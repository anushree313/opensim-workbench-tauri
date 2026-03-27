use std::collections::HashMap;

use core_project::{
    CellKind, ConnectionKind, NodeState, SystemCategory, SystemKind,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// DTO for a system node as seen by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemNodeDto {
    pub id: Uuid,
    pub kind: SystemKind,
    pub category: SystemCategory,
    pub name: String,
    pub display_name: String,
    pub state: NodeState,
    pub cells: Vec<CellDto>,
    pub position: (f64, f64),
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geometry_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mesh_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub study_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellDto {
    pub id: Uuid,
    pub kind: CellKind,
    pub display_name: String,
    pub state: NodeState,
}

/// DTO for a connection between systems.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionDto {
    pub id: Uuid,
    pub source: Uuid,
    pub target: Uuid,
    pub kind: ConnectionKind,
}

/// DTO for the project schematic (full graph state).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSchematicDto {
    pub project_id: Uuid,
    pub project_name: String,
    pub nodes: Vec<SystemNodeDto>,
    pub connections: Vec<ConnectionDto>,
}

/// DTO for creating a new system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSystemRequest {
    pub kind: SystemKind,
    pub position: (f64, f64),
}

/// DTO for creating a connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateConnectionRequest {
    pub source: Uuid,
    pub target: Uuid,
    pub kind: ConnectionKind,
}

/// DTO for the available system types in the toolbox.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolboxEntry {
    pub kind: SystemKind,
    pub display_name: String,
    pub category: SystemCategory,
}

/// Generic operation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult {
    pub success: bool,
    pub message: String,
    pub id: Option<Uuid>,
}

// -- Geometry DTOs --

/// Tessellated mesh data for 3D rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TessellatedMeshDto {
    pub vertices: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub indices: Vec<u32>,
}

/// A body within a geometry model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyDto {
    pub id: Uuid,
    pub name: String,
    pub primitive_kind: Option<String>,
    pub bounding_box: Option<([f64; 3], [f64; 3])>,
}

/// A geometry model with its bodies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometryModelDto {
    pub id: Uuid,
    pub name: String,
    pub bodies: Vec<BodyDto>,
}

/// Full geometry view for the 3D viewer (model + render data).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometryViewDto {
    pub node_id: Uuid,
    pub model: GeometryModelDto,
    pub meshes: Vec<TessellatedMeshDto>,
}

// -- Mesh DTOs --

/// Mesh statistics summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshStatisticsDto {
    pub total_nodes: usize,
    pub total_elements: usize,
    pub element_counts: HashMap<String, usize>,
    pub min_quality: f64,
    pub max_quality: f64,
    pub avg_quality: f64,
}

/// Full mesh view for the 3D viewer (pre-computed rendering data).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshViewDto {
    pub node_id: Uuid,
    pub mesh_id: Uuid,
    pub name: String,
    pub statistics: MeshStatisticsDto,
    /// Edge line segments for wireframe rendering (pairs of points).
    pub edge_vertices: Vec<[f32; 3]>,
    /// Surface triangle vertices for translucent face rendering.
    pub surface_vertices: Vec<[f32; 3]>,
    /// Surface triangle normals.
    pub surface_normals: Vec<[f32; 3]>,
    /// Surface triangle indices.
    pub surface_indices: Vec<u32>,
}

// -- Result DTOs --

/// Summary for a single result field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultSummaryDto {
    pub field_name: String,
    pub location: String,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
}

/// Full result view for the 3D viewer with colored surface mesh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultViewDto {
    pub node_id: Uuid,
    pub result_id: Uuid,
    pub name: String,
    pub field_name: String,
    pub field_summaries: Vec<ResultSummaryDto>,
    /// Surface vertices (may be deformed).
    pub surface_vertices: Vec<[f32; 3]>,
    /// Surface normals.
    pub surface_normals: Vec<[f32; 3]>,
    /// Surface triangle indices.
    pub surface_indices: Vec<u32>,
    /// Per-vertex color values [r, g, b] mapped from field data.
    pub vertex_colors: Vec<[f32; 3]>,
    /// Field value range for the color legend.
    pub color_range: [f64; 2],
}

// -- Design Exploration DTOs --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterDto {
    pub name: String,
    pub value: f64,
    pub lower_bound: f64,
    pub upper_bound: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignPointDto {
    pub id: Uuid,
    pub parameter_values: Vec<f64>,
    pub output_values: Vec<f64>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseSurfaceDto {
    pub r_squared: f64,
    /// Grid data for visualization: [[p0, p1, response], ...]
    pub grid: Vec<Vec<f64>>,
    pub param_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResultDto {
    pub optimal_params: Vec<f64>,
    pub param_names: Vec<String>,
    pub optimal_value: f64,
    pub history: Vec<f64>,
}

/// Combined DE view for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignExplorationViewDto {
    pub node_id: Uuid,
    pub study_id: Uuid,
    pub name: String,
    pub parameters: Vec<ParameterDto>,
    pub output_names: Vec<String>,
    pub doe_algorithm: String,
    pub design_points: Vec<DesignPointDto>,
    pub response_surface: Option<ResponseSurfaceDto>,
    pub optimization_result: Option<OptimizationResultDto>,
    pub pareto_indices: Option<Vec<usize>>,
    pub six_sigma: Option<SixSigmaResultDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SixSigmaResultDto {
    pub mean: f64,
    pub std_dev: f64,
    pub cpk: f64,
    pub histogram_bins: Vec<f64>,
    pub histogram_counts: Vec<u32>,
    pub sample_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStatusDto {
    pub job_id: Uuid,
    pub status: String,
    pub progress: f64,
}

// -- Chip Package DTOs --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChipPackageResultDto {
    pub node_id: Uuid,
    pub analysis_type: String,
    pub result_view: ResultViewDto,
    pub layer_summaries: Vec<LayerSummaryDto>,
    pub dba_material: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerSummaryDto {
    pub layer_name: String,
    pub field_name: String,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbaComparisonDto {
    pub node_id: Uuid,
    pub materials: Vec<String>,
    pub results: Vec<DbaComparisonRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbaComparisonRow {
    pub material_name: String,
    pub max_temperature: Option<f64>,
    pub thermal_resistance: Option<f64>,
    pub max_shear_stress: Option<f64>,
    pub max_deformation: Option<f64>,
}
