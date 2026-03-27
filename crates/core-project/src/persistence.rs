use std::path::Path;

use crate::graph::ProjectGraph;

#[derive(Debug, thiserror::Error)]
pub enum PersistenceError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Save a project graph to a JSON file.
pub fn save_project(graph: &ProjectGraph, path: &Path) -> Result<(), PersistenceError> {
    let json = serde_json::to_string_pretty(graph)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// Load a project graph from a JSON file.
pub fn load_project(path: &Path) -> Result<ProjectGraph, PersistenceError> {
    let json = std::fs::read_to_string(path)?;
    let graph = serde_json::from_str(&json)?;
    Ok(graph)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Project, SystemKind};

    #[test]
    fn round_trip_save_load() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test_project.osw");

        let mut graph = ProjectGraph::new(Project::new("Round Trip Test"));
        let geo = graph.add_system(SystemKind::Geometry, (10.0, 20.0));
        let struc = graph.add_system(SystemKind::StaticStructural, (200.0, 20.0));
        graph
            .connect(
                geo,
                struc,
                crate::model::ConnectionKind::GeometryShare,
            )
            .unwrap();

        save_project(&graph, &path).unwrap();
        let loaded = load_project(&path).unwrap();

        assert_eq!(loaded.project.name, "Round Trip Test");
        assert_eq!(loaded.ordered_nodes().len(), 2);
        assert_eq!(loaded.connections.len(), 1);
    }
}
