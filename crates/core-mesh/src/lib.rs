pub mod mesher;
pub mod quality;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// A finite element mesh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mesh {
    pub id: Uuid,
    pub name: String,
    pub nodes: Vec<MeshNode>,
    pub elements: Vec<Element>,
    pub node_sets: Vec<NodeSet>,
    pub element_sets: Vec<ElementSet>,
    /// The geometry that was meshed to produce this mesh.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_geometry_id: Option<Uuid>,
}

impl Mesh {
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: String::from("Mesh"),
            nodes: Vec::new(),
            elements: Vec::new(),
            node_sets: Vec::new(),
            element_sets: Vec::new(),
            source_geometry_id: None,
        }
    }

    pub fn num_nodes(&self) -> usize {
        self.nodes.len()
    }

    pub fn num_elements(&self) -> usize {
        self.elements.len()
    }

    /// Count elements grouped by kind.
    pub fn element_count_by_kind(&self) -> HashMap<ElementKind, usize> {
        let mut counts = HashMap::new();
        for el in &self.elements {
            *counts.entry(el.kind).or_insert(0) += 1;
        }
        counts
    }

    /// Return references to all 2D (surface) elements.
    pub fn surface_elements(&self) -> Vec<&Element> {
        self.elements.iter().filter(|e| e.kind.dimension() == 2).collect()
    }

    /// Return references to all 3D (volume) elements.
    pub fn volume_elements(&self) -> Vec<&Element> {
        self.elements.iter().filter(|e| e.kind.dimension() == 3).collect()
    }
}

impl Default for Mesh {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshNode {
    pub id: u64,
    pub position: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Element {
    pub id: u64,
    pub kind: ElementKind,
    pub node_ids: Vec<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ElementKind {
    // 1D
    Line2,
    Line3,
    // 2D
    Tri3,
    Tri6,
    Quad4,
    Quad8,
    // 3D
    Tet4,
    Tet10,
    Hex8,
    Hex20,
    Wedge6,
    Pyramid5,
}

impl ElementKind {
    pub fn dimension(&self) -> u8 {
        match self {
            Self::Line2 | Self::Line3 => 1,
            Self::Tri3 | Self::Tri6 | Self::Quad4 | Self::Quad8 => 2,
            _ => 3,
        }
    }

    pub fn nodes_per_element(&self) -> usize {
        match self {
            Self::Line2 => 2,
            Self::Line3 => 3,
            Self::Tri3 => 3,
            Self::Tri6 => 6,
            Self::Quad4 => 4,
            Self::Quad8 => 8,
            Self::Tet4 => 4,
            Self::Tet10 => 10,
            Self::Hex8 => 8,
            Self::Hex20 => 20,
            Self::Wedge6 => 6,
            Self::Pyramid5 => 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSet {
    pub name: String,
    pub node_ids: Vec<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementSet {
    pub name: String,
    pub element_ids: Vec<u64>,
}

/// Mesh quality metrics for a single element.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementQuality {
    pub element_id: u64,
    pub aspect_ratio: f64,
    pub skewness: f64,
    pub jacobian_ratio: f64,
}
