use crate::{DoeAlgorithm, Parameter};

/// Generate DOE design points as parameter value vectors.
/// Each inner Vec<f64> has one value per parameter.
pub fn generate_doe_points(params: &[Parameter], algorithm: &DoeAlgorithm) -> Vec<Vec<f64>> {
    match algorithm {
        DoeAlgorithm::FullFactorial { levels } => full_factorial(params, *levels),
        DoeAlgorithm::LatinHypercube { samples } => latin_hypercube(params, *samples),
        DoeAlgorithm::CentralComposite => central_composite(params),
        _ => full_factorial(params, 3), // default fallback
    }
}

/// Full factorial design: all combinations of `levels` evenly spaced values per parameter.
fn full_factorial(params: &[Parameter], levels: usize) -> Vec<Vec<f64>> {
    if params.is_empty() || levels == 0 {
        return vec![];
    }

    let n = params.len();
    let total = levels.pow(n as u32);
    let mut points = Vec::with_capacity(total);

    for i in 0..total {
        let mut point = Vec::with_capacity(n);
        let mut idx = i;
        for p in params {
            let level_idx = idx % levels;
            idx /= levels;
            let (lo, hi) = param_bounds(p);
            let val = if levels == 1 {
                (lo + hi) / 2.0
            } else {
                lo + (hi - lo) * level_idx as f64 / (levels - 1) as f64
            };
            point.push(val);
        }
        points.push(point);
    }
    points
}

/// Latin Hypercube Sampling: stratified random sampling.
/// Uses deterministic stratification (midpoints of strata) for reproducibility.
fn latin_hypercube(params: &[Parameter], samples: usize) -> Vec<Vec<f64>> {
    if params.is_empty() || samples == 0 {
        return vec![];
    }

    let n = params.len();
    let mut points = Vec::with_capacity(samples);

    // Generate permutations for each parameter dimension
    // Use a simple deterministic shuffle based on prime offsets
    let primes = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];

    for dim in 0..n {
        let prime = primes[dim % primes.len()];
        for s in 0..samples {
            if dim == 0 {
                points.push(vec![0.0; n]);
            }
            // Stratified midpoint with prime-based permutation
            let stratum = (s * prime) % samples;
            let t = (stratum as f64 + 0.5) / samples as f64;
            let (lo, hi) = param_bounds(&params[dim]);
            points[s][dim] = lo + t * (hi - lo);
        }
    }
    points
}

/// Central Composite Design: center point + axial points + factorial corners.
fn central_composite(params: &[Parameter]) -> Vec<Vec<f64>> {
    if params.is_empty() {
        return vec![];
    }

    let n = params.len();
    let mut points = Vec::new();

    // Center point
    let center: Vec<f64> = params.iter().map(|p| {
        let (lo, hi) = param_bounds(p);
        (lo + hi) / 2.0
    }).collect();
    points.push(center.clone());

    // Axial points (star points): vary one parameter at a time to bounds
    for (i, p) in params.iter().enumerate() {
        let (lo, hi) = param_bounds(p);
        let mut low_point = center.clone();
        low_point[i] = lo;
        points.push(low_point);
        let mut high_point = center.clone();
        high_point[i] = hi;
        points.push(high_point);
    }

    // Factorial corners (2^n for small n, limit to avoid explosion)
    if n <= 6 {
        let num_corners = 1usize << n;
        for i in 0..num_corners {
            let mut corner = Vec::with_capacity(n);
            for (j, p) in params.iter().enumerate() {
                let (lo, hi) = param_bounds(p);
                corner.push(if (i >> j) & 1 == 0 { lo } else { hi });
            }
            points.push(corner);
        }
    }

    points
}

fn param_bounds(p: &Parameter) -> (f64, f64) {
    let lo = p.lower_bound.unwrap_or(p.value * 0.5);
    let hi = p.upper_bound.unwrap_or(p.value * 1.5);
    (lo.min(hi), lo.max(hi))
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn make_params(n: usize) -> Vec<Parameter> {
        (0..n)
            .map(|i| Parameter {
                id: Uuid::new_v4(),
                name: format!("P{}", i),
                description: String::new(),
                value: 1.0,
                lower_bound: Some(0.0),
                upper_bound: Some(2.0),
                distribution: None,
            })
            .collect()
    }

    #[test]
    fn test_full_factorial_count() {
        let params = make_params(2);
        let points = full_factorial(&params, 3);
        assert_eq!(points.len(), 9); // 3^2
    }

    #[test]
    fn test_full_factorial_bounds() {
        let params = make_params(1);
        let points = full_factorial(&params, 5);
        assert_eq!(points.len(), 5);
        assert!((points[0][0] - 0.0).abs() < 1e-10);
        assert!((points[4][0] - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_latin_hypercube_count() {
        let params = make_params(3);
        let points = latin_hypercube(&params, 10);
        assert_eq!(points.len(), 10);
        for p in &points {
            assert_eq!(p.len(), 3);
            for &v in p {
                assert!(v >= 0.0 && v <= 2.0, "LHS value {} out of bounds", v);
            }
        }
    }

    #[test]
    fn test_central_composite() {
        let params = make_params(2);
        let points = central_composite(&params);
        // 1 center + 4 axial + 4 factorial = 9
        assert_eq!(points.len(), 9);
    }
}
