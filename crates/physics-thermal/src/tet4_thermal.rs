use nalgebra::{DMatrix, DVector, Vector3};

/// Compute the volume of a Tet4 element.
pub fn tet4_volume(nodes: &[[f64; 3]; 4]) -> f64 {
    let a = Vector3::new(nodes[0][0], nodes[0][1], nodes[0][2]);
    let b = Vector3::new(nodes[1][0], nodes[1][1], nodes[1][2]);
    let c = Vector3::new(nodes[2][0], nodes[2][1], nodes[2][2]);
    let d = Vector3::new(nodes[3][0], nodes[3][1], nodes[3][2]);
    ((b - a).cross(&(c - a)).dot(&(d - a)) / 6.0).abs()
}

/// Compute the 4x4 element conductivity matrix for a Tet4 element.
///
/// For heat conduction: K_e = V * B^T * k * B
/// where B is the 3x4 temperature gradient matrix and k is thermal conductivity.
pub fn tet4_conductivity(nodes: &[[f64; 3]; 4], k: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(4, 4);
    }

    let b = tet4_thermal_b_matrix(nodes, vol);
    let bt = b.transpose();
    // K_e = V * k * B^T * B
    let ke = &bt * &b * (vol * k);
    ke
}

/// Compute the 3x4 B-matrix for thermal (temperature gradient).
/// dT/dx = B * T_nodal, where B[i][j] = dN_j/dx_i
fn tet4_thermal_b_matrix(nodes: &[[f64; 3]; 4], vol: f64) -> DMatrix<f64> {
    let v6 = 6.0 * vol;
    let x = [nodes[0][0], nodes[1][0], nodes[2][0], nodes[3][0]];
    let y = [nodes[0][1], nodes[1][1], nodes[2][1], nodes[3][1]];
    let z = [nodes[0][2], nodes[1][2], nodes[2][2], nodes[3][2]];

    let mut dn = [[0.0_f64; 3]; 4];

    dn[0][0] = ((y[1] - y[3]) * (z[2] - z[3]) - (y[2] - y[3]) * (z[1] - z[3])) / v6;
    dn[0][1] = ((x[2] - x[3]) * (z[1] - z[3]) - (x[1] - x[3]) * (z[2] - z[3])) / v6;
    dn[0][2] = ((x[1] - x[3]) * (y[2] - y[3]) - (x[2] - x[3]) * (y[1] - y[3])) / v6;

    dn[1][0] = ((y[2] - y[3]) * (z[0] - z[3]) - (y[0] - y[3]) * (z[2] - z[3])) / v6;
    dn[1][1] = ((x[0] - x[3]) * (z[2] - z[3]) - (x[2] - x[3]) * (z[0] - z[3])) / v6;
    dn[1][2] = ((x[2] - x[3]) * (y[0] - y[3]) - (x[0] - x[3]) * (y[2] - y[3])) / v6;

    dn[2][0] = ((y[0] - y[3]) * (z[1] - z[3]) - (y[1] - y[3]) * (z[0] - z[3])) / v6;
    dn[2][1] = ((x[1] - x[3]) * (z[0] - z[3]) - (x[0] - x[3]) * (z[1] - z[3])) / v6;
    dn[2][2] = ((x[0] - x[3]) * (y[1] - y[3]) - (x[1] - x[3]) * (y[0] - y[3])) / v6;

    dn[3][0] = -(dn[0][0] + dn[1][0] + dn[2][0]);
    dn[3][1] = -(dn[0][1] + dn[1][1] + dn[2][1]);
    dn[3][2] = -(dn[0][2] + dn[1][2] + dn[2][2]);

    let mut b = DMatrix::zeros(3, 4);
    for j in 0..4 {
        b[(0, j)] = dn[j][0]; // dN/dx
        b[(1, j)] = dn[j][1]; // dN/dy
        b[(2, j)] = dn[j][2]; // dN/dz
    }
    b
}

/// Compute the 4x4 consistent capacitance (thermal mass) matrix for a Tet4 element.
///
/// C_e = ρ * c_p * V/20 * [[2,1,1,1],[1,2,1,1],[1,1,2,1],[1,1,1,2]]
///
/// Used for transient thermal analysis: (C/dt + K)T_{n+1} = (C/dt)T_n + f
pub fn tet4_capacitance(nodes: &[[f64; 3]; 4], density: f64, specific_heat: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(4, 4);
    }

    let factor = density * specific_heat * vol / 20.0;
    let mut ce = DMatrix::zeros(4, 4);

    for i in 0..4 {
        for j in 0..4 {
            ce[(i, j)] = if i == j { 2.0 * factor } else { factor };
        }
    }

    ce
}

/// Compute heat flux at element centroid from nodal temperatures.
/// Returns [qx, qy, qz] = -k * B * T
pub fn tet4_heat_flux(nodes: &[[f64; 3]; 4], temperatures: &[f64; 4], k: f64) -> [f64; 3] {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return [0.0; 3];
    }
    let b = tet4_thermal_b_matrix(nodes, vol);
    let t = DVector::from_column_slice(temperatures);
    let grad = &b * &t;
    [-k * grad[0], -k * grad[1], -k * grad[2]]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_tet() -> [[f64; 3]; 4] {
        [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    }

    #[test]
    fn test_conductivity_symmetry() {
        let ke = tet4_conductivity(&unit_tet(), 50.0);
        assert_eq!(ke.nrows(), 4);
        for i in 0..4 {
            for j in 0..4 {
                assert!((ke[(i, j)] - ke[(j, i)]).abs() < 1e-10);
            }
        }
    }

    #[test]
    fn test_uniform_temp_zero_flux() {
        let nodes = unit_tet();
        let temps = [100.0; 4]; // uniform temperature
        let flux = tet4_heat_flux(&nodes, &temps, 50.0);
        for &q in &flux {
            assert!(q.abs() < 1e-10, "Uniform temp should give zero flux");
        }
    }
}
