pub mod solver;
pub mod tet4_thermal;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Isotropic thermal material properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalMaterial {
    pub conductivity: f64,
    pub specific_heat: f64,
    pub density: f64,
}

/// Maps element set names to thermal materials for multi-material analysis.
#[derive(Debug, Clone)]
pub struct ThermalMaterialMap {
    pub element_set_materials: std::collections::HashMap<String, ThermalMaterial>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalAnalysis {
    pub id: Uuid,
    pub analysis_type: ThermalAnalysisType,
    pub boundary_conditions: Vec<ThermalBc>,
    pub solver_settings: ThermalSolverSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThermalAnalysisType {
    SteadyState,
    Transient,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThermalBc {
    FixedTemperature { node_set: String, temperature: f64 },
    HeatFlux { element_set: String, flux: f64 },
    VolumetricHeatSource { element_set: String, power_density: f64 },
    Convection { element_set: String, coefficient: f64, ambient_temp: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalSolverSettings {
    pub max_iterations: u32,
    pub convergence_tolerance: f64,
    pub time_end: Option<f64>,
    pub time_step: Option<f64>,
}

impl Default for ThermalSolverSettings {
    fn default() -> Self {
        Self {
            max_iterations: 100,
            convergence_tolerance: 1e-6,
            time_end: None,
            time_step: None,
        }
    }
}
