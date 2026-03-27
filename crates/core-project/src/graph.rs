use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::model::{ConnectionKind, NodeState, Project, SystemKind, SystemNode};
use core_geometry::GeometryModel;
use core_mesh::Mesh;
use core_parametric::DesignStudy;
use core_post::ResultSet;

/// Unique identifier for a connection (edge) in the project graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ConnectionId(pub Uuid);

/// A directed edge in the project graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: ConnectionId,
    pub source: Uuid,
    pub target: Uuid,
    pub kind: ConnectionKind,
}

/// The project graph: nodes (systems) and edges (data dependencies).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectGraph {
    pub project: Project,
    pub nodes: HashMap<Uuid, SystemNode>,
    pub connections: Vec<Connection>,
    /// Insertion order for deterministic layout.
    node_order: Vec<Uuid>,
    /// Geometry models stored by their own UUID.
    #[serde(default)]
    pub geometry_models: HashMap<Uuid, GeometryModel>,
    /// Finite element meshes stored by their own UUID.
    #[serde(default)]
    pub meshes: HashMap<Uuid, Mesh>,
    /// Analysis result sets stored by their own UUID.
    #[serde(default)]
    pub results: HashMap<Uuid, ResultSet>,
    /// Design studies stored by their own UUID.
    #[serde(default)]
    pub design_studies: HashMap<Uuid, DesignStudy>,
}

#[derive(Debug, thiserror::Error)]
pub enum GraphError {
    #[error("Node not found: {0}")]
    NodeNotFound(Uuid),
    #[error("Connection would create a cycle")]
    CycleDetected,
    #[error("Duplicate connection between {0} and {1}")]
    DuplicateConnection(Uuid, Uuid),
    #[error("Cannot connect node to itself")]
    SelfConnection,
}

impl ProjectGraph {
    pub fn new(project: Project) -> Self {
        Self {
            project,
            nodes: HashMap::new(),
            connections: Vec::new(),
            node_order: Vec::new(),
            geometry_models: HashMap::new(),
            meshes: HashMap::new(),
            results: HashMap::new(),
            design_studies: HashMap::new(),
        }
    }

    /// Add a new system node to the graph.
    pub fn add_system(&mut self, kind: SystemKind, position: (f64, f64)) -> Uuid {
        let node = SystemNode::new(kind, position);
        let id = node.id;
        self.nodes.insert(id, node);
        self.node_order.push(id);
        self.project.touch();
        id
    }

    /// Remove a system node and all its connections (and associated geometry).
    pub fn remove_system(&mut self, id: Uuid) -> Result<SystemNode, GraphError> {
        let node = self.nodes.remove(&id).ok_or(GraphError::NodeNotFound(id))?;
        // Remove associated geometry model
        if let Some(geo_id) = node.geometry_id {
            self.geometry_models.remove(&geo_id);
        }
        // Remove associated mesh
        if let Some(mesh_id) = node.mesh_id {
            self.meshes.remove(&mesh_id);
        }
        // Remove associated results
        if let Some(result_id) = node.result_id {
            self.results.remove(&result_id);
        }
        // Remove associated design study
        if let Some(study_id) = node.study_id {
            self.design_studies.remove(&study_id);
        }
        self.connections
            .retain(|c| c.source != id && c.target != id);
        self.node_order.retain(|n| *n != id);
        self.project.touch();
        Ok(node)
    }

    /// Attach a geometry model to a system node.
    pub fn attach_geometry(&mut self, node_id: Uuid, model: GeometryModel) -> Result<Uuid, GraphError> {
        let node = self.nodes.get_mut(&node_id).ok_or(GraphError::NodeNotFound(node_id))?;
        let geo_id = model.id;
        node.geometry_id = Some(geo_id);
        self.geometry_models.insert(geo_id, model);
        self.project.touch();
        Ok(geo_id)
    }

    /// Get the geometry model associated with a system node.
    pub fn get_geometry(&self, node_id: Uuid) -> Option<&GeometryModel> {
        let node = self.nodes.get(&node_id)?;
        let geo_id = node.geometry_id?;
        self.geometry_models.get(&geo_id)
    }

    /// Get mutable geometry model associated with a system node.
    pub fn get_geometry_mut(&mut self, node_id: Uuid) -> Option<&mut GeometryModel> {
        let geo_id = self.nodes.get(&node_id)?.geometry_id?;
        self.geometry_models.get_mut(&geo_id)
    }

    /// Attach a mesh to a system node.
    pub fn attach_mesh(&mut self, node_id: Uuid, mesh: Mesh) -> Result<Uuid, GraphError> {
        let node = self
            .nodes
            .get_mut(&node_id)
            .ok_or(GraphError::NodeNotFound(node_id))?;
        let mesh_id = mesh.id;
        // Remove old mesh if any
        if let Some(old_id) = node.mesh_id {
            self.meshes.remove(&old_id);
        }
        node.mesh_id = Some(mesh_id);
        self.meshes.insert(mesh_id, mesh);
        self.project.touch();
        Ok(mesh_id)
    }

    /// Get the mesh associated with a system node.
    pub fn get_mesh(&self, node_id: Uuid) -> Option<&Mesh> {
        let node = self.nodes.get(&node_id)?;
        let mesh_id = node.mesh_id?;
        self.meshes.get(&mesh_id)
    }

    /// Get mutable mesh associated with a system node.
    pub fn get_mesh_mut(&mut self, node_id: Uuid) -> Option<&mut Mesh> {
        let mesh_id = self.nodes.get(&node_id)?.mesh_id?;
        self.meshes.get_mut(&mesh_id)
    }

    /// Attach a result set to a system node.
    pub fn attach_result(&mut self, node_id: Uuid, result: ResultSet) -> Result<Uuid, GraphError> {
        let node = self
            .nodes
            .get_mut(&node_id)
            .ok_or(GraphError::NodeNotFound(node_id))?;
        let result_id = result.id;
        if let Some(old_id) = node.result_id {
            self.results.remove(&old_id);
        }
        node.result_id = Some(result_id);
        self.results.insert(result_id, result);
        self.project.touch();
        Ok(result_id)
    }

    /// Get the result set associated with a system node.
    pub fn get_result(&self, node_id: Uuid) -> Option<&ResultSet> {
        let node = self.nodes.get(&node_id)?;
        let result_id = node.result_id?;
        self.results.get(&result_id)
    }

    /// Attach a design study to a system node.
    pub fn attach_study(&mut self, node_id: Uuid, study: DesignStudy) -> Result<Uuid, GraphError> {
        let node = self.nodes.get_mut(&node_id).ok_or(GraphError::NodeNotFound(node_id))?;
        let study_id = study.id;
        if let Some(old_id) = node.study_id {
            self.design_studies.remove(&old_id);
        }
        node.study_id = Some(study_id);
        self.design_studies.insert(study_id, study);
        self.project.touch();
        Ok(study_id)
    }

    /// Get the design study associated with a system node.
    pub fn get_study(&self, node_id: Uuid) -> Option<&DesignStudy> {
        let node = self.nodes.get(&node_id)?;
        let study_id = node.study_id?;
        self.design_studies.get(&study_id)
    }

    /// Get mutable design study.
    pub fn get_study_mut(&mut self, node_id: Uuid) -> Option<&mut DesignStudy> {
        let study_id = self.nodes.get(&node_id)?.study_id?;
        self.design_studies.get_mut(&study_id)
    }

    /// Connect two systems with a data-sharing edge.
    pub fn connect(
        &mut self,
        source: Uuid,
        target: Uuid,
        kind: ConnectionKind,
    ) -> Result<ConnectionId, GraphError> {
        if source == target {
            return Err(GraphError::SelfConnection);
        }
        if !self.nodes.contains_key(&source) {
            return Err(GraphError::NodeNotFound(source));
        }
        if !self.nodes.contains_key(&target) {
            return Err(GraphError::NodeNotFound(target));
        }

        // Check for duplicate
        if self
            .connections
            .iter()
            .any(|c| c.source == source && c.target == target && std::mem::discriminant(&c.kind) == std::mem::discriminant(&kind))
        {
            return Err(GraphError::DuplicateConnection(source, target));
        }

        // Simple cycle check: would adding this edge create a cycle?
        if self.has_path(target, source) {
            return Err(GraphError::CycleDetected);
        }

        let conn_id = ConnectionId(Uuid::new_v4());
        self.connections.push(Connection {
            id: conn_id,
            source,
            target,
            kind,
        });
        self.project.touch();
        Ok(conn_id)
    }

    /// Remove a connection by id.
    pub fn disconnect(&mut self, conn_id: ConnectionId) -> bool {
        let len_before = self.connections.len();
        self.connections.retain(|c| c.id != conn_id);
        let removed = self.connections.len() < len_before;
        if removed {
            self.project.touch();
        }
        removed
    }

    /// Get a node by id.
    pub fn get_node(&self, id: Uuid) -> Option<&SystemNode> {
        self.nodes.get(&id)
    }

    /// Get a mutable node by id.
    pub fn get_node_mut(&mut self, id: Uuid) -> Option<&mut SystemNode> {
        self.nodes.get_mut(&id)
    }

    /// Return nodes in insertion order.
    pub fn ordered_nodes(&self) -> Vec<&SystemNode> {
        self.node_order
            .iter()
            .filter_map(|id| self.nodes.get(id))
            .collect()
    }

    /// Get IDs of upstream (source) nodes for a given node.
    pub fn upstream_of(&self, node_id: Uuid) -> Vec<Uuid> {
        self.connections
            .iter()
            .filter(|c| c.target == node_id)
            .map(|c| c.source)
            .collect()
    }

    /// Get IDs of downstream (target) nodes for a given node.
    pub fn downstream_of(&self, node_id: Uuid) -> Vec<Uuid> {
        self.connections
            .iter()
            .filter(|c| c.source == node_id)
            .map(|c| c.target)
            .collect()
    }

    /// Propagate dirty state downstream from a given node.
    pub fn mark_dirty_downstream(&mut self, node_id: Uuid) {
        let downstream = self.downstream_of(node_id);
        for ds_id in downstream {
            if let Some(node) = self.nodes.get_mut(&ds_id) {
                let was_dirty = node.state == NodeState::Dirty;
                node.state = NodeState::Dirty;
                for cell in &mut node.cells {
                    if cell.state == NodeState::Solved || cell.state == NodeState::Clean {
                        cell.state = NodeState::Dirty;
                    }
                }
                if !was_dirty {
                    // Recursively propagate
                    self.mark_dirty_downstream(ds_id);
                }
            }
        }
    }

    /// Return all nodes that need updating (dirty or not configured with
    /// all upstreams solved), in topological order.
    pub fn systems_needing_update(&self) -> Vec<Uuid> {
        self.topological_order()
            .into_iter()
            .filter(|id| {
                self.nodes
                    .get(id)
                    .map_or(false, |n| n.state == NodeState::Dirty)
            })
            .collect()
    }

    /// Topological sort of nodes.
    pub fn topological_order(&self) -> Vec<Uuid> {
        let mut in_degree: HashMap<Uuid, usize> = HashMap::new();
        for id in self.nodes.keys() {
            in_degree.insert(*id, 0);
        }
        for conn in &self.connections {
            *in_degree.entry(conn.target).or_insert(0) += 1;
        }

        let mut queue: Vec<Uuid> = in_degree
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(&id, _)| id)
            .collect();
        // Stabilize order based on node_order
        queue.sort_by_key(|id| {
            self.node_order
                .iter()
                .position(|n| n == id)
                .unwrap_or(usize::MAX)
        });

        let mut result = Vec::new();
        while let Some(id) = queue.pop() {
            result.push(id);
            for conn in &self.connections {
                if conn.source == id {
                    if let Some(deg) = in_degree.get_mut(&conn.target) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push(conn.target);
                        }
                    }
                }
            }
        }
        result
    }

    /// BFS check: is there a path from `from` to `to`?
    fn has_path(&self, from: Uuid, to: Uuid) -> bool {
        let mut visited = std::collections::HashSet::new();
        let mut stack = vec![from];
        while let Some(current) = stack.pop() {
            if current == to {
                return true;
            }
            if visited.insert(current) {
                for conn in &self.connections {
                    if conn.source == current {
                        stack.push(conn.target);
                    }
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_graph() -> ProjectGraph {
        ProjectGraph::new(Project::new("Test Project"))
    }

    #[test]
    fn add_and_remove_systems() {
        let mut g = make_graph();
        let id = g.add_system(SystemKind::StaticStructural, (100.0, 100.0));
        assert!(g.get_node(id).is_some());
        assert_eq!(g.ordered_nodes().len(), 1);

        g.remove_system(id).unwrap();
        assert!(g.get_node(id).is_none());
        assert_eq!(g.ordered_nodes().len(), 0);
    }

    #[test]
    fn connect_systems() {
        let mut g = make_graph();
        let geo = g.add_system(SystemKind::Geometry, (50.0, 50.0));
        let struc = g.add_system(SystemKind::StaticStructural, (200.0, 50.0));

        let conn = g.connect(geo, struc, ConnectionKind::GeometryShare);
        assert!(conn.is_ok());
        assert_eq!(g.upstream_of(struc), vec![geo]);
        assert_eq!(g.downstream_of(geo), vec![struc]);
    }

    #[test]
    fn prevent_self_connection() {
        let mut g = make_graph();
        let id = g.add_system(SystemKind::Geometry, (0.0, 0.0));
        let err = g.connect(id, id, ConnectionKind::GeometryShare);
        assert!(matches!(err, Err(GraphError::SelfConnection)));
    }

    #[test]
    fn prevent_cycles() {
        let mut g = make_graph();
        let a = g.add_system(SystemKind::Geometry, (0.0, 0.0));
        let b = g.add_system(SystemKind::Mesh, (100.0, 0.0));
        let c = g.add_system(SystemKind::StaticStructural, (200.0, 0.0));

        g.connect(a, b, ConnectionKind::GeometryShare).unwrap();
        g.connect(b, c, ConnectionKind::MeshShare).unwrap();

        let err = g.connect(c, a, ConnectionKind::ResultTransfer);
        assert!(matches!(err, Err(GraphError::CycleDetected)));
    }

    #[test]
    fn dirty_propagation() {
        let mut g = make_graph();
        let geo = g.add_system(SystemKind::Geometry, (0.0, 0.0));
        let mesh = g.add_system(SystemKind::Mesh, (100.0, 0.0));
        let struc = g.add_system(SystemKind::StaticStructural, (200.0, 0.0));

        g.connect(geo, mesh, ConnectionKind::GeometryShare).unwrap();
        g.connect(mesh, struc, ConnectionKind::MeshShare).unwrap();

        // Mark mesh and structural as solved
        g.get_node_mut(mesh).unwrap().state = NodeState::Solved;
        for cell in &mut g.get_node_mut(mesh).unwrap().cells {
            cell.state = NodeState::Solved;
        }
        g.get_node_mut(struc).unwrap().state = NodeState::Solved;
        for cell in &mut g.get_node_mut(struc).unwrap().cells {
            cell.state = NodeState::Solved;
        }

        // Propagate dirty from geometry
        g.mark_dirty_downstream(geo);

        assert_eq!(g.get_node(mesh).unwrap().state, NodeState::Dirty);
        assert_eq!(g.get_node(struc).unwrap().state, NodeState::Dirty);
    }

    #[test]
    fn topological_order_respects_edges() {
        let mut g = make_graph();
        let a = g.add_system(SystemKind::Geometry, (0.0, 0.0));
        let b = g.add_system(SystemKind::Mesh, (100.0, 0.0));
        let c = g.add_system(SystemKind::StaticStructural, (200.0, 0.0));

        g.connect(a, b, ConnectionKind::GeometryShare).unwrap();
        g.connect(b, c, ConnectionKind::MeshShare).unwrap();

        let order = g.topological_order();
        let pos_a = order.iter().position(|x| *x == a).unwrap();
        let pos_b = order.iter().position(|x| *x == b).unwrap();
        let pos_c = order.iter().position(|x| *x == c).unwrap();
        assert!(pos_a < pos_b);
        assert!(pos_b < pos_c);
    }
}
