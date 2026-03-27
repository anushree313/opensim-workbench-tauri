use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A material definition with physical properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Material {
    pub id: Uuid,
    pub name: String,
    pub category: MaterialCategory,
    pub properties: MaterialProperties,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MaterialCategory {
    Metal,
    Polymer,
    Ceramic,
    Composite,
    Fluid,
    Semiconductor,
    Custom,
}

/// Linear isotropic elastic material properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialProperties {
    /// Young's modulus (Pa)
    pub youngs_modulus: Option<f64>,
    /// Poisson's ratio (dimensionless)
    pub poissons_ratio: Option<f64>,
    /// Density (kg/m^3)
    pub density: Option<f64>,
    /// Thermal conductivity (W/(m·K))
    pub thermal_conductivity: Option<f64>,
    /// Specific heat capacity (J/(kg·K))
    pub specific_heat: Option<f64>,
    /// Thermal expansion coefficient (1/K)
    pub thermal_expansion: Option<f64>,
    /// Dynamic viscosity (Pa·s) — for fluids
    pub viscosity: Option<f64>,
}

impl Default for MaterialProperties {
    fn default() -> Self {
        Self {
            youngs_modulus: None,
            poissons_ratio: None,
            density: None,
            thermal_conductivity: None,
            specific_heat: None,
            thermal_expansion: None,
            viscosity: None,
        }
    }
}

/// Standard material library with common engineering materials.
pub fn default_library() -> Vec<Material> {
    vec![
        Material {
            id: Uuid::new_v4(),
            name: "Structural Steel".into(),
            category: MaterialCategory::Metal,
            properties: MaterialProperties {
                youngs_modulus: Some(200e9),
                poissons_ratio: Some(0.3),
                density: Some(7850.0),
                thermal_conductivity: Some(60.5),
                specific_heat: Some(434.0),
                thermal_expansion: Some(12e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Aluminum Alloy".into(),
            category: MaterialCategory::Metal,
            properties: MaterialProperties {
                youngs_modulus: Some(71e9),
                poissons_ratio: Some(0.33),
                density: Some(2770.0),
                thermal_conductivity: Some(170.0),
                specific_heat: Some(875.0),
                thermal_expansion: Some(23e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Water".into(),
            category: MaterialCategory::Fluid,
            properties: MaterialProperties {
                density: Some(998.0),
                thermal_conductivity: Some(0.6),
                specific_heat: Some(4182.0),
                viscosity: Some(1.003e-3),
                ..Default::default()
            },
        },
        // Semiconductor packaging materials
        Material {
            id: Uuid::new_v4(),
            name: "Silicon".into(),
            category: MaterialCategory::Semiconductor,
            properties: MaterialProperties {
                youngs_modulus: Some(130e9),
                poissons_ratio: Some(0.28),
                density: Some(2330.0),
                thermal_conductivity: Some(148.0),
                specific_heat: Some(700.0),
                thermal_expansion: Some(2.6e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Copper Alloy C194".into(),
            category: MaterialCategory::Metal,
            properties: MaterialProperties {
                youngs_modulus: Some(120e9),
                poissons_ratio: Some(0.34),
                density: Some(8900.0),
                thermal_conductivity: Some(260.0),
                specific_heat: Some(385.0),
                thermal_expansion: Some(17e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Epoxy DBA".into(),
            category: MaterialCategory::Polymer,
            properties: MaterialProperties {
                youngs_modulus: Some(3.5e9),
                poissons_ratio: Some(0.35),
                density: Some(1200.0),
                thermal_conductivity: Some(1.5),
                specific_heat: Some(1100.0),
                thermal_expansion: Some(65e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Solder SAC305".into(),
            category: MaterialCategory::Metal,
            properties: MaterialProperties {
                youngs_modulus: Some(50e9),
                poissons_ratio: Some(0.35),
                density: Some(7400.0),
                thermal_conductivity: Some(58.0),
                specific_heat: Some(230.0),
                thermal_expansion: Some(21e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Silver Sinter".into(),
            category: MaterialCategory::Metal,
            properties: MaterialProperties {
                youngs_modulus: Some(9e9),
                poissons_ratio: Some(0.37),
                density: Some(8500.0),
                thermal_conductivity: Some(250.0),
                specific_heat: Some(235.0),
                thermal_expansion: Some(19e-6),
                viscosity: None,
            },
        },
        Material {
            id: Uuid::new_v4(),
            name: "Conductive Adhesive".into(),
            category: MaterialCategory::Polymer,
            properties: MaterialProperties {
                youngs_modulus: Some(5e9),
                poissons_ratio: Some(0.35),
                density: Some(2000.0),
                thermal_conductivity: Some(3.5),
                specific_heat: Some(900.0),
                thermal_expansion: Some(40e-6),
                viscosity: None,
            },
        },
    ]
}

/// Find a material by name in a library.
pub fn find_by_name<'a>(library: &'a [Material], name: &str) -> Option<&'a Material> {
    library.iter().find(|m| m.name == name)
}
