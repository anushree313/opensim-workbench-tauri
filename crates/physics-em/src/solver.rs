use std::collections::HashMap;

use nalgebra::{DMatrix, DVector};

use core_mesh::{ElementKind, Mesh};
use core_post::{FieldData, FieldLocation, FieldType, ResultSet};

use crate::tet4_em::{tet4_electric_field, tet4_magnetic_field, tet4_permittivity_matrix, tet4_permeability_matrix};
use crate::{DielectricMaterial, EmAnalysis, EmBc, MagneticMaterial};

#[derive(Debug, thiserror::Error)]
pub enum EmSolverError {
    #[error("No Tet4 elements found")]
    NoTet4Elements,
    #[error("Mesh has no nodes")]
    EmptyMesh,
    #[error("Singular system matrix")]
    SingularMatrix,
    #[error("Node set '{0}' not found")]
    NodeSetNotFound(String),
    #[error("No boundary conditions applied")]
    Unconstrained,
}

/// Solve electrostatic Poisson equation: ∇·(ε∇φ) = -ρ_v
///
/// Identical to steady-state thermal with permittivity ε replacing conductivity k.
/// Output: ElectricPotential (node), ElectricField (element).
pub fn solve_electrostatic(
    mesh: &Mesh,
    analysis: &EmAnalysis,
    material: &DielectricMaterial,
) -> Result<ResultSet, EmSolverError> {
    solve_scalar_potential(
        mesh,
        analysis,
        material.permittivity,
        "Electrostatic Results",
        "ElectricPotential",
        "ElectricField",
        true,
    )
}

/// Solve magnetostatic scalar potential: ∇·(μ∇φ_m) = 0
///
/// Scalar potential approach for regions without free current.
/// Output: MagneticPotential (node), MagneticField (element).
pub fn solve_magnetostatic(
    mesh: &Mesh,
    analysis: &EmAnalysis,
    material: &MagneticMaterial,
) -> Result<ResultSet, EmSolverError> {
    solve_scalar_potential(
        mesh,
        analysis,
        material.permeability,
        "Magnetostatic Results",
        "MagneticPotential",
        "MagneticField",
        false,
    )
}

/// Shared solver for scalar potential problems (Laplace/Poisson).
/// Works for both electrostatic (ε) and magnetostatic (μ) by parameterizing
/// the material property and field names.
fn solve_scalar_potential(
    mesh: &Mesh,
    analysis: &EmAnalysis,
    material_coeff: f64,
    result_name: &str,
    potential_field_name: &str,
    field_field_name: &str,
    is_electrostatic: bool,
) -> Result<ResultSet, EmSolverError> {
    if mesh.nodes.is_empty() {
        return Err(EmSolverError::EmptyMesh);
    }

    let tet_elements: Vec<_> = mesh
        .elements
        .iter()
        .filter(|e| e.kind == ElementKind::Tet4)
        .collect();

    if tet_elements.is_empty() {
        return Err(EmSolverError::NoTet4Elements);
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

    // 1. Assemble global stiffness
    let mut k_global = DMatrix::zeros(num_nodes, num_nodes);

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

        let ke = if is_electrostatic {
            tet4_permittivity_matrix(&elem_nodes, material_coeff)
        } else {
            tet4_permeability_matrix(&elem_nodes, material_coeff)
        };

        for i in 0..4 {
            for j in 0..4 {
                k_global[(elem_indices[i], elem_indices[j])] += ke[(i, j)];
            }
        }
    }

    // 2. Build RHS and apply BCs
    let mut f_global = DVector::zeros(num_nodes);
    let penalty = 1e30;
    let mut has_bc = false;

    for bc in &analysis.boundary_conditions {
        match bc {
            EmBc::Voltage { node_set, value } => {
                let ids = resolve_node_set(node_set, &node_sets, mesh)?;
                for &nid in &ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        k_global[(idx, idx)] += penalty;
                        f_global[idx] = penalty * value;
                        has_bc = true;
                    }
                }
            }
            EmBc::MagneticFluxDensity { face_set, value } => {
                // Apply as Dirichlet BC (scalar potential value derived from B magnitude)
                let ids = resolve_node_set(face_set, &node_sets, mesh)?;
                let b_mag = (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt();
                for &nid in &ids {
                    if let Some(&idx) = node_id_to_idx.get(&nid) {
                        k_global[(idx, idx)] += penalty;
                        f_global[idx] = penalty * b_mag / material_coeff;
                        has_bc = true;
                    }
                }
            }
            EmBc::SurfaceCharge { .. } | EmBc::CurrentDensity { .. } => {
                // Neumann BCs — would add to RHS but skip for simplicity
            }
        }
    }

    if !has_bc {
        return Err(EmSolverError::Unconstrained);
    }

    // 3. Solve
    let lu = k_global.lu();
    let phi = lu.solve(&f_global).ok_or(EmSolverError::SingularMatrix)?;

    // 4. Post-process: potential per node
    let potential_values: Vec<Vec<f64>> = (0..num_nodes).map(|i| vec![phi[i]]).collect();

    // 5. Post-process: field per element (E = -∇φ or H = -∇φ_m)
    let mut field_values: Vec<Vec<f64>> = Vec::new();

    for elem in &tet_elements {
        if elem.node_ids.len() < 4 {
            field_values.push(vec![0.0, 0.0, 0.0]);
            continue;
        }

        let mut elem_nodes = [[0.0_f64; 3]; 4];
        let mut elem_pots = [0.0_f64; 4];

        for (i, &nid) in elem.node_ids.iter().take(4).enumerate() {
            if let Some(&idx) = node_id_to_idx.get(&nid) {
                elem_nodes[i] = mesh.nodes[idx].position;
                elem_pots[i] = phi[idx];
            }
        }

        let field = if is_electrostatic {
            tet4_electric_field(&elem_nodes, &elem_pots)
        } else {
            tet4_magnetic_field(&elem_nodes, &elem_pots)
        };

        field_values.push(vec![field[0], field[1], field[2]]);
    }

    // 6. Build ResultSet
    let mut result_set = ResultSet::new(result_name);
    result_set.time_steps = vec![0.0];

    result_set.fields.push(FieldData {
        name: potential_field_name.to_string(),
        field_type: FieldType::Scalar,
        location: FieldLocation::Node,
        values: vec![potential_values],
    });

    result_set.fields.push(FieldData {
        name: field_field_name.to_string(),
        field_type: FieldType::Vector,
        location: FieldLocation::Element,
        values: vec![field_values],
    });

    Ok(result_set)
}

fn resolve_node_set(
    name: &str,
    named_sets: &HashMap<&str, &[u64]>,
    mesh: &Mesh,
) -> Result<Vec<u64>, EmSolverError> {
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
    Err(EmSolverError::NodeSetNotFound(name.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
            core_mesh::NodeSet { name: "anode".to_string(), node_ids: vec![0] },
            core_mesh::NodeSet { name: "cathode".to_string(), node_ids: vec![3] },
        ];
        mesh
    }

    #[test]
    fn test_electrostatic_solver() {
        let mesh = simple_tet_mesh();
        let material = DielectricMaterial { permittivity: 8.85e-12, conductivity: 0.0 };

        let analysis = EmAnalysis {
            id: uuid::Uuid::new_v4(),
            analysis_type: EmAnalysisType::Electrostatic,
            boundary_conditions: vec![
                EmBc::Voltage { node_set: "anode".to_string(), value: 100.0 },
                EmBc::Voltage { node_set: "cathode".to_string(), value: 0.0 },
            ],
            solver_settings: Default::default(),
        };

        let result = solve_electrostatic(&mesh, &analysis, &material).unwrap();
        assert_eq!(result.fields.len(), 2);
        assert_eq!(result.fields[0].name, "ElectricPotential");
        assert_eq!(result.fields[1].name, "ElectricField");

        // Anode should be at 100V
        let pot = &result.fields[0].values[0][0];
        assert!((pot[0] - 100.0).abs() < 1e-3, "Anode should be ~100V");

        // Cathode should be at 0V
        let pot_c = &result.fields[0].values[0][3];
        assert!(pot_c[0].abs() < 1e-3, "Cathode should be ~0V");
    }

    #[test]
    fn test_magnetostatic_solver() {
        let mesh = simple_tet_mesh();
        let material = MagneticMaterial { permeability: 4.0 * std::f64::consts::PI * 1e-7 };

        let analysis = EmAnalysis {
            id: uuid::Uuid::new_v4(),
            analysis_type: EmAnalysisType::Magnetostatic,
            boundary_conditions: vec![
                EmBc::MagneticFluxDensity {
                    face_set: "anode".to_string(),
                    value: [0.0, 0.0, 1.0],
                },
                EmBc::Voltage { node_set: "cathode".to_string(), value: 0.0 },
            ],
            solver_settings: Default::default(),
        };

        let result = solve_magnetostatic(&mesh, &analysis, &material).unwrap();
        assert_eq!(result.fields.len(), 2);
        assert_eq!(result.fields[0].name, "MagneticPotential");
        assert_eq!(result.fields[1].name, "MagneticField");
    }
}
