export type StageStatus = 'pending' | 'running' | 'review' | 'approved' | 'stale' | 'failed';
export type Artifact = {
  id: string;
  content: string;
  created_at: number;
  source: string;
  conversation_id: string | null;
  based_on: string[];
};
export type Stage = { status: StageStatus; versions: Artifact[]; conversation_id: string | null; error: string | null };
export type Check = { id: string; text: string; passed: boolean };
export type Model = { provider_id: string; model: string; use_model?: string | null };
export type ProjectInput = {
  name: string;
  brief: string;
  assistant_id: string;
  workspace: string;
  model: Model | null;
};
export type Project = ProjectInput & {
  id: string;
  stages: Stage[];
  checks: Check[];
  archived: boolean;
  revision: number;
  created_at: number;
  updated_at: number;
  run_id: string | null;
};
export type Action =
  | { action: 'run'; stage: number; automatic: boolean }
  | { action: 'pause' }
  | { action: 'save'; stage: number; content: string }
  | { action: 'restore'; stage: number; version_id: string }
  | { action: 'approve'; stage: number }
  | ({ action: 'update' } & ProjectInput)
  | { action: 'checks'; checks: Check[] }
  | { action: 'archive'; archived: boolean };
export type Assistant = {
  id: string;
  name: string;
  name_i18n?: Record<string, string>;
  enabled: boolean;
  agent_status: string;
};
export type ModelOption = { provider_id: string; provider_name: string; model: string };
