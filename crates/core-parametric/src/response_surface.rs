use nalgebra::DMatrix;
use serde::{Deserialize, Serialize};

use crate::DesignStudy;

/// A polynomial response surface (surrogate model).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseSurface {
    /// Parameter names.
    pub param_names: Vec<String>,
    /// Polynomial coefficients (constant + linear + quadratic + cross terms).
    pub coefficients: Vec<f64>,
    /// R² goodness-of-fit score (0 to 1).
    pub r_squared: f64,
    /// Number of parameters.
    pub n_params: usize,
}

impl ResponseSurface {
    /// Evaluate the response surface at a given parameter point.
    pub fn predict(&self, params: &[f64]) -> f64 {
        let basis = build_basis_row(params);
        basis
            .iter()
            .zip(self.coefficients.iter())
            .map(|(b, c)| b * c)
            .sum()
    }

    /// Evaluate over a grid for visualization.
    /// Returns (param1_values, param2_values, response_values) for first two parameters.
    pub fn eval_grid(&self, params: &[crate::Parameter], resolution: usize) -> Vec<Vec<f64>> {
        if self.n_params < 2 || params.len() < 2 {
            return vec![];
        }
        let p0_lo = params[0].lower_bound.unwrap_or(0.0);
        let p0_hi = params[0].upper_bound.unwrap_or(1.0);
        let p1_lo = params[1].lower_bound.unwrap_or(0.0);
        let p1_hi = params[1].upper_bound.unwrap_or(1.0);

        let mut grid = Vec::new();
        let center: Vec<f64> = params.iter().map(|p| p.value).collect();

        for i in 0..resolution {
            for j in 0..resolution {
                let v0 = p0_lo + (p0_hi - p0_lo) * i as f64 / (resolution - 1).max(1) as f64;
                let v1 = p1_lo + (p1_hi - p1_lo) * j as f64 / (resolution - 1).max(1) as f64;
                let mut point = center.clone();
                point[0] = v0;
                point[1] = v1;
                let response = self.predict(&point);
                grid.push(vec![v0, v1, response]);
            }
        }
        grid
    }
}

/// Fit a quadratic response surface from design study data.
///
/// Model: y = c0 + c1*x1 + c2*x2 + ... + c_n*xn + c_{n+1}*x1² + ... + c_{2n}*xn² + cross terms
pub fn fit_response_surface(study: &DesignStudy, output_idx: usize) -> Option<ResponseSurface> {
    let converged_points: Vec<_> = study
        .design_points
        .iter()
        .filter(|dp| dp.status == crate::DesignPointStatus::Converged)
        .filter(|dp| dp.output_values.len() > output_idx)
        .collect();

    if converged_points.is_empty() {
        return None;
    }

    let n = study.parameters.len();
    let m = converged_points.len();

    // Build design matrix A (m rows × k columns) where k = basis function count
    // Basis: 1, x1, x2, ..., xn, x1², x2², ..., xn²
    let k = 1 + n + n; // constant + linear + quadratic (no cross terms for simplicity)

    if m < k {
        // Not enough points for a full quadratic fit, use linear only
        return fit_linear(study, output_idx);
    }

    let mut a = DMatrix::zeros(m, k);
    let mut y = DMatrix::zeros(m, 1);

    for (i, dp) in converged_points.iter().enumerate() {
        let basis = build_basis_row(&dp.parameter_values);
        for (j, &b) in basis.iter().take(k).enumerate() {
            a[(i, j)] = b;
        }
        y[(i, 0)] = dp.output_values[output_idx];
    }

    // Least squares: c = (A^T A)^{-1} A^T y
    let at = a.transpose();
    let ata = &at * &a;
    let aty = &at * &y;

    let coeffs = match ata.clone().try_inverse() {
        Some(inv) => inv * aty,
        None => return fit_linear(study, output_idx), // fallback
    };

    let coefficients: Vec<f64> = (0..k).map(|i| coeffs[(i, 0)]).collect();

    // Compute R²
    let y_mean = y.column(0).sum() / m as f64;
    let ss_tot: f64 = (0..m).map(|i| (y[(i, 0)] - y_mean).powi(2)).sum();
    let ss_res: f64 = (0..m)
        .map(|i| {
            let predicted: f64 = (0..k).map(|j| a[(i, j)] * coefficients[j]).sum();
            (y[(i, 0)] - predicted).powi(2)
        })
        .sum();
    let r_squared = if ss_tot > 1e-20 { 1.0 - ss_res / ss_tot } else { 0.0 };

    Some(ResponseSurface {
        param_names: study.parameters.iter().map(|p| p.name.clone()).collect(),
        coefficients,
        r_squared: r_squared.clamp(0.0, 1.0),
        n_params: n,
    })
}

/// Fallback: fit a linear model (constant + linear terms only).
fn fit_linear(study: &DesignStudy, output_idx: usize) -> Option<ResponseSurface> {
    let converged: Vec<_> = study
        .design_points
        .iter()
        .filter(|dp| dp.status == crate::DesignPointStatus::Converged)
        .filter(|dp| dp.output_values.len() > output_idx)
        .collect();

    let n = study.parameters.len();
    let m = converged.len();
    let k = 1 + n;

    if m < k {
        return None;
    }

    let mut a = DMatrix::zeros(m, k);
    let mut y = DMatrix::zeros(m, 1);

    for (i, dp) in converged.iter().enumerate() {
        a[(i, 0)] = 1.0;
        for (j, &v) in dp.parameter_values.iter().take(n).enumerate() {
            a[(i, 1 + j)] = v;
        }
        y[(i, 0)] = dp.output_values[output_idx];
    }

    let at = a.transpose();
    let ata = &at * &a;
    let aty = &at * &y;
    let coeffs = ata.try_inverse()? * aty;

    let mut coefficients: Vec<f64> = (0..k).map(|i| coeffs[(i, 0)]).collect();
    // Pad with zeros for quadratic terms
    coefficients.resize(1 + n + n, 0.0);

    Some(ResponseSurface {
        param_names: study.parameters.iter().map(|p| p.name.clone()).collect(),
        coefficients,
        r_squared: 0.0, // simplified
        n_params: n,
    })
}

/// Build the basis function row for a given parameter vector.
/// Returns [1, x1, x2, ..., xn, x1², x2², ..., xn²]
fn build_basis_row(params: &[f64]) -> Vec<f64> {
    let mut row = vec![1.0]; // constant term
    for &v in params {
        row.push(v); // linear terms
    }
    for &v in params {
        row.push(v * v); // quadratic terms
    }
    row
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DesignPoint, DesignPointStatus, DoeAlgorithm, Parameter};
    use uuid::Uuid;

    #[test]
    fn test_fit_known_quadratic() {
        // y = 1 + 2*x + 3*x²
        let mut study = DesignStudy::new("Test", DoeAlgorithm::Custom);
        study.parameters.push(Parameter {
            id: Uuid::new_v4(),
            name: "x".into(),
            description: String::new(),
            value: 0.0,
            lower_bound: Some(-1.0),
            upper_bound: Some(1.0),
            distribution: None,
        });
        study.output_names.push("y".into());

        // Generate points from y = 1 + 2x + 3x²
        for i in 0..10 {
            let x = -1.0 + 2.0 * i as f64 / 9.0;
            let y = 1.0 + 2.0 * x + 3.0 * x * x;
            study.design_points.push(DesignPoint {
                id: Uuid::new_v4(),
                parameter_values: vec![x],
                output_values: vec![y],
                status: DesignPointStatus::Converged,
            });
        }

        let surface = fit_response_surface(&study, 0).unwrap();
        assert!(surface.r_squared > 0.99, "R² should be ~1.0 for exact quadratic, got {}", surface.r_squared);

        // Test prediction at x=0.5: y = 1 + 1 + 0.75 = 2.75
        let predicted = surface.predict(&[0.5]);
        assert!((predicted - 2.75).abs() < 0.01, "Prediction at x=0.5 should be ~2.75, got {}", predicted);
    }
}
