import { useState } from "react";
import type { PrimitiveKind } from "../../types/project";
import "./PrimitiveDialog.css";

interface PrimitiveDialogProps {
  kind: PrimitiveKind;
  onConfirm: (name: string, params: Record<string, unknown>) => void;
  onCancel: () => void;
}

const DEFAULTS: Record<PrimitiveKind, Record<string, unknown>> = {
  Box: { origin: [0, 0, 0], dimensions: [1, 1, 1] },
  Cylinder: { origin: [0, 0, 0], axis: [0, 0, 1], radius: 0.5, height: 1.0 },
  Sphere: { center: [0, 0, 0], radius: 0.5 },
  Plate: { origin: [0, 0, 0], width: 2.0, height: 1.0, thickness: 0.1 },
};

export function PrimitiveDialog({
  kind,
  onConfirm,
  onCancel,
}: PrimitiveDialogProps) {
  const [name, setName] = useState(`${kind} 1`);
  const [params, setParams] = useState<Record<string, unknown>>(
    () => ({ ...DEFAULTS[kind] })
  );

  const updateScalar = (key: string, value: string) => {
    setParams((p) => ({ ...p, [key]: parseFloat(value) || 0 }));
  };

  const updateVector = (key: string, idx: number, value: string) => {
    setParams((p) => {
      const arr = [...(p[key] as number[])];
      arr[idx] = parseFloat(value) || 0;
      return { ...p, [key]: arr };
    });
  };

  const renderVectorField = (label: string, key: string) => {
    const arr = params[key] as number[];
    return (
      <div className="prim-field">
        <label>{label}</label>
        <div className="prim-vector">
          {["X", "Y", "Z"].map((axis, i) => (
            <input
              key={axis}
              type="number"
              step="0.1"
              value={arr[i]}
              onChange={(e) => updateVector(key, i, e.target.value)}
              placeholder={axis}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderScalarField = (label: string, key: string) => (
    <div className="prim-field">
      <label>{label}</label>
      <input
        type="number"
        step="0.1"
        value={params[key] as number}
        onChange={(e) => updateScalar(key, e.target.value)}
      />
    </div>
  );

  return (
    <div className="prim-dialog-overlay" onClick={onCancel}>
      <div className="prim-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Add {kind}</h3>
        <div className="prim-field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {kind === "Box" && (
          <>
            {renderVectorField("Origin", "origin")}
            {renderVectorField("Dimensions", "dimensions")}
          </>
        )}
        {kind === "Cylinder" && (
          <>
            {renderVectorField("Origin", "origin")}
            {renderScalarField("Radius", "radius")}
            {renderScalarField("Height", "height")}
          </>
        )}
        {kind === "Sphere" && (
          <>
            {renderVectorField("Center", "center")}
            {renderScalarField("Radius", "radius")}
          </>
        )}
        {kind === "Plate" && (
          <>
            {renderVectorField("Origin", "origin")}
            {renderScalarField("Width", "width")}
            {renderScalarField("Height", "height")}
            {renderScalarField("Thickness", "thickness")}
          </>
        )}

        <div className="prim-dialog-actions">
          <button className="prim-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="prim-btn-confirm"
            onClick={() => onConfirm(name, params)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
