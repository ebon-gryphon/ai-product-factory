use aionui_api_types::*;
use aionui_db::{FactoryRecord, IFactoryRepository, SqliteFactoryRepository, init_database_memory};
use aionui_factory::{FactoryError, FactoryReaResult, FactoryRunner, FactoryService, FactoryStopSignal};
use std::sync::{
    Arc,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use tokio::sync::Mutex;
const USER: &str = "system_default_user";
struct Runner {
    fail: AtomicBool,
    wait: AtomicBool,
    cancelled: AtomicBool,
    prompts: Mutex<Vec<String>>,
    inspections: AtomicUsize,
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
    async fn inspect(
        &self,
        _: &FactoryProject,
        stop: Arc<FactoryStopSignal>,
    ) -> Result<FactoryReaResult, FactoryError> {
        self.inspections.fetch_add(1, Ordering::SeqCst);
        if self.wait.load(Ordering::SeqCst) {
            stop.cancelled().await;
            self.cancelled.store(true, Ordering::SeqCst);
            return Err(FactoryError::Execution("FACTORY_STOPPED"));
        }
        if self.fail.load(Ordering::SeqCst) {
            return Err(FactoryError::Execution("FACTORY_REA_EXECUTION_FAILED"));
        }
        Ok(fake_evidence(false))
    }
    async fn trace(
        &self,
        _: &FactoryProject,
        _: &FactoryReaEvidence,
        _: &str,
        _: FactoryReaDirection,
        _: Arc<FactoryStopSignal>,
    ) -> Result<FactoryReaResult, FactoryError> {
        if self.fail.load(Ordering::SeqCst) {
            return Err(FactoryError::Execution("FACTORY_REA_EXECUTION_FAILED"));
        }
        Ok(fake_evidence(true))
    }
    async fn read_evidence(&self, _: &FactoryProject, _: &FactoryReaEvidence) -> Result<Vec<u8>, FactoryError> {
        Ok(b"{}".to_vec())
    }
    async fn cancel(&self, _: &str, _: &str) -> Result<(), FactoryError> {
        self.cancelled.store(true, Ordering::SeqCst);
        Ok(())
    }
}
fn fake_evidence(trace: bool) -> FactoryReaResult {
    FactoryReaResult {
        content: if trace {
            "Evidence ev-trace from ev-rea".into()
        } else {
            "Evidence ev-rea: module main.js; limitations: static only".into()
        },
        evidence: FactoryReaEvidence {
            evidence_id: if trace { "ev-trace".into() } else { "ev-rea".into() },
            file_name: "evidence.json".into(),
            sha256: "a".repeat(64),
            bytes: 2,
            operation: if trace {
                "trace_application_feature".into()
            } else {
                "analyze_javascript_application".into()
            },
            summary: serde_json::json!({}),
            limitations: vec!["static only".into()],
            coverage: serde_json::json!({}),
            candidates: vec![FactoryReaCandidate {
                node_id: "node-1".into(),
                kind: "ipc-channel".into(),
                label: "notes:list".into(),
            }],
            candidate_total: 1,
        },
    }
}
fn rea_run(stage: usize, seed: Option<&str>) -> FactoryAction {
    FactoryAction::Run {
        stage,
        automatic: false,
        rea_seed: seed.map(String::from),
        rea_direction: FactoryReaDirection::Both,
    }
}
async fn setup() -> (Arc<FactoryService>, Arc<Runner>, aionui_db::Database) {
    let db = init_database_memory().await.unwrap();
    let runner = Arc::new(Runner {
        fail: AtomicBool::new(false),
        wait: AtomicBool::new(false),
        cancelled: AtomicBool::new(false),
        prompts: Mutex::new(vec![]),
        inspections: AtomicUsize::new(0),
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
            workflow: FactoryWorkflow::Production,
            target_path: String::new(),
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
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
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
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
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
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
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
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
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
                automatic: true,
                rea_seed: None,
                rea_direction: FactoryReaDirection::Both
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
    let started = action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: true,
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
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
    assert!(active.revision > started.revision);
    action(&s, &started, FactoryAction::Pause).await.unwrap();
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
    r.wait.store(false, Ordering::SeqCst);
    action(&s, &stopped, rea_run(0, None)).await.unwrap();
    let retried = settled(&s, &p.id).await;
    assert_eq!(retried.stages[0].status, FactoryStageStatus::Review);
    assert_eq!(retried.stages[0].versions.len(), 1);
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
                automatic: true,
                rea_seed: None,
                rea_direction: FactoryReaDirection::Both
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

async fn create_rea(s: &FactoryService, assistant: &str) -> FactoryProject {
    s.create(
        USER,
        CreateFactoryProject {
            name: "REA inspection".into(),
            brief: "Trace local search".into(),
            assistant_id: assistant.into(),
            workspace: String::new(),
            model: None,
            workflow: FactoryWorkflow::Rea,
            target_path: "/local/application".into(),
        },
    )
    .await
    .unwrap()
}
#[tokio::test]
async fn rea_evidence_and_feature_trace_work_without_an_ai_assistant() {
    let (s, r, _db) = setup().await;
    let p = create_rea(&s, "").await;
    action(&s, &p, rea_run(0, None)).await.unwrap();
    let p = settled(&s, &p.id).await;
    assert_eq!(p.stages[0].versions[0].source, "rea");
    assert!(p.stages[0].versions[0].rea.is_some());
    action(&s, &p, rea_run(1, Some("node-1"))).await.unwrap();
    let p = settled(&s, &p.id).await;
    assert!(p.stages[1].conversation_id.is_none());
    assert!(r.prompts.lock().await.is_empty());
    assert!(matches!(
        action(&s, &p, rea_run(2, None)).await,
        Err(FactoryError::Invalid("FACTORY_ASSISTANT_REQUIRED"))
    ));
}
#[tokio::test]
async fn rea_pipeline_passes_inspection_and_trace_to_two_analysis_stages() {
    let (s, r, _db) = setup().await;
    let mut p = create_rea(&s, "assistant").await;
    for stage in 0..4 {
        action(&s, &p, rea_run(stage, if stage == 1 { Some("node-1") } else { None }))
            .await
            .unwrap();
        p = settled(&s, &p.id).await;
    }
    assert!(p.stages.iter().all(|s| s.status == FactoryStageStatus::Review));
    let prompts = r.prompts.lock().await;
    assert_eq!(prompts.len(), 2);
    assert!(prompts.iter().all(|p| p.contains("ev-rea") && p.contains("ev-trace")));
    assert!(prompts[1].contains("重建方案"));
}
#[tokio::test]
async fn rea_failure_preserves_missing_evidence_and_stops_analysis() {
    let (s, r, _db) = setup().await;
    let p = create_rea(&s, "assistant").await;
    r.fail.store(true, Ordering::SeqCst);
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: false,
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
        },
    )
    .await
    .unwrap();
    let done = settled(&s, &p.id).await;
    assert_eq!(done.stages[0].error.as_deref(), Some("FACTORY_REA_EXECUTION_FAILED"));
    assert!(done.stages.iter().all(|s| s.versions.is_empty()));
    assert!(r.prompts.lock().await.is_empty());
}
#[tokio::test]
async fn rea_stop_waits_for_inspector_cancellation_and_never_commits_output() {
    let (s, r, _db) = setup().await;
    let p = create_rea(&s, "").await;
    r.wait.store(true, Ordering::SeqCst);
    let started = action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: false,
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
        },
    )
    .await
    .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while r.inspections.load(Ordering::SeqCst) == 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let active = s.get(USER, &p.id).await.unwrap();
    assert!(active.revision > started.revision);
    action(&s, &started, FactoryAction::Pause).await.unwrap();
    let done = settled(&s, &p.id).await;
    assert!(r.cancelled.load(Ordering::SeqCst));
    assert_eq!(done.stages[0].error.as_deref(), Some("FACTORY_STOPPED"));
    assert!(done.stages[0].versions.is_empty());
    r.wait.store(false, Ordering::SeqCst);
    action(&s, &done, rea_run(0, None)).await.unwrap();
    let retried = settled(&s, &p.id).await;
    assert_eq!(retried.stages[0].status, FactoryStageStatus::Review);
    assert_eq!(retried.stages[0].versions.len(), 1);
    assert_eq!(r.inspections.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn rea_target_validation_and_workflow_immutability_preserve_history() {
    let (s, _, _db) = setup().await;
    let request = serde_json::json!({"name":"bad", "brief":"trace", "assistant_id":"", "workflow":"rea", "target_path":"https://example.com"});
    assert!(matches!(
        s.create(USER, serde_json::from_value(request).unwrap()).await,
        Err(FactoryError::Invalid("FACTORY_REA_INVALID_TARGET"))
    ));
    let p = create_rea(&s, "").await;
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: false,
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
        },
    )
    .await
    .unwrap();
    let p = settled(&s, &p.id).await;
    let changed = action(
        &s,
        &p,
        FactoryAction::Update {
            name: p.name.clone(),
            brief: p.brief.clone(),
            assistant_id: p.assistant_id.clone(),
            workspace: p.workspace.clone(),
            model: None,
            workflow: FactoryWorkflow::Rea,
            target_path: "/new/application".into(),
        },
    )
    .await
    .unwrap();
    assert_eq!(changed.stages[0].status, FactoryStageStatus::Stale);
    assert_eq!(changed.stages[0].versions.len(), 1);
    assert!(matches!(
        action(
            &s,
            &changed,
            FactoryAction::Update {
                name: changed.name.clone(),
                brief: changed.brief.clone(),
                assistant_id: String::new(),
                workspace: String::new(),
                model: None,
                workflow: FactoryWorkflow::Production,
                target_path: String::new()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_WORKFLOW_IMMUTABLE"))
    ));
}
#[tokio::test]
async fn legacy_project_json_defaults_to_production_without_losing_versions() {
    let (s, _, db) = setup().await;
    let p = create(&s).await;
    let p = action(
        &s,
        &p,
        FactoryAction::Save {
            stage: 0,
            content: "Legacy requirements".into(),
        },
    )
    .await
    .unwrap();
    let mut payload = serde_json::to_value(&p).unwrap();
    payload.as_object_mut().unwrap().remove("workflow");
    payload.as_object_mut().unwrap().remove("target_path");
    payload["revision"] = (p.revision + 1).into();
    let repo = SqliteFactoryRepository::new(db.pool().clone());
    repo.replace(
        &FactoryRecord {
            id: p.id.clone(),
            user_id: USER.into(),
            revision: p.revision + 1,
            updated_at: p.updated_at,
            payload: payload.to_string(),
        },
        p.revision,
    )
    .await
    .unwrap();
    let old = s.get(USER, &p.id).await.unwrap();
    assert_eq!(old.workflow, FactoryWorkflow::Production);
    assert!(old.target_path.is_empty());
    assert_eq!(old.stages[0].versions[0].content, "Legacy requirements");
}

#[tokio::test]
async fn manual_evidence_cannot_bypass_rea_inspection_or_reactivate_a_changed_target() {
    let (s, _, _db) = setup().await;
    let p = create_rea(&s, "assistant").await;
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Save {
                stage: 0,
                content: "Fabricated evidence".into()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_REA_EVIDENCE_READ_ONLY"))
    ));
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Run {
                stage: 1,
                automatic: false,
                rea_seed: None,
                rea_direction: FactoryReaDirection::Both
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_REA_EVIDENCE_REQUIRED"))
    ));
    action(
        &s,
        &p,
        FactoryAction::Run {
            stage: 0,
            automatic: false,
            rea_seed: None,
            rea_direction: FactoryReaDirection::Both,
        },
    )
    .await
    .unwrap();
    let p = settled(&s, &p.id).await;
    let changed = action(
        &s,
        &p,
        FactoryAction::Update {
            name: p.name.clone(),
            brief: p.brief.clone(),
            assistant_id: p.assistant_id.clone(),
            workspace: p.workspace.clone(),
            model: None,
            workflow: FactoryWorkflow::Rea,
            target_path: "/new/application".into(),
        },
    )
    .await
    .unwrap();
    assert!(matches!(
        action(
            &s,
            &changed,
            FactoryAction::Restore {
                stage: 0,
                version_id: p.stages[0].versions[0].id.clone()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_REA_EVIDENCE_READ_ONLY"))
    ));
    assert!(matches!(
        action(
            &s,
            &changed,
            FactoryAction::Run {
                stage: 1,
                automatic: false,
                rea_seed: Some("node-1".into()),
                rea_direction: FactoryReaDirection::Both
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_PREREQUISITE"))
    ));
}

#[tokio::test]
async fn rea_requires_an_explicit_current_seed_and_blocks_automatic_pipeline() {
    let (s, _, _db) = setup().await;
    let p = create_rea(&s, "").await;
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Run {
                stage: 0,
                automatic: true,
                rea_seed: None,
                rea_direction: FactoryReaDirection::Both
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_REA_MANUAL_STEPS_REQUIRED"))
    ));
    action(&s, &p, rea_run(0, None)).await.unwrap();
    let p = settled(&s, &p.id).await;
    assert!(matches!(
        action(&s, &p, rea_run(1, None)).await,
        Err(FactoryError::Invalid("FACTORY_REA_SEED_REQUIRED"))
    ));
    assert!(matches!(
        action(&s, &p, rea_run(1, Some("invented-node"))).await,
        Err(FactoryError::Invalid("FACTORY_REA_INVALID_SEED"))
    ));
    assert!(matches!(
        action(
            &s,
            &p,
            FactoryAction::Save {
                stage: 1,
                content: "fake trace".into()
            }
        )
        .await,
        Err(FactoryError::Invalid("FACTORY_REA_EVIDENCE_READ_ONLY"))
    ));
    assert!(matches!(
        action(&s, &p, rea_run(2, None)).await,
        Err(FactoryError::Invalid("FACTORY_REA_EVIDENCE_REQUIRED"))
    ));
}

#[tokio::test]
async fn changing_the_question_reuses_the_overview_and_invalidates_trace_and_analysis() {
    let (s, r, _db) = setup().await;
    let mut p = create_rea(&s, "assistant").await;
    for stage in 0..4 {
        action(&s, &p, rea_run(stage, if stage == 1 { Some("node-1") } else { None }))
            .await
            .unwrap();
        p = settled(&s, &p.id).await;
    }
    let original_id = p.stages[0].versions[0].id.clone();
    let p = action(
        &s,
        &p,
        FactoryAction::Update {
            name: p.name.clone(),
            brief: "Investigate a different feature".into(),
            assistant_id: p.assistant_id.clone(),
            workspace: p.workspace.clone(),
            model: p.model.clone(),
            workflow: FactoryWorkflow::Rea,
            target_path: p.target_path.clone(),
        },
    )
    .await
    .unwrap();
    assert_eq!(p.stages[0].status, FactoryStageStatus::Review);
    assert_eq!(p.stages[0].versions[0].id, original_id);
    assert!(p.stages[1..].iter().all(|s| s.status == FactoryStageStatus::Stale));
    action(&s, &p, rea_run(1, Some("node-1"))).await.unwrap();
    let p = settled(&s, &p.id).await;
    assert_eq!(r.inspections.load(Ordering::SeqCst), 1);
    assert_eq!(p.stages[1].versions.len(), 2);
    assert_eq!(p.stages[1].versions[1].based_on, vec![original_id]);
}

struct MarkerRaceRepository {
    inner: SqliteFactoryRepository,
    mode: AtomicUsize,
}
#[async_trait::async_trait]
impl IFactoryRepository for MarkerRaceRepository {
    async fn list(&self, user: &str) -> Result<Vec<FactoryRecord>, aionui_db::DbError> {
        self.inner.list(user).await
    }
    async fn get(&self, user: &str, id: &str) -> Result<Option<FactoryRecord>, aionui_db::DbError> {
        self.inner.get(user, id).await
    }
    async fn insert(&self, row: &FactoryRecord) -> Result<(), aionui_db::DbError> {
        self.inner.insert(row).await
    }
    async fn interrupted(&self) -> Result<Vec<FactoryRecord>, aionui_db::DbError> {
        self.inner.interrupted().await
    }
    async fn replace(&self, row: &FactoryRecord, expected: i64) -> Result<bool, aionui_db::DbError> {
        if row.payload.contains("FACTORY_STOP_REQUESTED") {
            match self.mode.swap(0, Ordering::SeqCst) {
                1 => return Ok(false),
                2 => return Err(aionui_db::DbError::Init("forced stop-marker storage failure".into())),
                _ => {}
            }
        }
        self.inner.replace(row, expected).await
    }
}
#[tokio::test]
async fn stop_is_delivered_before_marker_conflicts_and_storage_errors_remain_visible() {
    for mode in [1, 2] {
        let db = init_database_memory().await.unwrap();
        let runner = Arc::new(Runner {
            fail: AtomicBool::new(false),
            wait: AtomicBool::new(true),
            cancelled: AtomicBool::new(false),
            prompts: Mutex::new(vec![]),
            inspections: AtomicUsize::new(0),
        });
        let s = Arc::new(FactoryService::new(
            Arc::new(MarkerRaceRepository {
                inner: SqliteFactoryRepository::new(db.pool().clone()),
                mode: AtomicUsize::new(mode),
            }),
            runner.clone(),
        ));
        let p = create_rea(&s, "").await;
        let started = action(&s, &p, rea_run(0, None)).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            while runner.inspections.load(Ordering::SeqCst) == 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let response = action(&s, &started, FactoryAction::Pause).await;
        if mode == 1 {
            assert!(response.is_ok());
        } else {
            assert!(matches!(response, Err(FactoryError::Storage)));
        }
        let stopped = settled(&s, &p.id).await;
        assert!(runner.cancelled.load(Ordering::SeqCst));
        assert_eq!(stopped.stages[0].error.as_deref(), Some("FACTORY_STOPPED"));
        assert!(stopped.stages[0].versions.is_empty());
    }
}
#[tokio::test]
async fn stale_pause_after_completion_is_a_read_only_noop() {
    let (s, _, _db) = setup().await;
    let p = create(&s).await;
    action(&s, &p, rea_run(0, None)).await.unwrap();
    let done = settled(&s, &p.id).await;
    let result = action(&s, &p, FactoryAction::Pause).await.unwrap();
    assert_eq!(result.revision, done.revision);
    assert_eq!(result.stages[0].versions[0].id, done.stages[0].versions[0].id);
}
