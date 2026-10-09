use crate::DbError;
use sqlx::SqlitePool;

pub use crate::models::FactoryRecord;
#[async_trait::async_trait]
pub trait IFactoryRepository: Send + Sync {
    async fn list(&self, user: &str) -> Result<Vec<FactoryRecord>, DbError>;
    async fn get(&self, user: &str, id: &str) -> Result<Option<FactoryRecord>, DbError>;
    async fn insert(&self, row: &FactoryRecord) -> Result<(), DbError>;
    async fn replace(&self, row: &FactoryRecord, expected: i64) -> Result<bool, DbError>;
    async fn interrupted(&self) -> Result<Vec<FactoryRecord>, DbError>;
}
pub struct SqliteFactoryRepository {
    pool: SqlitePool,
}
impl SqliteFactoryRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}
#[async_trait::async_trait]
impl IFactoryRepository for SqliteFactoryRepository {
    async fn list(&self, user: &str) -> Result<Vec<FactoryRecord>, DbError> {
        Ok(
            sqlx::query_as("SELECT * FROM factory_projects WHERE user_id=? ORDER BY updated_at DESC")
                .bind(user)
                .fetch_all(&self.pool)
                .await?,
        )
    }
    async fn get(&self, user: &str, id: &str) -> Result<Option<FactoryRecord>, DbError> {
        Ok(
            sqlx::query_as("SELECT * FROM factory_projects WHERE user_id=? AND id=?")
                .bind(user)
                .bind(id)
                .fetch_optional(&self.pool)
                .await?,
        )
    }
    async fn insert(&self, row: &FactoryRecord) -> Result<(), DbError> {
        sqlx::query("INSERT INTO factory_projects(id,user_id,revision,payload,updated_at) VALUES(?,?,?,?,?)")
            .bind(&row.id)
            .bind(&row.user_id)
            .bind(row.revision)
            .bind(&row.payload)
            .bind(row.updated_at)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
    async fn replace(&self, row: &FactoryRecord, expected: i64) -> Result<bool, DbError> {
        Ok(sqlx::query(
            "UPDATE factory_projects SET revision=?,payload=?,updated_at=? WHERE id=? AND user_id=? AND revision=?",
        )
        .bind(row.revision)
        .bind(&row.payload)
        .bind(row.updated_at)
        .bind(&row.id)
        .bind(&row.user_id)
        .bind(expected)
        .execute(&self.pool)
        .await?
        .rows_affected()
            == 1)
    }
    async fn interrupted(&self) -> Result<Vec<FactoryRecord>, DbError> {
        Ok(
            sqlx::query_as("SELECT * FROM factory_projects WHERE json_extract(payload,'$.run_id') IS NOT NULL")
                .fetch_all(&self.pool)
                .await?,
        )
    }
}
