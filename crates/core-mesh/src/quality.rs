use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{ElementKind, ElementQuality, Mesh, MeshNode};

/// Summary statistics for a mesh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshStatistics {
    pub total_nodes: usize,
    pub total_elements: usize,
    pub element_counts: HashMap<ElementKind, usize>,
    pub min_quality: f64,
    pub max_quality: f64,
    pub avg_quality: f64,
}

/// Compute quality metrics for all elements in a mesh.
pub fn compute_element_quality(mesh: &Mesh) -> Vec<ElementQuality> {
    let node_map: HashMap<u64, &MeshNode> = mesh.nodes.iter().map(|n| (n.id, n)).collect();

    mesh.elements
        .iter()
        .filter_map(|el| {
            let positions: Vec<[f64; 3]> = el
                .node_ids
                .iter()
                .filter_map(|id| node_map.get(id).map(|n| n.position))
                .collect();

            if positions.len() != el.node_ids.len() {
                return None;
            }

            let quality = match el.kind {
                ElementKind::Tri3 => compute_tri3_quality(&positions),
                ElementKind::Tet4 => compute_tet4_quality(&positions),
                _ => ElementQuality {
                    element_id: el.id,
                    aspect_ratio: 1.0,
                    skewness: 0.0,
                    jacobian_ratio: 1.0,
                },
            };

            Some(ElementQuality {
                element_id: el.id,
                ..quality
            })
        })
        .collect()
}

/// Compute summary statistics for a mesh.
pub fn compute_statistics(mesh: &Mesh) -> MeshStatistics {
    let qualities = compute_element_quality(mesh);

    let (min_q, max_q, avg_q) = if qualities.is_empty() {
        (0.0, 0.0, 0.0)
    } else {
        let mut min = f64::MAX;
        let mut max = f64::MIN;
        let mut sum = 0.0;
        for q in &qualities {
            // Use aspect ratio as the primary quality metric (lower is better, 1.0 is ideal)
            let val = 1.0 / q.aspect_ratio.max(1.0); // normalize so 1.0 = best
            min = min.min(val);
            max = max.max(val);
            sum += val;
        }
        (min, max, sum / qualities.len() as f64)
    };

    MeshStatistics {
        total_nodes: mesh.num_nodes(),
        total_elements: mesh.num_elements(),
        element_counts: mesh.element_count_by_kind(),
        min_quality: min_q,
        max_quality: max_q,
        avg_quality: avg_q,
    }
}

/// Compute quality for a Tri3 element.
fn compute_tri3_quality(positions: &[[f64; 3]]) -> ElementQuality {
    let edge_lengths = [
        distance(&positions[0], &positions[1]),
        distance(&positions[1], &positions[2]),
        distance(&positions[2], &positions[0]),
    ];

    let max_edge = edge_lengths.iter().cloned().fold(0.0_f64, f64::max);
    let min_edge = edge_lengths.iter().cloned().fold(f64::MAX, f64::min);

    let aspect_ratio = if min_edge > 1e-12 {
        max_edge / min_edge
    } else {
        f64::MAX
    };

    // Skewness: deviation from equilateral triangle
    // Use the ratio of the triangle area to the area of an equilateral triangle
    // with the same longest edge
    let area = triangle_area(&positions[0], &positions[1], &positions[2]);
    let ideal_area = (3.0_f64.sqrt() / 4.0) * max_edge * max_edge;
    let skewness = if ideal_area > 1e-12 {
        1.0 - (area / ideal_area)
    } else {
        1.0
    };

    ElementQuality {
        element_id: 0,
        aspect_ratio,
        skewness: skewness.clamp(0.0, 1.0),
        jacobian_ratio: 1.0, // simplified for Tri3
    }
}

/// Compute quality for a Tet4 element.
fn compute_tet4_quality(positions: &[[f64; 3]]) -> ElementQuality {
    // Compute all 6 edge lengths
    let edges = [
        distance(&positions[0], &positions[1]),
        distance(&positions[0], &positions[2]),
        distance(&positions[0], &positions[3]),
        distance(&positions[1], &positions[2]),
        distance(&positions[1], &positions[3]),
        distance(&positions[2], &positions[3]),
    ];

    let max_edge = edges.iter().cloned().fold(0.0_f64, f64::max);
    let min_edge = edges.iter().cloned().fold(f64::MAX, f64::min);

    let aspect_ratio = if min_edge > 1e-12 {
        max_edge / min_edge
    } else {
        f64::MAX
    };

    // Volume of tetrahedron
    let volume = tet_volume(&positions[0], &positions[1], &positions[2], &positions[3]);

    // Ideal volume for a regular tet with the same longest edge
    let ideal_volume = (2.0_f64.sqrt() / 12.0) * max_edge.powi(3);

    let skewness = if ideal_volume > 1e-12 {
        1.0 - (volume.abs() / ideal_volume)
    } else {
        1.0
    };

    // Jacobian ratio: simplified as volume ratio
    let jacobian_ratio = if volume.abs() > 1e-12 {
        (volume.abs() / ideal_volume).min(1.0)
    } else {
        0.0
    };

    ElementQuality {
        element_id: 0,
        aspect_ratio,
        skewness: skewness.clamp(0.0, 1.0),
        jacobian_ratio,
    }
}

fn distance(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

fn triangle_area(a: &[f64; 3], b: &[f64; 3], c: &[f64; 3]) -> f64 {
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
    ];
    0.5 * (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt()
}

fn tet_volume(a: &[f64; 3], b: &[f64; 3], c: &[f64; 3], d: &[f64; 3]) -> f64 {
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let cross = [
        ac[1] * ad[2] - ac[2] * ad[1],
        ac[2] * ad[0] - ac[0] * ad[2],
        ac[0] * ad[1] - ac[1] * ad[0],
    ];
    (ab[0] * cross[0] + ab[1] * cross[1] + ab[2] * cross[2]) / 6.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equilateral_triangle_quality() {
        let positions = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.5, (3.0_f64).sqrt() / 2.0, 0.0],
        ];
        let q = compute_tri3_quality(&positions);
        assert!((q.aspect_ratio - 1.0).abs() < 0.01, "Equilateral tri should have AR ~1.0");
        assert!(q.skewness < 0.01, "Equilateral tri should have low skewness");
    }

    #[test]
    fn test_degenerate_triangle_quality() {
        // Very thin sliver triangle: long edge 10, height ~0.001
        let positions = [
            [0.0, 0.0, 0.0],
            [10.0, 0.0, 0.0],
            [5.0, 0.0001, 0.0],
        ];
        let q = compute_tri3_quality(&positions);
        // Edge lengths: 10, ~5.0, ~5.0 → AR ~2.0
        // But skewness should be very high (nearly zero area vs equilateral)
        assert!(q.skewness > 0.9, "Nearly-flat tri should have high skewness, got {}", q.skewness);
    }

    #[test]
    fn test_regular_tet_quality() {
        // Regular tetrahedron
        let positions = [
            [1.0, 1.0, 1.0],
            [1.0, -1.0, -1.0],
            [-1.0, 1.0, -1.0],
            [-1.0, -1.0, 1.0],
        ];
        let q = compute_tet4_quality(&positions);
        assert!((q.aspect_ratio - 1.0).abs() < 0.01, "Regular tet should have AR ~1.0");
        assert!(q.skewness < 0.1, "Regular tet should have low skewness");
    }
}
