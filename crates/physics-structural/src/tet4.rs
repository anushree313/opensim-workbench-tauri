use nalgebra::{DMatrix, DVector, Vector3};

/// Compute the volume of a Tet4 element.
pub fn tet4_volume(nodes: &[[f64; 3]; 4]) -> f64 {
    let a = Vector3::new(nodes[0][0], nodes[0][1], nodes[0][2]);
    let b = Vector3::new(nodes[1][0], nodes[1][1], nodes[1][2]);
    let c = Vector3::new(nodes[2][0], nodes[2][1], nodes[2][2]);
    let d = Vector3::new(nodes[3][0], nodes[3][1], nodes[3][2]);

    let ab = b - a;
    let ac = c - a;
    let ad = d - a;

    (ab.cross(&ac).dot(&ad) / 6.0).abs()
}

/// Compute the 12x12 element stiffness matrix for a Tet4 element.
///
/// Uses constant strain formulation with the B-matrix approach.
/// K_e = V * B^T * D * B
///
/// where:
/// - V is the element volume
/// - B is the 6x12 strain-displacement matrix
/// - D is the 6x6 material stiffness matrix (isotropic linear elastic)
pub fn tet4_stiffness(nodes: &[[f64; 3]; 4], e: f64, nu: f64) -> DMatrix<f64> {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return DMatrix::zeros(12, 12);
    }

    let b = tet4_b_matrix(nodes, vol);
    let d = isotropic_d_matrix(e, nu);

    // K_e = V * B^T * D * B
    let bt = b.transpose();
    let db = &d * &b;
    let ke = &bt * &db * vol;

    ke
}

/// Compute the 6x12 B-matrix (strain-displacement) for a Tet4 element.
///
/// For a Tet4, the strain is constant within the element.
/// B relates nodal displacements (12 DOFs) to strain (6 components).
fn tet4_b_matrix(nodes: &[[f64; 3]; 4], vol: f64) -> DMatrix<f64> {
    // Shape function gradients for Tet4
    // dN/dx, dN/dy, dN/dz for each of the 4 nodes
    let v6 = 6.0 * vol;

    // Compute shape function gradients using the Jacobian inverse
    let x = [nodes[0][0], nodes[1][0], nodes[2][0], nodes[3][0]];
    let y = [nodes[0][1], nodes[1][1], nodes[2][1], nodes[3][1]];
    let z = [nodes[0][2], nodes[1][2], nodes[2][2], nodes[3][2]];

    // Coefficients for shape function gradients (from cofactors of the Jacobian)
    let mut dn = [[0.0_f64; 3]; 4]; // dn[node][xyz]

    // Node 0: gradient coefficients
    dn[0][0] = ((y[1] - y[3]) * (z[2] - z[3]) - (y[2] - y[3]) * (z[1] - z[3])) / v6;
    dn[0][1] = ((x[2] - x[3]) * (z[1] - z[3]) - (x[1] - x[3]) * (z[2] - z[3])) / v6;
    dn[0][2] = ((x[1] - x[3]) * (y[2] - y[3]) - (x[2] - x[3]) * (y[1] - y[3])) / v6;

    // Node 1
    dn[1][0] = ((y[2] - y[3]) * (z[0] - z[3]) - (y[0] - y[3]) * (z[2] - z[3])) / v6;
    dn[1][1] = ((x[0] - x[3]) * (z[2] - z[3]) - (x[2] - x[3]) * (z[0] - z[3])) / v6;
    dn[1][2] = ((x[2] - x[3]) * (y[0] - y[3]) - (x[0] - x[3]) * (y[2] - y[3])) / v6;

    // Node 2
    dn[2][0] = ((y[0] - y[3]) * (z[1] - z[3]) - (y[1] - y[3]) * (z[0] - z[3])) / v6;
    dn[2][1] = ((x[1] - x[3]) * (z[0] - z[3]) - (x[0] - x[3]) * (z[1] - z[3])) / v6;
    dn[2][2] = ((x[0] - x[3]) * (y[1] - y[3]) - (x[1] - x[3]) * (y[0] - y[3])) / v6;

    // Node 3: derived from partition of unity (sum of all gradients = 0)
    dn[3][0] = -(dn[0][0] + dn[1][0] + dn[2][0]);
    dn[3][1] = -(dn[0][1] + dn[1][1] + dn[2][1]);
    dn[3][2] = -(dn[0][2] + dn[1][2] + dn[2][2]);

    // Assemble B matrix (6x12)
    // Strain: [exx, eyy, ezz, gxy, gyz, gxz]
    // DOFs: [u0,v0,w0, u1,v1,w1, u2,v2,w2, u3,v3,w3]
    let mut b = DMatrix::zeros(6, 12);

    for i in 0..4 {
        let col = i * 3;
        let (dnx, dny, dnz) = (dn[i][0], dn[i][1], dn[i][2]);

        // exx = du/dx
        b[(0, col)] = dnx;
        // eyy = dv/dy
        b[(1, col + 1)] = dny;
        // ezz = dw/dz
        b[(2, col + 2)] = dnz;
        // gxy = du/dy + dv/dx
        b[(3, col)] = dny;
        b[(3, col + 1)] = dnx;
        // gyz = dv/dz + dw/dy
        b[(4, col + 1)] = dnz;
        b[(4, col + 2)] = dny;
        // gxz = du/dz + dw/dx
        b[(5, col)] = dnz;
        b[(5, col + 2)] = dnx;
    }

    b
}

/// Build the 6x6 isotropic linear elastic material stiffness matrix (D).
///
/// For Voigt notation: [σxx, σyy, σzz, τxy, τyz, τxz]
fn isotropic_d_matrix(e: f64, nu: f64) -> DMatrix<f64> {
    let factor = e / ((1.0 + nu) * (1.0 - 2.0 * nu));
    let mut d = DMatrix::zeros(6, 6);

    d[(0, 0)] = factor * (1.0 - nu);
    d[(1, 1)] = factor * (1.0 - nu);
    d[(2, 2)] = factor * (1.0 - nu);

    d[(0, 1)] = factor * nu;
    d[(0, 2)] = factor * nu;
    d[(1, 0)] = factor * nu;
    d[(1, 2)] = factor * nu;
    d[(2, 0)] = factor * nu;
    d[(2, 1)] = factor * nu;

    d[(3, 3)] = factor * (1.0 - 2.0 * nu) / 2.0;
    d[(4, 4)] = factor * (1.0 - 2.0 * nu) / 2.0;
    d[(5, 5)] = factor * (1.0 - 2.0 * nu) / 2.0;

    d
}

/// Compute strain at element centroid from nodal displacements.
/// Returns [exx, eyy, ezz, gxy, gyz, gxz].
pub fn tet4_strain(nodes: &[[f64; 3]; 4], displacements: &[[f64; 3]; 4]) -> [f64; 6] {
    let vol = tet4_volume(nodes);
    if vol < 1e-20 {
        return [0.0; 6];
    }

    let b = tet4_b_matrix(nodes, vol);
    let mut u = DVector::zeros(12);
    for i in 0..4 {
        u[i * 3] = displacements[i][0];
        u[i * 3 + 1] = displacements[i][1];
        u[i * 3 + 2] = displacements[i][2];
    }

    let strain = &b * &u;
    [strain[0], strain[1], strain[2], strain[3], strain[4], strain[5]]
}

/// Compute stress from strain using isotropic material.
/// Returns [σxx, σyy, σzz, τxy, τyz, τxz].
pub fn tet4_stress(strain: &[f64; 6], e: f64, nu: f64) -> [f64; 6] {
    let d = isotropic_d_matrix(e, nu);
    let eps = DVector::from_column_slice(strain);
    let sig = &d * &eps;
    [sig[0], sig[1], sig[2], sig[3], sig[4], sig[5]]
}

/// Compute Von Mises equivalent stress from stress tensor.
pub fn von_mises(stress: &[f64; 6]) -> f64 {
    let (sxx, syy, szz, sxy, syz, sxz) =
        (stress[0], stress[1], stress[2], stress[3], stress[4], stress[5]);

    let term1 = (sxx - syy).powi(2) + (syy - szz).powi(2) + (szz - sxx).powi(2);
    let term2 = 6.0 * (sxy.powi(2) + syz.powi(2) + sxz.powi(2));

    ((term1 + term2) / 2.0).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_tet() -> [[f64; 3]; 4] {
        [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ]
    }

    #[test]
    fn test_tet4_volume() {
        let vol = tet4_volume(&unit_tet());
        assert!((vol - 1.0 / 6.0).abs() < 1e-10, "Unit tet volume should be 1/6");
    }

    #[test]
    fn test_stiffness_matrix_symmetry() {
        let ke = tet4_stiffness(&unit_tet(), 200e9, 0.3);
        assert_eq!(ke.nrows(), 12);
        assert_eq!(ke.ncols(), 12);

        // Check symmetry
        for i in 0..12 {
            for j in 0..12 {
                assert!(
                    (ke[(i, j)] - ke[(j, i)]).abs() < 1e-6 * ke[(i, j)].abs().max(1.0),
                    "K[{},{}] = {} != K[{},{}] = {}",
                    i, j, ke[(i, j)], j, i, ke[(j, i)]
                );
            }
        }
    }

    #[test]
    fn test_stiffness_positive_diagonal() {
        let ke = tet4_stiffness(&unit_tet(), 200e9, 0.3);
        for i in 0..12 {
            assert!(ke[(i, i)] > 0.0, "Diagonal K[{},{}] should be positive", i, i);
        }
    }

    #[test]
    fn test_zero_strain_for_rigid_body() {
        let nodes = unit_tet();
        // Pure translation: all nodes displaced equally
        let disp = [[1.0, 2.0, 3.0]; 4];
        let strain = tet4_strain(&nodes, &disp);
        for (i, &s) in strain.iter().enumerate() {
            assert!(s.abs() < 1e-10, "Rigid body translation should give zero strain[{}] = {}", i, s);
        }
    }

    #[test]
    fn test_von_mises_uniaxial() {
        // Uniaxial stress: σxx = 100, rest = 0
        let stress = [100.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let vm = von_mises(&stress);
        assert!((vm - 100.0).abs() < 1e-10, "Von Mises for uniaxial should equal σ");
    }

    #[test]
    fn test_von_mises_pure_shear() {
        // Pure shear: τxy = 100
        let stress = [0.0, 0.0, 0.0, 100.0, 0.0, 0.0];
        let vm = von_mises(&stress);
        let expected = 100.0 * 3.0_f64.sqrt();
        assert!((vm - expected).abs() < 1e-6, "Von Mises for pure shear should be τ*√3, got {}", vm);
    }
}
