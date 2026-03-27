use serde::{Deserialize, Serialize};

use crate::response_surface::ResponseSurface;
use crate::Parameter;

/// Monte Carlo sampling parameters.
#[derive(Debug, Clone)]
pub struct MonteCarloParams {
    pub samples: usize,
    pub seed: u64,
}

impl Default for MonteCarloParams {
    fn default() -> Self {
        Self {
            samples: 1000,
            seed: 42,
        }
    }
}

/// Six Sigma robustness analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SixSigmaResult {
    pub mean: f64,
    pub std_dev: f64,
    pub cpk: f64,
    pub histogram_bins: Vec<f64>,
    pub histogram_counts: Vec<u32>,
    pub sample_count: usize,
}

/// Run Monte Carlo robustness analysis using a response surface.
///
/// Samples parameters from their distributions (or uniform within bounds)
/// and evaluates the response surface to compute statistical properties.
pub fn run_monte_carlo(
    surface: &ResponseSurface,
    params: &[Parameter],
    mc_params: &MonteCarloParams,
) -> SixSigmaResult {
    let n = params.len();
    let samples = mc_params.samples.max(10);
    let mut outputs = Vec::with_capacity(samples);

    // Deterministic pseudo-random sampling using a simple LCG
    let mut rng_state = mc_params.seed;

    for _ in 0..samples {
        let mut point = Vec::with_capacity(n);
        for p in params {
            let lo = p.lower_bound.unwrap_or(p.value * 0.5);
            let hi = p.upper_bound.unwrap_or(p.value * 1.5);
            let (lo, hi) = (lo.min(hi), lo.max(hi));

            // LCG: simple deterministic random
            rng_state = rng_state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let t = (rng_state >> 33) as f64 / (1u64 << 31) as f64;

            // If parameter has a Normal distribution, use Box-Muller approximation
            // Otherwise uniform within bounds
            let val = match &p.distribution {
                Some(crate::Distribution::Normal { mean, std_dev }) => {
                    // Approximate: clamp to bounds
                    let offset = (t - 0.5) * 2.0 * std_dev * 3.0; // ±3σ
                    (mean + offset).clamp(lo, hi)
                }
                _ => lo + t * (hi - lo),
            };
            point.push(val);
        }
        outputs.push(surface.predict(&point));
    }

    // Compute statistics
    let mean = outputs.iter().sum::<f64>() / outputs.len() as f64;
    let variance = outputs.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / outputs.len() as f64;
    let std_dev = variance.sqrt();

    // Cpk: Process capability index (assume spec limits = mean ± 3σ_target)
    // Using the 6σ methodology: Cpk = min((USL - mean), (mean - LSL)) / (3 * σ)
    // For simplicity, assume USL/LSL at ±10% of mean
    let usl = mean * 1.1;
    let lsl = mean * 0.9;
    let cpk = if std_dev > 1e-20 {
        ((usl - mean).abs().min((mean - lsl).abs())) / (3.0 * std_dev)
    } else {
        999.0
    };

    // Build histogram
    let num_bins = 20;
    let out_min = outputs.iter().cloned().fold(f64::INFINITY, f64::min);
    let out_max = outputs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let bin_width = (out_max - out_min) / num_bins as f64;

    let mut bins = Vec::with_capacity(num_bins);
    let mut counts = vec![0u32; num_bins];

    for i in 0..num_bins {
        bins.push(out_min + (i as f64 + 0.5) * bin_width);
    }

    for &val in &outputs {
        let bin = ((val - out_min) / bin_width).floor() as usize;
        let bin = bin.min(num_bins - 1);
        counts[bin] += 1;
    }

    SixSigmaResult {
        mean,
        std_dev,
        cpk,
        histogram_bins: bins,
        histogram_counts: counts,
        sample_count: samples,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::response_surface::{fit_response_surface, ResponseSurface};
    use crate::{DesignPoint, DesignPointStatus, DesignStudy, DoeAlgorithm, Parameter};
    use uuid::Uuid;

    #[test]
    fn test_monte_carlo() {
        // y = x² — quadratic response
        let mut study = DesignStudy::new("Test", DoeAlgorithm::Custom);
        study.parameters.push(Parameter {
            id: Uuid::new_v4(),
            name: "x".into(),
            description: String::new(),
            value: 0.5,
            lower_bound: Some(0.0),
            upper_bound: Some(1.0),
            distribution: None,
        });
        study.output_names.push("y".into());

        for i in 0..20 {
            let x = i as f64 / 19.0;
            study.design_points.push(DesignPoint {
                id: Uuid::new_v4(),
                parameter_values: vec![x],
                output_values: vec![x * x],
                status: DesignPointStatus::Converged,
            });
        }

        let surface = fit_response_surface(&study, 0).unwrap();
        let mc = MonteCarloParams { samples: 500, seed: 42 };
        let result = run_monte_carlo(&surface, &study.parameters, &mc);

        assert_eq!(result.sample_count, 500);
        assert!(result.std_dev > 0.0, "Should have non-zero std dev");
        assert_eq!(result.histogram_bins.len(), 20);
        assert_eq!(result.histogram_counts.len(), 20);
        let total: u32 = result.histogram_counts.iter().sum();
        assert_eq!(total, 500);
    }
}
