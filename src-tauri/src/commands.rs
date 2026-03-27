use std::sync::Arc;

use app_engine::dto::*;
use app_engine::AppEngine;
use uuid::Uuid;

type EngineState = Arc<AppEngine>;

#[tauri::command]
pub fn new_project(
    engine: tauri::State<EngineState>,
    name: String,
) -> Result<ProjectSchematicDto, String> {
    engine.new_project(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_project(
    engine: tauri::State<EngineState>,
    path: String,
) -> Result<ProjectSchematicDto, String> {
    engine.open_project(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_project(
    engine: tauri::State<EngineState>,
    path: Option<String>,
) -> Result<OperationResult, String> {
    engine
        .save_project(path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_schematic(
    engine: tauri::State<EngineState>,
) -> Result<ProjectSchematicDto, String> {
    engine.get_schematic().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_system(
    engine: tauri::State<EngineState>,
    kind: core_project::SystemKind,
    position: (f64, f64),
) -> Result<SystemNodeDto, String> {
    engine
        .add_system(CreateSystemRequest { kind, position })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_system(
    engine: tauri::State<EngineState>,
    id: Uuid,
) -> Result<OperationResult, String> {
    engine.remove_system(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn connect_systems(
    engine: tauri::State<EngineState>,
    source: Uuid,
    target: Uuid,
    kind: core_project::ConnectionKind,
) -> Result<OperationResult, String> {
    engine
        .connect_systems(CreateConnectionRequest {
            source,
            target,
            kind,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disconnect(
    engine: tauri::State<EngineState>,
    connection_id: Uuid,
) -> Result<OperationResult, String> {
    engine
        .disconnect(connection_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_dirty(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<ProjectSchematicDto, String> {
    engine.mark_dirty(node_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_toolbox(engine: tauri::State<EngineState>) -> Vec<ToolboxEntry> {
    engine.get_toolbox()
}

// -- Geometry commands --

#[tauri::command]
pub fn create_geometry(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<GeometryModelDto, String> {
    engine.create_geometry(node_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_primitive(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    kind: String,
    name: String,
    params: serde_json::Value,
) -> Result<BodyDto, String> {
    engine
        .add_primitive(node_id, &kind, &name, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_body(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    body_id: Uuid,
) -> Result<OperationResult, String> {
    engine
        .remove_body(node_id, body_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_geometry(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    file_path: String,
) -> Result<GeometryViewDto, String> {
    engine
        .import_geometry(node_id, &file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_geometry_view(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<GeometryViewDto, String> {
    engine
        .get_geometry_view(node_id)
        .map_err(|e| e.to_string())
}

// -- Mesh commands --

#[tauri::command]
pub fn create_mesh(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<MeshStatisticsDto, String> {
    engine.create_mesh(node_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn generate_mesh(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    params: serde_json::Value,
) -> Result<MeshViewDto, String> {
    engine
        .generate_mesh(node_id, params)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mesh_view(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<MeshViewDto, String> {
    engine.get_mesh_view(node_id).map_err(|e| e.to_string())
}

// -- Solver commands --

#[tauri::command]
pub fn run_solver(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    params: serde_json::Value,
) -> Result<ResultViewDto, String> {
    engine.run_solver(node_id, params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_result_view(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    field_name: String,
) -> Result<ResultViewDto, String> {
    engine
        .get_result_view(node_id, &field_name)
        .map_err(|e| e.to_string())
}

// -- Design Exploration commands --

#[tauri::command]
pub fn create_design_study(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    params: serde_json::Value,
) -> Result<DesignExplorationViewDto, String> {
    engine.create_design_study(node_id, params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_doe(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<DesignExplorationViewDto, String> {
    engine.run_doe(node_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fit_response_surface(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    output_idx: usize,
) -> Result<DesignExplorationViewDto, String> {
    engine.fit_response_surface_cmd(node_id, output_idx).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_optimization(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    output_idx: usize,
    minimize: bool,
) -> Result<DesignExplorationViewDto, String> {
    engine.run_optimization_cmd(node_id, output_idx, minimize).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_design_exploration_view(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<DesignExplorationViewDto, String> {
    engine.get_design_exploration_view(node_id).map_err(|e| e.to_string())
}

// -- Thermal + advanced DE commands --

#[tauri::command]
pub fn run_thermal_solver(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    params: serde_json::Value,
) -> Result<ResultViewDto, String> {
    engine.run_thermal_solver(node_id, params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_pareto(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
) -> Result<DesignExplorationViewDto, String> {
    engine.run_pareto(node_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_six_sigma(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    output_idx: usize,
) -> Result<DesignExplorationViewDto, String> {
    engine.run_six_sigma(node_id, output_idx).map_err(|e| e.to_string())
}

// -- Chip Package commands --

#[tauri::command]
pub fn run_chip_package_analysis(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    params: serde_json::Value,
) -> Result<ChipPackageResultDto, String> {
    engine.run_chip_package_analysis(node_id, params).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_dba_comparison(
    engine: tauri::State<EngineState>,
    node_id: Uuid,
    params: serde_json::Value,
) -> Result<DbaComparisonDto, String> {
    engine.run_dba_comparison(node_id, params).map_err(|e| e.to_string())
}
