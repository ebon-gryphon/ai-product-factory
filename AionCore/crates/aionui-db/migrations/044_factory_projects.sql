CREATE TABLE IF NOT EXISTS factory_projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_factory_projects_owner ON factory_projects(user_id, updated_at DESC);
