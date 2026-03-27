import { useState, useCallback, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { BodyMesh } from "./BodyMesh";
import { ViewerToolbar } from "./ViewerToolbar";
import { PrimitiveDialog } from "./PrimitiveDialog";
import { useProjectStore } from "../../stores/projectStore";
import type { GeometryViewDto, PrimitiveKind, BodyDto } from "../../types/project";
import "./GeometryViewer.css";

interface GeometryViewerProps {
  geometryView: GeometryViewDto;
  nodeName: string;
  onBack: () => void;
}

// Colors for different bodies
const BODY_COLORS = [
  "#6699cc",
  "#66cc99",
  "#cc6699",
  "#99cc66",
  "#cc9966",
  "#9966cc",
  "#66cccc",
  "#cccc66",
];

function FitViewHelper({ triggerFit }: { triggerFit: number }) {
  const { camera, scene, invalidate } = useThree();

  useEffect(() => {
    // Small delay to ensure meshes are added to scene
    const timer = setTimeout(() => {
      fitCamera(camera, scene);
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
    // Zoom by moving camera along its look direction
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    camera.position.addScaledVector(forward, direction * 0.5);
    camera.updateProjectionMatrix();
  }, [zoomTrigger, camera]);

  return null;
}

function fitCamera(camera: THREE.Camera, scene: THREE.Scene) {
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
}

interface DimensionField {
  label: string;
  value: number;
}

function getDimensionsForBody(body: BodyDto): DimensionField[] {
  if (!body.bounding_box) return [];
  const [[minX, minY, minZ], [maxX, maxY, maxZ]] = body.bounding_box;
  const width = Math.abs(maxX - minX);
  const height = Math.abs(maxY - minY);
  const depth = Math.abs(maxZ - minZ);

  switch (body.primitive_kind) {
    case "Box":
      return [
        { label: "Width", value: parseFloat(width.toFixed(4)) },
        { label: "Height", value: parseFloat(height.toFixed(4)) },
        { label: "Depth", value: parseFloat(depth.toFixed(4)) },
      ];
    case "Cylinder": {
      const radius = Math.max(width, depth) / 2;
      return [
        { label: "Radius", value: parseFloat(radius.toFixed(4)) },
        { label: "Height", value: parseFloat(height.toFixed(4)) },
      ];
    }
    case "Sphere": {
      const r = Math.max(width, height, depth) / 2;
      return [
        { label: "Radius", value: parseFloat(r.toFixed(4)) },
      ];
    }
    case "Plate":
      return [
        { label: "Width", value: parseFloat(width.toFixed(4)) },
        { label: "Height", value: parseFloat(height.toFixed(4)) },
        { label: "Thickness", value: parseFloat(depth.toFixed(4)) },
      ];
    default:
      return [];
  }
}

function getOriginForBody(body: BodyDto): [number, number, number] {
  if (!body.bounding_box) return [0, 0, 0];
  const [[minX, minY, minZ], [maxX, maxY, maxZ]] = body.bounding_box;
  return [
    parseFloat(((minX + maxX) / 2).toFixed(4)),
    parseFloat(((minY + maxY) / 2).toFixed(4)),
    parseFloat(((minZ + maxZ) / 2).toFixed(4)),
  ];
}

function BodyDimensionsPanel({ body }: { body: BodyDto }) {
  const dimensions = getDimensionsForBody(body);
  const origin = getOriginForBody(body);
  const hasPrimitive = !!body.primitive_kind;

  return (
    <div className="body-dimensions-panel">
      <div className="body-dimensions-header">Dimensions</div>

      {hasPrimitive && dimensions.length > 0 ? (
        <>
          {dimensions.map((dim) => (
            <div className="body-dim-row" key={dim.label}>
              <span className="body-dim-label">{dim.label}</span>
              <input
                type="number"
                className="body-dim-input"
                value={dim.value}
                readOnly
                tabIndex={-1}
              />
            </div>
          ))}
        </>
      ) : (
        <div className="body-dim-note">
          Imported geometry — dimensions are read from bounding box.
        </div>
      )}

      <div className="body-dim-section">Origin</div>
      <div className="body-dim-row">
        <span className="body-dim-label">X</span>
        <input
          type="number"
          className="body-dim-input"
          value={origin[0]}
          readOnly
          tabIndex={-1}
        />
      </div>
      <div className="body-dim-row">
        <span className="body-dim-label">Y</span>
        <input
          type="number"
          className="body-dim-input"
          value={origin[1]}
          readOnly
          tabIndex={-1}
        />
      </div>
      <div className="body-dim-row">
        <span className="body-dim-label">Z</span>
        <input
          type="number"
          className="body-dim-input"
          value={origin[2]}
          readOnly
          tabIndex={-1}
        />
      </div>

      <div className="body-dim-edit-note">
        Note: Edit dimensions by removing and re-adding the primitive
      </div>
    </div>
  );
}

export function GeometryViewer({
  geometryView,
  nodeName,
  onBack,
}: GeometryViewerProps) {
  const { addPrimitive, removeBody, importGeometry } = useProjectStore();
  const [wireframe, setWireframe] = useState(false);
  const [selectedBodyIdx, setSelectedBodyIdx] = useState<number | null>(null);
  const [dialogKind, setDialogKind] = useState<PrimitiveKind | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [zoomTrigger, setZoomTrigger] = useState(0);

  const handleAddPrimitive = useCallback((kind: PrimitiveKind) => {
    setDialogKind(kind);
  }, []);

  const handleConfirmPrimitive = useCallback(
    async (name: string, params: Record<string, unknown>) => {
      if (!dialogKind) return;
      await addPrimitive(geometryView.node_id, dialogKind, name, params);
      setDialogKind(null);
      setFitTrigger((t) => t + 1);
    },
    [dialogKind, geometryView.node_id, addPrimitive]
  );

  const handleImport = useCallback(async () => {
    // Prompt user for file path (dialog plugin optional)
    const filePath = window.prompt(
      "Enter path to geometry file (STL or OBJ):"
    );
    if (filePath && filePath.trim()) {
      try {
        await importGeometry(geometryView.node_id, filePath.trim());
        setFitTrigger((t) => t + 1);
      } catch (err) {
        console.error("Import failed:", err);
      }
    }
  }, [geometryView.node_id, importGeometry]);

  const handleFitView = useCallback(() => {
    setFitTrigger((t) => t + 1);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomTrigger((t) => t + 1);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomTrigger((t) => t - 1);
  }, []);

  const bodyCount = geometryView.model.bodies.length;
  const selectedBody =
    selectedBodyIdx !== null ? geometryView.model.bodies[selectedBodyIdx] ?? null : null;

  return (
    <div className="geometry-viewer">
      <ViewerToolbar
        wireframe={wireframe}
        onToggleWireframe={() => setWireframe((w) => !w)}
        onAddPrimitive={handleAddPrimitive}
        onImport={handleImport}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onBack={onBack}
        nodeName={nodeName}
      />

      <div className="viewer-canvas-container">
        {bodyCount === 0 ? (
          <div className="viewer-empty">
            <p>No geometry bodies yet.</p>
            <p>Use the toolbar to add primitives or import a file.</p>
          </div>
        ) : (
          <Canvas
            camera={{ position: [3, 3, 3], fov: 50 }}
            style={{ background: "#1a1a2e" }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 10, 5]} intensity={0.8} />
            <directionalLight position={[-5, -5, -3]} intensity={0.3} />

            {geometryView.meshes.map((mesh, idx) => (
              <BodyMesh
                key={idx}
                mesh={mesh}
                color={BODY_COLORS[idx % BODY_COLORS.length]}
                wireframe={wireframe}
                selected={selectedBodyIdx === idx}
                onClick={() =>
                  setSelectedBodyIdx(selectedBodyIdx === idx ? null : idx)
                }
              />
            ))}

            <gridHelper args={[10, 10, "#333355", "#222244"]} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
            <FitViewHelper triggerFit={fitTrigger} />
            <ZoomHelper zoomTrigger={zoomTrigger} />
          </Canvas>
        )}
      </div>

      {/* Body list sidebar */}
      <div className="viewer-body-list">
        <div className="viewer-body-list-header">
          Bodies ({bodyCount})
        </div>
        {geometryView.model.bodies.map((body, idx) => (
          <div
            key={body.id}
            className={`viewer-body-item ${selectedBodyIdx === idx ? "selected" : ""}`}
            onClick={() =>
              setSelectedBodyIdx(selectedBodyIdx === idx ? null : idx)
            }
          >
            <span className="body-icon">
              {body.primitive_kind ? "&#9632;" : "&#9650;"}
            </span>
            <span className="body-name">{body.name}</span>
            <span className="body-type">
              {body.primitive_kind || "Imported"}
            </span>
            <button
              className="body-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeBody(geometryView.node_id, body.id);
              }}
              title="Remove body"
            >
              &times;
            </button>
          </div>
        ))}

        {/* Dimensions panel for selected body */}
        {selectedBody && <BodyDimensionsPanel body={selectedBody} />}
      </div>

      {dialogKind && (
        <PrimitiveDialog
          kind={dialogKind}
          onConfirm={handleConfirmPrimitive}
          onCancel={() => setDialogKind(null)}
        />
      )}
    </div>
  );
}
