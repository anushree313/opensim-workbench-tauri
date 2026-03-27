use std::collections::HashMap;

use core_geometry::{GeometryModel, TessellatedMesh};

use crate::{Element, ElementKind, Mesh, MeshNode};

/// Meshing parameters.
#[derive(Debug, Clone)]
pub struct MeshingParams {
    /// Maximum element edge length. Controls mesh density.
    pub max_element_size: f64,
    /// Whether to generate volume (tet) elements or surface only.
    pub mesh_type: MeshType,
}

impl Default for MeshingParams {
    fn default() -> Self {
        Self {
            max_element_size: 0.5,
            mesh_type: MeshType::Volume,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeshType {
    SurfaceOnly,
    Volume,
}

#[derive(Debug, thiserror::Error)]
pub enum MeshError {
    #[error("No geometry provided")]
    NoGeometry,
    #[error("No tessellation available for body '{0}'")]
    NoTessellation(String),
    #[error("Empty mesh produced")]
    EmptyMesh,
    #[error("Degenerate surface: {0}")]
    DegenerateSurface(String),
}

/// Generate a finite element mesh from a geometry model.
///
/// For each body in the geometry, the tessellation is used as the source surface.
/// Vertices are welded to produce shared nodes, then Tri3 surface elements are created.
/// If `params.mesh_type` is `Volume`, the interior is filled with Tet4 elements.
pub fn generate_mesh_from_geometry(
    geometry: &GeometryModel,
    params: &MeshingParams,
) -> Result<Mesh, MeshError> {
    if geometry.bodies.is_empty() {
        return Err(MeshError::NoGeometry);
    }

    let mut all_nodes: Vec<MeshNode> = Vec::new();
    let mut all_elements: Vec<Element> = Vec::new();
    let mut next_node_id: u64 = 0;
    let mut next_elem_id: u64 = 0;

    for body in &geometry.bodies {
        let tess = body
            .tessellation
            .as_ref()
            .ok_or_else(|| MeshError::NoTessellation(body.name.clone()))?;

        // Surface mesh from tessellation (weld vertices)
        let (nodes, elements) =
            surface_mesh_from_tessellation(tess, next_node_id, next_elem_id);

        let node_count = nodes.len() as u64;
        let elem_count = elements.len() as u64;

        all_nodes.extend(nodes);
        all_elements.extend(elements);
        next_node_id += node_count;
        next_elem_id += elem_count;
    }

    // Volume meshing: tetrahedralize the interior
    if params.mesh_type == MeshType::Volume && !all_nodes.is_empty() {
        let surface_tris: Vec<[u64; 3]> = all_elements
            .iter()
            .filter(|e| e.kind == ElementKind::Tri3)
            .map(|e| [e.node_ids[0], e.node_ids[1], e.node_ids[2]])
            .collect();

        let (tet_nodes, tet_elements) = tetrahedralize_interior(
            &all_nodes,
            &surface_tris,
            params.max_element_size,
            next_node_id,
            next_elem_id,
        );
        all_nodes.extend(tet_nodes);
        all_elements.extend(tet_elements);
    }

    if all_nodes.is_empty() {
        return Err(MeshError::EmptyMesh);
    }

    let mut mesh = Mesh::new();
    mesh.name = format!("Mesh of {}", geometry.name);
    mesh.source_geometry_id = Some(geometry.id);
    mesh.nodes = all_nodes;
    mesh.elements = all_elements;

    Ok(mesh)
}

/// Convert a tessellated mesh (with duplicated vertices per face) into a proper
/// surface mesh with shared nodes and Tri3 elements.
fn surface_mesh_from_tessellation(
    tess: &TessellatedMesh,
    start_node_id: u64,
    start_elem_id: u64,
) -> (Vec<MeshNode>, Vec<Element>) {
    // Weld vertices using a spatial hash
    let tolerance = 1e-6_f64;
    let inv_tol = 1.0 / tolerance;
    let mut vertex_map: HashMap<(i64, i64, i64), u64> = HashMap::new();
    let mut nodes: Vec<MeshNode> = Vec::new();
    let mut index_remap: Vec<u64> = Vec::with_capacity(tess.vertices.len());
    let mut next_id = start_node_id;

    for v in &tess.vertices {
        let key = (
            (v[0] as f64 * inv_tol).round() as i64,
            (v[1] as f64 * inv_tol).round() as i64,
            (v[2] as f64 * inv_tol).round() as i64,
        );
        let node_id = *vertex_map.entry(key).or_insert_with(|| {
            let id = next_id;
            nodes.push(MeshNode {
                id,
                position: [v[0] as f64, v[1] as f64, v[2] as f64],
            });
            next_id += 1;
            id
        });
        index_remap.push(node_id);
    }

    // Create Tri3 elements from index buffer
    let mut elements: Vec<Element> = Vec::new();
    let mut elem_id = start_elem_id;
    let num_tris = tess.indices.len() / 3;
    for i in 0..num_tris {
        let i0 = tess.indices[i * 3] as usize;
        let i1 = tess.indices[i * 3 + 1] as usize;
        let i2 = tess.indices[i * 3 + 2] as usize;

        let n0 = index_remap[i0];
        let n1 = index_remap[i1];
        let n2 = index_remap[i2];

        // Skip degenerate triangles
        if n0 == n1 || n1 == n2 || n0 == n2 {
            continue;
        }

        elements.push(Element {
            id: elem_id,
            kind: ElementKind::Tri3,
            node_ids: vec![n0, n1, n2],
        });
        elem_id += 1;
    }

    (nodes, elements)
}

/// Fill the interior of a surface mesh with Tet4 elements using a grid-based approach.
///
/// Algorithm:
/// 1. Compute AABB of the surface mesh
/// 2. Create a regular 3D grid within the AABB
/// 3. Subdivide each grid cell (cube) into 5 tetrahedra
/// 4. Keep only tets whose centroid is inside the surface mesh (ray-cast test)
fn tetrahedralize_interior(
    surface_nodes: &[MeshNode],
    surface_tris: &[[u64; 3]],
    max_element_size: f64,
    start_node_id: u64,
    start_elem_id: u64,
) -> (Vec<MeshNode>, Vec<Element>) {
    if surface_nodes.is_empty() || surface_tris.is_empty() {
        return (Vec::new(), Vec::new());
    }

    // Build a node lookup for the surface
    let node_map: HashMap<u64, [f64; 3]> = surface_nodes
        .iter()
        .map(|n| (n.id, n.position))
        .collect();

    // Pre-compute triangle data for ray casting
    let tri_data: Vec<[[f64; 3]; 3]> = surface_tris
        .iter()
        .filter_map(|[a, b, c]| {
            let pa = node_map.get(a)?;
            let pb = node_map.get(b)?;
            let pc = node_map.get(c)?;
            Some([*pa, *pb, *pc])
        })
        .collect();

    // Compute AABB
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    for node in surface_nodes {
        for i in 0..3 {
            min[i] = min[i].min(node.position[i]);
            max[i] = max[i].max(node.position[i]);
        }
    }

    // Slightly shrink to avoid boundary issues
    let pad = max_element_size * 0.1;
    for i in 0..3 {
        min[i] += pad;
        max[i] -= pad;
    }

    // Grid resolution
    let size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    let nx = ((size[0] / max_element_size).ceil() as usize).max(2);
    let ny = ((size[1] / max_element_size).ceil() as usize).max(2);
    let nz = ((size[2] / max_element_size).ceil() as usize).max(2);

    let dx = size[0] / nx as f64;
    let dy = size[1] / ny as f64;
    let dz = size[2] / nz as f64;

    // Create grid nodes
    let mut grid_nodes: Vec<MeshNode> = Vec::new();
    let mut grid_node_ids: Vec<Vec<Vec<u64>>> =
        vec![vec![vec![0; nz + 1]; ny + 1]; nx + 1];
    let mut next_id = start_node_id;

    for ix in 0..=nx {
        for iy in 0..=ny {
            for iz in 0..=nz {
                let pos = [
                    min[0] + ix as f64 * dx,
                    min[1] + iy as f64 * dy,
                    min[2] + iz as f64 * dz,
                ];
                grid_node_ids[ix][iy][iz] = next_id;
                grid_nodes.push(MeshNode {
                    id: next_id,
                    position: pos,
                });
                next_id += 1;
            }
        }
    }

    // Subdivide each cube into 5 tetrahedra and filter by inside test
    let mut tet_elements: Vec<Element> = Vec::new();
    let mut elem_id = start_elem_id;

    // 5-tet decomposition of a cube (using local corner indices 0-7)
    // Corners: 0=(0,0,0) 1=(1,0,0) 2=(1,1,0) 3=(0,1,0) 4=(0,0,1) 5=(1,0,1) 6=(1,1,1) 7=(0,1,1)
    let tet_patterns: [[usize; 4]; 5] = [
        [0, 1, 3, 4], // front-left
        [1, 2, 3, 6], // back-right
        [1, 4, 5, 6], // top-front
        [3, 4, 6, 7], // top-back
        [1, 3, 4, 6], // center
    ];

    for ix in 0..nx {
        for iy in 0..ny {
            for iz in 0..nz {
                // 8 corners of this cube
                let corners = [
                    grid_node_ids[ix][iy][iz],
                    grid_node_ids[ix + 1][iy][iz],
                    grid_node_ids[ix + 1][iy + 1][iz],
                    grid_node_ids[ix][iy + 1][iz],
                    grid_node_ids[ix][iy][iz + 1],
                    grid_node_ids[ix + 1][iy][iz + 1],
                    grid_node_ids[ix + 1][iy + 1][iz + 1],
                    grid_node_ids[ix][iy + 1][iz + 1],
                ];

                for pattern in &tet_patterns {
                    let nids = [
                        corners[pattern[0]],
                        corners[pattern[1]],
                        corners[pattern[2]],
                        corners[pattern[3]],
                    ];

                    // Compute centroid
                    let mut centroid = [0.0; 3];
                    for &nid in &nids {
                        if let Some(node) = grid_nodes.iter().find(|n| n.id == nid) {
                            for k in 0..3 {
                                centroid[k] += node.position[k];
                            }
                        }
                    }
                    for k in 0..3 {
                        centroid[k] /= 4.0;
                    }

                    if is_inside(&centroid, &tri_data) {
                        tet_elements.push(Element {
                            id: elem_id,
                            kind: ElementKind::Tet4,
                            node_ids: nids.to_vec(),
                        });
                        elem_id += 1;
                    }
                }
            }
        }
    }

    // Only keep nodes that are referenced by at least one tet element
    let used_node_ids: std::collections::HashSet<u64> = tet_elements
        .iter()
        .flat_map(|e| e.node_ids.iter().copied())
        .collect();

    let used_nodes: Vec<MeshNode> = grid_nodes
        .into_iter()
        .filter(|n| used_node_ids.contains(&n.id))
        .collect();

    (used_nodes, tet_elements)
}

/// Ray-casting point-in-mesh test.
/// Casts multiple slightly-perturbed rays and takes majority vote to handle edge cases.
fn is_inside(point: &[f64; 3], triangles: &[[[f64; 3]; 3]]) -> bool {
    // Use perturbed directions to avoid hitting edges/vertices exactly
    let directions: [[f64; 3]; 3] = [
        [1.0, 0.00037, 0.00019],
        [0.00013, 1.0, 0.00041],
        [0.00029, 0.00017, 1.0],
    ];
    let mut inside_votes = 0;
    for dir in &directions {
        let mut crossings = 0;
        for tri in triangles {
            if ray_intersects_triangle_dir(point, dir, tri) {
                crossings += 1;
            }
        }
        if crossings % 2 == 1 {
            inside_votes += 1;
        }
    }
    inside_votes >= 2
}

/// Möller–Trumbore ray-triangle intersection test.
/// Ray starts at `origin` and goes along the given direction.
fn ray_intersects_triangle_dir(origin: &[f64; 3], dir: &[f64; 3], tri: &[[f64; 3]; 3]) -> bool {
    let v0 = tri[0];
    let v1 = tri[1];
    let v2 = tri[2];

    let edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    let edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

    let h = cross(dir, &edge2);
    let a = dot(&edge1, &h);

    if a.abs() < 1e-12 {
        return false; // parallel
    }

    let f = 1.0 / a;
    let s = [
        origin[0] - v0[0],
        origin[1] - v0[1],
        origin[2] - v0[2],
    ];
    let u = f * dot(&s, &h);
    // Use half-open intervals to avoid double-counting edges
    if u < 0.0 || u > 1.0 {
        return false;
    }

    let q = cross(&s, &edge1);
    let v = f * dot(dir, &q);
    if v < 0.0 || u + v > 1.0 {
        return false;
    }

    let t = f * dot(&edge2, &q);
    t > 1e-12 // intersection ahead of ray origin
}

fn cross(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn dot(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Generate a conforming Tet4 mesh for a chip package (3-layer stacked boxes).
///
/// Creates shared nodes at material interfaces, element sets per layer,
/// and named node sets for boundary condition application.
pub fn generate_chip_package_mesh(
    params: &core_geometry::primitives::ChipPackagePrimitive,
    mesh_params: &MeshingParams,
) -> Result<Mesh, MeshError> {
    let mut mesh = Mesh::new();
    mesh.name = "Chip Package Mesh".into();

    let o = params.origin;
    let es = mesh_params.max_element_size;

    // Layer Z coordinates
    let lf_z0 = o[2];
    let lf_z1 = o[2] + params.leadframe_thickness;
    let dba_z1 = lf_z1 + params.dba_thickness;
    let die_z1 = dba_z1 + params.die_thickness;

    // DBA and die XY bounds (centered on leadframe)
    let lf_w = params.leadframe_size[0];
    let lf_h = params.leadframe_size[1];
    let dba_x0 = o[0] + (lf_w - params.dba_size[0]) / 2.0;
    let dba_x1 = dba_x0 + params.dba_size[0];
    let dba_y0 = o[1] + (lf_h - params.dba_size[1]) / 2.0;
    let dba_y1 = dba_y0 + params.dba_size[1];
    let die_x0 = o[0] + (lf_w - params.die_size[0]) / 2.0;
    let die_x1 = die_x0 + params.die_size[0];
    let die_y0 = o[1] + (lf_h - params.die_size[1]) / 2.0;
    let die_y1 = die_y0 + params.die_size[1];

    // Build merged X coordinates (sorted, unique)
    let mut x_coords = build_grid_coords(o[0], o[0] + lf_w, es);
    insert_coords(&mut x_coords, dba_x0);
    insert_coords(&mut x_coords, dba_x1);
    insert_coords(&mut x_coords, die_x0);
    insert_coords(&mut x_coords, die_x1);
    x_coords.sort_by(|a, b| a.partial_cmp(b).unwrap());
    x_coords.dedup_by(|a, b| (*a - *b).abs() < 1e-10);

    let mut y_coords = build_grid_coords(o[1], o[1] + lf_h, es);
    insert_coords(&mut y_coords, dba_y0);
    insert_coords(&mut y_coords, dba_y1);
    insert_coords(&mut y_coords, die_y0);
    insert_coords(&mut y_coords, die_y1);
    y_coords.sort_by(|a, b| a.partial_cmp(b).unwrap());
    y_coords.dedup_by(|a, b| (*a - *b).abs() < 1e-10);

    // Z grids per layer
    let z_lf = build_grid_coords(lf_z0, lf_z1, es);
    let z_dba = build_grid_coords(lf_z1, dba_z1, es.min(params.dba_thickness));
    let z_die = build_grid_coords(dba_z1, die_z1, es);

    // Build all Z levels: merge leadframe, skip first of DBA (shared with LF top), skip first of die
    let mut z_levels: Vec<(f64, &str)> = Vec::new(); // (z, layer_hint)
    for &z in &z_lf { z_levels.push((z, "leadframe")); }
    for &z in z_dba.iter().skip(1) { z_levels.push((z, "dba")); }
    for &z in z_die.iter().skip(1) { z_levels.push((z, "die")); }

    let nx = x_coords.len();
    let ny = y_coords.len();
    let nz = z_levels.len();

    // Create nodes: 3D grid indexed [ix][iy][iz]
    // Some nodes only exist where the layer covers that XY location
    let mut node_id_grid: Vec<Vec<Vec<Option<u64>>>> = vec![vec![vec![None; nz]; ny]; nx];
    let mut next_node_id: u64 = 0;

    for (ix, &x) in x_coords.iter().enumerate() {
        for (iy, &y) in y_coords.iter().enumerate() {
            for (iz, &(z, _layer)) in z_levels.iter().enumerate() {
                // Determine if this node is within the active XY region for its Z level
                let in_lf = z <= lf_z1 + 1e-10;
                let in_dba = z >= lf_z1 - 1e-10 && z <= dba_z1 + 1e-10
                    && x >= dba_x0 - 1e-10 && x <= dba_x1 + 1e-10
                    && y >= dba_y0 - 1e-10 && y <= dba_y1 + 1e-10;
                let in_die = z >= dba_z1 - 1e-10 && z <= die_z1 + 1e-10
                    && x >= die_x0 - 1e-10 && x <= die_x1 + 1e-10
                    && y >= die_y0 - 1e-10 && y <= die_y1 + 1e-10;

                if in_lf || in_dba || in_die {
                    let nid = next_node_id;
                    next_node_id += 1;
                    node_id_grid[ix][iy][iz] = Some(nid);
                    mesh.nodes.push(MeshNode { id: nid, position: [x, y, z] });
                }
            }
        }
    }

    // Create Tet4 elements from hex cells
    let tet_patterns: [[usize; 4]; 5] = [
        [0, 1, 3, 4], [1, 2, 3, 6], [1, 4, 5, 6], [3, 4, 6, 7], [1, 3, 4, 6],
    ];

    let mut next_elem_id: u64 = 0;
    let mut lf_elems = Vec::new();
    let mut dba_elems = Vec::new();
    let mut die_elems = Vec::new();

    for ix in 0..nx - 1 {
        for iy in 0..ny - 1 {
            for iz in 0..nz - 1 {
                // Get 8 corners of hex cell
                let corners = [
                    node_id_grid[ix][iy][iz],
                    node_id_grid[ix + 1][iy][iz],
                    node_id_grid[ix + 1][iy + 1][iz],
                    node_id_grid[ix][iy + 1][iz],
                    node_id_grid[ix][iy][iz + 1],
                    node_id_grid[ix + 1][iy][iz + 1],
                    node_id_grid[ix + 1][iy + 1][iz + 1],
                    node_id_grid[ix][iy + 1][iz + 1],
                ];

                // Skip if any corner is missing
                if corners.iter().any(|c| c.is_none()) { continue; }
                let c: Vec<u64> = corners.iter().map(|c| c.unwrap()).collect();

                // Determine which layer this cell belongs to (by Z midpoint)
                let z_mid = (z_levels[iz].0 + z_levels[iz + 1].0) / 2.0;
                let layer = if z_mid < lf_z1 - 1e-10 {
                    "leadframe"
                } else if z_mid < dba_z1 - 1e-10 {
                    "dba"
                } else {
                    "die"
                };

                for pattern in &tet_patterns {
                    let nids = vec![c[pattern[0]], c[pattern[1]], c[pattern[2]], c[pattern[3]]];
                    let eid = next_elem_id;
                    next_elem_id += 1;
                    mesh.elements.push(Element { id: eid, kind: ElementKind::Tet4, node_ids: nids });

                    match layer {
                        "leadframe" => lf_elems.push(eid),
                        "dba" => dba_elems.push(eid),
                        "die" => die_elems.push(eid),
                        _ => {}
                    }
                }
            }
        }
    }

    // Element sets
    mesh.element_sets.push(crate::ElementSet { name: "leadframe".into(), element_ids: lf_elems });
    mesh.element_sets.push(crate::ElementSet { name: "dba".into(), element_ids: dba_elems });
    mesh.element_sets.push(crate::ElementSet { name: "die".into(), element_ids: die_elems });

    // Node sets for BCs
    let tol = 1e-10;
    let bottom_nodes: Vec<u64> = mesh.nodes.iter()
        .filter(|n| (n.position[2] - lf_z0).abs() < tol)
        .map(|n| n.id).collect();
    let top_nodes: Vec<u64> = mesh.nodes.iter()
        .filter(|n| (n.position[2] - die_z1).abs() < tol)
        .map(|n| n.id).collect();
    let interface_lf_dba: Vec<u64> = mesh.nodes.iter()
        .filter(|n| (n.position[2] - lf_z1).abs() < tol
            && n.position[0] >= dba_x0 - tol && n.position[0] <= dba_x1 + tol
            && n.position[1] >= dba_y0 - tol && n.position[1] <= dba_y1 + tol)
        .map(|n| n.id).collect();
    let interface_dba_die: Vec<u64> = mesh.nodes.iter()
        .filter(|n| (n.position[2] - dba_z1).abs() < tol
            && n.position[0] >= die_x0 - tol && n.position[0] <= die_x1 + tol
            && n.position[1] >= die_y0 - tol && n.position[1] <= die_y1 + tol)
        .map(|n| n.id).collect();

    mesh.node_sets.push(crate::NodeSet { name: "leadframe_bottom".into(), node_ids: bottom_nodes });
    mesh.node_sets.push(crate::NodeSet { name: "die_top".into(), node_ids: top_nodes });
    mesh.node_sets.push(crate::NodeSet { name: "interface_lf_dba".into(), node_ids: interface_lf_dba });
    mesh.node_sets.push(crate::NodeSet { name: "interface_dba_die".into(), node_ids: interface_dba_die });

    if mesh.elements.is_empty() {
        return Err(MeshError::EmptyMesh);
    }

    Ok(mesh)
}

fn build_grid_coords(start: f64, end: f64, max_step: f64) -> Vec<f64> {
    let range = end - start;
    if range < 1e-15 { return vec![start, end]; }
    let n = (range / max_step).ceil() as usize;
    let n = n.max(1);
    let step = range / n as f64;
    (0..=n).map(|i| start + i as f64 * step).collect()
}

fn insert_coords(coords: &mut Vec<f64>, val: f64) {
    if !coords.iter().any(|&c| (c - val).abs() < 1e-10) {
        coords.push(val);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_geometry::primitives::{BoxPrimitive, ChipPackagePrimitive, Primitive};
    use core_geometry::{Body, GeometryModel};

    fn make_box_geometry() -> GeometryModel {
        let prim = Primitive::Box(BoxPrimitive {
            origin: [0.0, 0.0, 0.0],
            dimensions: [1.0, 1.0, 1.0],
        });
        let body = Body::from_primitive("TestBox", prim);
        let mut geo = GeometryModel::new("Test");
        geo.add_body(body);
        geo
    }

    #[test]
    fn test_surface_mesh_welds_vertices() {
        let geo = make_box_geometry();
        let tess = geo.bodies[0].tessellation.as_ref().unwrap();

        let (nodes, elements) = surface_mesh_from_tessellation(tess, 0, 0);

        // A box has 8 unique corners
        assert_eq!(nodes.len(), 8, "Box should have 8 welded nodes");
        // A box has 12 triangles (2 per face × 6 faces)
        assert_eq!(elements.len(), 12, "Box should have 12 Tri3 elements");

        // All elements should be Tri3
        assert!(elements.iter().all(|e| e.kind == ElementKind::Tri3));
    }

    #[test]
    fn test_generate_volume_mesh_from_box() {
        let geo = make_box_geometry();
        let params = MeshingParams {
            max_element_size: 0.5,
            mesh_type: MeshType::Volume,
        };

        let mesh = generate_mesh_from_geometry(&geo, &params).unwrap();

        // Should have surface Tri3 elements
        let tri_count = mesh
            .elements
            .iter()
            .filter(|e| e.kind == ElementKind::Tri3)
            .count();
        assert!(tri_count > 0, "Should have surface triangles");

        // Should have volume Tet4 elements
        let tet_count = mesh
            .elements
            .iter()
            .filter(|e| e.kind == ElementKind::Tet4)
            .count();
        assert!(tet_count > 0, "Should have volume tetrahedra");

        // All nodes should be within or on the AABB of the box [0,1]^3
        for node in &mesh.nodes {
            for k in 0..3 {
                assert!(
                    node.position[k] >= -0.1 && node.position[k] <= 1.1,
                    "Node {:?} is outside bounding box",
                    node.position
                );
            }
        }

        assert!(mesh.source_geometry_id.is_some());
    }

    #[test]
    fn test_point_in_mesh() {
        // Simple test: unit cube made of two triangles per face
        let geo = make_box_geometry();
        let tess = geo.bodies[0].tessellation.as_ref().unwrap();
        let (nodes, elements) = surface_mesh_from_tessellation(tess, 0, 0);

        let node_map: HashMap<u64, [f64; 3]> =
            nodes.iter().map(|n| (n.id, n.position)).collect();
        let tri_data: Vec<[[f64; 3]; 3]> = elements
            .iter()
            .map(|e| {
                [
                    node_map[&e.node_ids[0]],
                    node_map[&e.node_ids[1]],
                    node_map[&e.node_ids[2]],
                ]
            })
            .collect();

        // Center of box should be inside
        assert!(is_inside(&[0.5, 0.5, 0.5], &tri_data), "Center should be inside");

        // Well outside the box
        assert!(!is_inside(&[5.0, 5.0, 5.0], &tri_data), "Far point should be outside");
        assert!(!is_inside(&[-1.0, 0.5, 0.5], &tri_data), "Left of box should be outside");
    }

    #[test]
    fn test_chip_package_mesh() {
        let cp = ChipPackagePrimitive::default_package();
        let params = MeshingParams { max_element_size: 2.0, mesh_type: MeshType::Volume };
        let mesh = generate_chip_package_mesh(&cp, &params).unwrap();

        assert!(mesh.nodes.len() > 20, "Should have many nodes, got {}", mesh.nodes.len());
        let tet_count = mesh.elements.iter().filter(|e| e.kind == ElementKind::Tet4).count();
        assert!(tet_count > 10, "Should have many Tet4 elements, got {}", tet_count);

        // Check element sets exist
        assert_eq!(mesh.element_sets.len(), 3);
        let lf_set = mesh.element_sets.iter().find(|s| s.name == "leadframe").unwrap();
        let dba_set = mesh.element_sets.iter().find(|s| s.name == "dba").unwrap();
        let die_set = mesh.element_sets.iter().find(|s| s.name == "die").unwrap();
        assert!(!lf_set.element_ids.is_empty(), "Leadframe should have elements");
        assert!(!dba_set.element_ids.is_empty(), "DBA should have elements");
        assert!(!die_set.element_ids.is_empty(), "Die should have elements");

        // Check node sets
        assert_eq!(mesh.node_sets.len(), 4);
        let bottom = mesh.node_sets.iter().find(|s| s.name == "leadframe_bottom").unwrap();
        let top = mesh.node_sets.iter().find(|s| s.name == "die_top").unwrap();
        assert!(!bottom.node_ids.is_empty(), "Bottom node set should exist");
        assert!(!top.node_ids.is_empty(), "Top node set should exist");

        // Total elements should equal sum of element sets
        let total_set = lf_set.element_ids.len() + dba_set.element_ids.len() + die_set.element_ids.len();
        assert_eq!(total_set, tet_count, "All Tet4 elements should be in a layer set");
    }

    #[test]
    fn test_surface_only_mesh() {
        let geo = make_box_geometry();
        let params = MeshingParams {
            max_element_size: 0.5,
            mesh_type: MeshType::SurfaceOnly,
        };

        let mesh = generate_mesh_from_geometry(&geo, &params).unwrap();

        // Should only have Tri3 elements, no Tet4
        let tet_count = mesh.elements.iter().filter(|e| e.kind == ElementKind::Tet4).count();
        assert_eq!(tet_count, 0, "Surface-only mesh should have no Tet4 elements");
    }
}
