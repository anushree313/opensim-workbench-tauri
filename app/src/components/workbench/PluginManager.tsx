import { useState } from "react";
import "./PluginManager.css";

interface PluginManagerProps {
  onClose: () => void;
}

interface SolverModule {
  name: string;
  version: string;
  category: string;
  description: string;
  provides: string[];
  consumes: string[];
  status: string;
  outputs: string[];
  inputs: string[];
}

const BUILTIN_MODULES: SolverModule[] = [
  {
    name: "Structural FEA",
    version: "0.8.0",
    category: "Structural",
    description: "Linear static structural analysis with Tet4 elements",
    provides: ["Displacement", "VonMises"],
    consumes: ["Temperature", "Pressure"],
    status: "Active",
    outputs: [
      "Displacement (Vector, Node, m)",
      "VonMises (Scalar, Element, Pa)",
      "ShearStressXY (Scalar, Element, Pa)",
    ],
    inputs: ["youngs_modulus (f64, Pa)", "poisson_ratio (f64)"],
  },
  {
    name: "Thermal FEA",
    version: "0.8.0",
    category: "Thermal",
    description: "Steady-state heat conduction with multi-material support",
    provides: ["Temperature", "HeatFlux"],
    consumes: ["HeatGeneration"],
    status: "Active",
    outputs: [
      "Temperature (Scalar, Node, \u00B0C)",
      "HeatFlux (Vector, Element, W/m\u00B2)",
    ],
    inputs: ["conductivity (f64, W/m\u00B7K)", "heat_flux (f64, W/m\u00B2)"],
  },
  {
    name: "CFD (Stokes Flow)",
    version: "0.8.0",
    category: "Fluid",
    description: "Incompressible Stokes flow using penalty method",
    provides: ["Pressure", "Velocity"],
    consumes: ["Displacement"],
    status: "Active",
    outputs: [
      "Velocity (Vector, Node, m/s)",
      "Pressure (Scalar, Element, Pa)",
    ],
    inputs: ["viscosity (f64, Pa\u00B7s)", "density (f64, kg/m\u00B3)"],
  },
  {
    name: "Electromagnetic",
    version: "0.8.0",
    category: "Electromagnetic",
    description: "Electrostatic and magnetostatic scalar potential solvers",
    provides: ["HeatGeneration", "LorentzForce"],
    consumes: [],
    status: "Active",
    outputs: [
      "ElectricPotential (Scalar, Node, V)",
      "ElectricField (Vector, Element, V/m)",
    ],
    inputs: ["permittivity (f64, F/m)", "permeability (f64, H/m)"],
  },
  {
    name: "Thermo-Mechanical (CTE)",
    version: "0.8.0",
    category: "Multiphysics",
    description:
      "Coupled thermal-structural with CTE mismatch for chip deformation",
    provides: ["Temperature", "Displacement", "Warpage"],
    consumes: ["HeatGeneration"],
    status: "Active",
    outputs: [
      "Temperature (\u00B0C)",
      "Displacement (m)",
      "DisplacementMagnitude (m)",
      "VonMises (Pa)",
      "ThermalStress (Pa)",
      "Warpage (m)",
    ],
    inputs: [
      "heat_flux (W/m\u00B2)",
      "ref_temperature (\u00B0C)",
      "shear_force (N)",
    ],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Structural: "#4ecdc4",
  Thermal: "#ff6b6b",
  Fluid: "#5b8def",
  Electromagnetic: "#ffd93d",
  Multiphysics: "#a29bfe",
};

const COUPLING_CONNECTIONS = [
  { source: "Thermal", field: "Temperature", target: "Structural" },
  { source: "Thermal", field: "Temperature", target: "ThermoMechanical" },
  { source: "CFD", field: "Pressure", target: "Structural" },
  { source: "EM", field: "HeatGeneration", target: "Thermal" },
];

export function PluginManager({ onClose }: PluginManagerProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selected = selectedIdx !== null ? BUILTIN_MODULES[selectedIdx] : null;

  return (
    <div className="plugin-overlay" onClick={onClose}>
      <div className="plugin-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="plugin-header">
          <div className="plugin-header-left">
            <h3>Solver Module Registry</h3>
            <span className="plugin-count-badge">
              {BUILTIN_MODULES.length} Modules
            </span>
          </div>
          <button className="plugin-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Body: list + detail */}
        <div className="plugin-body">
          {/* Module list */}
          <div className="plugin-list">
            {BUILTIN_MODULES.map((mod, idx) => (
              <div
                key={mod.name}
                className={`plugin-card ${selectedIdx === idx ? "selected" : ""}`}
                onClick={() => setSelectedIdx(idx)}
              >
                <div className="plugin-card-header">
                  <span className="plugin-name">{mod.name}</span>
                  <span className="plugin-version">v{mod.version}</span>
                </div>
                <div className="plugin-card-meta">
                  <span
                    className="plugin-category"
                    style={{
                      background:
                        (CATEGORY_COLORS[mod.category] || "#666") + "22",
                      color: CATEGORY_COLORS[mod.category] || "#666",
                    }}
                  >
                    {mod.category}
                  </span>
                  <span
                    className={`plugin-status ${mod.status.toLowerCase()}`}
                  />
                  <span className="plugin-status-label">{mod.status}</span>
                </div>
                <div className="plugin-card-desc">{mod.description}</div>
              </div>
            ))}
          </div>

          {/* Module detail */}
          <div className="plugin-detail">
            {selected ? (
              <>
                <h4>{selected.name}</h4>
                <p className="plugin-detail-desc">{selected.description}</p>

                <div className="plugin-detail-section">
                  <h5>Provides</h5>
                  <ul className="plugin-field-list provides">
                    {selected.provides.map((p) => (
                      <li key={p}>
                        <span className="field-arrow provides-arrow">&rarr;</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="plugin-detail-section">
                  <h5>Consumes</h5>
                  {selected.consumes.length > 0 ? (
                    <ul className="plugin-field-list consumes">
                      {selected.consumes.map((c) => (
                        <li key={c}>
                          <span className="field-arrow consumes-arrow">&larr;</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="plugin-none">None</span>
                  )}
                </div>

                <div className="plugin-detail-section">
                  <h5>Output Fields</h5>
                  <ul className="plugin-field-list">
                    {selected.outputs.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>

                <div className="plugin-detail-section">
                  <h5>Input Parameters</h5>
                  <ul className="plugin-field-list">
                    {selected.inputs.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="plugin-detail-empty">
                Select a module to view details
              </div>
            )}
          </div>
        </div>

        {/* Coupling diagram */}
        <div className="coupling-section">
          <h4 className="coupling-title">Data Flow Coupling</h4>
          {COUPLING_CONNECTIONS.map((conn, idx) => (
            <div className="coupling-row" key={idx}>
              <span className="coupling-source">{conn.source}</span>
              <span className="coupling-arrow">&rarr;</span>
              <span className="coupling-field">{conn.field}</span>
              <span className="coupling-arrow">&rarr;</span>
              <span className="coupling-target">{conn.target}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
