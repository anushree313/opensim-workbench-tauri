use std::collections::{HashMap, HashSet};

use nalgebra::{DMatrix, DVector};

use core_mesh::{ElementKind, Mesh};
use core_post::{FieldData, FieldLocation, FieldType, ResultSet};

use crate::tet4_cfd::{tet4_div_penalty, tet4_velocity_divergence, tet4_viscous_stiffness};
use crate::{CfdAnalysis, CfdBc, FluidMaterial};

#[derive(Debug, thiserror::Error)]
pub enum CfdSolverError {
    #[error("No Tet4 elements found in mesh")]
    NoTet4Elements,
    #[error("Mesh has no nodes")]
    EmptyMesh,
    #[error("Singular system matrix")]
    SingularMatrix,
    #[error("Node set '{0}' not found")]
    NodeSetNotFound(String),
    #[error("No velocity boundary conditions applied")]
    Unconstrained,
}

/// Solve steady incompressible Stokes flow using penalty method on Tet4 elements.
///
/// Penalty method: K_total = K_viscous + λ·K_div where λ = 10⁶·μ.
/// This avoids the saddle-point problem of mixed velocity-pressure formulations.
/// Output: velocity field (nodes), pressure field (elements), velocity magnitude (nodes).
pub fn solve_stokes_flow(
    mesh: &Mesh,
    analysis: &CfdAnalysis,
    fluid: &FluidMaterial,
) -> Result<ResultSet, CfdSolverError> {
    if mesh.nodes.is_empty() {
        return Err(CfdSolverError::EmptyMesh);
    }

    let tet_elements: Vec<_> = mesh
        .elements
        .iter()
        .filter(|e| e.kind == ElementKind::Tet4)
        .collect();

    if tet_elements.is_empty() {
        return Err(CfdSolverError::NoTet4Elements);
    }

    let node_id_to_idx: HashMap<u64, usize> = mesh
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id, i))
        .collect();

    let num_nodes = mesh.nodes.len();
    // DOF layout: [u0..u_{N-1}, v0..v_{N-1}, w0..w_{N-1}]
    let ndof = num_nodes * 3;

    let node_sets: HashMap<&str, &[u64]> = mesh
        .node_sets
        .iter()
        .map(|ns| (ns.name.as_str(), ns.node_ids.as_slice()))
        .collect();

    let mu = fluid.viscosity;
    let lambda = 1e6 * mu; // penalty parameter for incompressibility

    // 1. Assemble global stiffness (viscous + penalty)
    let mut k_global = DMatrix::zeros(ndof, ndof);

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            continue;
        }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_indices = [0_usize; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_indices[i] = idx;
            }
        }

        let k_visc = tet4_viscous_stiffness(&elem_nodes, mu);
        let k_pen = tet4_div_penalty(&elem_nodes, lambda);

        // DOF mapping: element local DOF (comp*4+i) → global DOF (comp*N + node_idx)
        for li in 0..12 {
            let comp_i = li / 4;
            let node_i = li % 4;
            let gi = comp_i * num_nodes + elem_indices[node_i];

            for lj in 0..12 {
                let comp_j = lj / 4;
                let node_j = lj % 4;
                let gj = comp_j * num_nodes + elem_indices[node_j];

                k_global[(gi, gj)] += k_visc[(li, lj)] + k_pen[(li, lj)];
            }
        }
    }

    // 2. Build force vector (body forces not implemented for simplicity)
    let mut f_global = DVector::zeros(ndof);

    // 3. Apply velocity BCs (penalty method)
    let penalty = 1e30;
    let mut constrained_dofs: HashSet<usize> = HashSet::new();

    for bc in &analysis.boundary_conditions {
        match bc {
            CfdBc::VelocityInlet { face_set, velocity } => {
                let node_ids = resolve_node_set(face_set, &node_sets, mesh)?;
                for &nid in &node_ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        for comp in 0..3 {
                            let dof = comp * num_nodes + idx;
                            k_global[(dof, dof)] += penalty;
                            f_global[dof] = penalty * velocity[comp];
                            constrained_dofs.insert(dof);
                        }
                    }
                }
            }
            CfdBc::Wall { face_set, no_slip } => {
                if *no_slip {
                    let node_ids = resolve_node_set(face_set, &node_sets, mesh)?;
                    for &nid in &node_ids {
                        if let Some(&idx) = node_id_to_idx.get(&nid) {
                            for comp in 0..3 {
                                let dof = comp * num_nodes + idx;
                                k_global[(dof, dof)] += penalty;
                                f_global[dof] = 0.0; // no-slip: u = 0
                                constrained_dofs.insert(dof);
                            }
                        }
                    }
                }
            }
            CfdBc::PressureOutlet { .. } => {
                // Natural BC — no modification needed (traction-free)
            }
            CfdBc::Symmetry { face_set } => {
                // Symmetry: normal velocity = 0 (simplified: no action for now)
                let _ = face_set;
            }
        }
    }

    if constrained_dofs.is_empty() {
        return Err(CfdSolverError::Unconstrained);
    }

    // 4. Solve
    let lu = k_global.lu();
    let u_global = lu.solve(&f_global).ok_or(CfdSolverError::SingularMatrix)?;

    // 5. Post-process: extract velocity per node
    let mut vel_field: Vec<Vec<f64>> = Vec::with_capacity(num_nodes);
    let mut vel_mag_field: Vec<Vec<f64>> = Vec::with_capacity(num_nodes);

    for i in 0..num_nodes {
        let ux = u_global[0 * num_nodes + i];
        let uy = u_global[1 * num_nodes + i];
        let uz = u_global[2 * num_nodes + i];
        let mag = (ux * ux + uy * uy + uz * uz).sqrt();
        vel_field.push(vec![ux, uy, uz]);
        vel_mag_field.push(vec![mag]);
    }

    // 6. Post-process: compute pressure at each element (p = -λ * div(u))
    let mut pressure_field: Vec<Vec<f64>> = Vec::new();

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            pressure_field.push(vec![0.0]);
            continue;
        }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_vels = [[0.0_f64; 3]; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_vels[i] = [
                    u_global[0 * num_nodes + idx],
                    u_global[1 * num_nodes + idx],
                    u_global[2 * num_nodes + idx],
                ];
            }
        }

        let div = tet4_velocity_divergence(&elem_nodes, &elem_vels);
        pressure_field.push(vec![-lambda * div]);
    }

    // 7. Build ResultSet
    let mut result_set = ResultSet::new("Stokes Flow Results");
    result_set.time_steps = vec![0.0];

    result_set.fields.push(FieldData {
        name: "Velocity".to_string(),
        field_type: FieldType::Vector,
        location: FieldLocation::Node,
        values: vec![vel_field],
    });

    result_set.fields.push(FieldData {
        name: "VelocityMagnitude".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Node,
        values: vec![vel_mag_field],
    });

    result_set.fields.push(FieldData {
        name: "Pressure".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Element,
        values: vec![pressure_field],
    });

    Ok(result_set)
}

fn resolve_node_set(
    name: &str,
    named_sets: &HashMap<&str, &[u64]>,
    mesh: &Mesh,
) -> Result<Vec<u64>, CfdSolverError> {
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
    Err(CfdSolverError::NodeSetNotFound(name.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CfdSolverSettings;

    fn simple_tet_mesh() -> Mesh {
        let mut mesh = core_mesh::Mesh::new();
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
            core_mesh::NodeSet { name: "inlet".to_string(), node_ids: vec![0] },
            core_mesh::NodeSet { name: "wall".to_string(), node_ids: vec![1, 2, 3] },
        ];
        mesh
    }

    #[test]
    fn test_stokes_solver() {
        let mesh = simple_tet_mesh();
        let fluid = FluidMaterial { viscosity: 1.0e-3, density: 998.0 };

        let analysis = CfdAnalysis {
            id: uuid::Uuid::new_v4(),
            flow_type: crate::FlowType::SteadyIncompressible,
            boundary_conditions: vec![
                CfdBc::VelocityInlet {
                    face_set: "inlet".to_string(),
                    velocity: [0.1, 0.0, 0.0],
                },
                CfdBc::Wall {
                    face_set: "wall".to_string(),
                    no_slip: true,
                },
            ],
            solver_settings: CfdSolverSettings::default(),
        };

        let result = solve_stokes_flow(&mesh, &analysis, &fluid).unwrap();
        assert_eq!(result.fields.len(), 3);
        assert_eq!(result.fields[0].name, "Velocity");
        assert_eq!(result.fields[1].name, "VelocityMagnitude");
        assert_eq!(result.fields[2].name, "Pressure");

        // Inlet node should have prescribed velocity
        let vel = &result.fields[0].values[0][0];
        assert!((vel[0] - 0.1).abs() < 1e-6, "Inlet velocity should be ~0.1 m/s");
    }
}
