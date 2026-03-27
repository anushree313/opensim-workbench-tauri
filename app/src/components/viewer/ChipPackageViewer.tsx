import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  MATERIALS, DBA_MATERIALS, DEFAULT_GEOMETRY,
  solveThermal, solveShear, solveCTEMismatch, runFullComparison,
  solveTransientThermal, runParameterSweep, computeCorrelation, linspace,
  temperatureToColor, formatSci, formatTemp, formatSF,
  type ChipGeometry, type ThermalBCs, type ShearBCs,
  type ThermalResult, type ShearResult, type CTEResult, type DBAComparisonResult,
  type TransientParams, type TransientResult, type SweepResult,
  type ExperimentalData, type SweepableParam,
} from "../../utils/chipCalculations";
import "./ChipPackageViewer.css";

interface Props {
  nodeId: string;
  onBack: () => void;
}

type AnalysisType = "thermal" | "shear";
type AnalysisMode = "steady" | "transient";
type RightTab = "comparison" | "sweep" | "correlation";

export function ChipPackageViewer({ nodeId: _nodeId, onBack }: Props) {
  // Geometry parameters
  const [geo, setGeo] = useState<ChipGeometry>({ ...DEFAULT_GEOMETRY });

  // Analysis settings
  const [analysisType, setAnalysisType] = useState<AnalysisType>("thermal");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("steady");
  const [dbaMaterial, setDbaMaterial] = useState("Epoxy DBA");
  const [thermalBCs, setThermalBCs] = useState<ThermalBCs>({
    heatFlux: 50000, bottomTemp: 25, convectionH: 0, convectionTInf: 25,
  });
  const [shearBCs, setShearBCs] = useState<ShearBCs>({ force: 10, direction: "X" });
  const [transientParams, setTransientParams] = useState<TransientParams>({ endTime: 5.0, dt: 0.05 });

  // Custom materials (CRUD — spec sec 3.2)
  const [customMaterials, setCustomMaterials] = useState<Record<string, typeof MATERIALS[string]>>({});
  const [showAddMat, setShowAddMat] = useState(false);
  const allMaterials = useMemo(() => ({ ...MATERIALS, ...customMaterials }), [customMaterials]);
  const allDbaMats = useMemo(() => [...DBA_MATERIALS, ...Object.keys(customMaterials)], [customMaterials]);

  // Results
  const [thermalResult, setThermalResult] = useState<ThermalResult | null>(null);
  const [shearResult, setShearResult] = useState<ShearResult | null>(null);
  const [cteResult, setCTEResult] = useState<CTEResult | null>(null);
  const [transientResult, setTransientResult] = useState<TransientResult | null>(null);
  const [comparison, setComparison] = useState<DBAComparisonResult[] | null>(null);

  // Parameter sweep state
  const [sweepParam, setSweepParam] = useState<SweepableParam>("dba_t");
  const [sweepMin, setSweepMin] = useState(0.01);
  const [sweepMax, setSweepMax] = useState(0.1);
  const [sweepSteps, setSweepSteps] = useState(8);
  const [sweepResults, setSweepResults] = useState<SweepResult[] | null>(null);

  // Experimental correlation state
  const [expData, setExpData] = useState<ExperimentalData>({});

  // UI state
  const [solving, setSolving] = useState(false);
  const [solved, setSolved] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [rightTab, setRightTab] = useState<RightTab>("comparison");
  const [stale, setStale] = useState(false);

  const currentMat = allMaterials[dbaMaterial] ?? MATERIALS["Epoxy DBA"];

  // Mark stale when params change after a solve
  const prevSolvedRef = useRef(false);
  useEffect(() => {
    if (prevSolvedRef.current) setStale(true);
  }, [geo, analysisType, analysisMode, dbaMaterial, thermalBCs, shearBCs, transientParams]);
  useEffect(() => { prevSolvedRef.current = solved; }, [solved]);

  // Run analysis
  const handleRun = useCallback(() => {
    setSolving(true);
    setSolved(false);
    setStale(false);

    setTimeout(() => {
      const tr = solveThermal(geo, thermalBCs, dbaMaterial);
      const cte = solveCTEMismatch(geo, tr, dbaMaterial);
      setThermalResult(tr);
      setCTEResult(cte);

      if (analysisType === "shear") {
        const sr = solveShear(geo, shearBCs, dbaMaterial);
        setShearResult(sr);
        setTransientResult(null);
      } else {
        setShearResult(null);
        if (analysisMode === "transient") {
          const tranResult = solveTransientThermal(geo, thermalBCs, dbaMaterial, transientParams);
          setTransientResult(tranResult);
        } else {
          setTransientResult(null);
        }
      }

      setSolving(false);
      setSolved(true);
      setFitTrigger((t) => t + 1);
    }, analysisMode === "transient" ? 1800 : 1000);
  }, [geo, analysisType, analysisMode, dbaMaterial, thermalBCs, shearBCs, transientParams]);

  // Compare all DBA materials
  const handleCompare = useCallback(() => {
    const results = runFullComparison(geo, thermalBCs, shearBCs);
    setComparison(results);
    setRightTab("comparison");
  }, [geo, thermalBCs, shearBCs]);

  // Parameter sweep
  const handleSweep = useCallback(() => {
    const values = linspace(sweepMin, sweepMax, sweepSteps);
    const results = runParameterSweep(geo, thermalBCs, shearBCs, dbaMaterial, sweepParam, values);
    setSweepResults(results);
    setRightTab("sweep");
  }, [geo, thermalBCs, shearBCs, dbaMaterial, sweepParam, sweepMin, sweepMax, sweepSteps]);

  // Copy comparison table
  const handleCopyTable = useCallback(() => {
    if (!comparison) return;
    const header = "Material\tT_junction(°C)\tR_jc(K/W)\tτ_max(Pa)\tδ_total(m)\tσ_CTE(Pa)\tWarpage(m)\tSF";
    const rows = comparison.map((r) =>
      `${r.material}\t${r.T_junction.toFixed(2)}\t${formatSci(r.R_jc)}\t${formatSci(r.tau_max)}\t${formatSci(r.delta_total)}\t${formatSci(r.sigma_thermal)}\t${formatSci(r.warpage)}\t${formatSF(r.safetyFactor)}`
    );
    navigator.clipboard?.writeText([header, ...rows].join("\n"));
  }, [comparison]);

  // Best material ranking (lowest R_jc)
  const bestMat = useMemo(() => {
    if (!comparison) return null;
    return comparison.reduce((best, r) => r.R_jc < best.R_jc ? r : best, comparison[0]).material;
  }, [comparison]);

  // Correlation results
  const corrResult = useMemo(() => {
    if (!thermalResult) return null;
    const hasExpData = Object.values(expData).some((v) => v != null && v !== 0);
    if (!hasExpData) return null;
    return computeCorrelation(thermalResult, shearResult, expData);
  }, [thermalResult, shearResult, expData]);

  // Geometry field helper
  const geoField = (key: keyof ChipGeometry, label: string, unit: string) => (
    <div className="param-row">
      <label>{label}</label>
      <div className="param-input-wrap">
        <input type="number" step="any" value={geo[key]}
          onChange={(e) => { setGeo((g) => ({ ...g, [key]: parseFloat(e.target.value) || 0 })); setSolved(false); }}
          className="param-input" />
        <span className="param-unit">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="chip-viewer">
      {/* ============ TOOLBAR ============ */}
      <div className="chip-toolbar">
        <div className="chip-toolbar-left">
          <button className="viewer-btn back-btn" onClick={onBack}>← Schematic</button>
          <span className="chip-title">Chip Package Analysis</span>
          {stale && <span className="stale-badge">● Parameters changed</span>}
        </div>
        <div className="chip-toolbar-center">
          <div className="chip-toggle">
            <button className={`toggle-btn ${analysisType === "thermal" ? "active" : ""}`}
              onClick={() => setAnalysisType("thermal")}>Thermal</button>
            <button className={`toggle-btn ${analysisType === "shear" ? "active" : ""}`}
              onClick={() => setAnalysisType("shear")}>Shear</button>
          </div>
          {analysisType === "thermal" && (
            <div className="chip-toggle">
              <button className={`toggle-btn ${analysisMode === "steady" ? "active" : ""}`}
                onClick={() => setAnalysisMode("steady")}>Steady</button>
              <button className={`toggle-btn ${analysisMode === "transient" ? "active" : ""}`}
                onClick={() => setAnalysisMode("transient")}>Transient</button>
            </div>
          )}
          <select className="dba-select" value={dbaMaterial} onChange={(e) => setDbaMaterial(e.target.value)}>
            {allDbaMats.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="viewer-btn primary" onClick={handleRun} disabled={solving}>
            {solving ? "Solving..." : analysisMode === "transient" ? "Run Transient" : "Run Analysis"}
          </button>
          <button className="viewer-btn" onClick={handleCompare}>Compare All</button>
          <span className="toolbar-sep" />
          <button className={`viewer-btn ${exploded ? "active" : ""}`} onClick={() => setExploded(!exploded)}>Explode</button>
          <button className={`viewer-btn ${wireframe ? "active" : ""}`} onClick={() => setWireframe(!wireframe)}>Wire</button>
          <button className="viewer-btn" onClick={() => setFitTrigger((t) => t + 1)}>Fit</button>
        </div>
      </div>

      <div className="chip-body">
        {/* ============ LEFT PANEL: Parameters ============ */}
        <div className="chip-params-panel">
          {/* Geometry */}
          <div className="param-section">
            <div className="param-section-title">Geometry (mm)</div>
            <div className="param-group-label">Lead Frame</div>
            {geoField("lf_w", "Width",     "mm")}
            {geoField("lf_h", "Height",    "mm")}
            {geoField("lf_t", "Thickness", "mm")}
            <div className="param-group-label">DBA Layer</div>
            {geoField("dba_w", "Width",     "mm")}
            {geoField("dba_h", "Height",    "mm")}
            {geoField("dba_t", "Thickness", "mm")}
            <div className="param-group-label">Silicon Die</div>
            {geoField("die_w", "Width",     "mm")}
            {geoField("die_h", "Height",    "mm")}
            {geoField("die_t", "Thickness", "mm")}
          </div>

          {/* Boundary Conditions */}
          <div className="param-section">
            <div className="param-section-title">
              {analysisType === "thermal" ? "Thermal BCs" : "Shear BCs"}
            </div>
            {analysisType === "thermal" ? (
              <>
                <div className="param-row">
                  <label>Heat Flux</label>
                  <div className="param-input-wrap">
                    <input type="number" step="any" value={thermalBCs.heatFlux}
                      onChange={(e) => setThermalBCs((b) => ({ ...b, heatFlux: parseFloat(e.target.value) || 0 }))}
                      className="param-input" />
                    <span className="param-unit">W/m²</span>
                  </div>
                </div>
                <div className="param-row">
                  <label>Bottom T</label>
                  <div className="param-input-wrap">
                    <input type="number" step="any" value={thermalBCs.bottomTemp}
                      onChange={(e) => setThermalBCs((b) => ({ ...b, bottomTemp: parseFloat(e.target.value) || 0 }))}
                      className="param-input" />
                    <span className="param-unit">°C</span>
                  </div>
                </div>
                <div className="param-group-label" style={{ marginTop: 4 }}>Convection BC (optional)</div>
                <div className="param-row">
                  <label>h coeff</label>
                  <div className="param-input-wrap">
                    <input type="number" step="any" value={thermalBCs.convectionH ?? 0}
                      onChange={(e) => setThermalBCs((b) => ({ ...b, convectionH: parseFloat(e.target.value) || 0 }))}
                      className="param-input" />
                    <span className="param-unit">W/m²K</span>
                  </div>
                </div>
                <div className="param-row">
                  <label>T∞</label>
                  <div className="param-input-wrap">
                    <input type="number" step="any" value={thermalBCs.convectionTInf ?? 25}
                      onChange={(e) => setThermalBCs((b) => ({ ...b, convectionTInf: parseFloat(e.target.value) || 0 }))}
                      className="param-input" />
                    <span className="param-unit">°C</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="param-row">
                  <label>Shear Force</label>
                  <div className="param-input-wrap">
                    <input type="number" step="any" value={shearBCs.force}
                      onChange={(e) => setShearBCs((b) => ({ ...b, force: parseFloat(e.target.value) || 0 }))}
                      className="param-input" />
                    <span className="param-unit">N</span>
                  </div>
                </div>
                <div className="param-row">
                  <label>Direction</label>
                  <select className="param-input" value={shearBCs.direction}
                    onChange={(e) => setShearBCs((b) => ({ ...b, direction: e.target.value as "X" | "Y" | "Z" }))}>
                    <option value="X">X</option>
                    <option value="Y">Y</option>
                    <option value="Z">Z</option>
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Transient Settings */}
          {analysisType === "thermal" && analysisMode === "transient" && (
            <div className="param-section">
              <div className="param-section-title">Transient Settings</div>
              <div className="param-row">
                <label>End Time</label>
                <div className="param-input-wrap">
                  <input type="number" step="any" value={transientParams.endTime}
                    onChange={(e) => setTransientParams((p) => ({ ...p, endTime: parseFloat(e.target.value) || 1 }))}
                    className="param-input" />
                  <span className="param-unit">s</span>
                </div>
              </div>
              <div className="param-row">
                <label>Time Step</label>
                <div className="param-input-wrap">
                  <input type="number" step="any" value={transientParams.dt}
                    onChange={(e) => setTransientParams((p) => ({ ...p, dt: parseFloat(e.target.value) || 0.01 }))}
                    className="param-input" />
                  <span className="param-unit">s</span>
                </div>
              </div>
            </div>
          )}

          {/* Material Properties */}
          <div className="param-section">
            <div className="param-section-title">DBA: {dbaMaterial}</div>
            <div className="mat-props">
              <div className="mat-prop"><span>k</span><span>{currentMat.k} W/(m·K)</span></div>
              <div className="mat-prop"><span>E</span><span>{(currentMat.E / 1e9).toFixed(1)} GPa</span></div>
              <div className="mat-prop"><span>ν</span><span>{currentMat.nu}</span></div>
              <div className="mat-prop"><span>CTE</span><span>{(currentMat.cte * 1e6).toFixed(1)} ppm/K</span></div>
              <div className="mat-prop"><span>ρ</span><span>{currentMat.density} kg/m³</span></div>
              <div className="mat-prop"><span>cp</span><span>{currentMat.cp} J/(kg·K)</span></div>
              {currentMat.shearStrength > 0 && (
                <div className="mat-prop"><span>τ_allow</span><span>{formatSci(currentMat.shearStrength)} Pa</span></div>
              )}
            </div>
          </div>

          {/* Custom Material Add */}
          <div className="param-section">
            <div className="param-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Custom Materials</span>
              <button className="viewer-btn" style={{ padding: "1px 8px", fontSize: 11 }}
                onClick={() => setShowAddMat(!showAddMat)}>+</button>
            </div>
            {showAddMat && <AddMaterialForm onAdd={(mat) => {
              setCustomMaterials((prev) => ({ ...prev, [mat.name]: mat }));
              setShowAddMat(false);
            }} />}
            {Object.keys(customMaterials).length > 0 && (
              <div className="mat-props" style={{ marginTop: 4 }}>
                {Object.keys(customMaterials).map((name) => (
                  <div key={name} className="mat-prop" style={{ justifyContent: "space-between" }}>
                    <span>{name}</span>
                    <button className="viewer-btn" style={{ padding: "0 5px", fontSize: 9 }}
                      onClick={() => setCustomMaterials((prev) => {
                        const next = { ...prev };
                        delete next[name];
                        return next;
                      })}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Thermal Results */}
          {solved && thermalResult && analysisType === "thermal" && analysisMode === "steady" && (
            <div className="param-section results-section">
              <div className="param-section-title">Results</div>
              {thermalResult.layers.map((l, i) => (
                <div key={i} className={`layer-result layer-${l.name.toLowerCase()}`}>
                  <div className="layer-result-name">{l.name}</div>
                  <div className="layer-result-stats">
                    <span>{formatTemp(l.T_min)}</span>
                    <span>→</span>
                    <span>{formatTemp(l.T_max)}</span>
                  </div>
                </div>
              ))}
              <div className="result-metric"><span>T_junction</span><span className="metric-value">{formatTemp(thermalResult.T_die_top)}</span></div>
              <div className="result-metric"><span>R_θjc</span><span className="metric-value">{formatSci(thermalResult.R_jc)} K/W</span></div>
              {thermalResult.R_conv > 0 && (
                <div className="result-metric"><span>R_conv</span><span className="metric-value">{formatSci(thermalResult.R_conv)} K/W</span></div>
              )}
              {cteResult && (
                <>
                  <div className="result-metric"><span>CTE Stress</span><span className="metric-value">{formatSci(cteResult.sigma_thermal)} Pa</span></div>
                  <div className="result-metric"><span>Warpage</span><span className="metric-value">{formatSci(cteResult.warpage * 1e6)} μm</span></div>
                </>
              )}
            </div>
          )}

          {/* Shear Results with Safety Factor */}
          {solved && shearResult && analysisType === "shear" && (
            <div className="param-section results-section">
              <div className="param-section-title">Results</div>
              <div className="result-metric"><span>τ_avg</span><span className="metric-value">{formatSci(shearResult.tau_avg)} Pa</span></div>
              <div className="result-metric"><span>τ_max</span><span className="metric-value">{formatSci(shearResult.tau_max)} Pa</span></div>
              <div className="result-metric"><span>σ_VM</span><span className="metric-value">{formatSci(shearResult.sigma_vm)} Pa</span></div>
              <div className="result-metric"><span>δ_shear</span><span className="metric-value">{formatSci(shearResult.delta_shear)} m</span></div>
              <div className="result-metric"><span>δ_total</span><span className="metric-value">{formatSci(shearResult.delta_total)} m</span></div>
              <div className="result-metric"><span>σ_bend</span><span className="metric-value">{formatSci(shearResult.sigma_bend_die)} Pa</span></div>
              {shearResult.shearStrength > 0 && (
                <>
                  <div className="result-metric"><span>τ_allow</span><span className="metric-value">{formatSci(shearResult.shearStrength)} Pa</span></div>
                  <div className={`result-metric sf-row ${shearResult.safetyFactor >= 2 ? "sf-good" : shearResult.safetyFactor >= 1 ? "sf-warn" : "sf-fail"}`}>
                    <span>Safety Factor</span>
                    <span className="metric-value sf-value">{formatSF(shearResult.safetyFactor)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ============ CENTER: 3D Viewport ============ */}
        <div className="chip-canvas-container">
          {solving && (
            <div className="solving-overlay">
              <div className="spinner" />
              <span>Solving {analysisMode === "transient" ? "Transient Thermal" : analysisType === "thermal" ? "Thermal" : "Shear"} Analysis...</span>
            </div>
          )}
          <Canvas camera={{ position: [8, 6, 10], fov: 45 }} style={{ background: "#0a0f1e" }}>
            <ambientLight intensity={0.35} />
            <directionalLight position={[10, 15, 8]} intensity={0.9} />
            <directionalLight position={[-8, -5, -6]} intensity={0.25} />
            <ChipPackage3D
              geo={geo}
              exploded={exploded}
              wireframe={wireframe}
              thermalResult={solved && (analysisType === "thermal" || (analysisMode === "transient" && transientResult != null)) ? thermalResult : null}
              shearResult={solved && analysisType === "shear" ? shearResult : null}
            />
            <gridHelper args={[16, 16, "#1a2a4a", "#111828"]} />
            <axesHelper args={[3]} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
            <FitViewHelper triggerFit={fitTrigger} />
          </Canvas>

          {/* Color legend */}
          {solved && (
            <div className="chip-legend-v">
              <div className="legend-bar" />
              <div className="legend-ticks">
                {analysisType === "thermal" && thermalResult ? (
                  <>
                    <span>{thermalResult.T_die_top.toFixed(1)}°C</span>
                    <span>{thermalResult.T_dba_top.toFixed(1)}°C</span>
                    <span>{thermalResult.T_lf_top.toFixed(1)}°C</span>
                    <span>{thermalResult.T_bottom.toFixed(1)}°C</span>
                  </>
                ) : shearResult ? (
                  <>
                    <span>{formatSci(shearResult.tau_max)} Pa</span>
                    <span>{formatSci(shearResult.tau_avg)} Pa</span>
                    <span>0 Pa</span>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* Profile / Transient plot */}
          {solved && analysisType === "thermal" && (
            <div className="profile-plot">
              {analysisMode === "transient" && transientResult ? (
                <>
                  <div className="profile-title">T vs Time</div>
                  <TransientHistoryPlot result={transientResult} />
                </>
              ) : thermalResult ? (
                <>
                  <div className="profile-title">T vs Z Profile</div>
                  <TempProfilePlot result={thermalResult} geo={geo} />
                </>
              ) : null}
            </div>
          )}
        </div>

        {/* ============ RIGHT PANEL: Tabs ============ */}
        <div className="chip-comparison-panel">
          <div className="right-tabs">
            <button className={`tab-btn ${rightTab === "comparison" ? "active" : ""}`}
              onClick={() => setRightTab("comparison")}>Compare</button>
            <button className={`tab-btn ${rightTab === "sweep" ? "active" : ""}`}
              onClick={() => setRightTab("sweep")}>Sweep</button>
            <button className={`tab-btn ${rightTab === "correlation" ? "active" : ""}`}
              onClick={() => setRightTab("correlation")}>Correlation</button>
          </div>

          {rightTab === "comparison" && (
            <ComparisonPanel
              comparison={comparison}
              bestMat={bestMat}
              dbaMaterial={dbaMaterial}
              onCopy={handleCopyTable}
            />
          )}

          {rightTab === "sweep" && (
            <SweepPanel
              sweepParam={sweepParam} setSweepParam={setSweepParam}
              sweepMin={sweepMin} setSweepMin={setSweepMin}
              sweepMax={sweepMax} setSweepMax={setSweepMax}
              sweepSteps={sweepSteps} setSweepSteps={setSweepSteps}
              onRun={handleSweep}
              results={sweepResults}
            />
          )}

          {rightTab === "correlation" && (
            <CorrelationPanel
              expData={expData}
              setExpData={setExpData}
              corrResult={corrResult}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Comparison Panel
// ============================================================

function ComparisonPanel({ comparison, bestMat, dbaMaterial, onCopy }: {
  comparison: DBAComparisonResult[] | null;
  bestMat: string | null;
  dbaMaterial: string;
  onCopy: () => void;
}) {
  if (!comparison) return (
    <p className="chip-hint">Click "Compare All" to evaluate all DBA materials with current parameters.</p>
  );

  return (
    <>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>T_j (°C)</th>
            <th>R_jc</th>
            <th>τ_max</th>
            <th>SF</th>
            <th>Warp</th>
          </tr>
        </thead>
        <tbody>
          {comparison.map((row, i) => (
            <tr key={i} className={row.material === dbaMaterial ? "active-row" : ""}>
              <td className="mat-name">
                {row.material === bestMat && <span className="best-badge" title="Best thermal">★</span>}
                {row.material.replace(" DBA", "").replace("Conductive ", "Cond.")}
              </td>
              <td>{row.T_junction.toFixed(1)}</td>
              <td>{formatSci(row.R_jc)}</td>
              <td>{formatSci(row.tau_max)}</td>
              <td className={row.safetyFactor >= 2 ? "sf-good-cell" : row.safetyFactor >= 1 ? "sf-warn-cell" : "sf-fail-cell"}>
                {formatSF(row.safetyFactor)}
              </td>
              <td>{formatSci(row.warpage * 1e6)}μm</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="panel-title" style={{ marginTop: 16 }}>Performance Radar</div>
      <RadarChart data={comparison} />

      <div className="panel-title" style={{ marginTop: 12 }}>Thermal Resistance</div>
      <div className="bar-chart">
        {comparison.map((row, i) => {
          const maxR = Math.max(...comparison.map((r) => r.R_jc));
          const pct = maxR > 0 ? (row.R_jc / maxR) * 100 : 0;
          const colors = ["#cc6666", "#66cc99", "#6699cc", "#cccc66"];
          return (
            <div key={i} className="bar-row">
              <span className="bar-label">{row.material.replace(" DBA", "").replace("Conductive ", "Cond.")}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${pct}%`, background: colors[i] }} />
              </div>
              <span className="bar-value">{formatSci(row.R_jc)}</span>
            </div>
          );
        })}
      </div>

      {bestMat && (
        <div className="recommendation">
          <span className="rec-badge">★ Recommended</span>
          <span className="rec-text">{bestMat} — lowest thermal resistance</span>
        </div>
      )}
      <button className="viewer-btn copy-btn" onClick={onCopy} style={{ marginTop: 12 }}>
        Copy Table to Clipboard
      </button>
    </>
  );
}

// ============================================================
// Parameter Sweep Panel
// ============================================================

const SWEEP_PARAM_LABELS: Record<SweepableParam, string> = {
  lf_w: "LF Width (mm)", lf_h: "LF Height (mm)", lf_t: "LF Thickness (mm)",
  dba_w: "DBA Width (mm)", dba_h: "DBA Height (mm)", dba_t: "DBA Thickness (mm)",
  die_w: "Die Width (mm)", die_h: "Die Height (mm)", die_t: "Die Thickness (mm)",
};

function SweepPanel({ sweepParam, setSweepParam, sweepMin, setSweepMin, sweepMax, setSweepMax,
  sweepSteps, setSweepSteps, onRun, results }: {
  sweepParam: SweepableParam; setSweepParam: (p: SweepableParam) => void;
  sweepMin: number; setSweepMin: (v: number) => void;
  sweepMax: number; setSweepMax: (v: number) => void;
  sweepSteps: number; setSweepSteps: (v: number) => void;
  onRun: () => void;
  results: SweepResult[] | null;
}) {
  return (
    <div className="sweep-panel">
      <div className="panel-title">Parameter Sweep</div>
      <div className="param-row" style={{ marginBottom: 4 }}>
        <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Parameter</label>
        <select className="dba-select" value={sweepParam} onChange={(e) => setSweepParam(e.target.value as SweepableParam)}>
          {(Object.keys(SWEEP_PARAM_LABELS) as SweepableParam[]).map((k) => (
            <option key={k} value={k}>{SWEEP_PARAM_LABELS[k]}</option>
          ))}
        </select>
      </div>
      <div className="sweep-range-row">
        <div className="param-row">
          <label>Min</label>
          <input type="number" step="any" value={sweepMin}
            onChange={(e) => setSweepMin(parseFloat(e.target.value) || 0)}
            className="param-input" />
        </div>
        <div className="param-row">
          <label>Max</label>
          <input type="number" step="any" value={sweepMax}
            onChange={(e) => setSweepMax(parseFloat(e.target.value) || 0)}
            className="param-input" />
        </div>
        <div className="param-row">
          <label>Steps</label>
          <input type="number" min={2} max={20} value={sweepSteps}
            onChange={(e) => setSweepSteps(parseInt(e.target.value) || 5)}
            className="param-input" />
        </div>
      </div>
      <button className="viewer-btn primary" style={{ width: "100%", marginTop: 6 }} onClick={onRun}>
        Run Sweep
      </button>

      {results && (
        <>
          <div className="panel-title" style={{ marginTop: 12 }}>Sweep Results</div>
          <table className="sweep-table">
            <thead>
              <tr>
                <th>{SWEEP_PARAM_LABELS[sweepParam]}</th>
                <th>T_j (°C)</th>
                <th>R_jc</th>
                <th>SF</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.paramValue.toFixed(4)}</td>
                  <td>{r.T_junction.toFixed(2)}</td>
                  <td>{formatSci(r.R_jc)}</td>
                  <td className={r.safetyFactor >= 2 ? "sf-good-cell" : r.safetyFactor >= 1 ? "sf-warn-cell" : "sf-fail-cell"}>
                    {formatSF(r.safetyFactor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <SweepPlot results={results} param={sweepParam} />
        </>
      )}
    </div>
  );
}

function SweepPlot({ results, param }: { results: SweepResult[]; param: SweepableParam }) {
  const W = 240, H = 80, px = 30, py = 8;
  const vals = results.map((r) => r.paramValue);
  const temps = results.map((r) => r.T_junction);
  const minX = Math.min(...vals), maxX = Math.max(...vals);
  const minY = Math.min(...temps) - 1, maxY = Math.max(...temps) + 1;
  const sx = (x: number) => px + ((x - minX) / Math.max(maxX - minX, 1e-9)) * (W - px - 6);
  const sy = (y: number) => H - py - ((y - minY) / Math.max(maxY - minY, 1e-9)) * (H - py - 8);

  const path = results.map((r, i) => `${i === 0 ? "M" : "L"}${sx(r.paramValue)},${sy(r.T_junction)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ marginTop: 8 }}>
      <line x1={px} y1={py} x2={px} y2={H - py} stroke="#334" strokeWidth="0.5" />
      <line x1={px} y1={H - py} x2={W - 4} y2={H - py} stroke="#334" strokeWidth="0.5" />
      <path d={path} fill="none" stroke="#6699ff" strokeWidth="1.5" />
      {results.map((r, i) => (
        <circle key={i} cx={sx(r.paramValue)} cy={sy(r.T_junction)} r="2" fill="#6699ff" />
      ))}
      <text x={px - 2} y={py + 4} fill="#667" fontSize="5" textAnchor="end">{maxY.toFixed(0)}</text>
      <text x={px - 2} y={H - py} fill="#667" fontSize="5" textAnchor="end">{minY.toFixed(0)}</text>
      <text x={(W + px) / 2} y={H} fill="#667" fontSize="5" textAnchor="middle">
        {SWEEP_PARAM_LABELS[param]}
      </text>
      <text x={4} y={H / 2} fill="#667" fontSize="5" textAnchor="middle" transform={`rotate(-90,4,${H / 2})`}>T_j (°C)</text>
    </svg>
  );
}

// ============================================================
// Experimental Correlation Panel
// ============================================================

function CorrelationPanel({ expData, setExpData, corrResult }: {
  expData: ExperimentalData;
  setExpData: React.Dispatch<React.SetStateAction<ExperimentalData>>;
  corrResult: ReturnType<typeof computeCorrelation> | null;
}) {
  const expField = (key: keyof ExperimentalData, label: string, unit: string) => (
    <div className="param-row">
      <label style={{ width: 90 }}>{label}</label>
      <div className="param-input-wrap">
        <input type="number" step="any" value={expData[key] ?? ""}
          placeholder="—"
          onChange={(e) => setExpData((d) => ({
            ...d, [key]: e.target.value === "" ? undefined : parseFloat(e.target.value),
          }))}
          className="param-input" />
        <span className="param-unit">{unit}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="panel-title">Measured Values</div>
      <p className="chip-hint" style={{ marginBottom: 8 }}>
        Enter experimental results to compare with simulation. Run analysis first.
      </p>
      {expField("T_junction", "T_junction", "°C")}
      {expField("R_jc", "R_jc", "K/W")}
      {expField("tau_max", "τ_max", "Pa")}
      {expField("delta_total", "δ_total", "m")}

      {corrResult && corrResult.metrics.length > 0 ? (
        <>
          <div className="panel-title" style={{ marginTop: 14 }}>Sim vs Measured</div>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Sim</th>
                <th>Meas.</th>
                <th>Err %</th>
              </tr>
            </thead>
            <tbody>
              {corrResult.metrics.map((m, i) => (
                <tr key={i}>
                  <td className="mat-name">{m.name}</td>
                  <td>{formatSci(m.simulated)}</td>
                  <td>{formatSci(m.measured)}</td>
                  <td className={Math.abs(m.error_pct) <= 10 ? "err-good" : Math.abs(m.error_pct) <= 20 ? "err-warn" : "err-bad"}>
                    {m.error_pct > 0 ? "+" : ""}{m.error_pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="corr-rmse">
            <span>RMSE</span>
            <span className={corrResult.rmse <= 10 ? "err-good" : corrResult.rmse <= 20 ? "err-warn" : "err-bad"}>
              {corrResult.rmse.toFixed(1)}%
            </span>
          </div>
          <p className="chip-hint" style={{ marginTop: 6 }}>
            Target: &lt;10% per spec. Adjust material properties to calibrate.
          </p>
        </>
      ) : (
        corrResult?.metrics.length === 0 && (
          <p className="chip-hint" style={{ marginTop: 8 }}>Enter at least one measured value above.</p>
        )
      )}
    </div>
  );
}

// ============================================================
// Add Custom Material Form
// ============================================================

function AddMaterialForm({ onAdd }: { onAdd: (mat: typeof MATERIALS[string]) => void }) {
  const [name, setName] = useState("");
  const [k, setK] = useState(5);
  const [E, setE] = useState(3);
  const [nu, setNu] = useState(0.35);
  const [cte, setCte] = useState(50);
  const [density, setDensity] = useState(1500);
  const [cp, setCp] = useState(1000);
  const [shearStrength, setShearStrength] = useState(10);

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      k, E: E * 1e9, nu, cte: cte * 1e-6,
      density, cp, shearStrength: shearStrength * 1e6,
      color: "#aaaaaa",
    });
  };

  return (
    <div className="add-mat-form">
      <input className="param-input" style={{ width: "100%", marginBottom: 4 }}
        placeholder="Material name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="param-row"><label>k</label><input type="number" step="any" value={k} onChange={(e) => setK(+e.target.value)} className="param-input" /><span className="param-unit">W/mK</span></div>
      <div className="param-row"><label>E</label><input type="number" step="any" value={E} onChange={(e) => setE(+e.target.value)} className="param-input" /><span className="param-unit">GPa</span></div>
      <div className="param-row"><label>ν</label><input type="number" step="0.01" value={nu} onChange={(e) => setNu(+e.target.value)} className="param-input" /></div>
      <div className="param-row"><label>CTE</label><input type="number" step="any" value={cte} onChange={(e) => setCte(+e.target.value)} className="param-input" /><span className="param-unit">ppm/K</span></div>
      <div className="param-row"><label>ρ</label><input type="number" step="any" value={density} onChange={(e) => setDensity(+e.target.value)} className="param-input" /><span className="param-unit">kg/m³</span></div>
      <div className="param-row"><label>cp</label><input type="number" step="any" value={cp} onChange={(e) => setCp(+e.target.value)} className="param-input" /><span className="param-unit">J/kgK</span></div>
      <div className="param-row"><label>τ_allow</label><input type="number" step="any" value={shearStrength} onChange={(e) => setShearStrength(+e.target.value)} className="param-input" /><span className="param-unit">MPa</span></div>
      <button className="viewer-btn primary" style={{ width: "100%", marginTop: 6 }} onClick={handleAdd}>Add Material</button>
    </div>
  );
}

// ============================================================
// 3D Chip Package Geometry
// ============================================================

function ChipPackage3D({ geo, exploded, wireframe, thermalResult, shearResult }: {
  geo: ChipGeometry;
  exploded: boolean;
  wireframe: boolean;
  thermalResult: ThermalResult | null;
  shearResult: ShearResult | null;
}) {
  const gap = exploded ? 1.5 : 0;

  const layers = useMemo(() => {
    const lf_z0 = 0, lf_z1 = geo.lf_t;
    const dba_z0 = lf_z1 + gap, dba_z1 = dba_z0 + geo.dba_t;
    const die_z0 = dba_z1 + gap, die_z1 = die_z0 + geo.die_t;
    return [
      { name: "Leadframe", x: 0, y: 0, w: geo.lf_w, h: geo.lf_h, z0: lf_z0,  z1: lf_z1,  baseColor: "#cc9966" },
      { name: "DBA",       x: (geo.lf_w - geo.dba_w) / 2, y: (geo.lf_h - geo.dba_h) / 2, w: geo.dba_w, h: geo.dba_h, z0: dba_z0, z1: dba_z1, baseColor: "#66cc99" },
      { name: "Die",       x: (geo.lf_w - geo.die_w) / 2, y: (geo.lf_h - geo.die_h) / 2, w: geo.die_w, h: geo.die_h, z0: die_z0, z1: die_z1, baseColor: "#6699cc" },
    ];
  }, [geo, gap]);

  const tRange = thermalResult ? { min: thermalResult.T_bottom, max: thermalResult.T_die_top } : null;

  return (
    <group position={[-geo.lf_w / 2, -geo.lf_h / 2, 0]}>
      {layers.map((layer, li) => (
        <LayerBox key={li} layer={layer} wireframe={wireframe}
          thermalResult={thermalResult} shearResult={shearResult}
          tRange={tRange} layerIndex={li} />
      ))}
    </group>
  );
}

function LayerBox({ layer, wireframe, thermalResult, shearResult, tRange, layerIndex }: {
  layer: { name: string; x: number; y: number; w: number; h: number; z0: number; z1: number; baseColor: string };
  wireframe: boolean;
  thermalResult: ThermalResult | null;
  shearResult: ShearResult | null;
  tRange: { min: number; max: number } | null;
  layerIndex: number;
}) {
  const geom = useMemo(() => {
    const g = new THREE.BoxGeometry(layer.w, layer.h, layer.z1 - layer.z0);

    if (thermalResult && tRange) {
      const posArr = g.attributes.position;
      const colors = new Float32Array(posArr.count * 3);
      const layerResult = thermalResult.layers[layerIndex];
      for (let i = 0; i < posArr.count; i++) {
        const localZ = posArr.getZ(i);
        const t01 = (localZ / (layer.z1 - layer.z0)) * 0.5 + 0.5;
        const temp = layerResult.T_min + t01 * (layerResult.T_max - layerResult.T_min);
        const [r, gb, b] = temperatureToColor(temp, tRange.min, tRange.max);
        colors[i * 3] = r; colors[i * 3 + 1] = gb; colors[i * 3 + 2] = b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    } else if (shearResult) {
      const posArr = g.attributes.position;
      const colors = new Float32Array(posArr.count * 3);
      const layerShear = shearResult.layers[layerIndex];
      for (let i = 0; i < posArr.count; i++) {
        const norm = shearResult.tau_max > 0 ? layerShear.tau_mean / shearResult.tau_max : 0;
        const [r, gb, b] = temperatureToColor(norm * 100, 0, 100);
        colors[i * 3] = r; colors[i * 3 + 1] = gb; colors[i * 3 + 2] = b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    return g;
  }, [layer, thermalResult, shearResult, tRange, layerIndex]);

  const hasColors = thermalResult != null || shearResult != null;
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  const cz = (layer.z0 + layer.z1) / 2;

  return (
    <group position={[cx, cy, cz]}>
      <mesh geometry={geom}>
        {hasColors
          ? <meshPhongMaterial vertexColors side={THREE.DoubleSide} transparent opacity={0.92} />
          : <meshPhongMaterial color={layer.baseColor} side={THREE.DoubleSide} transparent opacity={0.85} />
        }
      </mesh>
      {wireframe && (
        <lineSegments>
          <edgesGeometry args={[geom]} />
          <lineBasicMaterial color="#ffffff" opacity={0.3} transparent />
        </lineSegments>
      )}
    </group>
  );
}

// ============================================================
// Temperature Profile Plot
// ============================================================

function TempProfilePlot({ result, geo }: { result: ThermalResult; geo: ChipGeometry }) {
  const totalH = geo.lf_t + geo.dba_t + geo.die_t;
  const tMin = result.T_bottom, tMax = result.T_die_top;
  const tRange = tMax - tMin || 1;

  const points = [
    { z: 0, t: result.T_bottom, label: "LF bot" },
    { z: geo.lf_t, t: result.T_lf_top, label: "LF/DBA" },
    { z: geo.lf_t + geo.dba_t, t: result.T_dba_top, label: "DBA/Die" },
    { z: totalH, t: result.T_die_top, label: "Die top" },
  ];

  return (
    <div className="profile-svg">
      <svg viewBox="0 0 120 80" width="100%" height="100%">
        <line x1="25" y1="5" x2="25" y2="72" stroke="#445" strokeWidth="0.5" />
        <line x1="25" y1="72" x2="115" y2="72" stroke="#445" strokeWidth="0.5" />
        {points.map((p, i) => {
          if (i === 0) return null;
          const prev = points[i - 1];
          const x1 = 25 + ((prev.t - tMin) / tRange) * 85;
          const y1 = 70 - (prev.z / totalH) * 62;
          const x2 = 25 + ((p.t - tMin) / tRange) * 85;
          const y2 = 70 - (p.z / totalH) * 62;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#66aaff" strokeWidth="1.5" />;
        })}
        {points.map((p, i) => {
          const x = 25 + ((p.t - tMin) / tRange) * 85;
          const y = 70 - (p.z / totalH) * 62;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="2" fill="#66aaff" />
              <text x={x + 3} y={y - 2} fill="#8899bb" fontSize="5">{p.t.toFixed(1)}°</text>
            </g>
          );
        })}
        <text x="65" y="79" fill="#667" fontSize="4" textAnchor="middle">Temperature (°C)</text>
        <text x="5" y="40" fill="#667" fontSize="4" textAnchor="middle" transform="rotate(-90, 5, 40)">Z (mm)</text>
      </svg>
    </div>
  );
}

// ============================================================
// Transient History Plot
// ============================================================

function TransientHistoryPlot({ result }: { result: TransientResult }) {
  const { steps } = result;
  if (steps.length < 2) return null;

  const W = 160, H = 80, px = 22, py = 6;
  const tVals = steps.map((s) => s.t);
  const allTemps = steps.flatMap((s) => [s.T_lf, s.T_dba, s.T_die]);
  const minX = 0, maxX = Math.max(...tVals);
  const minY = Math.min(...allTemps) - 2, maxY = Math.max(...allTemps) + 2;
  const sx = (t: number) => px + ((t - minX) / Math.max(maxX - minX, 1e-9)) * (W - px - 4);
  const sy = (v: number) => H - py - ((v - minY) / Math.max(maxY - minY, 1e-9)) * (H - py - 10);

  const mkPath = (vals: number[]) =>
    steps.map((s, i) => `${i === 0 ? "M" : "L"}${sx(s.t)},${sy(vals[i])}`).join(" ");

  const T_lfs  = steps.map((s) => s.T_lf);
  const T_dbas = steps.map((s) => s.T_dba);
  const T_dies = steps.map((s) => s.T_die);

  return (
    <div className="profile-svg">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
        <line x1={px} y1={py} x2={px} y2={H - py} stroke="#334" strokeWidth="0.4" />
        <line x1={px} y1={H - py} x2={W - 2} y2={H - py} stroke="#334" strokeWidth="0.4" />
        <path d={mkPath(T_lfs)}  fill="none" stroke="#cc9966" strokeWidth="1" />
        <path d={mkPath(T_dbas)} fill="none" stroke="#66cc99" strokeWidth="1" />
        <path d={mkPath(T_dies)} fill="none" stroke="#6699cc" strokeWidth="1.5" />
        {/* Steady state markers */}
        <line x1={sx(maxX * 0.95)} y1={sy(result.steadyState.T_die_top)} x2={W - 2} y2={sy(result.steadyState.T_die_top)} stroke="#6699cc" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* Legend */}
        <rect x={px + 2} y={py} width="4" height="1.5" fill="#cc9966" />
        <text x={px + 8} y={py + 2} fill="#cc9966" fontSize="4">LF</text>
        <rect x={px + 18} y={py} width="4" height="1.5" fill="#66cc99" />
        <text x={px + 24} y={py + 2} fill="#66cc99" fontSize="4">DBA</text>
        <rect x={px + 38} y={py} width="4" height="1.5" fill="#6699cc" />
        <text x={px + 44} y={py + 2} fill="#6699cc" fontSize="4">Die</text>
        <text x={(W + px) / 2} y={H} fill="#667" fontSize="4" textAnchor="middle">Time (s)</text>
        <text x={px - 2} y={py + 4} fill="#667" fontSize="4" textAnchor="end">{maxY.toFixed(0)}</text>
        <text x={px - 2} y={H - py} fill="#667" fontSize="4" textAnchor="end">{minY.toFixed(0)}</text>
      </svg>
    </div>
  );
}

// ============================================================
// Radar Chart (5 axes: R_jc, τ_max, δ, σ_CTE, SF)
// ============================================================

function RadarChart({ data }: { data: DBAComparisonResult[] }) {
  type AxisKey = "R_jc" | "tau_max" | "delta_total" | "sigma_thermal" | "safetyFactor";
  const axes: AxisKey[] = ["R_jc", "tau_max", "delta_total", "sigma_thermal", "safetyFactor"];
  const labels = ["R_th", "Shear", "Deform", "CTE σ", "SF"];
  const n = axes.length;
  const cx = 60, cy = 60, r = 45;
  const colors = ["#cc6666", "#66cc99", "#6699cc", "#cccc66"];

  // For SF: higher is better (outer = good); for others: lower is better (outer = good, i.e. invert)
  const maxVals = axes.map((a) => Math.max(...data.map((d) => Math.abs(d[a]))) || 1);

  const getPoint = (di: number, ai: number): [number, number] => {
    const angle = (Math.PI * 2 * ai) / n - Math.PI / 2;
    const raw = Math.abs(data[di][axes[ai]]);
    // SF: higher is better → normalized directly; others: lower is better → invert
    const val = axes[ai] === "safetyFactor"
      ? Math.min(raw / maxVals[ai], 1)
      : 1 - raw / maxVals[ai];
    return [cx + Math.cos(angle) * val * r, cy + Math.sin(angle) * val * r];
  };

  return (
    <svg viewBox="0 0 120 120" width="100%" className="radar-svg">
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <circle key={s} cx={cx} cy={cy} r={r * s} fill="none" stroke="#223" strokeWidth="0.3" />
      ))}
      {Array.from({ length: n }).map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (r + 10);
        const ly = cy + Math.sin(angle) * (r + 10);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r} stroke="#334" strokeWidth="0.3" />
            <text x={lx} y={ly} fill="#889" fontSize="5" textAnchor="middle" dominantBaseline="middle">{labels[i]}</text>
          </g>
        );
      })}
      {data.map((_, di) => {
        const pts = Array.from({ length: n }).map((__, ai) => getPoint(di, ai));
        const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ") + "Z";
        return <path key={di} d={path} fill={colors[di]} fillOpacity={0.15} stroke={colors[di]} strokeWidth="0.8" />;
      })}
    </svg>
  );
}

// ============================================================
// FitViewHelper
// ============================================================

function FitViewHelper({ triggerFit }: { triggerFit: number }) {
  const { camera, scene, invalidate } = useThree();
  useEffect(() => {
    const timer = setTimeout(() => {
      const box = new THREE.Box3().setFromObject(scene);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim * 2.2;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.position.set(center.x + dist * 0.5, center.y + dist * 0.4, center.z + dist * 0.8);
        camera.lookAt(center);
        camera.updateProjectionMatrix();
      }
      invalidate();
    }, 100);
    return () => clearTimeout(timer);
  }, [triggerFit, camera, scene, invalidate]);
  return null;
}
