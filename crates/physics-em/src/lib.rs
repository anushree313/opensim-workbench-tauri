pub mod solver;
pub mod tet4_em;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Dielectric material properties for electrostatic analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DielectricMaterial {
    pub permittivity: f64,  // F/m (ε)
    pub conductivity: f64,  // S/m (σ, for lossy dielectrics)
}

/// Magnetic material properties for magnetostatic analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagneticMaterial {
    pub permeability: f64,  // H/m (μ)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmAnalysis {
    pub id: Uuid,
    pub analysis_type: EmAnalysisType,
    pub boundary_conditions: Vec<EmBc>,
    pub solver_settings: EmSolverSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EmAnalysisType {
    Magnetostatic,
    Electrostatic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EmBc {
    Voltage { node_set: String, value: f64 },
    SurfaceCharge { face_set: String, density: f64 },
    MagneticFluxDensity { face_set: String, value: [f64; 3] },
    CurrentDensity { element_set: String, value: [f64; 3] },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmSolverSettings {
    pub max_iterations: u32,
    pub convergence_tolerance: f64,
}

impl Default for EmSolverSettings {
    fn default() -> Self {
        Self {
            max_iterations: 200,
            convergence_tolerance: 1e-6,
        }
    }
}
