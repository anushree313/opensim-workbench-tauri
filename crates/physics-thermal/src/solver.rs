use std::collections::HashMap;

use nalgebra::{DMatrix, DVector};

use core_mesh::{ElementKind, Mesh};
use core_post::{FieldData, FieldLocation, FieldType, ResultSet};

use crate::tet4_thermal::{tet4_conductivity, tet4_heat_flux};
use crate::{ThermalAnalysis, ThermalBc, ThermalMaterial};

#[derive(Debug, thiserror::Error)]
pub enum ThermalSolverError {
    #[error("No Tet4 elements found in mesh")]
    NoTet4Elements,
    #[error("Mesh has no nodes")]
    EmptyMesh,
    #[error("Singular conductivity matrix")]
    SingularMatrix,
    #[error("Node set '{0}' not found")]
    NodeSetNotFound(String),
    #[error("No thermal boundary conditions applied")]
    Unconstrained,
}

/// Solve a steady-state thermal analysis.
/// Assembles K*T = Q, applies BCs, solves for nodal temperatures.
pub fn solve_steady_thermal(
    mesh: &Mesh,
    analysis: &ThermalAnalysis,
    material: &ThermalMaterial,
) -> Result<ResultSet, ThermalSolverError> {
    if mesh.nodes.is_empty() {
        return Err(ThermalSolverError::EmptyMesh);
    }

    let tet_elements: Vec<_> = mesh.elements.iter()
        .filter(|e| e.kind == ElementKind::Tet4)
        .collect();

    if tet_elements.is_empty() {
        return Err(ThermalSolverError::NoTet4Elements);
    }

    let node_id_to_idx: HashMap<u64, usize> = mesh.nodes.iter()
        .enumerate()
        .map(|(i, n)| (n.id, i))
        .collect();

    let num_nodes = mesh.nodes.len();
    let node_sets: HashMap<&str, &[u64]> = mesh.node_sets.iter()
        .map(|ns| (ns.name.as_str(), ns.node_ids.as_slice()))
        .collect();

    // 1. Assemble global conductivity matrix
    let mut k_global = DMatrix::zeros(num_nodes, num_nodes);

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 { continue; }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_dofs = [0_usize; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_dofs[i] = idx;
            }
        }

        let ke = tet4_conductivity(&elem_nodes, material.conductivity);

        for i in 0..4 {
            for j in 0..4 {
                k_global[(elem_dofs[i], elem_dofs[j])] += ke[(i, j)];
            }
        }
    }

    // 2. Build heat load vector
    let mut q_global = DVector::zeros(num_nodes);

    for bc in &analysis.boundary_conditions {
        if let ThermalBc::HeatFlux { element_set: _, flux } = bc {
            // Simplified: distribute flux to all surface nodes
            for node in &mesh.nodes {
                if let Some(&idx) = node_id_to_idx.get(&node.id) {
                    q_global[idx] += flux / num_nodes as f64;
                }
            }
        }
    }

    // 3. Apply temperature BCs (penalty method)
    let penalty = 1e30;
    let mut constrained = false;

    for bc in &analysis.boundary_conditions {
        if let ThermalBc::FixedTemperature { node_set, temperature } = bc {
            let node_ids = resolve_node_set(node_set, &node_sets, mesh)?;
            for &nid in &node_ids {
                if let Some(&idx) = node_id_to_idx.get(&nid) {
                    k_global[(idx, idx)] += penalty;
                    q_global[idx] = penalty * temperature;
                    constrained = true;
                }
            }
        }
    }

    if !constrained {
        return Err(ThermalSolverError::Unconstrained);
    }

    // 4. Solve K*T = Q
    let lu = k_global.lu();
    let t_global = lu.solve(&q_global).ok_or(ThermalSolverError::SingularMatrix)?;

    // 5. Post-process: extract temperatures
    let temp_values: Vec<Vec<f64>> = (0..num_nodes)
        .map(|i| vec![t_global[i]])
        .collect();

    // 6. Compute heat flux at each element
    let mut flux_values: Vec<Vec<f64>> = Vec::new();
    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            flux_values.push(vec![0.0, 0.0, 0.0]);
            continue;
        }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_temps = [0.0_f64; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_temps[i] = t_global[idx];
            }
        }

        let flux = tet4_heat_flux(&elem_nodes, &elem_temps, material.conductivity);
        flux_values.push(vec![flux[0], flux[1], flux[2]]);
    }

    // 7. Build ResultSet
    let mut result_set = ResultSet::new("Steady-State Thermal Results");
    result_set.time_steps = vec![0.0];

    result_set.fields.push(FieldData {
        name: "Temperature".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Node,
        values: vec![temp_values],
    });

    result_set.fields.push(FieldData {
        name: "HeatFlux".to_string(),
        field_type: FieldType::Vector,
        location: FieldLocation::Element,
        values: vec![flux_values],
    });

    Ok(result_set)
}

/// Solve steady-state thermal with per-element-set material properties.
pub fn solve_steady_thermal_multi_material(
    mesh: &Mesh,
    analysis: &ThermalAnalysis,
    material_map: &crate::ThermalMaterialMap,
) -> Result<ResultSet, ThermalSolverError> {
    if mesh.nodes.is_empty() {
        return Err(ThermalSolverError::EmptyMesh);
    }

    let tet_elements: Vec<_> = mesh.elements.iter()
        .filter(|e| e.kind == ElementKind::Tet4)
        .collect();

    if tet_elements.is_empty() {
        return Err(ThermalSolverError::NoTet4Elements);
    }

    // Build element_id → element_set_name lookup
    let mut elem_to_set: HashMap<u64, String> = HashMap::new();
    for es in &mesh.element_sets {
        for &eid in &es.element_ids {
            elem_to_set.insert(eid, es.name.clone());
        }
    }

    // Default conductivity (first material in map)
    let default_k = material_map.element_set_materials.values()
        .next().map(|m| m.conductivity).unwrap_or(50.0);

    let node_id_to_idx: HashMap<u64, usize> = mesh.nodes.iter()
        .enumerate()
        .map(|(i, n)| (n.id, i))
        .collect();

    let num_nodes = mesh.nodes.len();
    let node_sets: HashMap<&str, &[u64]> = mesh.node_sets.iter()
        .map(|ns| (ns.name.as_str(), ns.node_ids.as_slice()))
        .collect();

    let mut k_global = DMatrix::zeros(num_nodes, num_nodes);

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 { continue; }

        // Look up per-element conductivity
        let k = elem_to_set.get(&elem.id)
            .and_then(|set_name| material_map.element_set_materials.get(set_name))
            .map(|m| m.conductivity)
            .unwrap_or(default_k);

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_dofs = [0_usize; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_dofs[i] = idx;
            }
        }

        let ke = tet4_conductivity(&elem_nodes, k);
        for i in 0..4 {
            for j in 0..4 {
                k_global[(elem_dofs[i], elem_dofs[j])] += ke[(i, j)];
            }
        }
    }

    let mut q_global = DVector::zeros(num_nodes);

    for bc in &analysis.boundary_conditions {
        if let ThermalBc::HeatFlux { element_set: _, flux } = bc {
            // Apply heat flux to die_top nodes if available
            let top_nodes = mesh.node_sets.iter().find(|ns| ns.name == "die_top");
            if let Some(ns) = top_nodes {
                let per_node = flux / ns.node_ids.len() as f64;
                for &nid in &ns.node_ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        q_global[idx] += per_node;
                    }
                }
            } else {
                for node in &mesh.nodes {
                    if let Some(&idx) = node_id_to_idx.get(&node.id) {
                        q_global[idx] += flux / num_nodes as f64;
                    }
                }
            }
        }
    }

    let penalty = 1e30;
    let mut constrained = false;

    for bc in &analysis.boundary_conditions {
        if let ThermalBc::FixedTemperature { node_set, temperature } = bc {
            let node_ids = resolve_node_set(node_set, &node_sets, mesh)?;
            for &nid in &node_ids {
                if let Some(&idx) = node_id_to_idx.get(&nid) {
                    k_global[(idx, idx)] += penalty;
                    q_global[idx] = penalty * temperature;
                    constrained = true;
                }
            }
        }
    }

    if !constrained {
        return Err(ThermalSolverError::Unconstrained);
    }

    let lu = k_global.lu();
    let t_global = lu.solve(&q_global).ok_or(ThermalSolverError::SingularMatrix)?;

    let temp_values: Vec<Vec<f64>> = (0..num_nodes)
        .map(|i| vec![t_global[i]])
        .collect();

    let mut flux_values: Vec<Vec<f64>> = Vec::new();
    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            flux_values.push(vec![0.0, 0.0, 0.0]);
            continue;
        }

        let k = elem_to_set.get(&elem.id)
            .and_then(|set_name| material_map.element_set_materials.get(set_name))
            .map(|m| m.conductivity)
            .unwrap_or(default_k);

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_temps = [0.0_f64; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_temps[i] = t_global[idx];
            }
        }

        let flux = tet4_heat_flux(&elem_nodes, &elem_temps, k);
        flux_values.push(vec![flux[0], flux[1], flux[2]]);
    }

    let mut result_set = ResultSet::new("Steady-State Thermal Results (Multi-Material)");
    result_set.time_steps = vec![0.0];

    result_set.fields.push(FieldData {
        name: "Temperature".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Node,
        values: vec![temp_values],
    });

    result_set.fields.push(FieldData {
        name: "HeatFlux".to_string(),
        field_type: FieldType::Vector,
        location: FieldLocation::Element,
        values: vec![flux_values],
    });

    Ok(result_set)
}

fn resolve_node_set(
    name: &str,
    named_sets: &HashMap<&str, &[u64]>,
    mesh: &Mesh,
) -> Result<Vec<u64>, ThermalSolverError> {
    if name == "all" || name == "ALL" {
        return Ok(mesh.nodes.iter().map(|n| n.id).collect());
    }
    if let Some(set) = named_sets.get(name) {
        return Ok(set.to_vec());
    }
    let ids: Result<Vec<u64>, _> = name.split(',').map(|s| s.trim().parse::<u64>()).collect();
    if let Ok(ids) = ids {
        return Ok(ids);
    }
    Err(ThermalSolverError::NodeSetNotFound(name.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_tet_mesh() -> Mesh {
        let mut mesh = Mesh::new();
        mesh.nodes = vec![
            core_mesh::MeshNode { id: 0, position: [0.0, 0.0, 0.0] },
            core_mesh::MeshNode { id: 1, position: [1.0, 0.0, 0.0] },
            core_mesh::MeshNode { id: 2, position: [0.0, 1.0, 0.0] },
            core_mesh::MeshNode { id: 3, position: [0.0, 0.0, 1.0] },
        ];
        mesh.elements = vec![core_mesh::Element {
            id: 0,
            kind: ElementKind::Tet4,
            node_ids: vec![0, 1, 2, 3],
        }];
        mesh.node_sets = vec![
            core_mesh::NodeSet { name: "hot".to_string(), node_ids: vec![0] },
            core_mesh::NodeSet { name: "cold".to_string(), node_ids: vec![1, 2, 3] },
        ];
        mesh
    }

    #[test]
    fn test_thermal_solve() {
        let mesh = simple_tet_mesh();
        let material = ThermalMaterial { conductivity: 50.0, specific_heat: 500.0, density: 7800.0 };

        let analysis = ThermalAnalysis {
            id: uuid::Uuid::new_v4(),
            analysis_type: crate::ThermalAnalysisType::SteadyState,
            boundary_conditions: vec![
                ThermalBc::FixedTemperature { node_set: "hot".into(), temperature: 100.0 },
                ThermalBc::FixedTemperature { node_set: "cold".into(), temperature: 20.0 },
            ],
            solver_settings: Default::default(),
        };

        let result = solve_steady_thermal(&mesh, &analysis, &material).unwrap();
        assert_eq!(result.fields.len(), 2);

        let temp = &result.fields[0];
        assert_eq!(temp.name, "Temperature");
        // Hot node should be ~100
        assert!((temp.values[0][0][0] - 100.0).abs() < 1.0);
        // Cold nodes should be ~20
        assert!((temp.values[0][1][0] - 20.0).abs() < 1.0);
    }
}
