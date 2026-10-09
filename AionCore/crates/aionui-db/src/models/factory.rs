#[derive(Debug, Clone, sqlx::FromRow)]
pub struct FactoryRecord {
    pub id: String,
    pub user_id: String,
    pub revision: i64,
    pub payload: String,
    pub updated_at: i64,
}
