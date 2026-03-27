use nalgebra::{DMatrix, DVector, Vector3};

/// Compute the volume of a Tet4 element.
pub fn tet4_volume(nodes: &[[f64; 3]; 4]) -> f64 {
    let a = Vector3::new(nodes[0][0], nodes[0][1], nodes[0][2]);
    let b = Vector3::new(nodes[1][0], nodes[1][1], nodes[1][2]);
    let c = Vector3::new(nodes[2][0], nodes[2][1], nodes[2][2]);
    let d = Vector3::new(nodes[3][0], nodes[3][1], nodes[3][2]);
    ((b - a).cross(&(c - a)).dot(&(d - a)) / 6.0).abs()
}

/// Shape function gradients (3x4 B-matrix).
fn tet4_b_matrix(nodes: &[[f64; 3]; 4], vol: f64) -> DMatrix<f64> {
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
        b[(0, j)] = dn[j][0];
        b[(1, j)] = dn[j][1];
        b[(2, j)] = dn[j][2];
    }
    b
}

/// 4x4 permittivity matrix for electrostatic analysis.
/// K_e = ε * V * B^T * B  (identical to thermal conductivity matrix with ε → k)
pub fn tet4_permittivity_matrix(nodes: &[[f64; 3]; 4], epsilon: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(4, 4);
    }
    let b = tet4_b_matrix(nodes, vol);
    &b.transpose() * &b * (vol * epsilon)
}

/// 4x4 permeability matrix for magnetostatic analysis.
/// K_e = μ * V * B^T * B
pub fn tet4_permeability_matrix(nodes: &[[f64; 3]; 4], mu: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(4, 4);
    }
    let b = tet4_b_matrix(nodes, vol);
    &b.transpose() * &b * (vol * mu)
}

/// Compute electric field E = -∇φ at element centroid.
pub fn tet4_electric_field(nodes: &[[f64; 3]; 4], potentials: &[f64; 4]) -> [f64; 3] {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return [0.0; 3];
    }
    let b = tet4_b_matrix(nodes, vol);
    let phi = DVector::from_column_slice(potentials);
    let grad = &b * &phi;
    [-grad[0], -grad[1], -grad[2]] // E = -∇φ
}

/// Compute magnetic field H = -∇φ_m at element centroid.
pub fn tet4_magnetic_field(nodes: &[[f64; 3]; 4], potentials: &[f64; 4]) -> [f64; 3] {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return [0.0; 3];
    }
    let b = tet4_b_matrix(nodes, vol);
    let phi = DVector::from_column_slice(potentials);
    let grad = &b * &phi;
    [-grad[0], -grad[1], -grad[2]] // H = -∇φ_m
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_tet() -> [[f64; 3]; 4] {
        [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    }

    #[test]
    fn test_permittivity_matrix_symmetry() {
        let ke = tet4_permittivity_matrix(&unit_tet(), 8.85e-12);
        for i in 0..4 {
            for j in 0..4 {
                assert!((ke[(i, j)] - ke[(j, i)]).abs() < 1e-25);
            }
        }
    }

    #[test]
    fn test_uniform_potential_zero_field() {
        let nodes = unit_tet();
        let pots = [5.0; 4]; // uniform potential
        let e = tet4_electric_field(&nodes, &pots);
        for &ei in &e {
            assert!(ei.abs() < 1e-10, "Uniform potential should give zero E field");
        }
    }
}
