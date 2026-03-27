use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Vertex in a topological model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vertex {
    pub id: Uuid,
    pub position: [f64; 3],
}

/// Edge connecting two vertices.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: Uuid,
    pub start: Uuid,
    pub end: Uuid,
}

/// Face bounded by edges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Face {
    pub id: Uuid,
    pub edge_loops: Vec<Vec<Uuid>>,
    pub normal: Option<[f64; 3]>,
}
