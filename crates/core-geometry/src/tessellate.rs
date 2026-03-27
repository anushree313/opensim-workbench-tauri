use crate::primitives::*;
use crate::TessellatedMesh;
use std::f64::consts::PI;

/// Tessellate a primitive into a triangle mesh for 3D rendering.
pub fn tessellate_primitive(primitive: &Primitive) -> TessellatedMesh {
    match primitive {
        Primitive::Box(b) => tessellate_box(b),
        Primitive::Cylinder(c) => tessellate_cylinder(c, 32),
        Primitive::Sphere(s) => tessellate_sphere(s, 32, 16),
        Primitive::Plate(p) => tessellate_plate(p),
        Primitive::ChipPackage(_) => {
            // ChipPackage bodies are built as separate Box primitives
            TessellatedMesh { vertices: vec![], normals: vec![], indices: vec![] }
        }
    }
}

fn tessellate_box(b: &BoxPrimitive) -> TessellatedMesh {
    let o = b.origin;
    let d = b.dimensions;
    let x0 = o[0] as f32;
    let y0 = o[1] as f32;
    let z0 = o[2] as f32;
    let x1 = (o[0] + d[0]) as f32;
    let y1 = (o[1] + d[1]) as f32;
    let z1 = (o[2] + d[2]) as f32;

    // 8 corners
    let corners = [
        [x0, y0, z0], // 0: left-bottom-back
        [x1, y0, z0], // 1: right-bottom-back
        [x1, y1, z0], // 2: right-top-back
        [x0, y1, z0], // 3: left-top-back
        [x0, y0, z1], // 4: left-bottom-front
        [x1, y0, z1], // 5: right-bottom-front
        [x1, y1, z1], // 6: right-top-front
        [x0, y1, z1], // 7: left-top-front
    ];

    // 6 faces, each with 4 vertices and a normal (unshared vertices for flat shading)
    let face_defs: [([usize; 4], [f32; 3]); 6] = [
        ([0, 1, 2, 3], [0.0, 0.0, -1.0]), // back  (-Z)
        ([4, 7, 6, 5], [0.0, 0.0, 1.0]),  // front (+Z)
        ([0, 3, 7, 4], [-1.0, 0.0, 0.0]), // left  (-X)
        ([1, 5, 6, 2], [1.0, 0.0, 0.0]),  // right (+X)
        ([0, 4, 5, 1], [0.0, -1.0, 0.0]), // bottom(-Y)
        ([3, 2, 6, 7], [0.0, 1.0, 0.0]),  // top   (+Y)
    ];

    let mut vertices = Vec::with_capacity(24);
    let mut normals = Vec::with_capacity(24);
    let mut indices = Vec::with_capacity(36);

    for (quad, normal) in &face_defs {
        let base = vertices.len() as u32;
        for &ci in quad {
            vertices.push(corners[ci]);
            normals.push(*normal);
        }
        // Two triangles per face
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    TessellatedMesh {
        vertices,
        normals,
        indices,
    }
}

fn tessellate_cylinder(c: &CylinderPrimitive, segments: u32) -> TessellatedMesh {
    let mut vertices = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();

    let ox = c.origin[0] as f32;
    let oy = c.origin[1] as f32;
    let oz = c.origin[2] as f32;
    let r = c.radius as f32;
    let h = c.height as f32;

    // Side vertices: two rings (bottom and top)
    for i in 0..=segments {
        let angle = 2.0 * PI as f32 * (i as f32 / segments as f32);
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let nx = cos_a;
        let ny = sin_a;

        // Bottom ring vertex
        vertices.push([ox + r * cos_a, oy + r * sin_a, oz]);
        normals.push([nx, ny, 0.0]);
        // Top ring vertex
        vertices.push([ox + r * cos_a, oy + r * sin_a, oz + h]);
        normals.push([nx, ny, 0.0]);
    }

    // Side triangles
    for i in 0..segments {
        let bl = i * 2;
        let br = (i + 1) * 2;
        let tl = bl + 1;
        let tr = br + 1;
        indices.extend_from_slice(&[bl, br, tr, bl, tr, tl]);
    }

    // Bottom cap
    let bottom_center_idx = vertices.len() as u32;
    vertices.push([ox, oy, oz]);
    normals.push([0.0, 0.0, -1.0]);
    for i in 0..segments {
        let angle = 2.0 * PI as f32 * (i as f32 / segments as f32);
        vertices.push([ox + r * angle.cos(), oy + r * angle.sin(), oz]);
        normals.push([0.0, 0.0, -1.0]);
    }
    for i in 0..segments {
        let curr = bottom_center_idx + 1 + i;
        let next = bottom_center_idx + 1 + (i + 1) % segments;
        indices.extend_from_slice(&[bottom_center_idx, next, curr]);
    }

    // Top cap
    let top_center_idx = vertices.len() as u32;
    vertices.push([ox, oy, oz + h]);
    normals.push([0.0, 0.0, 1.0]);
    for i in 0..segments {
        let angle = 2.0 * PI as f32 * (i as f32 / segments as f32);
        vertices.push([ox + r * angle.cos(), oy + r * angle.sin(), oz + h]);
        normals.push([0.0, 0.0, 1.0]);
    }
    for i in 0..segments {
        let curr = top_center_idx + 1 + i;
        let next = top_center_idx + 1 + (i + 1) % segments;
        indices.extend_from_slice(&[top_center_idx, curr, next]);
    }

    TessellatedMesh {
        vertices,
        normals,
        indices,
    }
}

fn tessellate_sphere(s: &SpherePrimitive, lon_segments: u32, lat_segments: u32) -> TessellatedMesh {
    let mut vertices = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();

    let cx = s.center[0] as f32;
    let cy = s.center[1] as f32;
    let cz = s.center[2] as f32;
    let r = s.radius as f32;

    // Generate vertices
    for lat in 0..=lat_segments {
        let theta = PI as f32 * (lat as f32 / lat_segments as f32);
        let sin_theta = theta.sin();
        let cos_theta = theta.cos();

        for lon in 0..=lon_segments {
            let phi = 2.0 * PI as f32 * (lon as f32 / lon_segments as f32);
            let sin_phi = phi.sin();
            let cos_phi = phi.cos();

            let nx = sin_theta * cos_phi;
            let ny = sin_theta * sin_phi;
            let nz = cos_theta;

            vertices.push([cx + r * nx, cy + r * ny, cz + r * nz]);
            normals.push([nx, ny, nz]);
        }
    }

    // Generate indices
    for lat in 0..lat_segments {
        for lon in 0..lon_segments {
            let curr = lat * (lon_segments + 1) + lon;
            let next = curr + lon_segments + 1;

            if lat != 0 {
                indices.extend_from_slice(&[curr, next, curr + 1]);
            }
            if lat != lat_segments - 1 {
                indices.extend_from_slice(&[curr + 1, next, next + 1]);
            }
        }
    }

    TessellatedMesh {
        vertices,
        normals,
        indices,
    }
}

fn tessellate_plate(p: &PlatePrimitive) -> TessellatedMesh {
    // A plate is a thin box
    let box_prim = BoxPrimitive {
        origin: p.origin,
        dimensions: [p.width, p.height, p.thickness],
    };
    tessellate_box(&box_prim)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_box_tessellation() {
        let b = BoxPrimitive {
            origin: [0.0, 0.0, 0.0],
            dimensions: [1.0, 1.0, 1.0],
        };
        let mesh = tessellate_box(&b);
        assert_eq!(mesh.vertices.len(), 24); // 6 faces × 4 vertices
        assert_eq!(mesh.indices.len(), 36);  // 6 faces × 2 triangles × 3 indices
        assert_eq!(mesh.normals.len(), 24);
    }

    #[test]
    fn test_cylinder_tessellation() {
        let c = CylinderPrimitive {
            origin: [0.0, 0.0, 0.0],
            axis: [0.0, 0.0, 1.0],
            radius: 1.0,
            height: 2.0,
        };
        let mesh = tessellate_cylinder(&c, 8);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
        // All indices should be valid
        let max_idx = mesh.vertices.len() as u32;
        for &idx in &mesh.indices {
            assert!(idx < max_idx, "Index {} out of bounds (max {})", idx, max_idx);
        }
    }

    #[test]
    fn test_sphere_tessellation() {
        let s = SpherePrimitive {
            center: [0.0, 0.0, 0.0],
            radius: 1.0,
        };
        let mesh = tessellate_sphere(&s, 16, 8);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
        // Check normals are unit length
        for n in &mesh.normals {
            let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
            assert!((len - 1.0).abs() < 0.001, "Normal not unit: len={}", len);
        }
    }

    #[test]
    fn test_plate_tessellation() {
        let p = PlatePrimitive {
            origin: [0.0, 0.0, 0.0],
            width: 2.0,
            height: 1.0,
            thickness: 0.1,
        };
        let mesh = tessellate_plate(&p);
        assert_eq!(mesh.vertices.len(), 24);
        assert_eq!(mesh.indices.len(), 36);
    }
}
