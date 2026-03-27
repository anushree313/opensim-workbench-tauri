pub mod doe;
pub mod optimizer;
pub mod response_surface;
pub mod six_sigma;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A registered parameter that can be varied in design studies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub value: f64,
    pub lower_bound: Option<f64>,
    pub upper_bound: Option<f64>,
    pub distribution: Option<Distribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Distribution {
    Uniform { min: f64, max: f64 },
    Normal { mean: f64, std_dev: f64 },
    LogNormal { mean: f64, std_dev: f64 },
}

/// A design point: a set of parameter values and corresponding outputs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignPoint {
    pub id: Uuid,
    pub parameter_values: Vec<f64>,
    pub output_values: Vec<f64>,
    pub status: DesignPointStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DesignPointStatus {
    Pending,
    Queued,
    Running,
    Converged,
    Failed,
}

/// DOE algorithm types.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum DoeAlgorithm {
    FullFactorial { levels: usize },
    LatinHypercube { samples: usize },
    CentralComposite,
    BoxBehnken,
    Custom,
}

/// A design study definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignStudy {
    pub id: Uuid,
    pub name: String,
    pub parameters: Vec<Parameter>,
    pub output_names: Vec<String>,
    pub doe_algorithm: DoeAlgorithm,
    pub design_points: Vec<DesignPoint>,
}

impl DesignStudy {
    pub fn new(name: impl Into<String>, doe: DoeAlgorithm) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            parameters: Vec::new(),
            output_names: Vec::new(),
            doe_algorithm: doe,
            design_points: Vec::new(),
        }
    }
}
