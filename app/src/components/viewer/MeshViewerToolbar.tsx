import "./ViewerToolbar.css";

interface MeshViewerToolbarProps {
  onBack: () => void;
  onGenerateMesh: () => void;
  onFitView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  wireframe: boolean;
  onToggleWireframe: () => void;
  showSurface: boolean;
  onToggleShowSurface: () => void;
  nodeName: string;
  hasMesh: boolean;
}

export function MeshViewerToolbar({
  onBack,
  onGenerateMesh,
  onFitView,
  onZoomIn,
  onZoomOut,
  wireframe,
  onToggleWireframe,
  showSurface,
  onToggleShowSurface,
  nodeName,
  hasMesh,
}: MeshViewerToolbarProps) {
  return (
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
          onClick={onGenerateMesh}
          title="Generate mesh from upstream geometry"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Generate Mesh
        </button>
      </div>
      <div className="viewer-toolbar-right">
        {hasMesh && (
          <>
            <button
              className={`viewer-btn ${wireframe ? "viewer-btn-active" : ""}`}
              onClick={onToggleWireframe}
            >
              Edges
            </button>
            <button
              className={`viewer-btn ${showSurface ? "viewer-btn-active" : ""}`}
              onClick={onToggleShowSurface}
            >
              Faces
            </button>
          </>
        )}
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
