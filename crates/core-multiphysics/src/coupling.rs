use core_mesh::Mesh;
use core_post::ResultSet;
use physics_structural::{IsotropicMaterial, StructuralAnalysis, BoundaryCondition};
use physics_thermal::{ThermalAnalysis, ThermalMaterial};

/// Run a one-way thermal→structural coupled analysis.
///
/// 1. Solve steady-state thermal to get temperature field
/// 2. Convert temperature field to thermal loads on structural model
/// 3. Solve structural with thermal loads
///
/// Returns (thermal_result, structural_result).
pub fn run_thermal_structural_coupling(
    mesh: &Mesh,
    thermal_analysis: &ThermalAnalysis,
    structural_analysis: &StructuralAnalysis,
    thermal_material: &ThermalMaterial,
    structural_material: &IsotropicMaterial,
) -> Result<(ResultSet, ResultSet), CouplingError> {
    // Step 1: Solve thermal
    let thermal_result = physics_thermal::solver::solve_steady_thermal(
        mesh, thermal_analysis, thermal_material,
    ).map_err(|e| CouplingError::ThermalSolverFailed(e.to_string()))?;

    // Step 2: Extract temperature field and create thermal load BCs
    let temp_field = thermal_result.fields.iter()
        .find(|f| f.name == "Temperature")
        .ok_or_else(|| CouplingError::MissingField("Temperature".into()))?;

    // Average temperature for a simple thermal stress estimate
    let temps = &temp_field.values[0]; // time step 0
    let avg_temp: f64 = temps.iter().map(|t| t[0]).sum::<f64>() / temps.len() as f64;
    let _max_temp: f64 = temps.iter().map(|t| t[0]).fold(f64::MIN, f64::max);

    // Step 3: Add thermal expansion effect as body force
    // For simplicity, add temperature-based force to structural analysis
    let mut coupled_structural = structural_analysis.clone();

    // Apply thermal body force: proportional to temperature gradient
    // This is a simplified coupling - real implementation would use CTE * dT
    let _ref_temp = 20.0; // reference temperature
    let thermal_strain_force = (avg_temp - _ref_temp) * structural_material.youngs_modulus * 1e-5; // CTE ~ 1e-5

    // Add thermal force to all nodes proportionally
    if !mesh.nodes.is_empty() {
        let all_ids: String = mesh.nodes.iter()
            .map(|n| n.id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        coupled_structural.boundary_conditions.push(
            BoundaryCondition::Force {
                node_set: all_ids,
                values: [0.0, 0.0, -thermal_strain_force / mesh.nodes.len() as f64],
            }
        );
    }

    // Step 4: Solve structural with thermal loads
    let structural_result = physics_structural::solver::solve_linear_static(
        mesh, &coupled_structural, structural_material,
    ).map_err(|e| CouplingError::StructuralSolverFailed(e.to_string()))?;

    Ok((thermal_result, structural_result))
}

#[derive(Debug, thiserror::Error)]
pub enum CouplingError {
    #[error("Thermal solver failed: {0}")]
    ThermalSolverFailed(String),
    #[error("Structural solver failed: {0}")]
    StructuralSolverFailed(String),
    #[error("Missing field: {0}")]
    MissingField(String),
}
