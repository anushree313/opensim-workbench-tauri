pub mod coupling;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Coupling type between two physics solvers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CouplingKind {
    OneWaySequential,
    TwoWayIterative,
}

/// A coupling definition between two analysis systems.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouplingDefinition {
    pub id: Uuid,
    pub source_system: Uuid,
    pub target_system: Uuid,
    pub kind: CouplingKind,
    pub max_iterations: u32,
    pub convergence_tolerance: f64,
}

impl CouplingDefinition {
    pub fn new_one_way(source: Uuid, target: Uuid) -> Self {
        Self {
            id: Uuid::new_v4(),
            source_system: source,
            target_system: target,
            kind: CouplingKind::OneWaySequential,
            max_iterations: 1,
            convergence_tolerance: 1e-6,
        }
    }
}
