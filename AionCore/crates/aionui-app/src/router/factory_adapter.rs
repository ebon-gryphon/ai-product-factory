use aionui_ai_agent::IWorkerTaskManager;
use aionui_api_types::{AssistantConversationRequest, CreateConversationRequest, FactoryProject};
use aionui_conversation::{ConversationAgentTurnRequest, ConversationAgentTurnStatus, ConversationService};
use aionui_db::{IConversationRepository, MessagePageDirection, MessagePageParams};
use aionui_factory::{FactoryError, FactoryRunner};
use std::sync::Arc;

pub(crate) struct FactoryConversationRunner {
    pub service: ConversationService,
    pub work_dir: std::path::PathBuf,
    pub repository: Arc<dyn IConversationRepository>,
    pub tasks: Arc<dyn IWorkerTaskManager>,
}
#[async_trait::async_trait]
impl FactoryRunner for FactoryConversationRunner {
    async fn create(&self, user: &str, project: &FactoryProject, stage: usize) -> Result<String, FactoryError> {
        let mut extra = serde_json::json!({"factory_project_id":project.id,"factory_stage":stage});
        let workspace = if project.workspace.trim().is_empty() {
            let path = self.work_dir.join("factory").join(&project.id);
            tokio::fs::create_dir_all(&path)
                .await
                .map_err(|_| FactoryError::Execution("FACTORY_SETUP_FAILED"))?;
            path.to_string_lossy().into_owned()
        } else {
            project.workspace.clone()
        };
        extra["workspace"] = workspace.into();
        self.service
            .create(
                user,
                CreateConversationRequest {
                    r#type: None,
                    name: Some(format!("{} · {}", project.name, stage + 1)),
                    model: project.model.clone(),
                    assistant: Some(AssistantConversationRequest {
                        id: project.assistant_id.clone(),
                        locale: Some("zh-CN".into()),
                        conversation_overrides: None,
                    }),
                    source: None,
                    channel_chat_id: None,
                    extra,
                },
            )
            .await
            .map(|c| c.id)
            .map_err(|_| FactoryError::Execution("FACTORY_SETUP_FAILED"))
    }
    async fn execute(&self, user: &str, conversation: &str, prompt: String) -> Result<String, FactoryError> {
        let result = self
            .service
            .run_agent_turn(ConversationAgentTurnRequest {
                user_id: user.into(),
                conversation_id: conversation.into(),
                content: prompt,
                files: vec![],
                inject_skills: vec![],
                required_runtime_mode: None,
                persist_user_message: true,
                user_message_hidden: false,
                on_started: None,
            })
            .await
            .map_err(|_| FactoryError::Execution("FACTORY_EXECUTION_FAILED"))?;
        if result.status != ConversationAgentTurnStatus::Completed {
            return Err(FactoryError::Execution("FACTORY_EXECUTION_FAILED"));
        }
        let page = self
            .repository
            .list_messages_page(
                user,
                conversation,
                &MessagePageParams {
                    limit: 500,
                    direction: MessagePageDirection::InitialLatest,
                },
            )
            .await
            .map_err(|_| FactoryError::Storage)?;
        for row in page.items.iter().rev() {
            if row.r#type == "text"
                && row.position.as_deref() == Some("left")
                && !row.hidden
                && row.status.as_deref() == Some("finish")
                && let Ok(body) = serde_json::from_str::<serde_json::Value>(&row.content)
                && let Some(text) = body
                    .get("content")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.trim().is_empty())
            {
                return Ok(text.into());
            }
        }
        Err(FactoryError::Execution("FACTORY_EMPTY_OUTPUT"))
    }
    async fn cancel(&self, user: &str, conversation: &str) -> Result<(), FactoryError> {
        if let Some(turn) = self.service.runtime_state().active_turn_id_for(conversation) {
            self.service
                .cancel(user, conversation, &turn, &self.tasks)
                .await
                .map_err(|_| FactoryError::Execution("FACTORY_CANCEL_FAILED"))?;
        }
        Ok(())
    }
}
