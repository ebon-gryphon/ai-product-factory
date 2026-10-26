mod common;
use aionui_app::{AppConfig, AppServices, create_router};
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use common::{body_json, json_with_token, setup_and_login};
use serde_json::json;
use tower::ServiceExt;

async fn setup() -> (axum::Router, AppServices, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let config = AppConfig {
        data_dir: dir.path().to_path_buf(),
        work_dir: dir.path().join("work"),
        ..Default::default()
    };
    let services = AppServices::from_config(aionui_db::init_database_memory().await.unwrap(), &config)
        .await
        .unwrap();
    let app = create_router(&services).await.unwrap();
    (app, services, dir)
}
#[tokio::test]
async fn factory_routes_require_authentication_and_csrf() {
    let (mut app, services, _dir) = setup().await;
    let req = Request::builder()
        .uri("/api/factory/projects")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.clone().oneshot(req).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    let (token, _) = setup_and_login(&mut app, &services, "factory-admin", "StrongP@ss1").await;
    let req = Request::builder()
        .method("POST")
        .uri("/api/factory/projects")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .body(Body::from("{}"))
        .unwrap();
    assert_eq!(app.oneshot(req).await.unwrap().status(), StatusCode::FORBIDDEN);
}
#[tokio::test]
async fn factory_http_persists_versions_and_rejects_stale_updates() {
    let (mut app, services, _dir) = setup().await;
    let (token, csrf) = setup_and_login(&mut app, &services, "factory-admin", "StrongP@ss1").await;
    let body = json!({"name":"Factory route test","brief":"Task tracker","assistant_id":"","workspace":""});
    let response = app
        .clone()
        .oneshot(json_with_token("POST", "/api/factory/projects", body, &token, &csrf))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let project = body_json(response).await;
    let id = project["data"]["id"].as_str().unwrap();
    let path = format!("/api/factory/projects/{id}/actions");
    let payload = json!({"revision":1,"action":"save","stage":0,"content":"Requirements v1"});
    let response = app
        .clone()
        .oneshot(json_with_token("POST", &path, payload.clone(), &token, &csrf))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        body_json(response).await["data"]["stages"][0]["versions"][0]["content"],
        "Requirements v1"
    );
    let response = app
        .clone()
        .oneshot(json_with_token("POST", &path, payload.clone(), &token, &csrf))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let response = app
        .clone()
        .oneshot(json_with_token(
            "POST",
            &path,
            json!({"revision":2,"action":"run","stage":0}),
            &token,
            &csrf,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(
        body_json(response)
            .await
            .to_string()
            .contains("FACTORY_ASSISTANT_REQUIRED")
    );
    let get = Request::builder()
        .uri(format!("/api/factory/projects/{id}"))
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    assert_eq!(body_json(app.oneshot(get).await.unwrap()).await["data"]["revision"], 2);
}

#[tokio::test]
async fn rea_status_requires_auth_and_invalid_target_does_not_create_project() {
    let (mut app, services, _dir) = setup().await;
    let unauth = Request::builder()
        .uri("/api/factory/rea/status")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.clone().oneshot(unauth).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    let unauth = Request::builder()
        .uri("/api/factory/projects/foreign/rea-evidence/version")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.clone().oneshot(unauth).await.unwrap().status(),
        StatusCode::UNAUTHORIZED
    );
    let (token, csrf) = setup_and_login(&mut app, &services, "rea-admin", "StrongP@ss1").await;
    let status = Request::builder()
        .uri("/api/factory/rea/status")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(status).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let data = body_json(response).await;
    assert!(data["data"]["available"].is_boolean());
    let response = app.clone().oneshot(json_with_token("POST", "/api/factory/projects", json!({"name":"REA", "brief":"trace", "assistant_id":"", "workflow":"rea", "target_path":"https://example.com"}), &token, &csrf)).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(
        body_json(response)
            .await
            .to_string()
            .contains("FACTORY_REA_INVALID_TARGET")
    );
    assert!(services.factory_service.list("other-user").await.unwrap().is_empty());
}
