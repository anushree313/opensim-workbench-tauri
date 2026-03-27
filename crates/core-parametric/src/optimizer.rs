use serde::{Deserialize, Serialize};

use crate::response_surface::ResponseSurface;
use crate::{DesignPoint, DesignPointStatus, DesignStudy, Parameter};

/// Optimization objective.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Objective {
    Minimize,
    Maximize,
}

/// Result of an optimization run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    /// Optimal parameter values found.
    pub optimal_params: Vec<f64>,
    /// Optimal parameter names for display.
    pub param_names: Vec<String>,
    /// Predicted optimal output value.
    pub optimal_value: f64,
    /// Convergence history (best value at each iteration).
    pub history: Vec<f64>,
}

/// Optimize over a response surface using grid search.
///
/// Evaluates the response surface on a dense grid within parameter bounds
/// and returns the point with the best objective value.
pub fn optimize(
    surface: &ResponseSurface,
    params: &[Parameter],
    objective: Objective,
) -> OptimizationResult {
    let n = params.len();
    let resolution: usize = 20; // per dimension (20^n grid, capped)
    let max_evals = 100_000;

    // Compute total evaluations and adjust resolution if needed
    let total = resolution.pow(n as u32);
    let actual_res = if total > max_evals {
        (max_evals as f64).powf(1.0 / n as f64).floor() as usize
    } else {
        resolution
    }
    .max(2);

    let mut best_params = vec![0.0; n];
    let mut best_value = match objective {
        Objective::Minimize => f64::INFINITY,
        Objective::Maximize => f64::NEG_INFINITY,
    };
    let mut history = Vec::new();

    let total_evals = actual_res.pow(n as u32);
    for i in 0..total_evals {
        let mut point = Vec::with_capacity(n);
        let mut idx = i;
        for p in params {
            let level = idx % actual_res;
            idx /= actual_res;
            let lo = p.lower_bound.unwrap_or(p.value * 0.5);
            let hi = p.upper_bound.unwrap_or(p.value * 1.5);
            let (lo, hi) = (lo.min(hi), lo.max(hi));
            let val = if actual_res == 1 {
                (lo + hi) / 2.0
            } else {
                lo + (hi - lo) * level as f64 / (actual_res - 1) as f64
            };
            point.push(val);
        }

        let value = surface.predict(&point);
        let is_better = match objective {
            Objective::Minimize => value < best_value,
            Objective::Maximize => value > best_value,
        };

        if is_better {
            best_value = value;
            best_params = point;
        }

        // Record history at regular intervals
        if i % (total_evals / 20).max(1) == 0 {
            history.push(best_value);
        }
    }
    history.push(best_value);

    OptimizationResult {
        optimal_params: best_params,
        param_names: params.iter().map(|p| p.name.clone()).collect(),
        optimal_value: best_value,
        history,
    }
}

/// Extract the Pareto frontier from converged design points for two objectives.
///
/// Returns indices of non-dominated points (minimizing both objectives).
pub fn pareto_frontier(
    study: &DesignStudy,
    obj1_idx: usize,
    obj2_idx: usize,
) -> Vec<usize> {
    let converged: Vec<(usize, &DesignPoint)> = study
        .design_points
        .iter()
        .enumerate()
        .filter(|(_, dp)| dp.status == DesignPointStatus::Converged)
        .filter(|(_, dp)| dp.output_values.len() > obj1_idx.max(obj2_idx))
        .collect();

    let mut pareto_indices = Vec::new();

    for (i, (idx_i, dp_i)) in converged.iter().enumerate() {
        let mut dominated = false;
        for (j, (_, dp_j)) in converged.iter().enumerate() {
            if i == j { continue; }
            // dp_j dominates dp_i if dp_j is <= in both objectives and < in at least one
            let v1_i = dp_i.output_values[obj1_idx];
            let v2_i = dp_i.output_values[obj2_idx];
            let v1_j = dp_j.output_values[obj1_idx];
            let v2_j = dp_j.output_values[obj2_idx];

            if v1_j <= v1_i && v2_j <= v2_i && (v1_j < v1_i || v2_j < v2_i) {
                dominated = true;
                break;
            }
        }
        if !dominated {
            pareto_indices.push(*idx_i);
        }
    }

    pareto_indices
}

/// Simple genetic algorithm optimizer over a response surface.
pub fn genetic_optimize(
    surface: &ResponseSurface,
    params: &[Parameter],
    objective: Objective,
    population_size: usize,
    generations: usize,
) -> OptimizationResult {
    let n = params.len();
    let pop_size = population_size.max(10);
    let gens = generations.max(5);

    // Initialize population: random points within bounds
    let mut population: Vec<Vec<f64>> = Vec::with_capacity(pop_size);
    for i in 0..pop_size {
        let mut individual = Vec::with_capacity(n);
        for (j, p) in params.iter().enumerate() {
            let lo = p.lower_bound.unwrap_or(p.value * 0.5);
            let hi = p.upper_bound.unwrap_or(p.value * 1.5);
            let (lo, hi) = (lo.min(hi), lo.max(hi));
            // Deterministic spread using golden ratio
            let t = ((i as f64 * 0.618033988 + j as f64 * 0.381966) % 1.0).abs();
            individual.push(lo + t * (hi - lo));
        }
        population.push(individual);
    }

    let mut history = Vec::new();
    let mut best_params = population[0].clone();
    let mut best_value = surface.predict(&best_params);

    for gen in 0..gens {
        // Evaluate fitness
        let mut fitness: Vec<(f64, usize)> = population
            .iter()
            .enumerate()
            .map(|(i, ind)| (surface.predict(ind), i))
            .collect();

        // Sort by objective
        match objective {
            Objective::Minimize => fitness.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap()),
            Objective::Maximize => fitness.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap()),
        }

        // Update best
        let gen_best = fitness[0].0;
        let gen_best_idx = fitness[0].1;
        let is_better = match objective {
            Objective::Minimize => gen_best < best_value,
            Objective::Maximize => gen_best > best_value,
        };
        if is_better {
            best_value = gen_best;
            best_params = population[gen_best_idx].clone();
        }
        history.push(best_value);

        // Selection: keep top 50%
        let elite_count = pop_size / 2;
        let elite_indices: Vec<usize> = fitness.iter().take(elite_count).map(|(_, i)| *i).collect();
        let elite: Vec<Vec<f64>> = elite_indices.iter().map(|&i| population[i].clone()).collect();

        // Crossover + mutation to fill population
        let mut new_pop = elite.clone();
        while new_pop.len() < pop_size {
            let p1 = &elite[gen % elite.len()];
            let p2 = &elite[(gen * 3 + new_pop.len()) % elite.len()];
            let mut child = Vec::with_capacity(n);
            for k in 0..n {
                // Uniform crossover
                let val = if (gen + k) % 2 == 0 { p1[k] } else { p2[k] };
                // Mutation: small perturbation
                let lo = params[k].lower_bound.unwrap_or(0.0);
                let hi = params[k].upper_bound.unwrap_or(1.0);
                let range = hi - lo;
                let mutation = range * 0.05 * ((gen as f64 * 0.7 + k as f64 * 0.3).sin());
                child.push((val + mutation).clamp(lo, hi));
            }
            new_pop.push(child);
        }
        population = new_pop;
    }

    OptimizationResult {
        optimal_params: best_params,
        param_names: params.iter().map(|p| p.name.clone()).collect(),
        optimal_value: best_value,
        history,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::response_surface::fit_response_surface;
    use crate::{DoeAlgorithm};
    use uuid::Uuid;

    fn make_quadratic_study() -> (DesignStudy, ResponseSurface) {
        // y = (x - 0.3)² + 1 → minimum at x=0.3, y=1.0
        let mut study = DesignStudy::new("Test", DoeAlgorithm::Custom);
        study.parameters.push(Parameter {
            id: Uuid::new_v4(),
            name: "x".into(),
            description: String::new(),
            value: 0.0,
            lower_bound: Some(0.0),
            upper_bound: Some(1.0),
            distribution: None,
        });
        study.output_names.push("y".into());

        for i in 0..20 {
            let x = i as f64 / 19.0;
            let y = (x - 0.3) * (x - 0.3) + 1.0;
            study.design_points.push(DesignPoint {
                id: Uuid::new_v4(),
                parameter_values: vec![x],
                output_values: vec![y],
                status: DesignPointStatus::Converged,
            });
        }

        let surface = fit_response_surface(&study, 0).unwrap();
        (study, surface)
    }

    #[test]
    fn test_optimize_finds_minimum() {
        let (study, surface) = make_quadratic_study();
        let result = optimize(&surface, &study.parameters, Objective::Minimize);

        assert!(
            (result.optimal_params[0] - 0.3).abs() < 0.1,
            "Should find minimum near x=0.3, got x={}",
            result.optimal_params[0]
        );
        assert!(
            (result.optimal_value - 1.0).abs() < 0.05,
            "Should find minimum value ~1.0, got {}",
            result.optimal_value
        );
    }

    #[test]
    fn test_optimize_finds_maximum() {
        let (study, surface) = make_quadratic_study();
        let result = optimize(&surface, &study.parameters, Objective::Maximize);

        // Maximum of (x-0.3)²+1 on [0,1] is at x=1.0: (0.7)²+1 = 1.49
        assert!(
            result.optimal_params[0] > 0.8,
            "Should find maximum near x=1.0, got x={}",
            result.optimal_params[0]
        );
    }
}
