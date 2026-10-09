use aionui_common::ProviderWithModel;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FactoryStageStatus {
    Pending,
    Running,
    Review,
    Approved,
    Stale,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryArtifact {
    pub id: String,
    pub content: String,
    pub created_at: i64,
    pub source: String,
    pub conversation_id: Option<String>,
    pub based_on: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryStage {
    pub status: FactoryStageStatus,
    pub versions: Vec<FactoryArtifact>,
    pub conversation_id: Option<String>,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryCheck {
    pub id: String,
    pub text: String,
    pub passed: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryProject {
    pub id: String,
    pub name: String,
    pub brief: String,
    pub assistant_id: String,
    pub workspace: String,
    pub model: Option<ProviderWithModel>,
    pub stages: Vec<FactoryStage>,
    pub checks: Vec<FactoryCheck>,
    pub archived: bool,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub run_id: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
pub struct CreateFactoryProject {
    pub name: String,
    pub brief: String,
    pub assistant_id: String,
    #[serde(default)]
    pub workspace: String,
    pub model: Option<ProviderWithModel>,
}
#[derive(Debug, Clone, Deserialize)]
pub struct FactoryActionRequest {
    pub revision: i64,
    #[serde(flatten)]
    pub action: FactoryAction,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum FactoryAction {
    Run {
        stage: usize,
        #[serde(default)]
        automatic: bool,
    },
    Pause,
    Save {
        stage: usize,
        content: String,
    },
    Restore {
        stage: usize,
        version_id: String,
    },
    Approve {
        stage: usize,
    },
    Update {
        name: String,
        brief: String,
        assistant_id: String,
        workspace: String,
        model: Option<ProviderWithModel>,
    },
    Checks {
        checks: Vec<FactoryCheck>,
    },
    Archive {
        archived: bool,
    },
}
