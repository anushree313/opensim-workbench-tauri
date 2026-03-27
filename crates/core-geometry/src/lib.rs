pub mod import;
pub mod primitives;
pub mod tessellate;
pub mod topology;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A tessellated triangle mesh for 3D rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TessellatedMesh {
    pub vertices: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub indices: Vec<u32>,
}

/// A geometry model containing bodies, surfaces, edges, vertices.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometryModel {
    pub id: Uuid,
    pub name: String,
    pub bodies: Vec<Body>,
}

impl GeometryModel {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            bodies: Vec::new(),
        }
    }

    pub fn add_body(&mut self, body: Body) {
        self.bodies.push(body);
    }

    pub fn remove_body(&mut self, body_id: Uuid) -> bool {
        let len = self.bodies.len();
        self.bodies.retain(|b| b.id != body_id);
        self.bodies.len() < len
    }
}

/// A body within a geometry model. Can be a parametric primitive or imported mesh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Body {
    pub id: Uuid,
    pub name: String,
    /// The parametric primitive definition (None for imported geometry).
    pub primitive: Option<primitives::Primitive>,
    /// Cached tessellated mesh for 3D rendering.
    pub tessellation: Option<TessellatedMesh>,
}

impl Body {
    pub fn from_primitive(name: impl Into<String>, primitive: primitives::Primitive) -> Self {
        let mut body = Self {
            id: Uuid::new_v4(),
            name: name.into(),
            primitive: Some(primitive.clone()),
            tessellation: None,
        };
        body.tessellation = Some(tessellate::tessellate_primitive(&primitive));
        body
    }

    pub fn from_tessellation(name: impl Into<String>, mesh: TessellatedMesh) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            primitive: None,
            tessellation: Some(mesh),
        }
    }
}

/// Build a 3-layer chip package geometry (lead frame → DBA → die).
pub fn build_chip_package(params: &primitives::ChipPackagePrimitive) -> GeometryModel {
    let mut model = GeometryModel::new("Chip Package");

    let o = params.origin;
    let lf_w = params.leadframe_size[0];
    let lf_h = params.leadframe_size[1];
    let lf_t = params.leadframe_thickness;

    // Lead frame: full size at bottom
    let leadframe = Body::from_primitive(
        "Leadframe",
        primitives::Primitive::Box(primitives::BoxPrimitive {
            origin: o,
            dimensions: [lf_w, lf_h, lf_t],
        }),
    );
    model.add_body(leadframe);

    // DBA: centered on lead frame top
    let dba_w = params.dba_size[0];
    let dba_h = params.dba_size[1];
    let dba_t = params.dba_thickness;
    let dba_x = o[0] + (lf_w - dba_w) / 2.0;
    let dba_y = o[1] + (lf_h - dba_h) / 2.0;
    let dba_z = o[2] + lf_t;

    let dba = Body::from_primitive(
        "DBA",
        primitives::Primitive::Box(primitives::BoxPrimitive {
            origin: [dba_x, dba_y, dba_z],
            dimensions: [dba_w, dba_h, dba_t],
        }),
    );
    model.add_body(dba);

    // Die: centered on DBA top
    let die_w = params.die_size[0];
    let die_h = params.die_size[1];
    let die_t = params.die_thickness;
    let die_x = o[0] + (lf_w - die_w) / 2.0;
    let die_y = o[1] + (lf_h - die_h) / 2.0;
    let die_z = dba_z + dba_t;

    let die = Body::from_primitive(
        "Die",
        primitives::Primitive::Box(primitives::BoxPrimitive {
            origin: [die_x, die_y, die_z],
            dimensions: [die_w, die_h, die_t],
        }),
    );
    model.add_body(die);

    model
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamedSelection {
    pub name: String,
    pub entity_ids: Vec<Uuid>,
}
