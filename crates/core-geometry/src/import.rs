use crate::{Body, GeometryModel, TessellatedMesh};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ImportError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("STL parse error: {0}")]
    StlParse(String),
    #[error("OBJ parse error: {0}")]
    ObjParse(String),
    #[error("Unsupported file format: {0}")]
    UnsupportedFormat(String),
}

/// Import a geometry file (STL or OBJ) based on extension.
pub fn import_file(path: &Path) -> Result<GeometryModel, ImportError> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "stl" => import_stl(path),
        "obj" => import_obj(path),
        other => Err(ImportError::UnsupportedFormat(other.to_string())),
    }
}

/// Import an STL file into a GeometryModel.
pub fn import_stl(path: &Path) -> Result<GeometryModel, ImportError> {
    let mut file = std::fs::OpenOptions::new().read(true).open(path)?;
    let stl = stl_io::read_stl(&mut file).map_err(|e| ImportError::StlParse(e.to_string()))?;

    let mut vertices = Vec::with_capacity(stl.vertices.len());
    let mut normals = Vec::new();
    let mut indices = Vec::new();

    // Convert vertices
    for v in &stl.vertices {
        vertices.push([v[0], v[1], v[2]]);
    }

    // Convert faces — stl_io gives us IndexedTriangle with normal + indices
    for face in &stl.faces {
        let n = [face.normal[0], face.normal[1], face.normal[2]];
        for &vi in &face.vertices {
            indices.push(vi as u32);
        }
        // Store per-face normal for each of the 3 vertices
        normals.push(n);
        normals.push(n);
        normals.push(n);
    }

    // stl_io uses indexed vertices, but normals are per-face.
    // We need to unindex so each vertex has its own normal.
    let mut unindexed_verts = Vec::with_capacity(indices.len());
    let mut unindexed_normals = Vec::with_capacity(indices.len());
    let mut new_indices = Vec::with_capacity(indices.len());

    for (_fi, face) in stl.faces.iter().enumerate() {
        let n = [face.normal[0], face.normal[1], face.normal[2]];
        for &vi in &face.vertices {
            let idx = unindexed_verts.len() as u32;
            new_indices.push(idx);
            unindexed_verts.push(vertices[vi]);
            unindexed_normals.push(n);
        }
    }

    let mesh = TessellatedMesh {
        vertices: unindexed_verts,
        normals: unindexed_normals,
        indices: new_indices,
    };

    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported STL");

    let body = Body::from_tessellation(file_name, mesh);
    let mut model = GeometryModel::new(file_name);
    model.add_body(body);

    Ok(model)
}

/// Import an OBJ file into a GeometryModel.
pub fn import_obj(path: &Path) -> Result<GeometryModel, ImportError> {
    let (models, _materials) =
        tobj::load_obj(path, &tobj::GPU_LOAD_OPTIONS).map_err(|e| ImportError::ObjParse(e.to_string()))?;

    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported OBJ");

    let mut geo_model = GeometryModel::new(file_name);

    for model in models {
        let mesh = &model.mesh;
        let num_verts = mesh.positions.len() / 3;

        let mut vertices = Vec::with_capacity(num_verts);
        for i in 0..num_verts {
            vertices.push([
                mesh.positions[i * 3] as f32,
                mesh.positions[i * 3 + 1] as f32,
                mesh.positions[i * 3 + 2] as f32,
            ]);
        }

        let normals = if mesh.normals.len() == mesh.positions.len() {
            let num_normals = mesh.normals.len() / 3;
            let mut norms = Vec::with_capacity(num_normals);
            for i in 0..num_normals {
                norms.push([
                    mesh.normals[i * 3] as f32,
                    mesh.normals[i * 3 + 1] as f32,
                    mesh.normals[i * 3 + 2] as f32,
                ]);
            }
            norms
        } else {
            // Compute flat normals from triangles
            compute_flat_normals(&vertices, &mesh.indices)
        };

        let indices: Vec<u32> = mesh.indices.clone();

        let tess = TessellatedMesh {
            vertices,
            normals,
            indices,
        };

        let body = Body::from_tessellation(&model.name, tess);
        geo_model.add_body(body);
    }

    Ok(geo_model)
}

/// Compute flat-shading normals from vertices and triangle indices.
fn compute_flat_normals(vertices: &[[f32; 3]], indices: &[u32]) -> Vec<[f32; 3]> {
    let mut normals = vec![[0.0f32; 3]; vertices.len()];

    for tri in indices.chunks(3) {
        if tri.len() < 3 {
            continue;
        }
        let (i0, i1, i2) = (tri[0] as usize, tri[1] as usize, tri[2] as usize);
        if i0 >= vertices.len() || i1 >= vertices.len() || i2 >= vertices.len() {
            continue;
        }
        let v0 = vertices[i0];
        let v1 = vertices[i1];
        let v2 = vertices[i2];

        let e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        let e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        let n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];

        for &i in &[i0, i1, i2] {
            normals[i][0] += n[0];
            normals[i][1] += n[1];
            normals[i][2] += n[2];
        }
    }

    // Normalize
    for n in &mut normals {
        let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
        if len > 1e-8 {
            n[0] /= len;
            n[1] /= len;
            n[2] /= len;
        }
    }

    normals
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unsupported_format() {
        let result = import_file(Path::new("test.xyz"));
        assert!(result.is_err());
        match result.unwrap_err() {
            ImportError::UnsupportedFormat(ext) => assert_eq!(ext, "xyz"),
            _ => panic!("Expected UnsupportedFormat error"),
        }
    }

    #[test]
    fn test_compute_flat_normals() {
        // Simple triangle in XY plane
        let vertices = vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let indices = vec![0, 1, 2];
        let normals = compute_flat_normals(&vertices, &indices);
        assert_eq!(normals.len(), 3);
        // Normal should point in +Z
        for n in &normals {
            assert!((n[2] - 1.0).abs() < 0.01);
        }
    }
}
