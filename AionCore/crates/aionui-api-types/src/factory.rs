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
    #[serde(default)]
    pub rea: Option<FactoryReaEvidence>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryReaCandidate {
    pub node_id: String,
    pub kind: String,
    pub label: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryReaEvidence {
    pub evidence_id: String,
    pub file_name: String,
    pub sha256: String,
    pub bytes: u64,
    pub operation: String,
    pub summary: serde_json::Value,
    pub limitations: Vec<String>,
    pub coverage: serde_json::Value,
    pub candidates: Vec<FactoryReaCandidate>,
    pub candidate_total: usize,
}
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FactoryReaDirection {
    Incoming,
    Outgoing,
    #[default]
    Both,
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
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FactoryWorkflow {
    #[default]
    Production,
    Rea,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryReaStatus {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FactoryProject {
    pub id: String,
    pub name: String,
    pub brief: String,
    pub assistant_id: String,
    pub workspace: String,
    pub model: Option<ProviderWithModel>,
    #[serde(default)]
    pub workflow: FactoryWorkflow,
    #[serde(default)]
    pub target_path: String,
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
    #[serde(default)]
    pub workflow: FactoryWorkflow,
    #[serde(default)]
    pub target_path: String,
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
        #[serde(default)]
        rea_seed: Option<String>,
        #[serde(default)]
        rea_direction: FactoryReaDirection,
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
        #[serde(default)]
        workflow: FactoryWorkflow,
        #[serde(default)]
        target_path: String,
    },
    Checks {
        checks: Vec<FactoryCheck>,
    },
    Archive {
        archived: bool,
    },
}
