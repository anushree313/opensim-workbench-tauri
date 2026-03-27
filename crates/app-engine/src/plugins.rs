//! Plugin system for third-party solver integration.
//!
//! Defines the `SolverPlugin` trait that external solvers must implement,
//! a `PluginManifest` for plugin metadata, and a `PluginRegistry` for
//! discovery and dispatch.

use serde::{Deserialize, Serialize};

/// Trait that all solver plugins must implement.
///
/// Plugins receive a mesh (as JSON) and solver parameters, and return
/// a result set (as JSON). This interface is designed to work across
/// FFI boundaries (shared libraries, WASM modules).
pub trait SolverPlugin: Send + Sync {
    /// Human-readable plugin name.
    fn name(&self) -> &str;

    /// Plugin version string (semver).
    fn version(&self) -> &str;

    /// List of analysis types this plugin can solve.
    /// E.g., ["LinearStatic", "Modal", "HarmonicResponse"]
    fn supported_analysis_types(&self) -> Vec<String>;

    /// Execute the solver with the given mesh and parameters.
    /// Both input and output are JSON-serialized for FFI compatibility.
    fn solve(
        &self,
        mesh_json: &str,
        params_json: &str,
    ) -> Result<String, String>;
}

/// Plugin metadata loaded from a manifest file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub solver_types: Vec<String>,
    /// Path to the plugin binary (.wasm, .so, .dll)
    pub entry_point: String,
    /// Minimum OpenSim Workbench version required
    pub min_workbench_version: Option<String>,
}

/// Registry that manages discovered and loaded plugins.
pub struct PluginRegistry {
    plugins: Vec<Box<dyn SolverPlugin>>,
    manifests: Vec<PluginManifest>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
            manifests: Vec::new(),
        }
    }

    /// Register a plugin instance.
    pub fn register_plugin(&mut self, plugin: Box<dyn SolverPlugin>) {
        self.plugins.push(plugin);
    }

    /// Register a manifest (for plugins discovered but not yet loaded).
    pub fn register_manifest(&mut self, manifest: PluginManifest) {
        self.manifests.push(manifest);
    }

    /// List all registered plugin names.
    pub fn list_plugins(&self) -> Vec<&str> {
        self.plugins.iter().map(|p| p.name()).collect()
    }

    /// List all discovered manifests.
    pub fn list_manifests(&self) -> &[PluginManifest] {
        &self.manifests
    }

    /// Find a loaded plugin that supports the given analysis type.
    pub fn find_plugin_for_type(&self, analysis_type: &str) -> Option<&dyn SolverPlugin> {
        self.plugins
            .iter()
            .find(|p| p.supported_analysis_types().iter().any(|t| t == analysis_type))
            .map(|p| p.as_ref())
    }

    /// Load a manifest from a JSON file path.
    pub fn load_manifest(path: &str) -> Result<PluginManifest, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read manifest {}: {}", path, e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse manifest {}: {}", path, e))
    }

    /// Discover plugins in a directory by scanning for manifest.json files.
    pub fn discover_plugins(&mut self, dir: &str) -> Vec<String> {
        let mut found = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let manifest_path = path.join("manifest.json");
                    if manifest_path.exists() {
                        if let Ok(manifest) = Self::load_manifest(
                            manifest_path.to_str().unwrap_or_default(),
                        ) {
                            found.push(manifest.name.clone());
                            self.manifests.push(manifest);
                        }
                    }
                }
            }
        }
        found
    }
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::new()
    }
}
