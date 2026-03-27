import { useState, useCallback, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ResultSurface } from "./ResultSurface";
import { useProjectStore } from "../../stores/projectStore";
import type { ResultViewDto } from "../../types/project";
import "./ResultViewer.css";

interface ResultViewerProps {
  resultView: ResultViewDto;
  nodeName: string;
  onBack: () => void;
}

// --------------- types ---------------

type AnalysisMode = "structural" | "thermal";

type Material = "Steel" | "Aluminum" | "Copper" | "Silicon";

interface StructuralParams {
  material: Material;
  forceX: number;
  forceY: number;
  forceZ: number;
  pressure: number;
}

interface ThermalParams {
  material: Material;
  fixedTemperature: number;
  heatFlux: number;
  convectionH: number;
  convectionTInf: number;
}

type StructuralPreset = "Custom" | "Cantilever Beam" | "Simply Supported" | "Fixed-Fixed" | "Compression Test";
type ThermalPreset = "Custom" | "Heat Sink Analysis" | "Uniform Heating" | "Spot Heating" | "Convective Cooling";

// --------------- constants ---------------

const STRUCTURAL_PRESETS: StructuralPreset[] = [
  "Custom",
  "Cantilever Beam",
  "Simply Supported",
  "Fixed-Fixed",
  "Compression Test",
];

const THERMAL_PRESETS: ThermalPreset[] = [
  "Custom",
  "Heat Sink Analysis",
  "Uniform Heating",
  "Spot Heating",
  "Convective Cooling",
];

const MATERIALS: Material[] = ["Steel", "Aluminum", "Copper", "Silicon"];

const MATERIAL_DEFAULTS: Record<Material, { force: number; pressure: number }> = {
  Steel: { force: 1000, pressure: 1e6 },
  Aluminum: { force: 500, pressure: 5e5 },
  Copper: { force: 600, pressure: 6e5 },
  Silicon: { force: 200, pressure: 2e5 },
};

function getStructuralPresetValues(preset: StructuralPreset, material: Material): Omit<StructuralParams, "material"> {
  const defaults = MATERIAL_DEFAULTS[material];
  switch (preset) {
    case "Cantilever Beam":
      return { forceX: 0, forceY: -defaults.force, forceZ: 0, pressure: 0 };
    case "Simply Supported":
      return { forceX: 0, forceY: -defaults.force * 2, forceZ: 0, pressure: 0 };
    case "Fixed-Fixed":
      return { forceX: defaults.force * 0.5, forceY: -defaults.force, forceZ: 0, pressure: 0 };
    case "Compression Test":
      return { forceX: 0, forceY: 0, forceZ: 0, pressure: defaults.pressure };
    case "Custom":
    default:
      return { forceX: 0, forceY: 0, forceZ: 0, pressure: 0 };
  }
}

function getThermalPresetValues(preset: ThermalPreset): Omit<ThermalParams, "material"> {
  switch (preset) {
    case "Heat Sink Analysis":
      return { fixedTemperature: 85, heatFlux: 5000, convectionH: 25, convectionTInf: 25 };
    case "Uniform Heating":
      return { fixedTemperature: 100, heatFlux: 10000, convectionH: 0, convectionTInf: 25 };
    case "Spot Heating":
      return { fixedTemperature: 200, heatFlux: 50000, convectionH: 10, convectionTInf: 25 };
    case "Convective Cooling":
      return { fixedTemperature: 25, heatFlux: 0, convectionH: 50, convectionTInf: 20 };
    case "Custom":
    default:
      return { fixedTemperature: 25, heatFlux: 0, convectionH: 0, convectionTInf: 25 };
  }
}

// --------------- validation ---------------

interface ValidationWarning {
  field: string;
  message: string;
}

function validateStructural(params: StructuralParams): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const mag = Math.sqrt(params.forceX ** 2 + params.forceY ** 2 + params.forceZ ** 2);
  if (mag > 1e8) {
    warnings.push({ field: "force", message: "Force may exceed material yield" });
  }
  return warnings;
}

function validateThermal(params: ThermalParams): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (Math.abs(params.heatFlux) > 1e7) {
    warnings.push({ field: "heatFlux", message: "Very high heat flux" });
  }
  return warnings;
}

// --------------- helpers ---------------

function FitViewHelper({ triggerFit }: { triggerFit: number }) {
  const { camera, scene, invalidate } = useThree();
  useEffect(() => {
    const timer = setTimeout(() => {
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2.5;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.position.set(
          center.x + distance * 0.6,
          center.y + distance * 0.6,
          center.z + distance * 0.6
        );
        camera.lookAt(center);
        camera.updateProjectionMatrix();
      }
      invalidate();
    }, 150);
    return () => clearTimeout(timer);
  }, [triggerFit, camera, scene, invalidate]);
  return null;
}

function ZoomHelper({ zoomTrigger }: { zoomTrigger: number }) {
  const { camera } = useThree();
  useEffect(() => {
    if (zoomTrigger === 0) return;
    const direction = zoomTrigger > 0 ? 1 : -1;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    camera.position.addScaledVector(forward, direction * 0.5);
    camera.updateProjectionMatrix();
  }, [zoomTrigger, camera]);
  return null;
}

function formatSci(val: number): string {
  if (Math.abs(val) < 0.001 || Math.abs(val) > 99999) {
    return val.toExponential(3);
  }
  return val.toFixed(4);
}

// --------------- sub-components ---------------

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  warning?: string;
}

function NumberInput({ label, value, onChange, unit, warning }: NumberInputProps) {
  return (
    <div className="param-field">
      <label className="param-label">
        {label} {unit && <span className="param-unit">({unit})</span>}
      </label>
      <input
        type="number"
        className="param-input"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {warning && <span className="param-warning">{warning}</span>}
    </div>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}

function SelectInput({ label, value, options, onChange }: SelectInputProps) {
  return (
    <div className="param-field">
      <label className="param-label">{label}</label>
      <select
        className="param-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// --------------- main component ---------------

export function ResultViewer({ resultView, nodeName, onBack }: ResultViewerProps) {
  const { runSolver, changeResultField } = useProjectStore();
  const [fitTrigger, setFitTrigger] = useState(0);
  const [zoomTrigger, setZoomTrigger] = useState(0);

  // Auto-detect analysis mode from node name
  const analysisMode: AnalysisMode = useMemo(() => {
    return nodeName.toLowerCase().includes("thermal") ? "thermal" : "structural";
  }, [nodeName]);

  // Preset state
  const [structuralPreset, setStructuralPreset] = useState<StructuralPreset>("Custom");
  const [thermalPreset, setThermalPreset] = useState<ThermalPreset>("Custom");

  // Structural params state
  const [structuralParams, setStructuralParams] = useState<StructuralParams>({
    material: "Steel",
    forceX: 0,
    forceY: 0,
    forceZ: 0,
    pressure: 0,
  });

  // Thermal params state
  const [thermalParams, setThermalParams] = useState<ThermalParams>({
    material: "Steel",
    fixedTemperature: 25,
    heatFlux: 0,
    convectionH: 0,
    convectionTInf: 25,
  });

  // Validation
  const structuralWarnings = useMemo(() => validateStructural(structuralParams), [structuralParams]);
  const thermalWarnings = useMemo(() => validateThermal(thermalParams), [thermalParams]);

  // Lookup warning for a specific field
  const getWarning = useCallback(
    (field: string): string | undefined => {
      const list = analysisMode === "structural" ? structuralWarnings : thermalWarnings;
      return list.find((w) => w.field === field)?.message;
    },
    [analysisMode, structuralWarnings, thermalWarnings]
  );

  // Handle structural preset change
  const handleStructuralPresetChange = useCallback(
    (preset: string) => {
      const p = preset as StructuralPreset;
      setStructuralPreset(p);
      if (p !== "Custom") {
        const values = getStructuralPresetValues(p, structuralParams.material);
        setStructuralParams((prev) => ({ ...prev, ...values }));
      }
    },
    [structuralParams.material]
  );

  // Handle thermal preset change
  const handleThermalPresetChange = useCallback((preset: string) => {
    const p = preset as ThermalPreset;
    setThermalPreset(p);
    if (p !== "Custom") {
      const values = getThermalPresetValues(p);
      setThermalParams((prev) => ({ ...prev, ...values }));
    }
  }, []);

  // Material change handler with auto-suggest
  const handleMaterialChange = useCallback(
    (mat: string) => {
      const material = mat as Material;
      if (analysisMode === "structural") {
        const defaults = MATERIAL_DEFAULTS[material];
        setStructuralParams((prev) => {
          const updated = { ...prev, material };
          // Auto-suggest: update force/pressure if they are at old material defaults
          const oldDefaults = MATERIAL_DEFAULTS[prev.material];
          if (prev.forceY === -oldDefaults.force || prev.forceY === 0) {
            updated.forceY = prev.forceY === 0 ? 0 : -defaults.force;
          }
          if (prev.pressure === oldDefaults.pressure || prev.pressure === 0) {
            updated.pressure = prev.pressure === 0 ? 0 : defaults.pressure;
          }
          return updated;
        });
        // Re-apply preset with new material if not custom
        if (structuralPreset !== "Custom") {
          const values = getStructuralPresetValues(structuralPreset, material);
          setStructuralParams((prev) => ({ ...prev, material, ...values }));
        }
      } else {
        setThermalParams((prev) => ({ ...prev, material }));
      }
    },
    [analysisMode, structuralPreset]
  );

  // Structural field updaters
  const setForceX = useCallback((v: number) => {
    setStructuralPreset("Custom");
    setStructuralParams((prev) => ({ ...prev, forceX: v }));
  }, []);
  const setForceY = useCallback((v: number) => {
    setStructuralPreset("Custom");
    setStructuralParams((prev) => ({ ...prev, forceY: v }));
  }, []);
  const setForceZ = useCallback((v: number) => {
    setStructuralPreset("Custom");
    setStructuralParams((prev) => ({ ...prev, forceZ: v }));
  }, []);
  const setPressure = useCallback((v: number) => {
    setStructuralPreset("Custom");
    setStructuralParams((prev) => ({ ...prev, pressure: v }));
  }, []);

  // Thermal field updaters
  const setFixedTemp = useCallback((v: number) => {
    setThermalPreset("Custom");
    setThermalParams((prev) => ({ ...prev, fixedTemperature: v }));
  }, []);
  const setHeatFlux = useCallback((v: number) => {
    setThermalPreset("Custom");
    setThermalParams((prev) => ({ ...prev, heatFlux: v }));
  }, []);
  const setConvH = useCallback((v: number) => {
    setThermalPreset("Custom");
    setThermalParams((prev) => ({ ...prev, convectionH: v }));
  }, []);
  const setConvTInf = useCallback((v: number) => {
    setThermalPreset("Custom");
    setThermalParams((prev) => ({ ...prev, convectionTInf: v }));
  }, []);

  const hasResult = resultView.surface_vertices.length > 0;

  // Build solver params from panel state
  const buildSolverParams = useCallback((): Record<string, unknown> => {
    if (analysisMode === "structural") {
      return {
        material: structuralParams.material,
        force_x: structuralParams.forceX,
        force_y: structuralParams.forceY,
        force_z: structuralParams.forceZ,
        pressure: structuralParams.pressure,
      };
    }
    return {
      material: thermalParams.material,
      fixed_temperature: thermalParams.fixedTemperature,
      heat_flux: thermalParams.heatFlux,
      convection_h: thermalParams.convectionH,
      convection_t_inf: thermalParams.convectionTInf,
    };
  }, [analysisMode, structuralParams, thermalParams]);

  const handleSolve = useCallback(async () => {
    await runSolver(resultView.node_id, buildSolverParams());
    setFitTrigger((t) => t + 1);
  }, [resultView.node_id, runSolver, buildSolverParams]);

  const handleFieldChange = useCallback(
    (fieldName: string) => {
      changeResultField(resultView.node_id, fieldName);
    },
    [resultView.node_id, changeResultField]
  );

  const currentSummary = resultView.field_summaries.find(
    (s) => s.field_name === resultView.field_name
  );

  const currentMaterial = analysisMode === "structural" ? structuralParams.material : thermalParams.material;

  return (
    <div className="result-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button className="viewer-btn viewer-btn-back" onClick={onBack}>
            &larr; Schematic
          </button>
          <span className="viewer-toolbar-title">{nodeName}</span>
        </div>
        <div className="viewer-toolbar-center">
          <button
            className="viewer-btn"
            onClick={handleSolve}
            style={{ background: "#cc6644", color: "white" }}
          >
            Solve
          </button>
        </div>
        <div className="viewer-toolbar-right">
          <div className="viewer-btn-group">
            <button className="viewer-btn" onClick={() => setZoomTrigger((t) => t + 1)} title="Zoom In">+</button>
            <button className="viewer-btn" onClick={() => setZoomTrigger((t) => t - 1)} title="Zoom Out">-</button>
          </div>
          <button className="viewer-btn" onClick={() => setFitTrigger((t) => t + 1)}>
            Fit View
          </button>
        </div>
      </div>

      <div className="result-canvas-container">
        {/* Left parameter panel */}
        <div className="result-params-panel">
          <div className="params-header">
            {analysisMode === "structural" ? "Structural" : "Thermal"} Parameters
          </div>

          {/* Preset selector */}
          <div className="params-section-title">Analysis Preset</div>
          {analysisMode === "structural" ? (
            <SelectInput
              label=""
              value={structuralPreset}
              options={STRUCTURAL_PRESETS}
              onChange={handleStructuralPresetChange}
            />
          ) : (
            <SelectInput
              label=""
              value={thermalPreset}
              options={THERMAL_PRESETS}
              onChange={handleThermalPresetChange}
            />
          )}

          {/* Material */}
          <div className="params-section-title">Material</div>
          <SelectInput
            label=""
            value={currentMaterial}
            options={MATERIALS}
            onChange={handleMaterialChange}
          />

          {/* Boundary Conditions */}
          <div className="params-section-title">Boundary Conditions</div>

          {analysisMode === "structural" ? (
            <>
              <NumberInput
                label="Force X"
                unit="N"
                value={structuralParams.forceX}
                onChange={setForceX}
                warning={getWarning("force")}
              />
              <NumberInput
                label="Force Y"
                unit="N"
                value={structuralParams.forceY}
                onChange={setForceY}
              />
              <NumberInput
                label="Force Z"
                unit="N"
                value={structuralParams.forceZ}
                onChange={setForceZ}
              />
              <NumberInput
                label="Pressure"
                unit="Pa"
                value={structuralParams.pressure}
                onChange={setPressure}
              />
            </>
          ) : (
            <>
              <NumberInput
                label="Fixed Temp"
                unit="C"
                value={thermalParams.fixedTemperature}
                onChange={setFixedTemp}
              />
              <NumberInput
                label="Heat Flux"
                unit="W/m2"
                value={thermalParams.heatFlux}
                onChange={setHeatFlux}
                warning={getWarning("heatFlux")}
              />
              <NumberInput
                label="Convection h"
                unit="W/m2K"
                value={thermalParams.convectionH}
                onChange={setConvH}
              />
              <NumberInput
                label="T_inf"
                unit="C"
                value={thermalParams.convectionTInf}
                onChange={setConvTInf}
              />
            </>
          )}
        </div>

        {/* 3D Canvas */}
        {!hasResult ? (
          <div className="result-empty">
            <p>No results available yet.</p>
            <p>Click &quot;Solve&quot; to run the {analysisMode} analysis.</p>
            <button onClick={handleSolve}>Solve</button>
          </div>
        ) : (
          <Canvas
            camera={{ position: [3, 3, 3], fov: 50 }}
            style={{ background: "#1a1a2e" }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={0.8} />
            <directionalLight position={[-5, -5, -3]} intensity={0.3} />

            <ResultSurface
              vertices={resultView.surface_vertices}
              normals={resultView.surface_normals}
              indices={resultView.surface_indices}
              colors={resultView.vertex_colors}
            />

            <gridHelper args={[10, 10, "#333355", "#222244"]} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
            <FitViewHelper triggerFit={fitTrigger} />
            <ZoomHelper zoomTrigger={zoomTrigger} />
          </Canvas>
        )}

        {/* Right stats panel */}
        {hasResult && (
          <div className="result-stats-panel">
            <div className="result-stats-header">Results</div>

            <div className="result-stat-row">
              <span className="stat-label">Analysis</span>
              <span className="stat-value">{resultView.name}</span>
            </div>

            {/* Field selector */}
            <div className="result-stat-section">Field</div>
            <div className="field-selector">
              <select
                value={resultView.field_name}
                onChange={(e) => handleFieldChange(e.target.value)}
              >
                {resultView.field_summaries.map((s) => (
                  <option key={s.field_name} value={s.field_name}>
                    {s.field_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Current field summary */}
            {currentSummary && (
              <>
                <div className="result-stat-section">
                  {currentSummary.field_name} ({currentSummary.location})
                </div>
                <div className="result-stat-row">
                  <span className="stat-label">Min</span>
                  <span className="stat-value">{formatSci(currentSummary.min)}</span>
                </div>
                <div className="result-stat-row">
                  <span className="stat-label">Mean</span>
                  <span className="stat-value">{formatSci(currentSummary.mean)}</span>
                </div>
                <div className="result-stat-row">
                  <span className="stat-label">Max</span>
                  <span className="stat-value">{formatSci(currentSummary.max)}</span>
                </div>
              </>
            )}

            {/* Color legend */}
            <div className="result-stat-section">Color Legend</div>
            <div className="color-legend">
              <div className="color-legend-row">
                <div
                  className="color-legend-bar"
                  style={{
                    background:
                      "linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff)",
                  }}
                />
                <div className="color-legend-labels">
                  <span>{formatSci(resultView.color_range[1])}</span>
                  <span>{formatSci((resultView.color_range[0] + resultView.color_range[1]) / 2)}</span>
                  <span>{formatSci(resultView.color_range[0])}</span>
                </div>
              </div>
            </div>

            {/* All field summaries */}
            <div className="result-stat-section">All Fields</div>
            {resultView.field_summaries.map((s) => (
              <div
                className="result-stat-row"
                key={s.field_name}
                style={{ cursor: "pointer" }}
                onClick={() => handleFieldChange(s.field_name)}
              >
                <span className="stat-label">{s.field_name}</span>
                <span className="stat-value">{formatSci(s.max)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
