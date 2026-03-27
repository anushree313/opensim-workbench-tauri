pub mod solver;
pub mod tet4_cfd;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Fluid material properties for CFD analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FluidMaterial {
    pub viscosity: f64, // Pa·s (dynamic viscosity)
    pub density: f64,   // kg/m³
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfdAnalysis {
    pub id: Uuid,
    pub flow_type: FlowType,
    pub boundary_conditions: Vec<CfdBc>,
    pub solver_settings: CfdSolverSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlowType {
    SteadyIncompressible,
    TransientIncompressible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CfdBc {
    VelocityInlet { face_set: String, velocity: [f64; 3] },
    PressureOutlet { face_set: String, pressure: f64 },
    Wall { face_set: String, no_slip: bool },
    Symmetry { face_set: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CfdSolverSettings {
    pub max_iterations: u32,
    pub convergence_tolerance: f64,
    pub time_end: Option<f64>,
    pub time_step: Option<f64>,
    pub turbulence_model: TurbulenceModel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TurbulenceModel {
    Laminar,
    // Future: KEpsilon, KOmegaSST
}

impl Default for CfdSolverSettings {
    fn default() -> Self {
        Self {
            max_iterations: 500,
            convergence_tolerance: 1e-4,
            time_end: None,
            time_step: None,
            turbulence_model: TurbulenceModel::Laminar,
        }
    }
}
