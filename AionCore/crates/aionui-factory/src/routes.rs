// ApiError is used only at this HTTP boundary; services retain FactoryError.
#![allow(clippy::disallowed_types)]

use crate::{FactoryError, FactoryRouterState};
use aionui_api_types::{ApiResponse, CreateFactoryProject, FactoryActionRequest, FactoryProject, FactoryReaStatus};
use aionui_auth::CurrentUser;
use aionui_common::ApiError;
use axum::{
    Json, Router,
    body::Body,
    extract::{Extension, Path, State},
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
    routing::get,
};
impl From<FactoryError> for ApiError {
    fn from(error: FactoryError) -> Self {
        match error {
            FactoryError::NotFound => Self::NotFound(error.to_string()),
            FactoryError::Conflict => Self::Conflict(error.to_string()),
            FactoryError::Invalid(_) => Self::BadRequest(error.to_string()),
            FactoryError::Storage => Self::Internal(error.to_string()),
            FactoryError::Execution(_) => Self::BadGateway(error.to_string()),
        }
    }
}
pub fn factory_routes(state: FactoryRouterState) -> Router {
    Router::new()
        .route("/api/factory/rea/status", get(rea_status))
        .route("/api/factory/projects", get(list).post(create))
        .route("/api/factory/projects/{id}", get(detail))
        .route(
            "/api/factory/projects/{id}/rea-evidence/{version_id}",
            get(download_evidence),
        )
        .route("/api/factory/projects/{id}/actions", axum::routing::post(action))
        .with_state(state)
}
async fn list(
    State(s): State<FactoryRouterState>,
    Extension(u): Extension<CurrentUser>,
) -> Result<Json<ApiResponse<Vec<FactoryProject>>>, ApiError> {
    Ok(Json(ApiResponse::ok(s.service.list(&u.id).await?)))
}
async fn create(
    State(s): State<FactoryRouterState>,
    Extension(u): Extension<CurrentUser>,
    Json(body): Json<CreateFactoryProject>,
) -> Result<Json<ApiResponse<FactoryProject>>, ApiError> {
    Ok(Json(ApiResponse::ok(s.service.create(&u.id, body).await?)))
}
async fn detail(
    State(s): State<FactoryRouterState>,
    Extension(u): Extension<CurrentUser>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<FactoryProject>>, ApiError> {
    Ok(Json(ApiResponse::ok(s.service.get(&u.id, &id).await?)))
}
async fn action(
    State(s): State<FactoryRouterState>,
    Extension(u): Extension<CurrentUser>,
    Path(id): Path<String>,
    Json(body): Json<FactoryActionRequest>,
) -> Result<Json<ApiResponse<FactoryProject>>, ApiError> {
    Ok(Json(ApiResponse::ok(s.service.action(&u.id, &id, body).await?)))
}

async fn rea_status(
    State(s): State<FactoryRouterState>,
    Extension(_u): Extension<CurrentUser>,
) -> Json<ApiResponse<FactoryReaStatus>> {
    Json(ApiResponse::ok(s.service.rea_status().await))
}

async fn download_evidence(
    State(s): State<FactoryRouterState>,
    Extension(u): Extension<CurrentUser>,
    Path((id, version_id)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let (name, bytes) = s.service.download_evidence(&u.id, &id, &version_id).await?;
    let mut response = Body::from(bytes).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{name}\""))
            .map_err(|_| ApiError::Internal("FACTORY_REA_INVALID_OUTPUT".into()))?,
    );
    Ok(response)
}
