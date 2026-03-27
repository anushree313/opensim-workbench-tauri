use nalgebra::{DMatrix, DVector, Vector3};

/// Compute the volume of a Tet4 element.
pub fn tet4_volume(nodes: &[[f64; 3]; 4]) -> f64 {
    let a = Vector3::new(nodes[0][0], nodes[0][1], nodes[0][2]);
    let b = Vector3::new(nodes[1][0], nodes[1][1], nodes[1][2]);
    let c = Vector3::new(nodes[2][0], nodes[2][1], nodes[2][2]);
    let d = Vector3::new(nodes[3][0], nodes[3][1], nodes[3][2]);
    ((b - a).cross(&(c - a)).dot(&(d - a)) / 6.0).abs()
}

/// Shape function gradients for Tet4 (3x4 B-matrix).
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

/// Compute 12x12 viscous stiffness matrix for Stokes flow on a Tet4 element.
///
/// For incompressible Stokes flow, the viscous term gives:
/// K_visc = μ * V * [B^T B,  0,     0   ]
///                   [0,     B^T B,  0   ]
///                   [0,      0,    B^T B]
///
/// where B is the 3x4 gradient matrix (same for each velocity component).
pub fn tet4_viscous_stiffness(nodes: &[[f64; 3]; 4], mu: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(12, 12);
    }

    let b = tet4_b_matrix(nodes, vol);
    let bt = b.transpose();
    let btb = &bt * &b; // 4x4

    let mut ke = DMatrix::zeros(12, 12);
    // Place BtB on the diagonal blocks for x, y, z velocity components
    for comp in 0..3 {
        for i in 0..4 {
            for j in 0..4 {
                ke[(comp * 4 + i, comp * 4 + j)] = mu * vol * btb[(i, j)];
            }
        }
    }
    ke
}

/// Compute 12x12 penalty matrix for incompressibility constraint.
///
/// Penalty method: add λ * V * (div N_i) * (div N_j) to enforce ∇·u ≈ 0.
/// div(N_i) for node i at component c is dN_i/dc.
pub fn tet4_div_penalty(nodes: &[[f64; 3]; 4], lambda: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(12, 12);
    }

    let b = tet4_b_matrix(nodes, vol);

    // Build divergence vector for each DOF (12 entries)
    // DOF layout: [u0,u1,u2,u3, v0,v1,v2,v3, w0,w1,w2,w3]
    // div contribution from DOF (comp*4+i) = dN_i/d(comp)
    let mut div_vec = DVector::zeros(12);
    for i in 0..4 {
        div_vec[0 * 4 + i] = b[(0, i)]; // dN_i/dx → u component
        div_vec[1 * 4 + i] = b[(1, i)]; // dN_i/dy → v component
        div_vec[2 * 4 + i] = b[(2, i)]; // dN_i/dz → w component
    }

    // Penalty matrix = λ * V * div_vec * div_vec^T
    let kp = &div_vec * div_vec.transpose() * (lambda * vol);
    kp
}

/// Compute velocity divergence at element centroid.
pub fn tet4_velocity_divergence(nodes: &[[f64; 3]; 4], velocities: &[[f64; 3]; 4]) -> f64 {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return 0.0;
    }
    let b = tet4_b_matrix(nodes, vol);

    let mut div = 0.0;
    for i in 0..4 {
        div += b[(0, i)] * velocities[i][0]; // du/dx
        div += b[(1, i)] * velocities[i][1]; // dv/dy
        div += b[(2, i)] * velocities[i][2]; // dw/dz
    }
    div
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_tet() -> [[f64; 3]; 4] {
        [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    }

    #[test]
    fn test_viscous_stiffness_symmetry() {
        let ke = tet4_viscous_stiffness(&unit_tet(), 1.0e-3);
        assert_eq!(ke.nrows(), 12);
        for i in 0..12 {
            for j in 0..12 {
                assert!((ke[(i, j)] - ke[(j, i)]).abs() < 1e-15,
                    "Viscous stiffness should be symmetric");
            }
        }
    }

    #[test]
    fn test_uniform_velocity_zero_divergence() {
        let nodes = unit_tet();
        let vels = [[1.0, 2.0, 3.0]; 4]; // uniform velocity
        let div = tet4_velocity_divergence(&nodes, &vels);
        assert!(div.abs() < 1e-10, "Uniform velocity should have zero divergence: {}", div);
    }
}
