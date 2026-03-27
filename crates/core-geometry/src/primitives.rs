use serde::{Deserialize, Serialize};

/// Basic constructive geometry primitives.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Primitive {
    Box(BoxPrimitive),
    Cylinder(CylinderPrimitive),
    Sphere(SpherePrimitive),
    Plate(PlatePrimitive),
    ChipPackage(ChipPackagePrimitive),
}

/// Semiconductor chip package: 3-layer stack (lead frame → DBA → die).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChipPackagePrimitive {
    pub origin: [f64; 3],
    /// Lead frame XY dimensions [width, height] in mm
    pub leadframe_size: [f64; 2],
    /// Lead frame thickness in mm
    pub leadframe_thickness: f64,
    /// Die bonding adhesive XY dimensions in mm
    pub dba_size: [f64; 2],
    /// DBA thickness in mm
    pub dba_thickness: f64,
    /// Silicon die XY dimensions in mm
    pub die_size: [f64; 2],
    /// Die thickness in mm
    pub die_thickness: f64,
}

impl ChipPackagePrimitive {
    /// Default dimensions for a standard QFN-like package.
    pub fn default_package() -> Self {
        Self {
            origin: [0.0, 0.0, 0.0],
            leadframe_size: [10.0, 10.0],
            leadframe_thickness: 0.25,
            dba_size: [4.2, 4.2],
            dba_thickness: 0.025,
            die_size: [4.1, 4.1],
            die_thickness: 0.3,
        }
    }

    pub fn total_height(&self) -> f64 {
        self.leadframe_thickness + self.dba_thickness + self.die_thickness
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoxPrimitive {
    pub origin: [f64; 3],
    pub dimensions: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CylinderPrimitive {
    pub origin: [f64; 3],
    pub axis: [f64; 3],
    pub radius: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpherePrimitive {
    pub center: [f64; 3],
    pub radius: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatePrimitive {
    pub origin: [f64; 3],
    pub width: f64,
    pub height: f64,
    pub thickness: f64,
}

impl Primitive {
    pub fn bounding_box(&self) -> ([f64; 3], [f64; 3]) {
        match self {
            Primitive::Box(b) => {
                let min = b.origin;
                let max = [
                    b.origin[0] + b.dimensions[0],
                    b.origin[1] + b.dimensions[1],
                    b.origin[2] + b.dimensions[2],
                ];
                (min, max)
            }
            Primitive::Cylinder(c) => {
                let r = c.radius;
                let min = [c.origin[0] - r, c.origin[1] - r, c.origin[2]];
                let max = [c.origin[0] + r, c.origin[1] + r, c.origin[2] + c.height];
                (min, max)
            }
            Primitive::Sphere(s) => {
                let r = s.radius;
                let min = [s.center[0] - r, s.center[1] - r, s.center[2] - r];
                let max = [s.center[0] + r, s.center[1] + r, s.center[2] + r];
                (min, max)
            }
            Primitive::Plate(p) => {
                let min = p.origin;
                let max = [
                    p.origin[0] + p.width,
                    p.origin[1] + p.height,
                    p.origin[2] + p.thickness,
                ];
                (min, max)
            }
            Primitive::ChipPackage(cp) => {
                let min = cp.origin;
                let max = [
                    cp.origin[0] + cp.leadframe_size[0],
                    cp.origin[1] + cp.leadframe_size[1],
                    cp.origin[2] + cp.total_height(),
                ];
                (min, max)
            }
        }
    }
}
