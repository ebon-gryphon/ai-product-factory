use aionui_api_types::*;
use aionui_db::{FactoryRecord, IFactoryRepository, SqliteFactoryRepository, init_database_memory};
use aionui_factory::{FactoryError, FactoryRunner, FactoryService};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio::sync::Mutex;
const USER: &str = "system_default_user";
struct Runner {
    fail: AtomicBool,
    wait: AtomicBool,
    cancelled: AtomicBool,
    prompts: Mutex<Vec<String>>,
}
#[async_trait::async_trait]
impl FactoryRunner for Runner {
    async fn create(&self, _: &str, p: &FactoryProject, stage: usize) -> Result<String, FactoryError> {
        Ok(format!("{}-{stage}", p.id))
    }
    async fn execute(&self, _: &str, _: &str, prompt: String) -> Result<String, FactoryError> {
        let mut prompts = self.prompts.lock().await;
        prompts.push(prompt);
        let n = prompts.len();
        drop(prompts);
        if self.wait.load(Ordering::SeqCst) {
            while !self.cancelled.load(Ordering::SeqCst) {
                tokio::task::yield_now().await;
            }
        }
        if self.fail.load(Ordering::SeqCst) {
            return Err(FactoryError::Execution("FACTORY_EXECUTION_FAILED"));
        }
        Ok(format!("Deliverable {n}"))
    }
    async fn cancel(&self, _: &str, _: &str) -> Result<(), FactoryError> {
        self.cancelled.store(true, Ordering::SeqCst);
        Ok(())
    }
}
async fn setup() -> (Arc<FactoryService>, Arc<Runner>, aionui_db::Database) {
    let db = init_database_memory().await.unwrap();
    let runner = Arc::new(Runner {
        fail: AtomicBool::new(false),
        wait: AtomicBool::new(false),
        cancelled: AtomicBool::new(false),
        prompts: Mutex::new(vec![]),
    });
    let service = Arc::new(FactoryService::new(
        Arc::new(SqliteFactoryRepository::new(db.pool().clone())),
        runner.clone(),
    ));
    (service, runner, db)
}
async fn create(s: &FactoryService) -> FactoryProject {
    s.create(
        USER,
        CreateFactoryProject {
            name: "Acceptance project".into(),
            brief: "A personal task list".into(),
            assistant_id: "assistant".into(),
            workspace: String::new(),
            model: None,
        },
    )
    .await
    .unwrap()
}
async fn action(s: &Arc<FactoryService>, p: &FactoryProject, a: FactoryAction) -> Result<FactoryProject, FactoryError> {
    s.action(
        USER,
        &p.id,
        FactoryActionRequest {
            revision: p.revision,
            action: a,
        },
    )
    .await
}
async fn settled(s: &FactoryService, id: &str) -> FactoryProject {
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let p = s.get(USER, id).await.unwrap();
            if p.run_id.is_none() {
                return p;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap()
}
#[tokio::test]
async fn pipeline_passes_context_and_preserves_review_boundary() {
    let (s, r, _db) = setup().await;
    let p = create(&s).await;
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: true,
        },
    )
    .await
    .unwrap();
    let mut done = settled(&s, &p.id).await;
    assert!(done.stages.iter().all(|s| s.status == FactoryStageStatus::Review));
    let prompts = r.prompts.lock().await;
    assert_eq!(prompts.len(), 4);
    assert!(prompts[1].contains("Deliverable 1"));
    assert!(prompts[3].contains("Deliverable 3"));
    drop(prompts);
    assert_eq!(done.stages[3].versions[0].based_on.len(), 3);
    assert!(matches!(
        action(&s, &done, FactoryAction::Approve { stage: 3 }).await,
        Err(FactoryError::Invalid("FACTORY_REVIEW_REQUIRED"))
    ));
    for stage in 0..4 {
        done = action(&s, &done, FactoryAction::Approve { stage }).await.unwrap();
    }
    assert!(done.stages.iter().all(|s| s.status == FactoryStageStatus::Approved));
}
#[tokio::test]
async fn failures_stop_pipeline_and_retry_preserves_prior_versions() {
    let (s, r, _db) = setup().await;
    let p = create(&s).await;
    r.fail.store(true, Ordering::SeqCst);
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: true,
        },
    )
    .await
    .unwrap();
    let failed = settled(&s, &p.id).await;
    assert_eq!(failed.stages[0].error.as_deref(), Some("FACTORY_EXECUTION_FAILED"));
    assert_eq!(failed.stages[1].status, FactoryStageStatus::Pending);
    r.fail.store(false, Ordering::SeqCst);
    action(
        &s,
        &failed,
        FactoryAction::Run {
            stage: 0,
            automatic: false,
        },
    )
    .await
    .unwrap();
    let done = settled(&s, &p.id).await;
    assert_eq!(done.stages[0].versions.len(), 1);
    assert_eq!(done.stages[0].status, FactoryStageStatus::Review);
}
#[tokio::test]
async fn editing_upstream_invalidates_downstream_and_restore_adds_history() {
    let (s, _, _db) = setup().await;
    let p = create(&s).await;
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: true,
        },
    )
    .await
    .unwrap();
    let done = settled(&s, &p.id).await;
    let original = done.stages[0].versions[0].id.clone();
    let edited = action(
        &s,
        &done,
        FactoryAction::Save {
            stage: 0,
            content: "New requirements".into(),
        },
    )
    .await
    .unwrap();
    assert!(edited.stages[1..].iter().all(|s| s.status == FactoryStageStatus::Stale));
    assert!(matches!(
        action(
            &s,
            &edited,
            FactoryAction::Run {
                stage: 2,
                automatic: true
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_PREREQUISITE"))
    ));
    let restored = action(
        &s,
        &edited,
        FactoryAction::Restore {
            stage: 0,
            version_id: original,
        },
    )
    .await
    .unwrap();
    assert_eq!(restored.stages[0].versions.len(), 3);
    assert_eq!(restored.stages[0].versions[2].content, "Deliverable 1");
}
#[tokio::test]
async fn stale_revision_and_other_user_cannot_modify_project() {
    let (s, _, _db) = setup().await;
    let p = create(&s).await;
    action(
        &s,
        &p,
        FactoryAction::Save {
            stage: 0,
            content: "First".into(),
        },
    )
    .await
    .unwrap();
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Save {
                stage: 0,
                content: "Lost update".into()
            }
        )
        .await,
        Err(FactoryError::Conflict)
    ));
    assert!(matches!(s.get("other", &p.id).await, Err(FactoryError::NotFound)));
    assert!(s.list("other").await.unwrap().is_empty());
    assert!(matches!(
        s.action(
            "other",
            &p.id,
            FactoryActionRequest {
                revision: p.revision,
                action: FactoryAction::Archive { archived: true }
            }
        )
        .await,
        Err(FactoryError::NotFound)
    ));
}
#[tokio::test]
async fn stop_prevents_output_commit_and_calls_runtime_cancel() {
    let (s, r, _db) = setup().await;
    let p = create(&s).await;
    r.wait.store(true, Ordering::SeqCst);
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: true,
        },
    )
    .await
    .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while r.prompts.lock().await.is_empty() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let active = s.get(USER, &p.id).await.unwrap();
    assert!(matches!(
        action(
            &s,
            &active,
            FactoryAction::Save {
                stage: 0,
                content: "Edit during execution".into()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_RUNNING"))
    ));
    action(&s, &active, FactoryAction::Pause).await.unwrap();
    let stopped = settled(&s, &p.id).await;
    assert!(stopped.run_id.is_none());
    assert_eq!(stopped.stages[0].error.as_deref(), Some("FACTORY_STOPPED"));
    assert!(stopped.stages[0].versions.is_empty());
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while !r.cancelled.load(Ordering::SeqCst) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
}
#[tokio::test]
async fn restart_marks_inflight_work_interrupted_without_replaying() {
    let (s, r, db) = setup().await;
    let mut p = create(&s).await;
    p.run_id = Some("interrupted".into());
    p.stages[0].status = FactoryStageStatus::Running;
    p.revision += 1;
    let repo = SqliteFactoryRepository::new(db.pool().clone());
    repo.replace(
        &FactoryRecord {
            id: p.id.clone(),
            user_id: USER.into(),
            revision: p.revision,
            payload: serde_json::to_string(&p).unwrap(),
            updated_at: p.updated_at,
        },
        p.revision - 1,
    )
    .await
    .unwrap();
    s.recover().await.unwrap();
    let recovered = s.get(USER, &p.id).await.unwrap();
    assert!(recovered.run_id.is_none());
    assert_eq!(recovered.stages[0].error.as_deref(), Some("FACTORY_INTERRUPTED"));
    assert!(r.prompts.lock().await.is_empty());
}
#[tokio::test]
async fn validation_and_delivery_checks_block_false_completion() {
    let (s, _, _db) = setup().await;
    let mut p = create(&s).await;
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Save {
                stage: 8,
                content: "x".into()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_INVALID_STAGE"))
    ));
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Save {
                stage: 0,
                content: " ".into()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_INVALID_ARTIFACT"))
    ));
    for stage in 0..4 {
        p = action(
            &s,
            &p,
            FactoryAction::Save {
                stage,
                content: format!("Stage {stage}"),
            },
        )
        .await
        .unwrap();
    }
    p = action(
        &s,
        &p,
        FactoryAction::Checks {
            checks: vec![FactoryCheck {
                id: "one".into(),
                text: "Verify prototype".into(),
                passed: false,
            }],
        },
    )
    .await
    .unwrap();
    for stage in 0..3 {
        p = action(&s, &p, FactoryAction::Approve { stage }).await.unwrap();
    }
    assert!(matches!(
        action(&s, &p, FactoryAction::Approve { stage: 3 }).await,
        Err(FactoryError::Invalid("FACTORY_CHECKS_REQUIRED"))
    ));
    p = action(
        &s,
        &p,
        FactoryAction::Checks {
            checks: vec![FactoryCheck {
                id: "one".into(),
                text: "Verify prototype".into(),
                passed: true,
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(
        action(&s, &p, FactoryAction::Approve { stage: 3 })
            .await
            .unwrap()
            .stages[3]
            .status,
        FactoryStageStatus::Approved
    );
}
#[tokio::test]
async fn archive_is_reversible_and_blocks_execution() {
    let (s, _, _db) = setup().await;
    let p = create(&s).await;
    let archived = action(&s, &p, FactoryAction::Archive { archived: true }).await.unwrap();
    assert!(matches!(
        action(
            &s,
            &archived,
            FactoryAction::Run {
                stage: 0,
                automatic: true
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_ARCHIVED"))
    ));
    assert!(
        !action(&s, &archived, FactoryAction::Archive { archived: false })
            .await
            .unwrap()
            .archived
    );
}
