use std::path::{Path, PathBuf};
use std::sync::Mutex;

use std::collections::{HashMap, HashSet};

use core_geometry::primitives::*;
use core_geometry::{Body, GeometryModel, TessellatedMesh};
use core_mesh::mesher::{MeshType, MeshingParams};
use core_mesh::quality;
use core_mesh::Mesh;
use core_post::{FieldLocation, FieldSummary, ResultSet};
use core_project::graph::ProjectGraph;
use core_project::model::*;
use core_project::persistence;
use uuid::Uuid;

use crate::dto::*;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("No project is currently open")]
    NoProject,
    #[error("Graph error: {0}")]
    Graph(#[from] core_project::graph::GraphError),
    #[error("Persistence error: {0}")]
    Persistence(#[from] persistence::PersistenceError),
    #[error("Geometry import error: {0}")]
    GeometryImport(#[from] core_geometry::import::ImportError),
    #[error("No geometry model found for node {0}")]
    NoGeometry(Uuid),
    #[error("Body not found: {0}")]
    BodyNotFound(Uuid),
    #[error("No mesh found for node {0}")]
    NoMesh(Uuid),
    #[error("Mesh generation error: {0}")]
    MeshGeneration(String),
    #[error("No upstream geometry found for mesh node {0}")]
    NoUpstreamGeometry(Uuid),
    #[error("No result found for node {0}")]
    NoResult(Uuid),
    #[error("No upstream mesh found for solver node {0}")]
    NoUpstreamMesh(Uuid),
    #[error("Solver error: {0}")]
    Solver(String),
    #[error("Lock poisoned")]
    LockPoisoned,
    #[error("Security: {0}")]
    Security(String),
    #[error("Validation: {0}")]
    Validation(String),
}

// --- Security: path validation ---
fn validate_project_path(path: &str) -> Result<PathBuf, EngineError> {
    if path.is_empty() {
        return Err(EngineError::Security("Empty path".into()));
    }
    if path.contains("..") {
        return Err(EngineError::Security("Path traversal detected".into()));
    }
    let p = PathBuf::from(path);
    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
        if ext.to_lowercase() != "osw" {
            return Err(EngineError::Validation(format!("Invalid project file extension: .{ext} (expected .osw)")));
        }
    }
    Ok(p)
}

fn validate_import_path(path: &str) -> Result<PathBuf, EngineError> {
    if path.is_empty() {
        return Err(EngineError::Security("Empty path".into()));
    }
    if path.contains("..") {
        return Err(EngineError::Security("Path traversal detected".into()));
    }
    let p = PathBuf::from(path);
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).unwrap_or_default();
    if ext != "stl" && ext != "obj" {
        return Err(EngineError::Validation(format!("Unsupported file format: .{ext} (expected .stl or .obj)")));
    }
    Ok(p)
}

fn validate_positive(value: f64, name: &str) -> Result<(), EngineError> {
    if !value.is_finite() || value <= 0.0 {
        return Err(EngineError::Validation(format!("{name} must be a positive finite number, got {value}")));
    }
    if value > 1e6 {
        return Err(EngineError::Validation(format!("{name} exceeds maximum allowed value (1e6), got {value}")));
    }
    Ok(())
}

/// The central application engine, holding the current project state.
pub struct AppEngine {
    graph: Mutex<Option<ProjectGraph>>,
    project_path: Mutex<Option<PathBuf>>,
}

impl AppEngine {
    pub fn new() -> Self {
        Self {
            graph: Mutex::new(None),
            project_path: Mutex::new(None),
        }
    }

    // -- Project operations --

    pub fn new_project(&self, name: &str) -> Result<ProjectSchematicDto, EngineError> {
        let project = Project::new(name);
        let graph = ProjectGraph::new(project);
        let dto = self.graph_to_dto(&graph);
        *self.graph.lock().map_err(|_| EngineError::LockPoisoned)? = Some(graph);
        *self
            .project_path
            .lock()
            .map_err(|_| EngineError::LockPoisoned)? = None;
        Ok(dto)
    }

    pub fn open_project(&self, path: &str) -> Result<ProjectSchematicDto, EngineError> {
        let p = validate_project_path(path)?;
        let graph = persistence::load_project(&p)?;
        let dto = self.graph_to_dto(&graph);
        *self.graph.lock().map_err(|_| EngineError::LockPoisoned)? = Some(graph);
        *self
            .project_path
            .lock()
            .map_err(|_| EngineError::LockPoisoned)? = Some(p);
        Ok(dto)
    }

    pub fn save_project(&self, path: Option<&str>) -> Result<OperationResult, EngineError> {
        let graph_lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = graph_lock.as_ref().ok_or(EngineError::NoProject)?;

        let save_path = if let Some(p) = path {
            validate_project_path(p)?
        } else {
            self.project_path
                .lock()
                .map_err(|_| EngineError::LockPoisoned)?
                .clone()
                .ok_or(EngineError::NoProject)?
        };

        persistence::save_project(graph, &save_path)?;

        // Update saved path
        drop(graph_lock);
        *self
            .project_path
            .lock()
            .map_err(|_| EngineError::LockPoisoned)? = Some(save_path.clone());

        Ok(OperationResult {
            success: true,
            message: format!("Project saved to {}", save_path.display()),
            id: None,
        })
    }

    // -- Graph operations --

    pub fn get_schematic(&self) -> Result<ProjectSchematicDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        Ok(self.graph_to_dto(graph))
    }

    pub fn add_system(&self, req: CreateSystemRequest) -> Result<SystemNodeDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        let id = graph.add_system(req.kind, req.position);

        // Auto-create geometry model for Geometry nodes
        if req.kind == SystemKind::Geometry {
            let name = graph.get_node(id).unwrap().name.clone();
            let model = GeometryModel::new(&name);
            let _ = graph.attach_geometry(id, model);
        }

        // Auto-create empty mesh for Mesh nodes
        if req.kind == SystemKind::Mesh {
            let mut mesh = Mesh::new();
            mesh.name = graph.get_node(id).unwrap().name.clone();
            let _ = graph.attach_mesh(id, mesh);
        }

        // Auto-create design study for DE nodes
        if matches!(req.kind, SystemKind::DesignOfExperiments | SystemKind::Optimization | SystemKind::ResponseSurface) {
            let name = graph.get_node(id).unwrap().name.clone();
            let study = core_parametric::DesignStudy::new(&name, core_parametric::DoeAlgorithm::LatinHypercube { samples: 10 });
            let _ = graph.attach_study(id, study);
        }

        let node = graph.get_node(id).unwrap();
        Ok(self.node_to_dto(node))
    }

    pub fn remove_system(&self, id: Uuid) -> Result<OperationResult, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        graph.remove_system(id)?;
        Ok(OperationResult {
            success: true,
            message: "System removed".into(),
            id: Some(id),
        })
    }

    pub fn connect_systems(
        &self,
        req: CreateConnectionRequest,
    ) -> Result<OperationResult, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        let conn_id = graph.connect(req.source, req.target, req.kind)?;
        Ok(OperationResult {
            success: true,
            message: "Systems connected".into(),
            id: Some(conn_id.0),
        })
    }

    pub fn disconnect(
        &self,
        connection_id: Uuid,
    ) -> Result<OperationResult, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        let removed = graph.disconnect(core_project::ConnectionId(connection_id));
        Ok(OperationResult {
            success: removed,
            message: if removed {
                "Connection removed".into()
            } else {
                "Connection not found".into()
            },
            id: Some(connection_id),
        })
    }

    pub fn mark_dirty(&self, node_id: Uuid) -> Result<ProjectSchematicDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        graph.mark_dirty_downstream(node_id);
        Ok(self.graph_to_dto(graph))
    }

    // -- Geometry operations --

    /// Create an empty geometry model and attach it to a system node.
    pub fn create_geometry(&self, node_id: Uuid) -> Result<GeometryModelDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        let node_name = graph
            .get_node(node_id)
            .ok_or_else(|| core_project::graph::GraphError::NodeNotFound(node_id))?
            .name
            .clone();

        let model = GeometryModel::new(&node_name);
        let geo_id = graph.attach_geometry(node_id, model)?;
        let geo = graph.geometry_models.get(&geo_id).unwrap();
        Ok(self.geometry_model_to_dto(geo))
    }

    /// Add a primitive body to a node's geometry model.
    pub fn add_primitive(
        &self,
        node_id: Uuid,
        kind: &str,
        name: &str,
        params: serde_json::Value,
    ) -> Result<BodyDto, EngineError> {
        let primitive = parse_primitive(kind, &params)?;
        let body = Body::from_primitive(name, primitive.clone());
        let body_dto = self.body_to_dto(&body);

        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        let geo = graph
            .get_geometry_mut(node_id)
            .ok_or(EngineError::NoGeometry(node_id))?;
        geo.add_body(body);

        // Mark downstream dirty
        graph.mark_dirty_downstream(node_id);

        Ok(body_dto)
    }

    /// Remove a body from a node's geometry model.
    pub fn remove_body(&self, node_id: Uuid, body_id: Uuid) -> Result<OperationResult, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;
        let geo = graph
            .get_geometry_mut(node_id)
            .ok_or(EngineError::NoGeometry(node_id))?;
        let removed = geo.remove_body(body_id);
        if removed {
            graph.mark_dirty_downstream(node_id);
        }
        Ok(OperationResult {
            success: removed,
            message: if removed {
                "Body removed".into()
            } else {
                "Body not found".into()
            },
            id: Some(body_id),
        })
    }

    /// Import a geometry file (STL/OBJ) and attach to a node.
    pub fn import_geometry(
        &self,
        node_id: Uuid,
        file_path: &str,
    ) -> Result<GeometryViewDto, EngineError> {
        let validated = validate_import_path(file_path)?;
        let path = validated.as_path();
        let model = core_geometry::import::import_file(path)?;

        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        // If node already has geometry, replace it
        if let Some(old_geo_id) = graph.get_node(node_id)
            .ok_or_else(|| core_project::graph::GraphError::NodeNotFound(node_id))?
            .geometry_id
        {
            graph.geometry_models.remove(&old_geo_id);
        }

        graph.attach_geometry(node_id, model)?;
        graph.mark_dirty_downstream(node_id);

        // Build view DTO
        let geo = graph.get_geometry(node_id).unwrap();
        let view = self.geometry_view_dto(node_id, geo);
        Ok(view)
    }

    /// Get the full geometry view for the 3D viewer.
    pub fn get_geometry_view(&self, node_id: Uuid) -> Result<GeometryViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let geo = graph
            .get_geometry(node_id)
            .ok_or(EngineError::NoGeometry(node_id))?;
        Ok(self.geometry_view_dto(node_id, geo))
    }

    // -- Mesh operations --

    /// Create an empty mesh and attach it to a system node.
    pub fn create_mesh(&self, node_id: Uuid) -> Result<MeshStatisticsDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        let node_name = graph
            .get_node(node_id)
            .ok_or_else(|| core_project::graph::GraphError::NodeNotFound(node_id))?
            .name
            .clone();

        let mut mesh = Mesh::new();
        mesh.name = node_name;
        graph.attach_mesh(node_id, mesh)?;

        let mesh = graph.get_mesh(node_id).unwrap();
        Ok(self.mesh_statistics_to_dto(&quality::compute_statistics(mesh)))
    }

    /// Generate a mesh from linked upstream geometry.
    pub fn generate_mesh(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<MeshViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        // Find upstream geometry: walk upstream connections looking for geometry
        let upstream_geo = self.find_upstream_geometry(graph, node_id)?;

        // Parse meshing params
        let max_element_size = params
            .get("max_element_size")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5);
        let surface_only = params
            .get("surface_only")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let meshing_params = MeshingParams {
            max_element_size,
            mesh_type: if surface_only {
                MeshType::SurfaceOnly
            } else {
                MeshType::Volume
            },
        };

        // Generate mesh
        let mesh = core_mesh::mesher::generate_mesh_from_geometry(&upstream_geo, &meshing_params)
            .map_err(|e| EngineError::MeshGeneration(e.to_string()))?;

        // Attach to node
        graph.attach_mesh(node_id, mesh)?;

        // Update node state
        if let Some(node) = graph.get_node_mut(node_id) {
            node.state = NodeState::Solved;
            for cell in &mut node.cells {
                cell.state = NodeState::Solved;
            }
        }
        graph.mark_dirty_downstream(node_id);

        // Build view DTO
        let mesh = graph.get_mesh(node_id).unwrap();
        Ok(self.build_mesh_view_dto(node_id, mesh))
    }

    /// Get the mesh view for the 3D viewer.
    pub fn get_mesh_view(&self, node_id: Uuid) -> Result<MeshViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let mesh = graph
            .get_mesh(node_id)
            .ok_or(EngineError::NoMesh(node_id))?;
        Ok(self.build_mesh_view_dto(node_id, mesh))
    }

    /// Find upstream geometry for a given node by traversing graph connections.
    fn find_upstream_geometry(
        &self,
        graph: &ProjectGraph,
        node_id: Uuid,
    ) -> Result<GeometryModel, EngineError> {
        // First check if the node itself has geometry
        if let Some(geo) = graph.get_geometry(node_id) {
            return Ok(geo.clone());
        }

        // Walk upstream looking for a node with geometry
        let upstream = graph.upstream_of(node_id);
        for up_id in &upstream {
            if let Some(geo) = graph.get_geometry(*up_id) {
                return Ok(geo.clone());
            }
            // Recurse one more level
            for up2_id in &graph.upstream_of(*up_id) {
                if let Some(geo) = graph.get_geometry(*up2_id) {
                    return Ok(geo.clone());
                }
            }
        }
        Err(EngineError::NoUpstreamGeometry(node_id))
    }

    fn mesh_statistics_to_dto(&self, stats: &quality::MeshStatistics) -> MeshStatisticsDto {
        MeshStatisticsDto {
            total_nodes: stats.total_nodes,
            total_elements: stats.total_elements,
            element_counts: stats
                .element_counts
                .iter()
                .map(|(k, v)| (format!("{:?}", k), *v))
                .collect(),
            min_quality: stats.min_quality,
            max_quality: stats.max_quality,
            avg_quality: stats.avg_quality,
        }
    }

    fn build_mesh_view_dto(&self, node_id: Uuid, mesh: &Mesh) -> MeshViewDto {
        let stats = quality::compute_statistics(mesh);

        // Extract unique edges for wireframe rendering
        let edge_vertices = self.extract_mesh_edges(mesh);

        // Extract surface triangles (Tri3 elements) for face rendering
        let (surface_vertices, surface_normals, surface_indices) =
            self.extract_surface_triangles(mesh);

        MeshViewDto {
            node_id,
            mesh_id: mesh.id,
            name: mesh.name.clone(),
            statistics: self.mesh_statistics_to_dto(&stats),
            edge_vertices,
            surface_vertices,
            surface_normals,
            surface_indices,
        }
    }

    /// Extract unique edges from mesh elements as pairs of vertex positions.
    fn extract_mesh_edges(&self, mesh: &Mesh) -> Vec<[f32; 3]> {
        let node_map: HashMap<u64, [f64; 3]> =
            mesh.nodes.iter().map(|n| (n.id, n.position)).collect();

        let mut seen_edges: HashSet<(u64, u64)> = HashSet::new();
        let mut edge_verts: Vec<[f32; 3]> = Vec::new();

        for el in &mesh.elements {
            let edges = element_edges(&el.kind, &el.node_ids);
            for (a, b) in edges {
                let key = if a < b { (a, b) } else { (b, a) };
                if seen_edges.insert(key) {
                    if let (Some(pa), Some(pb)) = (node_map.get(&a), node_map.get(&b)) {
                        edge_verts.push([pa[0] as f32, pa[1] as f32, pa[2] as f32]);
                        edge_verts.push([pb[0] as f32, pb[1] as f32, pb[2] as f32]);
                    }
                }
            }
        }
        edge_verts
    }

    /// Extract surface triangles from Tri3 elements with computed normals.
    fn extract_surface_triangles(
        &self,
        mesh: &Mesh,
    ) -> (Vec<[f32; 3]>, Vec<[f32; 3]>, Vec<u32>) {
        let node_map: HashMap<u64, [f64; 3]> =
            mesh.nodes.iter().map(|n| (n.id, n.position)).collect();

        let tri_elements: Vec<&core_mesh::Element> = mesh
            .elements
            .iter()
            .filter(|e| e.kind == core_mesh::ElementKind::Tri3)
            .collect();

        let mut vertices: Vec<[f32; 3]> = Vec::new();
        let mut normals: Vec<[f32; 3]> = Vec::new();
        let mut indices: Vec<u32> = Vec::new();

        for tri in &tri_elements {
            if tri.node_ids.len() < 3 {
                continue;
            }
            let pa = match node_map.get(&tri.node_ids[0]) {
                Some(p) => p,
                None => continue,
            };
            let pb = match node_map.get(&tri.node_ids[1]) {
                Some(p) => p,
                None => continue,
            };
            let pc = match node_map.get(&tri.node_ids[2]) {
                Some(p) => p,
                None => continue,
            };

            // Compute flat normal
            let ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
            let ac = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
            let nx = (ab[1] * ac[2] - ab[2] * ac[1]) as f32;
            let ny = (ab[2] * ac[0] - ab[0] * ac[2]) as f32;
            let nz = (ab[0] * ac[1] - ab[1] * ac[0]) as f32;
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            let normal = if len > 1e-12 {
                [nx / len, ny / len, nz / len]
            } else {
                [0.0, 1.0, 0.0]
            };

            let base = vertices.len() as u32;
            vertices.push([pa[0] as f32, pa[1] as f32, pa[2] as f32]);
            vertices.push([pb[0] as f32, pb[1] as f32, pb[2] as f32]);
            vertices.push([pc[0] as f32, pc[1] as f32, pc[2] as f32]);
            normals.push(normal);
            normals.push(normal);
            normals.push(normal);
            indices.push(base);
            indices.push(base + 1);
            indices.push(base + 2);
        }

        (vertices, normals, indices)
    }

    // -- Solver operations --

    /// Run the structural solver on a node.
    pub fn run_solver(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<ResultViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        // Find upstream mesh
        let upstream_mesh = self.find_upstream_mesh(graph, node_id)?;

        // Parse material properties
        let e = params.get("youngs_modulus").and_then(|v| v.as_f64()).unwrap_or(200e9);
        let nu = params.get("poisson_ratio").and_then(|v| v.as_f64()).unwrap_or(0.3);
        let material = physics_structural::IsotropicMaterial {
            youngs_modulus: e,
            poisson_ratio: nu,
            density: 7800.0,
        };

        // Build analysis with BCs from params
        let mut analysis = physics_structural::StructuralAnalysis::new_static();

        // Parse boundary conditions from params
        if let Some(bcs) = params.get("boundary_conditions").and_then(|v| v.as_array()) {
            for bc_val in bcs {
                if let Some(bc) = parse_boundary_condition(bc_val) {
                    analysis.boundary_conditions.push(bc);
                }
            }
        }

        // If no BCs provided, use defaults: fix bottom nodes, apply downward force on top
        if analysis.boundary_conditions.is_empty() {
            // Find min/max Z to create default node sets
            let (min_z, max_z) = self.find_z_bounds(&upstream_mesh);
            let tol = (max_z - min_z) * 0.05;

            let fixed_ids: Vec<u64> = upstream_mesh.nodes.iter()
                .filter(|n| n.position[2] <= min_z + tol)
                .map(|n| n.id)
                .collect();
            let load_ids: Vec<u64> = upstream_mesh.nodes.iter()
                .filter(|n| n.position[2] >= max_z - tol)
                .map(|n| n.id)
                .collect();

            // Set up node sets
            let fixed_str = fixed_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
            let load_str = load_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");

            analysis.boundary_conditions.push(physics_structural::BoundaryCondition::FixedSupport {
                node_set: fixed_str,
            });
            analysis.boundary_conditions.push(physics_structural::BoundaryCondition::Force {
                node_set: load_str,
                values: [0.0, 0.0, -1000.0],
            });
        }

        // Run solver
        let result_set = physics_structural::solver::solve_linear_static(
            &upstream_mesh, &analysis, &material,
        ).map_err(|e| EngineError::Solver(e.to_string()))?;

        // Attach result to node
        graph.attach_result(node_id, result_set)?;

        // Update node state
        if let Some(node) = graph.get_node_mut(node_id) {
            node.state = NodeState::Solved;
            for cell in &mut node.cells {
                cell.state = NodeState::Solved;
            }
        }
        graph.mark_dirty_downstream(node_id);

        // Build view
        let result = graph.get_result(node_id).unwrap();
        let field_name = "Displacement";
        Ok(self.build_result_view_dto(node_id, result, &upstream_mesh, field_name))
    }

    /// Get result view for rendering.
    pub fn get_result_view(
        &self,
        node_id: Uuid,
        field_name: &str,
    ) -> Result<ResultViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let result = graph.get_result(node_id).ok_or(EngineError::NoResult(node_id))?;
        let mesh = self.find_upstream_mesh(graph, node_id)?;
        Ok(self.build_result_view_dto(node_id, result, &mesh, field_name))
    }

    fn find_upstream_mesh(&self, graph: &ProjectGraph, node_id: Uuid) -> Result<Mesh, EngineError> {
        // Check if node itself has a mesh
        if let Some(mesh) = graph.get_mesh(node_id) {
            return Ok(mesh.clone());
        }
        // Walk upstream
        for up_id in &graph.upstream_of(node_id) {
            if let Some(mesh) = graph.get_mesh(*up_id) {
                return Ok(mesh.clone());
            }
            for up2_id in &graph.upstream_of(*up_id) {
                if let Some(mesh) = graph.get_mesh(*up2_id) {
                    return Ok(mesh.clone());
                }
            }
        }
        Err(EngineError::NoUpstreamMesh(node_id))
    }

    fn find_z_bounds(&self, mesh: &Mesh) -> (f64, f64) {
        let mut min_z = f64::MAX;
        let mut max_z = f64::MIN;
        for n in &mesh.nodes {
            min_z = min_z.min(n.position[2]);
            max_z = max_z.max(n.position[2]);
        }
        (min_z, max_z)
    }

    fn build_result_view_dto(
        &self,
        node_id: Uuid,
        result: &ResultSet,
        mesh: &Mesh,
        field_name: &str,
    ) -> ResultViewDto {
        // Build field summaries
        let field_summaries: Vec<ResultSummaryDto> = result.fields.iter()
            .filter_map(|f| {
                let summary = FieldSummary::compute(f, 0)?;
                Some(ResultSummaryDto {
                    field_name: f.name.clone(),
                    location: format!("{:?}", f.location),
                    min: summary.min,
                    max: summary.max,
                    mean: summary.mean,
                })
            })
            .collect();

        // Get the requested field
        let field = result.fields.iter().find(|f| f.name == field_name);

        // Build node value map (scalar value per node for coloring)
        let node_id_to_idx: HashMap<u64, usize> = mesh.nodes.iter()
            .enumerate()
            .map(|(i, n)| (n.id, i))
            .collect();

        let (node_scalars, field_min, field_max) = if let Some(field) = field {
            let values = &field.values[0]; // time step 0
            match field.location {
                FieldLocation::Node => {
                    let scalars: Vec<f64> = values.iter()
                        .map(|comps| {
                            if comps.len() == 1 { comps[0] }
                            else { comps.iter().map(|c| c * c).sum::<f64>().sqrt() }
                        })
                        .collect();
                    let min = scalars.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = scalars.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    (scalars, min, max)
                }
                FieldLocation::Element => {
                    // Average element values to nodes
                    let mut node_sums = vec![0.0_f64; mesh.nodes.len()];
                    let mut node_counts = vec![0_u32; mesh.nodes.len()];
                    let tet_elements: Vec<_> = mesh.elements.iter()
                        .filter(|e| e.kind == core_mesh::ElementKind::Tet4)
                        .collect();
                    for (ei, elem) in tet_elements.iter().enumerate() {
                        if ei >= values.len() { break; }
                        let val = values[ei][0];
                        for &nid in &elem.node_ids {
                            if let Some(&idx) = node_id_to_idx.get(&nid) {
                                node_sums[idx] += val;
                                node_counts[idx] += 1;
                            }
                        }
                    }
                    let scalars: Vec<f64> = node_sums.iter().zip(node_counts.iter())
                        .map(|(&s, &c)| if c > 0 { s / c as f64 } else { 0.0 })
                        .collect();
                    let min = scalars.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = scalars.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    (scalars, min, max)
                }
                _ => (vec![0.0; mesh.nodes.len()], 0.0, 1.0),
            }
        } else {
            (vec![0.0; mesh.nodes.len()], 0.0, 1.0)
        };

        // Build surface triangles with colors
        let tri_elements: Vec<_> = mesh.elements.iter()
            .filter(|e| e.kind == core_mesh::ElementKind::Tri3)
            .collect();

        let mut surface_vertices = Vec::new();
        let mut surface_normals = Vec::new();
        let mut surface_indices = Vec::new();
        let mut vertex_colors = Vec::new();

        for tri in &tri_elements {
            if tri.node_ids.len() < 3 { continue; }
            let idxs: Vec<usize> = tri.node_ids.iter()
                .filter_map(|nid| node_id_to_idx.get(nid).copied())
                .collect();
            if idxs.len() < 3 { continue; }

            let pa = mesh.nodes[idxs[0]].position;
            let pb = mesh.nodes[idxs[1]].position;
            let pc = mesh.nodes[idxs[2]].position;

            // Compute normal
            let ab = [pb[0]-pa[0], pb[1]-pa[1], pb[2]-pa[2]];
            let ac = [pc[0]-pa[0], pc[1]-pa[1], pc[2]-pa[2]];
            let nx = (ab[1]*ac[2] - ab[2]*ac[1]) as f32;
            let ny = (ab[2]*ac[0] - ab[0]*ac[2]) as f32;
            let nz = (ab[0]*ac[1] - ab[1]*ac[0]) as f32;
            let len = (nx*nx + ny*ny + nz*nz).sqrt();
            let normal = if len > 1e-12 { [nx/len, ny/len, nz/len] } else { [0.0, 1.0, 0.0] };

            let base = surface_vertices.len() as u32;
            for &idx in &idxs {
                surface_vertices.push([
                    mesh.nodes[idx].position[0] as f32,
                    mesh.nodes[idx].position[1] as f32,
                    mesh.nodes[idx].position[2] as f32,
                ]);
                surface_normals.push(normal);
                let color = value_to_color(node_scalars[idx], field_min, field_max);
                vertex_colors.push(color);
            }
            surface_indices.push(base);
            surface_indices.push(base + 1);
            surface_indices.push(base + 2);
        }

        ResultViewDto {
            node_id,
            result_id: result.id,
            name: result.name.clone(),
            field_name: field_name.to_string(),
            field_summaries,
            surface_vertices,
            surface_normals,
            surface_indices,
            vertex_colors,
            color_range: [field_min, field_max],
        }
    }

    // -- Design Exploration operations --

    /// Create or update a design study with parameters.
    pub fn create_design_study(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<DesignExplorationViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        // Parse parameters
        let mut parameters = Vec::new();
        if let Some(param_arr) = params.get("parameters").and_then(|v| v.as_array()) {
            for p in param_arr {
                parameters.push(core_parametric::Parameter {
                    id: uuid::Uuid::new_v4(),
                    name: p.get("name").and_then(|v| v.as_str()).unwrap_or("P").to_string(),
                    description: String::new(),
                    value: p.get("value").and_then(|v| v.as_f64()).unwrap_or(1.0),
                    lower_bound: p.get("lower_bound").and_then(|v| v.as_f64()),
                    upper_bound: p.get("upper_bound").and_then(|v| v.as_f64()),
                    distribution: None,
                });
            }
        }

        let doe_str = params.get("doe_algorithm").and_then(|v| v.as_str()).unwrap_or("LatinHypercube");
        let samples = params.get("samples").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
        let doe = match doe_str {
            "FullFactorial" => core_parametric::DoeAlgorithm::FullFactorial { levels: samples },
            "CentralComposite" => core_parametric::DoeAlgorithm::CentralComposite,
            _ => core_parametric::DoeAlgorithm::LatinHypercube { samples },
        };

        let output_names: Vec<String> = params.get("output_names")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_else(|| vec!["Displacement".into(), "VonMises".into()]);

        let mut study = core_parametric::DesignStudy::new(
            graph.get_node(node_id).map(|n| n.name.as_str()).unwrap_or("Study"),
            doe,
        );
        study.parameters = parameters;
        study.output_names = output_names;

        graph.attach_study(node_id, study)?;

        let study = graph.get_study(node_id).unwrap();
        Ok(self.build_de_view_dto(node_id, study))
    }

    /// Run DOE: generate design points and evaluate (mock solver for now).
    pub fn run_doe(&self, node_id: Uuid) -> Result<DesignExplorationViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        let study = graph.get_study_mut(node_id)
            .ok_or(EngineError::NoResult(node_id))?;

        // Generate DOE points
        let doe_values = core_parametric::doe::generate_doe_points(&study.parameters, &study.doe_algorithm);

        // Create design points and mock-evaluate them
        study.design_points.clear();
        for param_vals in doe_values {
            // Mock evaluation: simple analytical function of parameters
            let output_vals: Vec<f64> = study.output_names.iter().enumerate().map(|(oi, _)| {
                // Mock output: sum of squares + offset per output
                let base: f64 = param_vals.iter().map(|v| v * v).sum();
                base * (1.0 + oi as f64 * 0.5) + 0.01 * param_vals.iter().sum::<f64>()
            }).collect();

            study.design_points.push(core_parametric::DesignPoint {
                id: uuid::Uuid::new_v4(),
                parameter_values: param_vals,
                output_values: output_vals,
                status: core_parametric::DesignPointStatus::Converged,
            });
        }

        // Update node state
        if let Some(node) = graph.get_node_mut(node_id) {
            node.state = NodeState::Solved;
            for cell in &mut node.cells { cell.state = NodeState::Solved; }
        }

        let study = graph.get_study(node_id).unwrap();
        Ok(self.build_de_view_dto(node_id, study))
    }

    /// Fit response surface from DOE results.
    pub fn fit_response_surface_cmd(
        &self,
        node_id: Uuid,
        output_idx: usize,
    ) -> Result<DesignExplorationViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let study = graph.get_study(node_id).ok_or(EngineError::NoResult(node_id))?;

        let mut view = self.build_de_view_dto(node_id, study);

        // Fit response surface
        if let Some(surface) = core_parametric::response_surface::fit_response_surface(study, output_idx) {
            let grid = surface.eval_grid(&study.parameters, 20);
            view.response_surface = Some(ResponseSurfaceDto {
                r_squared: surface.r_squared,
                grid,
                param_names: surface.param_names.clone(),
            });
        }

        Ok(view)
    }

    /// Run optimization over response surface.
    pub fn run_optimization_cmd(
        &self,
        node_id: Uuid,
        output_idx: usize,
        minimize: bool,
    ) -> Result<DesignExplorationViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let study = graph.get_study(node_id).ok_or(EngineError::NoResult(node_id))?;

        let mut view = self.build_de_view_dto(node_id, study);

        if let Some(surface) = core_parametric::response_surface::fit_response_surface(study, output_idx) {
            let objective = if minimize {
                core_parametric::optimizer::Objective::Minimize
            } else {
                core_parametric::optimizer::Objective::Maximize
            };
            let opt_result = core_parametric::optimizer::optimize(&surface, &study.parameters, objective);

            let grid = surface.eval_grid(&study.parameters, 20);
            view.response_surface = Some(ResponseSurfaceDto {
                r_squared: surface.r_squared,
                grid,
                param_names: surface.param_names,
            });
            view.optimization_result = Some(OptimizationResultDto {
                optimal_params: opt_result.optimal_params,
                param_names: opt_result.param_names,
                optimal_value: opt_result.optimal_value,
                history: opt_result.history,
            });
        }

        Ok(view)
    }

    /// Get the DE view.
    pub fn get_design_exploration_view(&self, node_id: Uuid) -> Result<DesignExplorationViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let study = graph.get_study(node_id).ok_or(EngineError::NoResult(node_id))?;
        Ok(self.build_de_view_dto(node_id, study))
    }

    fn build_de_view_dto(&self, node_id: Uuid, study: &core_parametric::DesignStudy) -> DesignExplorationViewDto {
        DesignExplorationViewDto {
            node_id,
            study_id: study.id,
            name: study.name.clone(),
            parameters: study.parameters.iter().map(|p| ParameterDto {
                name: p.name.clone(),
                value: p.value,
                lower_bound: p.lower_bound.unwrap_or(0.0),
                upper_bound: p.upper_bound.unwrap_or(1.0),
            }).collect(),
            output_names: study.output_names.clone(),
            doe_algorithm: format!("{:?}", study.doe_algorithm),
            design_points: study.design_points.iter().map(|dp| DesignPointDto {
                id: dp.id,
                parameter_values: dp.parameter_values.clone(),
                output_values: dp.output_values.clone(),
                status: format!("{:?}", dp.status),
            }).collect(),
            response_surface: None,
            optimization_result: None,
            pareto_indices: None,
            six_sigma: None,
        }
    }

    // -- Thermal solver --

    pub fn run_thermal_solver(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<ResultViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        let upstream_mesh = self.find_upstream_mesh(graph, node_id)?;

        let k = params.get("conductivity").and_then(|v| v.as_f64()).unwrap_or(50.0);
        let material = physics_thermal::ThermalMaterial {
            conductivity: k,
            specific_heat: 500.0,
            density: 7800.0,
        };

        let mut analysis = physics_thermal::ThermalAnalysis {
            id: uuid::Uuid::new_v4(),
            analysis_type: physics_thermal::ThermalAnalysisType::SteadyState,
            boundary_conditions: Vec::new(),
            solver_settings: Default::default(),
        };

        // Parse BCs or use defaults
        if let Some(bcs) = params.get("boundary_conditions").and_then(|v| v.as_array()) {
            for bc_val in bcs {
                if let Some(bc) = parse_thermal_bc(bc_val) {
                    analysis.boundary_conditions.push(bc);
                }
            }
        }

        if analysis.boundary_conditions.is_empty() {
            let (min_z, max_z) = self.find_z_bounds(&upstream_mesh);
            let tol = (max_z - min_z) * 0.05;
            let hot_ids: String = upstream_mesh.nodes.iter()
                .filter(|n| n.position[2] >= max_z - tol)
                .map(|n| n.id.to_string())
                .collect::<Vec<_>>().join(",");
            let cold_ids: String = upstream_mesh.nodes.iter()
                .filter(|n| n.position[2] <= min_z + tol)
                .map(|n| n.id.to_string())
                .collect::<Vec<_>>().join(",");

            analysis.boundary_conditions.push(
                physics_thermal::ThermalBc::FixedTemperature { node_set: hot_ids, temperature: 100.0 }
            );
            analysis.boundary_conditions.push(
                physics_thermal::ThermalBc::FixedTemperature { node_set: cold_ids, temperature: 20.0 }
            );
        }

        let result_set = physics_thermal::solver::solve_steady_thermal(
            &upstream_mesh, &analysis, &material,
        ).map_err(|e| EngineError::Solver(e.to_string()))?;

        graph.attach_result(node_id, result_set)?;

        if let Some(node) = graph.get_node_mut(node_id) {
            node.state = NodeState::Solved;
            for cell in &mut node.cells { cell.state = NodeState::Solved; }
        }

        let result = graph.get_result(node_id).unwrap();
        Ok(self.build_result_view_dto(node_id, result, &upstream_mesh, "Temperature"))
    }

    // -- Pareto + Six Sigma --

    pub fn run_pareto(&self, node_id: Uuid) -> Result<DesignExplorationViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let study = graph.get_study(node_id).ok_or(EngineError::NoResult(node_id))?;

        let mut view = self.build_de_view_dto(node_id, study);
        let pareto = core_parametric::optimizer::pareto_frontier(study, 0, 1);
        view.pareto_indices = Some(pareto);
        Ok(view)
    }

    pub fn run_six_sigma(
        &self,
        node_id: Uuid,
        output_idx: usize,
    ) -> Result<DesignExplorationViewDto, EngineError> {
        let lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_ref().ok_or(EngineError::NoProject)?;
        let study = graph.get_study(node_id).ok_or(EngineError::NoResult(node_id))?;

        let mut view = self.build_de_view_dto(node_id, study);

        if let Some(surface) = core_parametric::response_surface::fit_response_surface(study, output_idx) {
            let mc = core_parametric::six_sigma::MonteCarloParams { samples: 1000, seed: 42 };
            let result = core_parametric::six_sigma::run_monte_carlo(&surface, &study.parameters, &mc);
            view.six_sigma = Some(SixSigmaResultDto {
                mean: result.mean,
                std_dev: result.std_dev,
                cpk: result.cpk,
                histogram_bins: result.histogram_bins,
                histogram_counts: result.histogram_counts,
                sample_count: result.sample_count,
            });

            let grid = surface.eval_grid(&study.parameters, 20);
            view.response_surface = Some(ResponseSurfaceDto {
                r_squared: surface.r_squared,
                grid,
                param_names: surface.param_names,
            });
        }

        Ok(view)
    }

    // -- Chip Package Analysis --

    pub fn run_chip_package_analysis(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<ChipPackageResultDto, EngineError> {
        let analysis_type = params.get("analysis_type")
            .and_then(|v| v.as_str()).unwrap_or("thermal").to_string();
        let dba_name = params.get("dba_material")
            .and_then(|v| v.as_str()).unwrap_or("Epoxy DBA").to_string();

        // Build chip package geometry
        let cp_params = core_geometry::primitives::ChipPackagePrimitive::default_package();
        let _geometry = core_geometry::build_chip_package(&cp_params);

        // Generate conforming mesh
        let mesh_params = core_mesh::mesher::MeshingParams {
            max_element_size: 1.0,
            mesh_type: core_mesh::mesher::MeshType::Volume,
        };
        let mesh = core_mesh::mesher::generate_chip_package_mesh(&cp_params, &mesh_params)
            .map_err(|e| EngineError::Solver(e.to_string()))?;

        let library = core_materials::default_library();

        let result_set = if analysis_type == "thermal" {
            self.run_chip_thermal(&mesh, &dba_name, &library, &params)?
        } else {
            self.run_chip_shear(&mesh, &dba_name, &library, &params)?
        };

        // Build layer summaries
        let field_name = if analysis_type == "thermal" { "Temperature" } else { "VonMises" };
        let layer_summaries = self.compute_layer_summaries(&mesh, &result_set, field_name);

        let result_view = self.build_result_view_dto(node_id, &result_set, &mesh, field_name);

        Ok(ChipPackageResultDto {
            node_id,
            analysis_type,
            result_view,
            layer_summaries,
            dba_material: dba_name,
        })
    }

    fn run_chip_thermal(
        &self,
        mesh: &core_mesh::Mesh,
        dba_name: &str,
        library: &[core_materials::Material],
        params: &serde_json::Value,
    ) -> Result<core_post::ResultSet, EngineError> {
        let mut mat_map = std::collections::HashMap::new();

        let cu_k = core_materials::find_by_name(library, "Copper Alloy C194")
            .and_then(|m| m.properties.thermal_conductivity).unwrap_or(260.0);
        let dba_k = core_materials::find_by_name(library, dba_name)
            .and_then(|m| m.properties.thermal_conductivity).unwrap_or(1.5);
        let si_k = core_materials::find_by_name(library, "Silicon")
            .and_then(|m| m.properties.thermal_conductivity).unwrap_or(148.0);

        mat_map.insert("leadframe".to_string(), physics_thermal::ThermalMaterial {
            conductivity: cu_k, specific_heat: 385.0, density: 8900.0,
        });
        mat_map.insert("dba".to_string(), physics_thermal::ThermalMaterial {
            conductivity: dba_k, specific_heat: 500.0, density: 2000.0,
        });
        mat_map.insert("die".to_string(), physics_thermal::ThermalMaterial {
            conductivity: si_k, specific_heat: 700.0, density: 2330.0,
        });

        let heat_flux = params.get("heat_flux").and_then(|v| v.as_f64()).unwrap_or(5e4);
        let bottom_temp = params.get("temperature").and_then(|v| v.as_f64()).unwrap_or(25.0);

        let bottom_ids: String = mesh.node_sets.iter()
            .find(|ns| ns.name == "leadframe_bottom")
            .map(|ns| ns.node_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(","))
            .unwrap_or_default();

        let analysis = physics_thermal::ThermalAnalysis {
            id: Uuid::new_v4(),
            analysis_type: physics_thermal::ThermalAnalysisType::SteadyState,
            boundary_conditions: vec![
                physics_thermal::ThermalBc::FixedTemperature { node_set: bottom_ids, temperature: bottom_temp },
                physics_thermal::ThermalBc::HeatFlux { element_set: "die_top".into(), flux: heat_flux },
            ],
            solver_settings: Default::default(),
        };

        let thermal_mat_map = physics_thermal::ThermalMaterialMap { element_set_materials: mat_map };

        physics_thermal::solver::solve_steady_thermal_multi_material(mesh, &analysis, &thermal_mat_map)
            .map_err(|e| EngineError::Solver(e.to_string()))
    }

    fn run_chip_shear(
        &self,
        mesh: &core_mesh::Mesh,
        dba_name: &str,
        library: &[core_materials::Material],
        params: &serde_json::Value,
    ) -> Result<core_post::ResultSet, EngineError> {
        // Multi-material structural analysis: each layer gets its own E/nu
        let mut struct_mat_map = std::collections::HashMap::new();

        let cu = core_materials::find_by_name(library, "Copper Alloy C194");
        struct_mat_map.insert("leadframe".to_string(), physics_structural::IsotropicMaterial {
            youngs_modulus: cu.and_then(|m| m.properties.youngs_modulus).unwrap_or(120e9),
            poisson_ratio: cu.and_then(|m| m.properties.poissons_ratio).unwrap_or(0.34),
            density: cu.and_then(|m| m.properties.density).unwrap_or(8900.0),
        });

        let dba = core_materials::find_by_name(library, dba_name);
        struct_mat_map.insert("dba".to_string(), physics_structural::IsotropicMaterial {
            youngs_modulus: dba.and_then(|m| m.properties.youngs_modulus).unwrap_or(3.5e9),
            poisson_ratio: dba.and_then(|m| m.properties.poissons_ratio).unwrap_or(0.35),
            density: dba.and_then(|m| m.properties.density).unwrap_or(1200.0),
        });

        let si = core_materials::find_by_name(library, "Silicon");
        struct_mat_map.insert("die".to_string(), physics_structural::IsotropicMaterial {
            youngs_modulus: si.and_then(|m| m.properties.youngs_modulus).unwrap_or(130e9),
            poisson_ratio: si.and_then(|m| m.properties.poissons_ratio).unwrap_or(0.28),
            density: si.and_then(|m| m.properties.density).unwrap_or(2330.0),
        });

        let force = params.get("force").and_then(|v| v.as_f64()).unwrap_or(10.0);

        let bottom_ids: String = mesh.node_sets.iter()
            .find(|ns| ns.name == "leadframe_bottom")
            .map(|ns| ns.node_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(","))
            .unwrap_or_default();
        let top_ids: String = mesh.node_sets.iter()
            .find(|ns| ns.name == "die_top")
            .map(|ns| ns.node_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(","))
            .unwrap_or_default();

        let material_map = physics_structural::StructuralMaterialMap {
            element_set_materials: struct_mat_map,
        };

        let analysis = physics_structural::StructuralAnalysis {
            id: Uuid::new_v4(),
            analysis_type: physics_structural::StructuralAnalysisType::LinearStatic,
            boundary_conditions: vec![
                physics_structural::BoundaryCondition::FixedSupport { node_set: bottom_ids },
                physics_structural::BoundaryCondition::Force {
                    node_set: top_ids,
                    values: [force, 0.0, 0.0], // lateral shear force in X
                },
            ],
            solver_settings: Default::default(),
        };

        physics_structural::solver::solve_linear_static_multi_material(mesh, &analysis, &material_map)
            .map_err(|e| EngineError::Solver(e.to_string()))
    }

    fn compute_layer_summaries(
        &self,
        mesh: &core_mesh::Mesh,
        result: &core_post::ResultSet,
        field_name: &str,
    ) -> Vec<LayerSummaryDto> {
        let field = result.fields.iter().find(|f| f.name == field_name);
        if field.is_none() || result.time_steps.is_empty() { return vec![]; }
        let field = field.unwrap();
        let values = &field.values[0]; // time step 0

        let layers = ["leadframe", "dba", "die"];
        let mut summaries = Vec::new();

        for layer_name in &layers {
            let elem_set = mesh.element_sets.iter().find(|es| es.name == *layer_name);
            if elem_set.is_none() { continue; }
            let elem_ids: std::collections::HashSet<u64> = elem_set.unwrap().element_ids.iter().copied().collect();

            if field.location == core_post::FieldLocation::Element {
                let tet_elems: Vec<_> = mesh.elements.iter()
                    .filter(|e| e.kind == core_mesh::ElementKind::Tet4)
                    .collect();
                let layer_vals: Vec<f64> = tet_elems.iter().enumerate()
                    .filter(|(_, e)| elem_ids.contains(&e.id))
                    .filter_map(|(i, _)| values.get(i).map(|v| v[0]))
                    .collect();

                if !layer_vals.is_empty() {
                    let min = layer_vals.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = layer_vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    let mean = layer_vals.iter().sum::<f64>() / layer_vals.len() as f64;
                    summaries.push(LayerSummaryDto {
                        layer_name: layer_name.to_string(), field_name: field_name.to_string(),
                        min, max, mean,
                    });
                }
            } else {
                // Node field — use all values for now
                let all_vals: Vec<f64> = values.iter().map(|v| v[0]).collect();
                if !all_vals.is_empty() {
                    let min = all_vals.iter().cloned().fold(f64::INFINITY, f64::min);
                    let max = all_vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                    let mean = all_vals.iter().sum::<f64>() / all_vals.len() as f64;
                    summaries.push(LayerSummaryDto {
                        layer_name: layer_name.to_string(), field_name: field_name.to_string(),
                        min, max, mean,
                    });
                }
            }
        }
        summaries
    }

    pub fn run_dba_comparison(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<DbaComparisonDto, EngineError> {
        let dba_materials = vec![
            "Epoxy DBA", "Solder SAC305", "Silver Sinter", "Conductive Adhesive",
        ];

        let mut rows = Vec::new();

        for dba_name in &dba_materials {
            // Thermal analysis
            let thermal_params = serde_json::json!({
                "analysis_type": "thermal",
                "dba_material": dba_name,
                "heat_flux": params.get("heat_flux").and_then(|v| v.as_f64()).unwrap_or(5e4),
                "temperature": params.get("temperature").and_then(|v| v.as_f64()).unwrap_or(25.0),
            });
            let thermal_result = self.run_chip_package_analysis(node_id, thermal_params);

            let (max_temp, thermal_resistance) = if let Ok(ref r) = thermal_result {
                let max_t = r.layer_summaries.iter()
                    .filter(|s| s.layer_name == "die")
                    .map(|s| s.max).next().unwrap_or(0.0);
                let base_temp = params.get("temperature").and_then(|v| v.as_f64()).unwrap_or(25.0);
                let heat_flux = params.get("heat_flux").and_then(|v| v.as_f64()).unwrap_or(5e4);
                let r_th = if heat_flux > 0.0 { (max_t - base_temp) / heat_flux } else { 0.0 };
                (Some(max_t), Some(r_th))
            } else { (None, None) };

            // Shear analysis
            let shear_params = serde_json::json!({
                "analysis_type": "shear",
                "dba_material": dba_name,
                "force": params.get("force").and_then(|v| v.as_f64()).unwrap_or(10.0),
            });
            let shear_result = self.run_chip_package_analysis(node_id, shear_params);

            let (max_shear, max_deformation) = if let Ok(ref r) = shear_result {
                let max_s = r.layer_summaries.iter()
                    .map(|s| s.max).fold(f64::NEG_INFINITY, f64::max);
                let disp_field = r.result_view.field_summaries.iter()
                    .find(|s| s.field_name == "Displacement");
                let max_d = disp_field.map(|s| s.max).unwrap_or(0.0);
                (Some(max_s), Some(max_d))
            } else { (None, None) };

            rows.push(DbaComparisonRow {
                material_name: dba_name.to_string(),
                max_temperature: max_temp,
                thermal_resistance,
                max_shear_stress: max_shear,
                max_deformation: max_deformation,
            });
        }

        Ok(DbaComparisonDto {
            node_id,
            materials: dba_materials.iter().map(|s| s.to_string()).collect(),
            results: rows,
        })
    }

    pub fn get_toolbox(&self) -> Vec<ToolboxEntry> {
        use SystemKind::*;
        let kinds = [
            StaticStructural,
            Modal,
            Harmonic,
            TransientStructural,
            SteadyThermal,
            TransientThermal,
            FluidFlow,
            Magnetostatic,
            Electrostatic,
            ThermalStructural,
            FluidStructureInteraction,
            Geometry,
            EngineeringData,
            Mesh,
            Result,
            ParameterSet,
            DesignOfExperiments,
            ResponseSurface,
            Optimization,
            SixSigma,
        ];
        kinds
            .iter()
            .map(|k| ToolboxEntry {
                kind: *k,
                display_name: k.display_name().to_string(),
                category: k.category(),
            })
            .collect()
    }

    // -- Internal helpers --

    fn graph_to_dto(&self, graph: &ProjectGraph) -> ProjectSchematicDto {
        ProjectSchematicDto {
            project_id: graph.project.id,
            project_name: graph.project.name.clone(),
            nodes: graph.ordered_nodes().iter().map(|n| self.node_to_dto(n)).collect(),
            connections: graph
                .connections
                .iter()
                .map(|c| ConnectionDto {
                    id: c.id.0,
                    source: c.source,
                    target: c.target,
                    kind: c.kind,
                })
                .collect(),
        }
    }

    /// Run CFD (Stokes flow) analysis on a mesh.
    pub fn run_cfd_analysis(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<ResultViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        let mesh = self.find_upstream_mesh(graph, node_id)?;

        let viscosity = params.get("viscosity").and_then(|v| v.as_f64()).unwrap_or(1.003e-3);
        let density = params.get("density").and_then(|v| v.as_f64()).unwrap_or(998.0);
        let fluid = physics_cfd::FluidMaterial { viscosity, density };

        let inlet_vel = params.get("inlet_velocity")
            .and_then(|v| v.as_array())
            .map(|a| [
                a.get(0).and_then(|x| x.as_f64()).unwrap_or(0.1),
                a.get(1).and_then(|x| x.as_f64()).unwrap_or(0.0),
                a.get(2).and_then(|x| x.as_f64()).unwrap_or(0.0),
            ])
            .unwrap_or([0.1, 0.0, 0.0]);

        // Build analysis with default BCs
        let analysis = physics_cfd::CfdAnalysis {
            id: Uuid::new_v4(),
            flow_type: physics_cfd::FlowType::SteadyIncompressible,
            boundary_conditions: vec![
                physics_cfd::CfdBc::VelocityInlet {
                    face_set: mesh.node_sets.first().map(|ns| ns.name.clone()).unwrap_or_else(|| "0".to_string()),
                    velocity: inlet_vel,
                },
                physics_cfd::CfdBc::Wall {
                    face_set: mesh.node_sets.last().map(|ns| ns.name.clone()).unwrap_or_else(|| "1".to_string()),
                    no_slip: true,
                },
            ],
            solver_settings: Default::default(),
        };

        let result = physics_cfd::solver::solve_stokes_flow(&mesh, &analysis, &fluid)
            .map_err(|e| EngineError::Solver(e.to_string()))?;

        Ok(self.build_result_view_dto(node_id, &result, &mesh, "VelocityMagnitude"))
    }

    /// Run EM (electrostatic or magnetostatic) analysis.
    pub fn run_em_analysis(
        &self,
        node_id: Uuid,
        params: serde_json::Value,
    ) -> Result<ResultViewDto, EngineError> {
        let mut lock = self.graph.lock().map_err(|_| EngineError::LockPoisoned)?;
        let graph = lock.as_mut().ok_or(EngineError::NoProject)?;

        let mesh = self.find_upstream_mesh(graph, node_id)?;

        let em_type = params.get("analysis_type")
            .and_then(|v| v.as_str())
            .unwrap_or("electrostatic");

        let high_set = mesh.node_sets.first().map(|ns| ns.name.clone()).unwrap_or_else(|| "0".to_string());
        let low_set = mesh.node_sets.last().map(|ns| ns.name.clone()).unwrap_or_else(|| "1".to_string());

        if em_type == "magnetostatic" {
            let mu = params.get("permeability").and_then(|v| v.as_f64())
                .unwrap_or(4.0 * std::f64::consts::PI * 1e-7);
            let material = physics_em::MagneticMaterial { permeability: mu };

            let analysis = physics_em::EmAnalysis {
                id: Uuid::new_v4(),
                analysis_type: physics_em::EmAnalysisType::Magnetostatic,
                boundary_conditions: vec![
                    physics_em::EmBc::MagneticFluxDensity {
                        face_set: high_set,
                        value: [0.0, 0.0, params.get("flux_density").and_then(|v| v.as_f64()).unwrap_or(1.0)],
                    },
                    physics_em::EmBc::Voltage { node_set: low_set, value: 0.0 },
                ],
                solver_settings: Default::default(),
            };

            let result = physics_em::solver::solve_magnetostatic(&mesh, &analysis, &material)
                .map_err(|e| EngineError::Solver(e.to_string()))?;

            Ok(self.build_result_view_dto(node_id, &result, &mesh, "MagneticPotential"))
        } else {
            let eps = params.get("permittivity").and_then(|v| v.as_f64()).unwrap_or(8.85e-12);
            let material = physics_em::DielectricMaterial { permittivity: eps, conductivity: 0.0 };

            let voltage_high = params.get("voltage_high").and_then(|v| v.as_f64()).unwrap_or(100.0);
            let voltage_low = params.get("voltage_low").and_then(|v| v.as_f64()).unwrap_or(0.0);

            let analysis = physics_em::EmAnalysis {
                id: Uuid::new_v4(),
                analysis_type: physics_em::EmAnalysisType::Electrostatic,
                boundary_conditions: vec![
                    physics_em::EmBc::Voltage { node_set: high_set, value: voltage_high },
                    physics_em::EmBc::Voltage { node_set: low_set, value: voltage_low },
                ],
                solver_settings: Default::default(),
            };

            let result = physics_em::solver::solve_electrostatic(&mesh, &analysis, &material)
                .map_err(|e| EngineError::Solver(e.to_string()))?;

            Ok(self.build_result_view_dto(node_id, &result, &mesh, "ElectricPotential"))
        }
    }

    fn node_to_dto(&self, node: &SystemNode) -> SystemNodeDto {
        SystemNodeDto {
            id: node.id,
            kind: node.kind,
            category: node.kind.category(),
            name: node.name.clone(),
            display_name: node.kind.display_name().to_string(),
            state: node.overall_state(),
            cells: node
                .cells
                .iter()
                .map(|c| CellDto {
                    id: c.id,
                    kind: c.kind,
                    display_name: c.kind.display_name().to_string(),
                    state: c.state,
                })
                .collect(),
            position: node.position,
            geometry_id: node.geometry_id,
            mesh_id: node.mesh_id,
            result_id: node.result_id,
            study_id: node.study_id,
        }
    }

    fn geometry_model_to_dto(&self, model: &GeometryModel) -> GeometryModelDto {
        GeometryModelDto {
            id: model.id,
            name: model.name.clone(),
            bodies: model.bodies.iter().map(|b| self.body_to_dto(b)).collect(),
        }
    }

    fn body_to_dto(&self, body: &Body) -> BodyDto {
        let primitive_kind = body.primitive.as_ref().map(|p| match p {
            Primitive::Box(_) => "Box".to_string(),
            Primitive::Cylinder(_) => "Cylinder".to_string(),
            Primitive::Sphere(_) => "Sphere".to_string(),
            Primitive::Plate(_) => "Plate".to_string(),
            Primitive::ChipPackage(_) => "ChipPackage".to_string(),
        });
        let bounding_box = body.primitive.as_ref().map(|p| p.bounding_box());
        BodyDto {
            id: body.id,
            name: body.name.clone(),
            primitive_kind,
            bounding_box,
        }
    }

    fn tessellation_to_dto(&self, mesh: &TessellatedMesh) -> TessellatedMeshDto {
        TessellatedMeshDto {
            vertices: mesh.vertices.clone(),
            normals: mesh.normals.clone(),
            indices: mesh.indices.clone(),
        }
    }

    fn geometry_view_dto(&self, node_id: Uuid, model: &GeometryModel) -> GeometryViewDto {
        let meshes: Vec<TessellatedMeshDto> = model
            .bodies
            .iter()
            .filter_map(|b| b.tessellation.as_ref().map(|t| self.tessellation_to_dto(t)))
            .collect();

        GeometryViewDto {
            node_id,
            model: self.geometry_model_to_dto(model),
            meshes,
        }
    }
}

/// Map a scalar value to a rainbow color (blue→cyan→green→yellow→red).
fn value_to_color(value: f64, min: f64, max: f64) -> [f32; 3] {
    let range = max - min;
    let t = if range > 1e-20 { ((value - min) / range).clamp(0.0, 1.0) } else { 0.5 };

    // Blue → Cyan → Green → Yellow → Red
    let (r, g, b) = if t < 0.25 {
        let s = t / 0.25;
        (0.0, s, 1.0)
    } else if t < 0.5 {
        let s = (t - 0.25) / 0.25;
        (0.0, 1.0, 1.0 - s)
    } else if t < 0.75 {
        let s = (t - 0.5) / 0.25;
        (s, 1.0, 0.0)
    } else {
        let s = (t - 0.75) / 0.25;
        (1.0, 1.0 - s, 0.0)
    };

    [r as f32, g as f32, b as f32]
}

/// Parse a boundary condition from a JSON value.
fn parse_boundary_condition(val: &serde_json::Value) -> Option<physics_structural::BoundaryCondition> {
    let bc_type = val.get("type")?.as_str()?;
    match bc_type {
        "FixedSupport" => {
            let node_set = val.get("node_set")?.as_str()?.to_string();
            Some(physics_structural::BoundaryCondition::FixedSupport { node_set })
        }
        "Force" => {
            let node_set = val.get("node_set")?.as_str()?.to_string();
            let values = parse_f64_array(val, "values").unwrap_or([0.0, 0.0, 0.0]);
            Some(physics_structural::BoundaryCondition::Force { node_set, values })
        }
        "Displacement" => {
            let node_set = val.get("node_set")?.as_str()?.to_string();
            let vals = val.get("values")?.as_array()?;
            let values = [
                vals.get(0).and_then(|v| v.as_f64()),
                vals.get(1).and_then(|v| v.as_f64()),
                vals.get(2).and_then(|v| v.as_f64()),
            ];
            Some(physics_structural::BoundaryCondition::Displacement { node_set, values })
        }
        _ => None,
    }
}

/// Parse a thermal boundary condition from JSON.
fn parse_thermal_bc(val: &serde_json::Value) -> Option<physics_thermal::ThermalBc> {
    let bc_type = val.get("type")?.as_str()?;
    match bc_type {
        "FixedTemperature" => {
            let node_set = val.get("node_set")?.as_str()?.to_string();
            let temperature = val.get("temperature")?.as_f64()?;
            Some(physics_thermal::ThermalBc::FixedTemperature { node_set, temperature })
        }
        "HeatFlux" => {
            let element_set = val.get("element_set")?.as_str()?.to_string();
            let flux = val.get("flux")?.as_f64()?;
            Some(physics_thermal::ThermalBc::HeatFlux { element_set, flux })
        }
        _ => None,
    }
}

/// Return the edges of an element as pairs of node IDs.
fn element_edges(kind: &core_mesh::ElementKind, node_ids: &[u64]) -> Vec<(u64, u64)> {
    match kind {
        core_mesh::ElementKind::Tri3 => {
            if node_ids.len() < 3 {
                return vec![];
            }
            vec![
                (node_ids[0], node_ids[1]),
                (node_ids[1], node_ids[2]),
                (node_ids[2], node_ids[0]),
            ]
        }
        core_mesh::ElementKind::Tet4 => {
            if node_ids.len() < 4 {
                return vec![];
            }
            vec![
                (node_ids[0], node_ids[1]),
                (node_ids[0], node_ids[2]),
                (node_ids[0], node_ids[3]),
                (node_ids[1], node_ids[2]),
                (node_ids[1], node_ids[3]),
                (node_ids[2], node_ids[3]),
            ]
        }
        core_mesh::ElementKind::Quad4 => {
            if node_ids.len() < 4 {
                return vec![];
            }
            vec![
                (node_ids[0], node_ids[1]),
                (node_ids[1], node_ids[2]),
                (node_ids[2], node_ids[3]),
                (node_ids[3], node_ids[0]),
            ]
        }
        core_mesh::ElementKind::Hex8 => {
            if node_ids.len() < 8 {
                return vec![];
            }
            vec![
                (node_ids[0], node_ids[1]),
                (node_ids[1], node_ids[2]),
                (node_ids[2], node_ids[3]),
                (node_ids[3], node_ids[0]),
                (node_ids[4], node_ids[5]),
                (node_ids[5], node_ids[6]),
                (node_ids[6], node_ids[7]),
                (node_ids[7], node_ids[4]),
                (node_ids[0], node_ids[4]),
                (node_ids[1], node_ids[5]),
                (node_ids[2], node_ids[6]),
                (node_ids[3], node_ids[7]),
            ]
        }
        _ => {
            // Generic: connect consecutive nodes
            let n = node_ids.len();
            if n < 2 {
                return vec![];
            }
            let mut edges = Vec::new();
            for i in 0..n {
                edges.push((node_ids[i], node_ids[(i + 1) % n]));
            }
            edges
        }
    }
}

/// Parse a primitive from a kind string and JSON params.
fn parse_primitive(kind: &str, params: &serde_json::Value) -> Result<Primitive, EngineError> {
    match kind {
        "Box" => {
            let origin = parse_f64_array(params, "origin").unwrap_or([0.0, 0.0, 0.0]);
            let dimensions = parse_f64_array(params, "dimensions").unwrap_or([1.0, 1.0, 1.0]);
            Ok(Primitive::Box(BoxPrimitive { origin, dimensions }))
        }
        "Cylinder" => {
            let origin = parse_f64_array(params, "origin").unwrap_or([0.0, 0.0, 0.0]);
            let axis = parse_f64_array(params, "axis").unwrap_or([0.0, 0.0, 1.0]);
            let radius = params.get("radius").and_then(|v| v.as_f64()).unwrap_or(0.5);
            let height = params.get("height").and_then(|v| v.as_f64()).unwrap_or(1.0);
            Ok(Primitive::Cylinder(CylinderPrimitive {
                origin,
                axis,
                radius,
                height,
            }))
        }
        "Sphere" => {
            let center = parse_f64_array(params, "center").unwrap_or([0.0, 0.0, 0.0]);
            let radius = params.get("radius").and_then(|v| v.as_f64()).unwrap_or(0.5);
            Ok(Primitive::Sphere(SpherePrimitive { center, radius }))
        }
        "Plate" => {
            let origin = parse_f64_array(params, "origin").unwrap_or([0.0, 0.0, 0.0]);
            let width = params.get("width").and_then(|v| v.as_f64()).unwrap_or(2.0);
            let height = params.get("height").and_then(|v| v.as_f64()).unwrap_or(1.0);
            let thickness = params.get("thickness").and_then(|v| v.as_f64()).unwrap_or(0.1);
            Ok(Primitive::Plate(PlatePrimitive {
                origin,
                width,
                height,
                thickness,
            }))
        }
        _ => Err(EngineError::NoGeometry(Uuid::nil())),
    }
}

fn parse_f64_array(params: &serde_json::Value, key: &str) -> Option<[f64; 3]> {
    let arr = params.get(key)?.as_array()?;
    if arr.len() >= 3 {
        Some([
            arr[0].as_f64().unwrap_or(0.0),
            arr[1].as_f64().unwrap_or(0.0),
            arr[2].as_f64().unwrap_or(0.0),
        ])
    } else {
        None
    }
}

impl Default for AppEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_project_lifecycle() {
        let engine = AppEngine::new();

        // Create project
        let schematic = engine.new_project("Test").unwrap();
        assert_eq!(schematic.project_name, "Test");
        assert!(schematic.nodes.is_empty());

        // Add systems
        let geo = engine
            .add_system(CreateSystemRequest {
                kind: SystemKind::Geometry,
                position: (50.0, 50.0),
            })
            .unwrap();
        let struc = engine
            .add_system(CreateSystemRequest {
                kind: SystemKind::StaticStructural,
                position: (250.0, 50.0),
            })
            .unwrap();

        // Connect
        let result = engine
            .connect_systems(CreateConnectionRequest {
                source: geo.id,
                target: struc.id,
                kind: ConnectionKind::GeometryShare,
            })
            .unwrap();
        assert!(result.success);

        // Verify schematic
        let schematic = engine.get_schematic().unwrap();
        assert_eq!(schematic.nodes.len(), 2);
        assert_eq!(schematic.connections.len(), 1);
    }

    #[test]
    fn engine_save_and_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.osw");
        let path_str = path.to_str().unwrap();

        let engine = AppEngine::new();
        engine.new_project("SaveTest").unwrap();
        engine
            .add_system(CreateSystemRequest {
                kind: SystemKind::StaticStructural,
                position: (100.0, 100.0),
            })
            .unwrap();

        engine.save_project(Some(path_str)).unwrap();

        // Load in a new engine
        let engine2 = AppEngine::new();
        let schematic = engine2.open_project(path_str).unwrap();
        assert_eq!(schematic.project_name, "SaveTest");
        assert_eq!(schematic.nodes.len(), 1);
    }
}
