pub mod solver;
pub mod tet4;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Isotropic linear elastic material properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IsotropicMaterial {
    pub youngs_modulus: f64,
    pub poisson_ratio: f64,
    pub density: f64,
}

/// Maps element set names to structural materials for multi-material analysis.
#[derive(Debug, Clone)]
pub struct StructuralMaterialMap {
    pub element_set_materials: std::collections::HashMap<String, IsotropicMaterial>,
}

/// Configuration for a structural analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuralAnalysis {
    pub id: Uuid,
    pub analysis_type: StructuralAnalysisType,
    pub boundary_conditions: Vec<BoundaryCondition>,
    pub solver_settings: SolverSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StructuralAnalysisType {
    LinearStatic,
    Modal,
    HarmonicResponse,
    TransientDynamic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BoundaryCondition {
    FixedSupport {
        node_set: String,
    },
    Displacement {
        node_set: String,
        values: [Option<f64>; 3],
    },
    Force {
        node_set: String,
        values: [f64; 3],
    },
    Pressure {
        element_set: String,
        value: f64,
    },
    BodyTemperature {
        element_set: String,
        value: f64,
        reference_temperature: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverSettings {
    pub max_iterations: u32,
    pub convergence_tolerance: f64,
    pub num_modes: Option<u32>,
}

impl Default for SolverSettings {
    fn default() -> Self {
        Self {
            max_iterations: 100,
            convergence_tolerance: 1e-8,
            num_modes: None,
        }
    }
}

impl StructuralAnalysis {
    pub fn new_static() -> Self {
        Self {
            id: Uuid::new_v4(),
            analysis_type: StructuralAnalysisType::LinearStatic,
            boundary_conditions: Vec::new(),
            solver_settings: SolverSettings::default(),
        }
    }

    pub fn new_modal(num_modes: u32) -> Self {
        Self {
            id: Uuid::new_v4(),
            analysis_type: StructuralAnalysisType::Modal,
            boundary_conditions: Vec::new(),
            solver_settings: SolverSettings {
                num_modes: Some(num_modes),
                ..Default::default()
            },
        }
    }
}
