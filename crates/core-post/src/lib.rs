use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A result dataset containing fields on nodes/elements over time/frequency.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultSet {
    pub id: Uuid,
    pub name: String,
    pub time_steps: Vec<f64>,
    pub fields: Vec<FieldData>,
}

impl ResultSet {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            time_steps: Vec::new(),
            fields: Vec::new(),
        }
    }
}

/// A single field (e.g., displacement, temperature, pressure).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldData {
    pub name: String,
    pub field_type: FieldType,
    pub location: FieldLocation,
    /// Values indexed by [time_step_index][entity_index][component].
    pub values: Vec<Vec<Vec<f64>>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FieldType {
    Scalar,
    Vector,
    SymmetricTensor,
    Tensor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FieldLocation {
    Node,
    Element,
    ElementNode,
}

/// Probe result at a specific point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeResult {
    pub location: [f64; 3],
    pub field_name: String,
    pub values: Vec<f64>,
}

/// Summary statistics for a field at a given time step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldSummary {
    pub field_name: String,
    pub time_step: f64,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
}

impl FieldSummary {
    pub fn compute(field: &FieldData, time_step_idx: usize) -> Option<Self> {
        let step_values = field.values.get(time_step_idx)?;
        if step_values.is_empty() {
            return None;
        }

        // For scalar fields, use component 0. For vector, compute magnitude.
        let scalars: Vec<f64> = step_values
            .iter()
            .map(|components| {
                if components.len() == 1 {
                    components[0]
                } else {
                    components.iter().map(|c| c * c).sum::<f64>().sqrt()
                }
            })
            .collect();

        let min = scalars.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = scalars.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mean = scalars.iter().sum::<f64>() / scalars.len() as f64;

        Some(Self {
            field_name: field.name.clone(),
            time_step: 0.0, // caller should set
            min,
            max,
            mean,
        })
    }
}
