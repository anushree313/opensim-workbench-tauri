use std::collections::{HashMap, HashSet};

use nalgebra::{DMatrix, DVector};

use core_mesh::{ElementKind, Mesh};
use core_post::{FieldData, FieldLocation, FieldType, ResultSet};

use crate::tet4::{tet4_strain, tet4_stiffness, tet4_stress, von_mises};
use crate::{BoundaryCondition, IsotropicMaterial, StructuralAnalysis};

#[derive(Debug, thiserror::Error)]
pub enum SolverError {
    #[error("No Tet4 elements found in mesh")]
    NoTet4Elements,
    #[error("Mesh has no nodes")]
    EmptyMesh,
    #[error("Singular stiffness matrix - check boundary conditions")]
    SingularMatrix,
    #[error("Node set '{0}' not found in mesh")]
    NodeSetNotFound(String),
    #[error("No boundary conditions applied - system is unconstrained")]
    Unconstrained,
}

/// Solve a linear static structural analysis.
///
/// Assembles the global stiffness matrix K, applies boundary conditions and loads,
/// solves Ku=F, and post-processes displacements into stress/strain fields.
pub fn solve_linear_static(
    mesh: &Mesh,
    analysis: &StructuralAnalysis,
    material: &IsotropicMaterial,
) -> Result<ResultSet, SolverError> {
    if mesh.nodes.is_empty() {
        return Err(SolverError::EmptyMesh);
    }

    let tet_elements: Vec<_> = mesh
        .elements
        .iter()
        .filter(|e| e.kind == ElementKind::Tet4)
        .collect();

    if tet_elements.is_empty() {
        return Err(SolverError::NoTet4Elements);
    }

    // Build node ID → sequential index mapping
    let node_id_to_idx: HashMap<u64, usize> = mesh
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id, i))
        .collect();

    let num_nodes = mesh.nodes.len();
    let ndof = num_nodes * 3;

    // Build node set lookup
    let node_sets: HashMap<&str, &[u64]> = mesh
        .node_sets
        .iter()
        .map(|ns| (ns.name.as_str(), ns.node_ids.as_slice()))
        .collect();

    // 1. Assemble global stiffness matrix
    let mut k_global = DMatrix::zeros(ndof, ndof);

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            continue;
        }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_dofs = [0_usize; 12];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_dofs[i * 3] = idx * 3;
                elem_dofs[i * 3 + 1] = idx * 3 + 1;
                elem_dofs[i * 3 + 2] = idx * 3 + 2;
            }
        }

        let ke = tet4_stiffness(&elem_nodes, material.youngs_modulus, material.poisson_ratio);

        // Scatter element stiffness into global matrix
        for i in 0..12 {
            for j in 0..12 {
                k_global[(elem_dofs[i], elem_dofs[j])] += ke[(i, j)];
            }
        }
    }

    // 2. Build force vector
    let mut f_global = DVector::zeros(ndof);

    for bc in &analysis.boundary_conditions {
        match bc {
            BoundaryCondition::Force { node_set, values } => {
                let node_ids = resolve_node_set(node_set, &node_sets, mesh)?;
                for &nid in &node_ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        f_global[idx * 3] += values[0];
                        f_global[idx * 3 + 1] += values[1];
                        f_global[idx * 3 + 2] += values[2];
                    }
                }
            }
            _ => {} // Other BCs handled below
        }
    }

    // 3. Apply displacement BCs (penalty method for simplicity)
    let penalty = 1e30;
    let mut constrained_dofs: HashSet<usize> = HashSet::new();

    for bc in &analysis.boundary_conditions {
        match bc {
            BoundaryCondition::FixedSupport { node_set } => {
                let node_ids = resolve_node_set(node_set, &node_sets, mesh)?;
                for &nid in &node_ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        for d in 0..3 {
                            let dof = idx * 3 + d;
                            k_global[(dof, dof)] += penalty;
                            f_global[dof] = 0.0; // prescribed zero displacement
                            constrained_dofs.insert(dof);
                        }
                    }
                }
            }
            BoundaryCondition::Displacement { node_set, values } => {
                let node_ids = resolve_node_set(node_set, &node_sets, mesh)?;
                for &nid in &node_ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        for d in 0..3 {
                            if let Some(val) = values[d] {
                                let dof = idx * 3 + d;
                                k_global[(dof, dof)] += penalty;
                                f_global[dof] = penalty * val;
                                constrained_dofs.insert(dof);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if constrained_dofs.is_empty() {
        return Err(SolverError::Unconstrained);
    }

    // 4. Solve Ku = F using LU decomposition
    let lu = k_global.lu();
    let u_global = lu.solve(&f_global).ok_or(SolverError::SingularMatrix)?;

    // 5. Post-process: extract displacements per node
    let mut disp_field_values: Vec<Vec<f64>> = Vec::with_capacity(num_nodes);
    for i in 0..num_nodes {
        disp_field_values.push(vec![
            u_global[i * 3],
            u_global[i * 3 + 1],
            u_global[i * 3 + 2],
        ]);
    }

    // 6. Post-process: compute stress at each Tet4 element centroid
    let mut vm_values: Vec<Vec<f64>> = Vec::new();
    let mut shear_xy_values: Vec<Vec<f64>> = Vec::new();
    let mut shear_yz_values: Vec<Vec<f64>> = Vec::new();
    let mut shear_xz_values: Vec<Vec<f64>> = Vec::new();

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            vm_values.push(vec![0.0]);
            shear_xy_values.push(vec![0.0]);
            shear_yz_values.push(vec![0.0]);
            shear_xz_values.push(vec![0.0]);
            continue;
        }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_disps = [[0.0_f64; 3]; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_disps[i] = [
                    u_global[idx * 3],
                    u_global[idx * 3 + 1],
                    u_global[idx * 3 + 2],
                ];
            }
        }

        let strain = tet4_strain(&elem_nodes, &elem_disps);
        let stress = tet4_stress(&strain, material.youngs_modulus, material.poisson_ratio);
        let vm = von_mises(&stress);

        vm_values.push(vec![vm]);
        // stress = [σxx, σyy, σzz, τxy, τyz, τxz]
        shear_xy_values.push(vec![stress[3]]);
        shear_yz_values.push(vec![stress[4]]);
        shear_xz_values.push(vec![stress[5]]);
    }

    // 7. Build ResultSet
    let mut result_set = ResultSet::new("Linear Static Results");
    result_set.time_steps = vec![0.0]; // Static analysis: single time step

    result_set.fields.push(FieldData {
        name: "Displacement".to_string(),
        field_type: FieldType::Vector,
        location: FieldLocation::Node,
        values: vec![disp_field_values],
    });

    result_set.fields.push(FieldData {
        name: "VonMises".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Element,
        values: vec![vm_values],
    });

    result_set.fields.push(FieldData {
        name: "ShearStressXY".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Element,
        values: vec![shear_xy_values],
    });

    result_set.fields.push(FieldData {
        name: "ShearStressYZ".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Element,
        values: vec![shear_yz_values],
    });

    result_set.fields.push(FieldData {
        name: "ShearStressXZ".to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Element,
        values: vec![shear_xz_values],
    });

    Ok(result_set)
}

/// Resolve a node set name to a list of node IDs.
/// If the name matches a named node set, use it.
/// If the name is "all", return all node IDs.
fn resolve_node_set(
    name: &str,
    named_sets: &HashMap<&str, &[u64]>,
    mesh: &Mesh,
) -> Result<Vec<u64>, SolverError> {
    if name == "all" || name == "ALL" {
        return Ok(mesh.nodes.iter().map(|n| n.id).collect());
    }

    if let Some(set) = named_sets.get(name) {
        return Ok(set.to_vec());
    }

    // Try to parse as a comma-separated list of node IDs
    let ids: Result<Vec<u64>, _> = name.split(',').map(|s| s.trim().parse::<u64>()).collect();
    if let Ok(ids) = ids {
        return Ok(ids);
    }

    Err(SolverError::NodeSetNotFound(name.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::StructuralAnalysis;

    fn simple_tet_mesh() -> Mesh {
        // A single tet with nodes at corners of a unit right-angle tet
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
            core_mesh::NodeSet { name: "fixed".to_string(), node_ids: vec![0] },
            core_mesh::NodeSet { name: "load".to_string(), node_ids: vec![1, 2, 3] },
        ];
        mesh
    }

    #[test]
    fn test_solve_single_tet() {
        let mesh = simple_tet_mesh();
        let material = IsotropicMaterial {
            youngs_modulus: 200e9,
            poisson_ratio: 0.3,
            density: 7800.0,
        };

        let mut analysis = StructuralAnalysis::new_static();
        analysis.boundary_conditions.push(BoundaryCondition::FixedSupport {
            node_set: "fixed".to_string(),
        });
        analysis.boundary_conditions.push(BoundaryCondition::Force {
            node_set: "load".to_string(),
            values: [0.0, 0.0, -1000.0],
        });

        let result = solve_linear_static(&mesh, &analysis, &material).unwrap();

        // Should have 5 fields: Displacement, VonMises, ShearXY, ShearYZ, ShearXZ
        assert_eq!(result.fields.len(), 5);

        let disp = &result.fields[0];
        assert_eq!(disp.name, "Displacement");
        assert_eq!(disp.location, FieldLocation::Node);
        // 4 nodes, each with 3 components
        assert_eq!(disp.values[0].len(), 4);
        assert_eq!(disp.values[0][0].len(), 3);

        // Fixed node (0) should have near-zero displacement
        let fixed_disp = &disp.values[0][0];
        for &d in fixed_disp {
            assert!(d.abs() < 1e-10, "Fixed node should have zero displacement: {}", d);
        }

        // Loaded nodes should have non-zero displacement
        let load_disp_mag: f64 = disp.values[0][1]
            .iter()
            .map(|d| d * d)
            .sum::<f64>()
            .sqrt();
        assert!(load_disp_mag > 0.0, "Loaded node should displace");

        let vm = &result.fields[1];
        assert_eq!(vm.name, "VonMises");
        assert!(vm.values[0][0][0] > 0.0, "Von Mises stress should be positive");
    }

    #[test]
    fn test_unconstrained_error() {
        let mesh = simple_tet_mesh();
        let material = IsotropicMaterial {
            youngs_modulus: 200e9,
            poisson_ratio: 0.3,
            density: 7800.0,
        };

        let mut analysis = StructuralAnalysis::new_static();
        // Only force, no support
        analysis.boundary_conditions.push(BoundaryCondition::Force {
            node_set: "load".to_string(),
            values: [0.0, 0.0, -1000.0],
        });

        let result = solve_linear_static(&mesh, &analysis, &material);
        assert!(matches!(result, Err(SolverError::Unconstrained)));
    }
}
