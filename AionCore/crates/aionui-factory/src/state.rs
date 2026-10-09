use crate::FactoryService;
use std::sync::Arc;
#[derive(Clone)]
pub struct FactoryRouterState {
    pub service: Arc<FactoryService>,
}
