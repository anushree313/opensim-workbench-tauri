use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Top-level project metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub version: ProjectVersion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Default for ProjectVersion {
    fn default() -> Self {
        Self {
            major: 0,
            minor: 1,
            patch: 0,
        }
    }
}

impl Project {
    pub fn new(name: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            description: String::new(),
            created_at: now,
            modified_at: now,
            version: ProjectVersion::default(),
        }
    }

    pub fn touch(&mut self) {
        self.modified_at = Utc::now();
    }
}

/// The kind of system a node represents in the project schematic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SystemKind {
    // Component systems
    Geometry,
    EngineeringData,
    Mesh,
    Result,

    // Analysis systems
    StaticStructural,
    Modal,
    Harmonic,
    TransientStructural,
    SteadyThermal,
    TransientThermal,
    FluidFlow,
    Magnetostatic,
    Electrostatic,

    // Coupled
    ThermalStructural,
    FluidStructureInteraction,

    // Design exploration
    ParameterSet,
    DesignOfExperiments,
    ResponseSurface,
    Optimization,
    SixSigma,
}

impl SystemKind {
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Geometry => "Geometry",
            Self::EngineeringData => "Engineering Data",
            Self::Mesh => "Mesh",
            Self::Result => "Results",
            Self::StaticStructural => "Static Structural",
            Self::Modal => "Modal",
            Self::Harmonic => "Harmonic Response",
            Self::TransientStructural => "Transient Structural",
            Self::SteadyThermal => "Steady-State Thermal",
            Self::TransientThermal => "Transient Thermal",
            Self::FluidFlow => "Fluid Flow",
            Self::Magnetostatic => "Magnetostatic",
            Self::Electrostatic => "Electrostatic",
            Self::ThermalStructural => "Thermal-Structural",
            Self::FluidStructureInteraction => "Fluid-Structure Interaction",
            Self::ParameterSet => "Parameter Set",
            Self::DesignOfExperiments => "Design of Experiments",
            Self::ResponseSurface => "Response Surface",
            Self::Optimization => "Optimization",
            Self::SixSigma => "Six Sigma Analysis",
        }
    }

    pub fn category(&self) -> SystemCategory {
        match self {
            Self::Geometry | Self::EngineeringData | Self::Mesh | Self::Result => {
                SystemCategory::Component
            }
            Self::StaticStructural
            | Self::Modal
            | Self::Harmonic
            | Self::TransientStructural
            | Self::SteadyThermal
            | Self::TransientThermal
            | Self::FluidFlow
            | Self::Magnetostatic
            | Self::Electrostatic
            | Self::ThermalStructural
            | Self::FluidStructureInteraction => SystemCategory::Analysis,
            Self::ParameterSet
            | Self::DesignOfExperiments
            | Self::ResponseSurface
            | Self::Optimization
            | Self::SixSigma => SystemCategory::DesignExploration,
        }
    }

    /// The default cells that appear in a system card on the schematic.
    pub fn default_cells(&self) -> Vec<CellKind> {
        match self {
            Self::Geometry => vec![CellKind::Geometry],
            Self::EngineeringData => vec![CellKind::EngineeringData],
            Self::Mesh => vec![CellKind::Mesh],
            Self::Result => vec![CellKind::Results],
            Self::StaticStructural | Self::Modal | Self::Harmonic | Self::TransientStructural => {
                vec![
                    CellKind::EngineeringData,
                    CellKind::Geometry,
                    CellKind::Model,
                    CellKind::Setup,
                    CellKind::Solution,
                    CellKind::Results,
                ]
            }
            Self::SteadyThermal | Self::TransientThermal => vec![
                CellKind::EngineeringData,
                CellKind::Geometry,
                CellKind::Model,
                CellKind::Setup,
                CellKind::Solution,
                CellKind::Results,
            ],
            Self::FluidFlow => vec![
                CellKind::Geometry,
                CellKind::Mesh,
                CellKind::Setup,
                CellKind::Solution,
                CellKind::Results,
            ],
            Self::Magnetostatic | Self::Electrostatic => vec![
                CellKind::Geometry,
                CellKind::Model,
                CellKind::Setup,
                CellKind::Solution,
                CellKind::Results,
            ],
            Self::ThermalStructural | Self::FluidStructureInteraction => vec![
                CellKind::EngineeringData,
                CellKind::Geometry,
                CellKind::Model,
                CellKind::Setup,
                CellKind::Solution,
                CellKind::Results,
            ],
            Self::ParameterSet => vec![CellKind::ParameterSet],
            Self::DesignOfExperiments => vec![CellKind::DesignOfExperiments],
            Self::ResponseSurface => vec![CellKind::ResponseSurface],
            Self::Optimization => vec![CellKind::Optimization],
            Self::SixSigma => vec![CellKind::SixSigma],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SystemCategory {
    Component,
    Analysis,
    DesignExploration,
}

/// Individual cells within a system card (sub-components).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CellKind {
    EngineeringData,
    Geometry,
    Model,
    Mesh,
    Setup,
    Solution,
    Results,
    ParameterSet,
    DesignOfExperiments,
    ResponseSurface,
    Optimization,
    SixSigma,
}

impl CellKind {
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::EngineeringData => "Engineering Data",
            Self::Geometry => "Geometry",
            Self::Model => "Model",
            Self::Mesh => "Mesh",
            Self::Setup => "Setup",
            Self::Solution => "Solution",
            Self::Results => "Results",
            Self::ParameterSet => "Parameter Set",
            Self::DesignOfExperiments => "Design of Experiments",
            Self::ResponseSurface => "Response Surface",
            Self::Optimization => "Optimization",
            Self::SixSigma => "Six Sigma",
        }
    }
}

/// State of a system node or cell in the project graph.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeState {
    /// Not yet configured.
    NotConfigured,
    /// Configured and up-to-date.
    Clean,
    /// Upstream data changed; needs re-solve.
    Dirty,
    /// Currently solving.
    Solving,
    /// Solve completed successfully.
    Solved,
    /// Solve failed.
    Failed,
}

impl Default for NodeState {
    fn default() -> Self {
        Self::NotConfigured
    }
}

/// A system node in the project schematic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemNode {
    pub id: Uuid,
    pub kind: SystemKind,
    pub name: String,
    pub state: NodeState,
    pub cells: Vec<Cell>,
    /// Position on the schematic canvas (x, y).
    pub position: (f64, f64),
    /// Associated geometry model ID (for Geometry nodes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_id: Option<Uuid>,
    /// Associated mesh ID (for Mesh nodes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mesh_id: Option<Uuid>,
    /// Associated result set ID (for analysis nodes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_id: Option<Uuid>,
    /// Associated design study ID (for DE nodes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub study_id: Option<Uuid>,
}

/// A cell within a system node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cell {
    pub id: Uuid,
    pub kind: CellKind,
    pub state: NodeState,
}

impl SystemNode {
    pub fn new(kind: SystemKind, position: (f64, f64)) -> Self {
        let cells = kind
            .default_cells()
            .into_iter()
            .map(|ck| Cell {
                id: Uuid::new_v4(),
                kind: ck,
                state: NodeState::default(),
            })
            .collect();

        Self {
            id: Uuid::new_v4(),
            kind,
            name: kind.display_name().to_string(),
            state: NodeState::default(),
            cells,
            position,
            geometry_id: None,
            mesh_id: None,
            result_id: None,
            study_id: None,
        }
    }

    pub fn overall_state(&self) -> NodeState {
        if self.cells.iter().any(|c| c.state == NodeState::Failed) {
            return NodeState::Failed;
        }
        if self.cells.iter().any(|c| c.state == NodeState::Solving) {
            return NodeState::Solving;
        }
        if self.cells.iter().any(|c| c.state == NodeState::Dirty) {
            return NodeState::Dirty;
        }
        if self
            .cells
            .iter()
            .all(|c| c.state == NodeState::Solved || c.state == NodeState::Clean)
        {
            return NodeState::Solved;
        }
        NodeState::NotConfigured
    }
}

/// Represents a data-sharing connection between systems.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectionKind {
    /// Upstream system provides geometry to downstream.
    GeometryShare,
    /// Upstream system provides mesh to downstream.
    MeshShare,
    /// Upstream system provides engineering data to downstream.
    EngineeringDataShare,
    /// Upstream system provides results (e.g., thermal loads) to downstream.
    ResultTransfer,
    /// Parameter linkage for design exploration.
    ParameterLink,
}
