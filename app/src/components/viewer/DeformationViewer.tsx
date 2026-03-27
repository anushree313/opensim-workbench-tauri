import { useState, useCallback } from "react";
import "./DeformationViewer.css";

interface DeformationViewerProps {
  results: {
    temperature: { min: number; max: number; mean: number };
    displacement: { min: number; max: number; mean: number };
    vonMises: { min: number; max: number; mean: number };
    thermalStress: { min: number; max: number; mean: number };
    warpage: { min: number; max: number; mean: number };
  };
  scenario: string;
  onScaleChange?: (scale: number) => void;
}

const LAYER_DATA = [
  { name: "Leadframe", tempFrac: 0.85, dispFrac: 0.6, stressFrac: 0.7 },
  { name: "DBA", tempFrac: 0.95, dispFrac: 0.8, stressFrac: 0.9 },
  { name: "Die", tempFrac: 1.0, dispFrac: 1.0, stressFrac: 1.0 },
];

const PACKAGE_LENGTH_MM = 10;

function fmt(value: number, decimals: number = 2): string {
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(decimals) + "M";
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(decimals) + "k";
  return value.toFixed(decimals);
}

export function DeformationViewer({
  results,
  scenario,
  onScaleChange,
}: DeformationViewerProps) {
  const [scale, setScale] = useState(10);

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      setScale(v);
      onScaleChange?.(v);
    },
    [onScaleChange],
  );

  const { temperature, displacement, vonMises, thermalStress, warpage } = results;

  // Warpage summary
  const bowUm = (warpage.max - warpage.min) * 1e6;
  const pass = bowUm < 25;
  const curvatureRadius =
    bowUm > 0
      ? ((PACKAGE_LENGTH_MM * PACKAGE_LENGTH_MM) / (8 * bowUm * 1e-3)).toFixed(1)
      : "\u221E";

  return (
    <div className="deformation-viewer">
      {/* Header */}
      <div className="deformation-header">
        <h3>Deformation Analysis</h3>
        <span className="scenario-badge">{scenario}</span>
      </div>

      {/* Scale slider */}
      <div className="deformation-scale">
        <label>Deformation Scale</label>
        <input
          type="range"
          min={1}
          max={100}
          value={scale}
          onChange={handleScaleChange}
        />
        <span className="scale-value">{scale}x</span>
      </div>

      {/* Field summary cards */}
      <div className="deformation-cards">
        <div className="deformation-card card-temp">
          <h4>Temperature</h4>
          <div className="value">{fmt(temperature.mean)} &deg;C</div>
          <div className="range">
            {fmt(temperature.min)} &ndash; {fmt(temperature.max)} &deg;C
          </div>
        </div>

        <div className="deformation-card card-disp">
          <h4>Displacement</h4>
          <div className="value">{fmt(displacement.mean * 1e6)} &micro;m</div>
          <div className="range">
            {fmt(displacement.min * 1e6)} &ndash; {fmt(displacement.max * 1e6)} &micro;m
          </div>
        </div>

        <div className="deformation-card card-stress">
          <h4>Von Mises Stress</h4>
          <div className="value">{fmt(vonMises.mean / 1e6)} MPa</div>
          <div className="range">
            {fmt(vonMises.min / 1e6)} &ndash; {fmt(vonMises.max / 1e6)} MPa
          </div>
        </div>

        <div className="deformation-card card-thermal">
          <h4>Thermal Stress</h4>
          <div className="value">{fmt(thermalStress.mean)} MPa</div>
          <div className="range">
            {fmt(thermalStress.min)} &ndash; {fmt(thermalStress.max)} MPa
          </div>
        </div>

        <div className="deformation-card card-warpage">
          <h4>Warpage</h4>
          <div className="value">{fmt(warpage.mean * 1e6)} &micro;m</div>
          <div className="range">
            {fmt(warpage.min * 1e6)} &ndash; {fmt(warpage.max * 1e6)} &micro;m
          </div>
        </div>
      </div>

      {/* Warpage summary */}
      <div className="warpage-summary">
        <div className="warpage-row">
          <span className="warpage-label">Package Bow</span>
          <span className="warpage-bow">{fmt(bowUm)} &micro;m</span>
          <span className={`pass-badge ${pass ? "pass" : "fail"}`}>
            {pass ? "PASS" : "FAIL"}
          </span>
        </div>
        <div className="warpage-row">
          <span className="warpage-label">Curvature Radius</span>
          <span className="warpage-value">R &asymp; {curvatureRadius} mm</span>
        </div>
        <div className="warpage-note">
          Threshold: 25 &micro;m &middot; Package size: {PACKAGE_LENGTH_MM} mm
        </div>
      </div>

      {/* Layer deformation table */}
      <table className="layer-table">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Max Temp (&deg;C)</th>
            <th>Max Disp (&micro;m)</th>
            <th>Max Stress (MPa)</th>
          </tr>
        </thead>
        <tbody>
          {LAYER_DATA.map((layer) => (
            <tr key={layer.name}>
              <td>{layer.name}</td>
              <td>{fmt(temperature.max * layer.tempFrac)}</td>
              <td>{fmt(displacement.max * 1e6 * layer.dispFrac)}</td>
              <td>{fmt((vonMises.max / 1e6) * layer.stressFrac)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
