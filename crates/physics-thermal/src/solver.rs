use std::collections::HashMap;

use nalgebra::{DMatrix, DVector};

use core_mesh::{ElementKind, Mesh};
use core_post::{FieldData, FieldLocation, FieldType, ResultSet};

use crate::tet4_thermal::{tet4_capacitance, tet4_conductivity, tet4_heat_flux};
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
/// Solve transient thermal analysis using implicit (backward) Euler time-stepping.
///
/// System: (C/dt + K) * T_{n+1} = (C/dt) * T_n + f
/// where C is the capacitance matrix, K is the conductivity matrix,
/// and f is the applied heat load vector.
pub fn solve_transient_thermal(
    mesh: &Mesh,
    analysis: &ThermalAnalysis,
    material: &ThermalMaterial,
) -> Result<ResultSet, ThermalSolverError> {
    if mesh.nodes.is_empty() {
        return Err(ThermalSolverError::EmptyMesh);
    }

    let tet_elements: Vec<_> = mesh
        .elements
        .iter()
        .filter(|e| e.kind == ElementKind::Tet4)
        .collect();

    if tet_elements.is_empty() {
        return Err(ThermalSolverError::NoTet4Elements);
    }

    let node_id_to_idx: HashMap<u64, usize> = mesh
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id, i))
        .collect();

    let num_nodes = mesh.nodes.len();

    let node_sets: HashMap<&str, &[u64]> = mesh
        .node_sets
        .iter()
        .map(|ns| (ns.name.as_str(), ns.node_ids.as_slice()))
        .collect();

    // Time parameters
    let dt = analysis.solver_settings.time_step.unwrap_or(0.1);
    let t_end = analysis.solver_settings.time_end.unwrap_or(1.0);
    let num_steps = ((t_end / dt).ceil() as usize).max(1).min(1000); // cap at 1000 steps

    // 1. Assemble global conductivity K and capacitance C matrices
    let mut k_global = DMatrix::<f64>::zeros(num_nodes, num_nodes);
    let mut c_global = DMatrix::<f64>::zeros(num_nodes, num_nodes);

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 { continue; }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_indices = [0_usize; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_indices[i] = idx;
            }
        }

        let ke = tet4_conductivity(&elem_nodes, material.conductivity);
        let ce = tet4_capacitance(&elem_nodes, material.density, material.specific_heat);

        for i in 0..4 {
            for j in 0..4 {
                k_global[(elem_indices[i], elem_indices[j])] += ke[(i, j)];
                c_global[(elem_indices[i], elem_indices[j])] += ce[(i, j)];
            }
        }
    }

    // 2. Build system matrix: A = C/dt + K
    let c_over_dt = &c_global * (1.0 / dt);
    let a_system = &c_over_dt + &k_global;

    // 3. Build applied load vector (constant in time for simplicity)
    let mut f_applied = DVector::<f64>::zeros(num_nodes);

    // 4. Initial condition: T_0 = reference temperature (from first FixedTemperature BC or 25°C)
    let mut t_current = DVector::<f64>::from_element(num_nodes, 25.0);

    // Apply BCs to identify fixed temperatures and heat loads
    let penalty = 1e30;
    let mut a_bc = a_system.clone();

    for bc in &analysis.boundary_conditions {
        match bc {
            ThermalBc::FixedTemperature { node_set, temperature } => {
                let ids = resolve_node_set(node_set, &node_sets, mesh)?;
                for &nid in &ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        a_bc[(idx, idx)] += penalty;
                        // Set initial condition at fixed nodes
                        t_current[idx] = *temperature;
                    }
                }
            }
            ThermalBc::HeatFlux { element_set: _, flux } => {
                // Simplified: distribute flux to all surface nodes
                // In practice, should be applied to specific face elements
                let flux_per_node = flux / num_nodes as f64;
                for i in 0..num_nodes {
                    f_applied[i] += flux_per_node;
                }
            }
            _ => {}
        }
    }

    // 5. Time-stepping loop (implicit Euler)
    let lu = a_bc.lu();
    let mut all_temps: Vec<Vec<Vec<f64>>> = Vec::with_capacity(num_steps + 1);
    let mut time_steps: Vec<f64> = Vec::with_capacity(num_steps + 1);

    // Store initial state
    time_steps.push(0.0);
    all_temps.push((0..num_nodes).map(|i| vec![t_current[i]]).collect());

    for step in 0..num_steps {
        let t = (step + 1) as f64 * dt;

        // RHS = (C/dt) * T_n + f_applied
        let mut rhs = &c_over_dt * &t_current + &f_applied;

        // Re-apply temperature BCs to RHS
        for bc in &analysis.boundary_conditions {
            if let ThermalBc::FixedTemperature { node_set, temperature } = bc {
                let ids = resolve_node_set(node_set, &node_sets, mesh)?;
                for &nid in &ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        rhs[idx] = penalty * temperature;
                    }
                }
            }
        }

        // Solve A * T_{n+1} = rhs
        if let Some(t_next) = lu.solve(&rhs) {
            t_current = t_next;
        }

        // Store every step (or every Nth step for large simulations)
        time_steps.push(t);
        all_temps.push((0..num_nodes).map(|i| vec![t_current[i]]).collect());
    }

    // 6. Build ResultSet
    let mut result_set = ResultSet::new("Transient Thermal Results");
    result_set.time_steps = time_steps;

    result_set.fields.push(FieldData {
        name: "Temperature".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Node,
        values: all_temps,
    });

    Ok(result_set)
}

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
