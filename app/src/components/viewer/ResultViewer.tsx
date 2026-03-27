import { useState, useCallback, useEffect } from "react";
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

export function ResultViewer({ resultView, nodeName, onBack }: ResultViewerProps) {
  const { runSolver, changeResultField } = useProjectStore();
  const [fitTrigger, setFitTrigger] = useState(0);
  const [zoomTrigger, setZoomTrigger] = useState(0);

  const hasResult = resultView.surface_vertices.length > 0;

  const handleSolve = useCallback(async () => {
    await runSolver(resultView.node_id, {});
    setFitTrigger((t) => t + 1);
  }, [resultView.node_id, runSolver]);

  const handleFieldChange = useCallback(
    (fieldName: string) => {
      changeResultField(resultView.node_id, fieldName);
    },
    [resultView.node_id, changeResultField]
  );

  const currentSummary = resultView.field_summaries.find(
    (s) => s.field_name === resultView.field_name
  );

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
        {!hasResult ? (
          <div className="result-empty">
            <p>No results available yet.</p>
            <p>Click "Solve" to run the structural analysis.</p>
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
