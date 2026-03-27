import { useState, useCallback } from "react";
import { useProjectStore } from "../../stores/projectStore";
import type { DesignExplorationViewDto } from "../../types/project";
import "./DEViewer.css";

interface DEViewerProps {
  deView: DesignExplorationViewDto;
  nodeName: string;
  onBack: () => void;
}

type Tab = "parameters" | "doe" | "surface" | "optimization" | "pareto" | "sixsigma";

function formatNum(val: number): string {
  if (Math.abs(val) < 0.001 || Math.abs(val) > 99999) return val.toExponential(3);
  return val.toFixed(4);
}

export function DEViewer({ deView, nodeName, onBack }: DEViewerProps) {
  const { runDoe, fitSurface, runOptimization, runPareto, runSixSigma } = useProjectStore();
  const [activeTab, setActiveTab] = useState<Tab>("parameters");

  const handleRunDoe = useCallback(async () => {
    await runDoe(deView.node_id);
  }, [deView.node_id, runDoe]);

  const handleFitSurface = useCallback(async () => {
    await fitSurface(deView.node_id, 0);
  }, [deView.node_id, fitSurface]);

  const handleOptimize = useCallback(async (minimize: boolean) => {
    await runOptimization(deView.node_id, 0, minimize);
  }, [deView.node_id, runOptimization]);

  const handlePareto = useCallback(async () => {
    await runPareto(deView.node_id);
  }, [deView.node_id, runPareto]);

  const handleSixSigma = useCallback(async () => {
    await runSixSigma(deView.node_id, 0);
  }, [deView.node_id, runSixSigma]);

  return (
    <div className="de-viewer">
      {/* Toolbar */}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button className="viewer-btn viewer-btn-back" onClick={onBack}>
            &larr; Schematic
          </button>
          <span className="viewer-toolbar-title">{nodeName}</span>
        </div>
        <div className="viewer-toolbar-center">
          <button className="de-action-btn primary" onClick={handleRunDoe}>
            Run DOE
          </button>
        </div>
        <div className="viewer-toolbar-right" />
      </div>

      {/* Tabs */}
      <div className="de-tabs">
        {(["parameters", "doe", "surface", "optimization", "pareto", "sixsigma"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = {
            parameters: "Parameters", doe: "DOE Points", surface: "Response Surface",
            optimization: "Optimization", pareto: "Pareto", sixsigma: "Six Sigma",
          };
          return (
            <button key={tab} className={`de-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="de-content">
        {activeTab === "parameters" && <ParametersTab deView={deView} />}
        {activeTab === "doe" && <DOETab deView={deView} onRunDoe={handleRunDoe} />}
        {activeTab === "surface" && <SurfaceTab deView={deView} onFit={handleFitSurface} />}
        {activeTab === "optimization" && <OptimizationTab deView={deView} onOptimize={handleOptimize} />}
        {activeTab === "pareto" && <ParetoTab deView={deView} onRunPareto={handlePareto} />}
        {activeTab === "sixsigma" && <SixSigmaTab deView={deView} onRunSixSigma={handleSixSigma} />}
      </div>
    </div>
  );
}

function ParametersTab({ deView }: { deView: DesignExplorationViewDto }) {
  return (
    <>
      <div className="de-section">
        <div className="de-section-title">Study: {deView.name}</div>
        <div className="de-info-row">
          <span className="info-label">Algorithm</span>
          <span className="info-value">{deView.doe_algorithm}</span>
        </div>
        <div className="de-info-row">
          <span className="info-label">Design Points</span>
          <span className="info-value">{deView.design_points.length}</span>
        </div>
        <div className="de-info-row">
          <span className="info-label">Outputs</span>
          <span className="info-value">{deView.output_names.join(", ")}</span>
        </div>
      </div>

      <div className="de-section">
        <div className="de-section-title">Parameters ({deView.parameters.length})</div>
        <table className="de-table">
          <thead>
            <tr><th>Name</th><th>Value</th><th>Min</th><th>Max</th></tr>
          </thead>
          <tbody>
            {deView.parameters.map((p, i) => (
              <tr key={i}>
                <td>{p.name}</td>
                <td>{formatNum(p.value)}</td>
                <td>{formatNum(p.lower_bound)}</td>
                <td>{formatNum(p.upper_bound)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DOETab({ deView, onRunDoe }: { deView: DesignExplorationViewDto; onRunDoe: () => void }) {
  if (deView.design_points.length === 0) {
    return (
      <div className="de-section">
        <div className="de-section-title">Design Points</div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No design points generated yet.</p>
        <button className="de-action-btn primary" onClick={onRunDoe}>Generate DOE Points</button>
      </div>
    );
  }

  return (
    <div className="de-section">
      <div className="de-section-title">
        Design Points ({deView.design_points.length})
      </div>
      <table className="de-table">
        <thead>
          <tr>
            <th>#</th>
            {deView.parameters.map((p, i) => <th key={`p${i}`}>{p.name}</th>)}
            {deView.output_names.map((o, i) => <th key={`o${i}`}>{o}</th>)}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {deView.design_points.map((dp, idx) => (
            <tr key={dp.id}>
              <td>{idx + 1}</td>
              {dp.parameter_values.map((v, i) => <td key={`p${i}`}>{formatNum(v)}</td>)}
              {dp.output_values.map((v, i) => <td key={`o${i}`}>{formatNum(v)}</td>)}
              <td><span className={`status-badge status-${dp.status}`}>{dp.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurfaceTab({ deView, onFit }: { deView: DesignExplorationViewDto; onFit: () => void }) {
  const rs = deView.response_surface;

  if (!rs) {
    return (
      <div className="de-section">
        <div className="de-section-title">Response Surface</div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {deView.design_points.length === 0
            ? "Run DOE first to generate design points."
            : "Click below to fit a response surface from DOE results."}
        </p>
        <button
          className="de-action-btn primary"
          onClick={onFit}
          disabled={deView.design_points.length === 0}
        >
          Fit Response Surface
        </button>
      </div>
    );
  }

  // Render response surface grid
  const gridSize = Math.round(Math.sqrt(rs.grid.length));
  const values = rs.grid.map((row) => row[2]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  return (
    <div className="de-section">
      <div className="de-section-title">Response Surface</div>
      <div className="de-info-row">
        <span className="info-label">R²</span>
        <span className="info-value">{rs.r_squared.toFixed(4)}</span>
      </div>
      <div className="de-info-row">
        <span className="info-label">Parameters</span>
        <span className="info-value">{rs.param_names.join(" vs ")}</span>
      </div>

      {gridSize > 0 && (
        <div
          className="rs-grid"
          style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
        >
          {rs.grid.map((row, i) => {
            const t = maxVal > minVal ? (row[2] - minVal) / (maxVal - minVal) : 0.5;
            const color = `hsl(${(1 - t) * 240}, 80%, 50%)`;
            return (
              <div
                key={i}
                className="rs-cell"
                style={{ background: color }}
                title={`${rs.param_names[0]}=${row[0].toFixed(3)}, ${rs.param_names[1]}=${row[1].toFixed(3)} → ${row[2].toFixed(4)}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function OptimizationTab({ deView, onOptimize }: { deView: DesignExplorationViewDto; onOptimize: (minimize: boolean) => void }) {
  const opt = deView.optimization_result;

  return (
    <div className="de-section">
      <div className="de-section-title">Optimization</div>

      <div style={{ marginBottom: 12 }}>
        <button className="de-action-btn primary" onClick={() => onOptimize(true)}>
          Minimize {deView.output_names[0] || "Output"}
        </button>
        <button className="de-action-btn secondary" onClick={() => onOptimize(false)}>
          Maximize {deView.output_names[0] || "Output"}
        </button>
      </div>

      {opt && (
        <>
          <div className="opt-result">
            <div className="opt-value">{formatNum(opt.optimal_value)}</div>
            <div className="opt-label">Optimal {deView.output_names[0] || "Output"}</div>
          </div>

          <div className="de-section" style={{ marginTop: 16 }}>
            <div className="de-section-title">Optimal Parameters</div>
            <table className="de-table">
              <thead>
                <tr><th>Parameter</th><th>Optimal Value</th></tr>
              </thead>
              <tbody>
                {opt.param_names.map((name, i) => (
                  <tr key={i}>
                    <td>{name}</td>
                    <td>{formatNum(opt.optimal_params[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {opt.history.length > 0 && (
            <div className="de-section" style={{ marginTop: 16 }}>
              <div className="de-section-title">Convergence History</div>
              <div className="history-chart">
                {opt.history.map((val, i) => {
                  const max = Math.max(...opt.history);
                  const min = Math.min(...opt.history);
                  const range = max - min || 1;
                  const h = ((val - min) / range) * 100;
                  return <div key={i} className="history-bar" style={{ height: `${Math.max(5, h)}%` }} />;
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParetoTab({ deView, onRunPareto }: { deView: DesignExplorationViewDto; onRunPareto: () => void }) {
  const pareto = deView.pareto_indices;

  return (
    <div className="de-section">
      <div className="de-section-title">Pareto Frontier</div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>
        Non-dominated solutions minimizing both {deView.output_names[0] || "Output 1"} and {deView.output_names[1] || "Output 2"}.
      </p>
      <button className="de-action-btn primary" onClick={onRunPareto}>
        Compute Pareto Frontier
      </button>

      {pareto && pareto.length > 0 && (
        <>
          <div className="de-info-row" style={{ marginTop: 12 }}>
            <span className="info-label">Non-dominated points</span>
            <span className="info-value">{pareto.length} / {deView.design_points.length}</span>
          </div>

          {/* Scatter plot using CSS grid */}
          <div style={{ position: "relative", width: "100%", height: 200, background: "rgba(0,0,0,0.2)", borderRadius: 4, marginTop: 8, border: "1px solid var(--border)" }}>
            {deView.design_points.map((dp, idx) => {
              if (dp.output_values.length < 2) return null;
              const allV0 = deView.design_points.map(d => d.output_values[0]);
              const allV1 = deView.design_points.map(d => d.output_values[1]);
              const minV0 = Math.min(...allV0), maxV0 = Math.max(...allV0);
              const minV1 = Math.min(...allV1), maxV1 = Math.max(...allV1);
              const x = maxV0 > minV0 ? ((dp.output_values[0] - minV0) / (maxV0 - minV0)) * 90 + 5 : 50;
              const y = maxV1 > minV1 ? (1 - (dp.output_values[1] - minV1) / (maxV1 - minV1)) * 90 + 5 : 50;
              const isPareto = pareto.includes(idx);
              return (
                <div key={idx} style={{
                  position: "absolute", left: `${x}%`, top: `${y}%`,
                  width: isPareto ? 10 : 6, height: isPareto ? 10 : 6,
                  borderRadius: "50%",
                  background: isPareto ? "#ff4444" : "#4488cc",
                  transform: "translate(-50%, -50%)",
                  border: isPareto ? "2px solid #ff8888" : "none",
                }} title={`${deView.output_names[0]}=${formatNum(dp.output_values[0])}, ${deView.output_names[1]}=${formatNum(dp.output_values[1])}`} />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            <span>{deView.output_names[0] || "Output 1"} →</span>
            <span>↑ {deView.output_names[1] || "Output 2"}</span>
          </div>

          <table className="de-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>#</th>
                {deView.parameters.map((p, i) => <th key={i}>{p.name}</th>)}
                {deView.output_names.map((o, i) => <th key={i}>{o}</th>)}
              </tr>
            </thead>
            <tbody>
              {pareto.map((dpIdx) => {
                const dp = deView.design_points[dpIdx];
                if (!dp) return null;
                return (
                  <tr key={dpIdx} style={{ background: "rgba(255,68,68,0.1)" }}>
                    <td>{dpIdx + 1}</td>
                    {dp.parameter_values.map((v, i) => <td key={i}>{formatNum(v)}</td>)}
                    {dp.output_values.map((v, i) => <td key={i}>{formatNum(v)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function SixSigmaTab({ deView, onRunSixSigma }: { deView: DesignExplorationViewDto; onRunSixSigma: () => void }) {
  const ss = deView.six_sigma;

  return (
    <div className="de-section">
      <div className="de-section-title">Six Sigma Robustness Analysis</div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>
        Monte Carlo sampling to assess output variability for {deView.output_names[0] || "Output"}.
      </p>
      <button className="de-action-btn primary" onClick={onRunSixSigma}>
        Run Monte Carlo ({1000} samples)
      </button>

      {ss && (
        <>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <div className="opt-result" style={{ flex: 1 }}>
              <div className="opt-value" style={{ fontSize: 18 }}>{formatNum(ss.mean)}</div>
              <div className="opt-label">Mean</div>
            </div>
            <div className="opt-result" style={{ flex: 1, borderColor: "rgba(68,136,204,0.3)", background: "rgba(68,136,204,0.1)" }}>
              <div className="opt-value" style={{ fontSize: 18, color: "#4488cc" }}>{formatNum(ss.std_dev)}</div>
              <div className="opt-label">Std Dev (σ)</div>
            </div>
            <div className="opt-result" style={{ flex: 1, borderColor: ss.cpk >= 1.33 ? "rgba(68,204,136,0.3)" : "rgba(204,68,68,0.3)", background: ss.cpk >= 1.33 ? "rgba(68,204,136,0.1)" : "rgba(204,68,68,0.1)" }}>
              <div className="opt-value" style={{ fontSize: 18, color: ss.cpk >= 1.33 ? "#44cc88" : "#cc4444" }}>{ss.cpk.toFixed(2)}</div>
              <div className="opt-label">Cpk</div>
            </div>
          </div>

          <div className="de-info-row" style={{ marginTop: 12 }}>
            <span className="info-label">Samples</span>
            <span className="info-value">{ss.sample_count.toLocaleString()}</span>
          </div>

          {/* Histogram */}
          <div className="de-section-title" style={{ marginTop: 16 }}>Output Distribution</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 100, padding: "8px 0" }}>
            {ss.histogram_counts.map((count, i) => {
              const maxCount = Math.max(...ss.histogram_counts);
              const h = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={i} style={{
                  flex: 1, height: `${Math.max(2, h)}%`,
                  background: "var(--accent)", borderRadius: "2px 2px 0 0",
                }} title={`${ss.histogram_bins[i]?.toFixed(2)}: ${count} samples`} />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
            <span>{ss.histogram_bins[0]?.toFixed(2)}</span>
            <span>{ss.histogram_bins[ss.histogram_bins.length - 1]?.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  );
}
