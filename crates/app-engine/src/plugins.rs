//! Ansys Workbench-style solver module system.
//!
//! Each physics solver registers as a `SolverModule` with declared input/output
//! schemas and coupling capabilities. The `ModuleRegistry` manages discovery,
//! validation, and orchestration — enabling automatic data transfer between
//! solvers via the project graph's `ResultTransfer` edges.

use serde::{Deserialize, Serialize};

// ============================================================
// Solver Module Trait (Ansys ACT equivalent)
// ============================================================

/// Information about a solver module.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverModuleInfo {
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub category: ModuleCategory,
    pub analysis_types: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModuleCategory {
    Structural,
    Thermal,
    Fluid,
    Electromagnetic,
    Multiphysics,
    Custom,
}

/// Declares what fields a solver produces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverOutputSchema {
    pub fields: Vec<FieldDeclaration>,
}

/// Declares what inputs a solver expects.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolverInputSchema {
    pub requires_mesh: bool,
    pub required_params: Vec<ParamDeclaration>,
    pub optional_params: Vec<ParamDeclaration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDeclaration {
    pub name: String,
    pub description: String,
    pub field_type: String, // "Scalar", "Vector", "Tensor"
    pub location: String,   // "Node", "Element"
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamDeclaration {
    pub name: String,
    pub description: String,
    pub param_type: String, // "f64", "string", "[f64;3]"
    pub default_value: Option<String>,
    pub unit: Option<String>,
}

/// What data this module can provide to or consume from other modules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CouplingCapability {
    /// This module produces this field (can be source in coupled analysis)
    Provides { field: String, description: String },
    /// This module can consume this field as input (can be target)
    Consumes { field: String, description: String },
}

/// Validation result from pre-solve check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

// ============================================================
// Built-in Module Descriptors
// ============================================================

/// Describes a registered solver module (without requiring the actual solver).
/// This is the serializable representation used by the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredModule {
    pub info: SolverModuleInfo,
    pub input_schema: SolverInputSchema,
    pub output_schema: SolverOutputSchema,
    pub coupling: Vec<CouplingCapability>,
    pub status: ModuleStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModuleStatus {
    Active,
    Available,
    Disabled,
    Error,
}

// ============================================================
// Module Registry
// ============================================================

/// Registry of all solver modules (built-in + plugins).
pub struct ModuleRegistry {
    modules: Vec<RegisteredModule>,
    manifests: Vec<PluginManifest>,
}

/// Plugin metadata loaded from a manifest file (for external plugins).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub solver_types: Vec<String>,
    pub entry_point: String,
    pub min_workbench_version: Option<String>,
}

impl ModuleRegistry {
    /// Create a new registry with all built-in solver modules registered.
    pub fn with_builtins() -> Self {
        let mut registry = Self {
            modules: Vec::new(),
            manifests: Vec::new(),
        };
        registry.register_builtins();
        registry
    }

    fn register_builtins(&mut self) {
        // 1. Structural Module
        self.modules.push(RegisteredModule {
            info: SolverModuleInfo {
                name: "Structural FEA".into(),
                version: "0.8.0".into(),
                author: "OpenSim Workbench".into(),
                description: "Linear static structural analysis with Tet4 elements. Supports single and multi-material models.".into(),
                category: ModuleCategory::Structural,
                analysis_types: vec!["LinearStatic".into(), "MultiMaterialStatic".into()],
            },
            input_schema: SolverInputSchema {
                requires_mesh: true,
                required_params: vec![
                    ParamDeclaration { name: "youngs_modulus".into(), description: "Young's modulus".into(), param_type: "f64".into(), default_value: Some("200e9".into()), unit: Some("Pa".into()) },
                    ParamDeclaration { name: "poisson_ratio".into(), description: "Poisson's ratio".into(), param_type: "f64".into(), default_value: Some("0.3".into()), unit: None },
                ],
                optional_params: vec![
                    ParamDeclaration { name: "density".into(), description: "Material density".into(), param_type: "f64".into(), default_value: Some("7800".into()), unit: Some("kg/m³".into()) },
                ],
            },
            output_schema: SolverOutputSchema {
                fields: vec![
                    FieldDeclaration { name: "Displacement".into(), description: "Nodal displacement vector".into(), field_type: "Vector".into(), location: "Node".into(), unit: "m".into() },
                    FieldDeclaration { name: "VonMises".into(), description: "Von Mises equivalent stress".into(), field_type: "Scalar".into(), location: "Element".into(), unit: "Pa".into() },
                    FieldDeclaration { name: "ShearStressXY".into(), description: "Shear stress τxy".into(), field_type: "Scalar".into(), location: "Element".into(), unit: "Pa".into() },
                ],
            },
            coupling: vec![
                CouplingCapability::Provides { field: "Displacement".into(), description: "Nodal displacements for downstream analysis".into() },
                CouplingCapability::Provides { field: "VonMises".into(), description: "Stress field for fatigue/failure assessment".into() },
                CouplingCapability::Consumes { field: "Temperature".into(), description: "Thermal load for thermo-mechanical coupling".into() },
                CouplingCapability::Consumes { field: "Pressure".into(), description: "Fluid pressure for FSI coupling".into() },
            ],
            status: ModuleStatus::Active,
        });

        // 2. Thermal Module
        self.modules.push(RegisteredModule {
            info: SolverModuleInfo {
                name: "Thermal FEA".into(),
                version: "0.8.0".into(),
                author: "OpenSim Workbench".into(),
                description: "Steady-state heat conduction with Tet4 elements. Multi-material support for layered structures.".into(),
                category: ModuleCategory::Thermal,
                analysis_types: vec!["SteadyThermal".into(), "MultiMaterialThermal".into()],
            },
            input_schema: SolverInputSchema {
                requires_mesh: true,
                required_params: vec![
                    ParamDeclaration { name: "conductivity".into(), description: "Thermal conductivity".into(), param_type: "f64".into(), default_value: Some("50".into()), unit: Some("W/(m·K)".into()) },
                ],
                optional_params: vec![
                    ParamDeclaration { name: "heat_flux".into(), description: "Applied heat flux".into(), param_type: "f64".into(), default_value: Some("50000".into()), unit: Some("W/m²".into()) },
                    ParamDeclaration { name: "fixed_temperature".into(), description: "Fixed temperature BC".into(), param_type: "f64".into(), default_value: Some("25".into()), unit: Some("°C".into()) },
                ],
            },
            output_schema: SolverOutputSchema {
                fields: vec![
                    FieldDeclaration { name: "Temperature".into(), description: "Nodal temperature distribution".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "°C".into() },
                    FieldDeclaration { name: "HeatFlux".into(), description: "Element heat flux vector".into(), field_type: "Vector".into(), location: "Element".into(), unit: "W/m²".into() },
                ],
            },
            coupling: vec![
                CouplingCapability::Provides { field: "Temperature".into(), description: "Temperature field for thermo-mechanical/thermo-fluid coupling".into() },
                CouplingCapability::Provides { field: "HeatFlux".into(), description: "Heat flux for thermal management".into() },
                CouplingCapability::Consumes { field: "HeatGeneration".into(), description: "Volumetric heat from EM/Joule heating".into() },
            ],
            status: ModuleStatus::Active,
        });

        // 3. CFD Module
        self.modules.push(RegisteredModule {
            info: SolverModuleInfo {
                name: "CFD (Stokes Flow)".into(),
                version: "0.8.0".into(),
                author: "OpenSim Workbench".into(),
                description: "Incompressible Stokes flow using penalty method on Tet4 elements.".into(),
                category: ModuleCategory::Fluid,
                analysis_types: vec!["StokesFlow".into(), "SteadyIncompressible".into()],
            },
            input_schema: SolverInputSchema {
                requires_mesh: true,
                required_params: vec![
                    ParamDeclaration { name: "viscosity".into(), description: "Dynamic viscosity".into(), param_type: "f64".into(), default_value: Some("1.003e-3".into()), unit: Some("Pa·s".into()) },
                    ParamDeclaration { name: "density".into(), description: "Fluid density".into(), param_type: "f64".into(), default_value: Some("998".into()), unit: Some("kg/m³".into()) },
                ],
                optional_params: vec![],
            },
            output_schema: SolverOutputSchema {
                fields: vec![
                    FieldDeclaration { name: "Velocity".into(), description: "Nodal velocity vector".into(), field_type: "Vector".into(), location: "Node".into(), unit: "m/s".into() },
                    FieldDeclaration { name: "VelocityMagnitude".into(), description: "Velocity magnitude".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "m/s".into() },
                    FieldDeclaration { name: "Pressure".into(), description: "Element pressure".into(), field_type: "Scalar".into(), location: "Element".into(), unit: "Pa".into() },
                ],
            },
            coupling: vec![
                CouplingCapability::Provides { field: "Pressure".into(), description: "Fluid pressure for FSI".into() },
                CouplingCapability::Provides { field: "Velocity".into(), description: "Flow velocity for convective heat transfer".into() },
                CouplingCapability::Consumes { field: "Displacement".into(), description: "Mesh deformation for ALE/moving mesh".into() },
            ],
            status: ModuleStatus::Active,
        });

        // 4. EM Module
        self.modules.push(RegisteredModule {
            info: SolverModuleInfo {
                name: "Electromagnetic".into(),
                version: "0.8.0".into(),
                author: "OpenSim Workbench".into(),
                description: "Electrostatic (Poisson) and magnetostatic (scalar potential) solvers on Tet4 elements.".into(),
                category: ModuleCategory::Electromagnetic,
                analysis_types: vec!["Electrostatic".into(), "Magnetostatic".into()],
            },
            input_schema: SolverInputSchema {
                requires_mesh: true,
                required_params: vec![
                    ParamDeclaration { name: "analysis_type".into(), description: "electrostatic or magnetostatic".into(), param_type: "string".into(), default_value: Some("electrostatic".into()), unit: None },
                ],
                optional_params: vec![
                    ParamDeclaration { name: "permittivity".into(), description: "Dielectric permittivity".into(), param_type: "f64".into(), default_value: Some("8.85e-12".into()), unit: Some("F/m".into()) },
                    ParamDeclaration { name: "permeability".into(), description: "Magnetic permeability".into(), param_type: "f64".into(), default_value: Some("1.257e-6".into()), unit: Some("H/m".into()) },
                ],
            },
            output_schema: SolverOutputSchema {
                fields: vec![
                    FieldDeclaration { name: "ElectricPotential".into(), description: "Electric scalar potential".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "V".into() },
                    FieldDeclaration { name: "ElectricField".into(), description: "Electric field vector".into(), field_type: "Vector".into(), location: "Element".into(), unit: "V/m".into() },
                    FieldDeclaration { name: "MagneticPotential".into(), description: "Magnetic scalar potential".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "A".into() },
                    FieldDeclaration { name: "MagneticField".into(), description: "Magnetic field vector".into(), field_type: "Vector".into(), location: "Element".into(), unit: "A/m".into() },
                ],
            },
            coupling: vec![
                CouplingCapability::Provides { field: "HeatGeneration".into(), description: "Joule heating for thermal coupling".into() },
                CouplingCapability::Provides { field: "LorentzForce".into(), description: "Electromagnetic body force for structural coupling".into() },
            ],
            status: ModuleStatus::Active,
        });

        // 5. Thermo-Mechanical Coupled Module
        self.modules.push(RegisteredModule {
            info: SolverModuleInfo {
                name: "Thermo-Mechanical (CTE)".into(),
                version: "0.8.0".into(),
                author: "OpenSim Workbench".into(),
                description: "Coupled thermal-structural analysis with CTE mismatch. Computes temperature distribution, thermal strain, displacement, warpage, and stress in multi-material chip packages.".into(),
                category: ModuleCategory::Multiphysics,
                analysis_types: vec!["ThermoMechanical".into(), "CTEWarpage".into(), "ChipDeformation".into()],
            },
            input_schema: SolverInputSchema {
                requires_mesh: true,
                required_params: vec![
                    ParamDeclaration { name: "heat_flux".into(), description: "Applied heat flux on die".into(), param_type: "f64".into(), default_value: Some("50000".into()), unit: Some("W/m²".into()) },
                    ParamDeclaration { name: "ref_temperature".into(), description: "Stress-free reference temperature".into(), param_type: "f64".into(), default_value: Some("25".into()), unit: Some("°C".into()) },
                ],
                optional_params: vec![
                    ParamDeclaration { name: "shear_force".into(), description: "Additional mechanical shear force".into(), param_type: "f64".into(), default_value: Some("0".into()), unit: Some("N".into()) },
                    ParamDeclaration { name: "bottom_temp".into(), description: "Fixed bottom temperature".into(), param_type: "f64".into(), default_value: Some("25".into()), unit: Some("°C".into()) },
                    ParamDeclaration { name: "dba_material".into(), description: "DBA interconnect material name".into(), param_type: "string".into(), default_value: Some("Epoxy DBA".into()), unit: None },
                ],
            },
            output_schema: SolverOutputSchema {
                fields: vec![
                    FieldDeclaration { name: "Temperature".into(), description: "Steady-state temperature".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "°C".into() },
                    FieldDeclaration { name: "Displacement".into(), description: "Total displacement (mechanical + thermal)".into(), field_type: "Vector".into(), location: "Node".into(), unit: "m".into() },
                    FieldDeclaration { name: "DisplacementMagnitude".into(), description: "Displacement magnitude".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "m".into() },
                    FieldDeclaration { name: "VonMises".into(), description: "Von Mises stress (combined)".into(), field_type: "Scalar".into(), location: "Element".into(), unit: "Pa".into() },
                    FieldDeclaration { name: "ThermalStress".into(), description: "CTE-induced thermal stress".into(), field_type: "Scalar".into(), location: "Element".into(), unit: "Pa".into() },
                    FieldDeclaration { name: "Warpage".into(), description: "Z-displacement relative to reference plane".into(), field_type: "Scalar".into(), location: "Node".into(), unit: "m".into() },
                ],
            },
            coupling: vec![
                CouplingCapability::Provides { field: "Temperature".into(), description: "Temperature field from thermal sub-solve".into() },
                CouplingCapability::Provides { field: "Displacement".into(), description: "Total deformation field".into() },
                CouplingCapability::Provides { field: "Warpage".into(), description: "Package warpage for quality assessment".into() },
                CouplingCapability::Consumes { field: "HeatGeneration".into(), description: "External heat source (e.g., from EM)".into() },
            ],
            status: ModuleStatus::Active,
        });
    }

    /// Get all registered modules (for frontend display).
    pub fn list_modules(&self) -> &[RegisteredModule] {
        &self.modules
    }

    /// Find modules that can provide a specific field.
    pub fn find_providers(&self, field: &str) -> Vec<&RegisteredModule> {
        self.modules.iter().filter(|m| {
            m.coupling.iter().any(|c| matches!(c, CouplingCapability::Provides { field: f, .. } if f == field))
        }).collect()
    }

    /// Find modules that can consume a specific field.
    pub fn find_consumers(&self, field: &str) -> Vec<&RegisteredModule> {
        self.modules.iter().filter(|m| {
            m.coupling.iter().any(|c| matches!(c, CouplingCapability::Consumes { field: f, .. } if f == field))
        }).collect()
    }

    /// Get all coupling connections (provider→consumer pairs).
    pub fn get_coupling_graph(&self) -> Vec<CouplingConnection> {
        let mut connections = Vec::new();
        for provider in &self.modules {
            for cap in &provider.coupling {
                if let CouplingCapability::Provides { field, .. } = cap {
                    for consumer in &self.modules {
                        if std::ptr::eq(provider, consumer) { continue; }
                        for ccap in &consumer.coupling {
                            if let CouplingCapability::Consumes { field: cf, .. } = ccap {
                                if field == cf {
                                    connections.push(CouplingConnection {
                                        source_module: provider.info.name.clone(),
                                        target_module: consumer.info.name.clone(),
                                        field: field.clone(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        connections
    }

    /// Register an external plugin manifest.
    pub fn register_manifest(&mut self, manifest: PluginManifest) {
        self.manifests.push(manifest);
    }

    /// Get discovered manifests.
    pub fn list_manifests(&self) -> &[PluginManifest] {
        &self.manifests
    }

    /// Discover plugins in a directory.
    pub fn discover_plugins(&mut self, dir: &str) -> Vec<String> {
        let mut found = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let manifest_path = path.join("manifest.json");
                    if manifest_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                            if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                                found.push(manifest.name.clone());
                                self.manifests.push(manifest);
                            }
                        }
                    }
                }
            }
        }
        found
    }
}

/// A coupling connection between two modules via a shared field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouplingConnection {
    pub source_module: String,
    pub target_module: String,
    pub field: String,
}

impl Default for ModuleRegistry {
    fn default() -> Self {
        Self::with_builtins()
    }
}
