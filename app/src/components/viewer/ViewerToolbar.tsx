import type { PrimitiveKind } from "../../types/project";
import "./ViewerToolbar.css";

interface ViewerToolbarProps {
  wireframe: boolean;
  onToggleWireframe: () => void;
  onAddPrimitive: (kind: PrimitiveKind) => void;
  onImport: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onBack: () => void;
  nodeName: string;
}

export function ViewerToolbar({
  wireframe,
  onToggleWireframe,
  onAddPrimitive,
  onImport,
  onFitView,
  onZoomIn,
  onZoomOut,
  onBack,
  nodeName,
}: ViewerToolbarProps) {
  return (
    <div className="viewer-toolbar">
      <div className="viewer-toolbar-left">
        <button className="viewer-btn viewer-btn-back" onClick={onBack}>
          &larr; Schematic
        </button>
        <span className="viewer-toolbar-title">{nodeName}</span>
      </div>
      <div className="viewer-toolbar-center">
        <div className="viewer-btn-group">
          <span className="viewer-btn-group-label">Add:</span>
          <button
            className="viewer-btn"
            onClick={() => onAddPrimitive("Box")}
            title="Add Box"
          >
            &#9632; Box
          </button>
          <button
            className="viewer-btn"
            onClick={() => onAddPrimitive("Cylinder")}
            title="Add Cylinder"
          >
            &#9711; Cylinder
          </button>
          <button
            className="viewer-btn"
            onClick={() => onAddPrimitive("Sphere")}
            title="Add Sphere"
          >
            &#9679; Sphere
          </button>
          <button
            className="viewer-btn"
            onClick={() => onAddPrimitive("Plate")}
            title="Add Plate"
          >
            &#9644; Plate
          </button>
        </div>
        <button className="viewer-btn" onClick={onImport}>
          Import File
        </button>
      </div>
      <div className="viewer-toolbar-right">
        <button
          className={`viewer-btn ${wireframe ? "viewer-btn-active" : ""}`}
          onClick={onToggleWireframe}
        >
          Wireframe
        </button>
        <div className="viewer-btn-group">
          <button className="viewer-btn" onClick={onZoomIn} title="Zoom In">
            +
          </button>
          <button className="viewer-btn" onClick={onZoomOut} title="Zoom Out">
            -
          </button>
        </div>
        <button className="viewer-btn" onClick={onFitView}>
          Fit View
        </button>
      </div>
    </div>
  );
}
