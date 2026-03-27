import { useState, useCallback, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { MeshWireframe } from "./MeshWireframe";
import { MeshViewerToolbar } from "./MeshViewerToolbar";
import { useProjectStore } from "../../stores/projectStore";
import type { MeshViewDto } from "../../types/project";
import "./MeshViewer.css";

interface MeshViewerProps {
  meshView: MeshViewDto;
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

function MeshSurface({
  vertices,
  normals,
  indices,
}: {
  vertices: [number, number, number][];
  normals: [number, number, number][];
  indices: number[];
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(vertices.length * 3);
    const norm = new Float32Array(normals.length * 3);
    for (let i = 0; i < vertices.length; i++) {
      pos[i * 3] = vertices[i][0];
      pos[i * 3 + 1] = vertices[i][1];
      pos[i * 3 + 2] = vertices[i][2];
      norm[i * 3] = normals[i][0];
      norm[i * 3 + 1] = normals[i][1];
      norm[i * 3 + 2] = normals[i][2];
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    return geo;
  }, [vertices, normals, indices]);

  return (
    <mesh geometry={geometry}>
      <meshPhongMaterial
        color="#4488cc"
        transparent
        opacity={0.25}
        side={THREE.DoubleSide}
        flatShading
      />
    </mesh>
  );
}

export function MeshViewer({ meshView, nodeName, onBack }: MeshViewerProps) {
  const { generateMesh } = useProjectStore();
  const [wireframe, setWireframe] = useState(true);
  const [showSurface, setShowSurface] = useState(true);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [zoomTrigger, setZoomTrigger] = useState(0);

  const hasMesh = meshView.statistics.total_elements > 0;

  const handleGenerateMesh = useCallback(async () => {
    await generateMesh(meshView.node_id, { max_element_size: 0.5 });
    setFitTrigger((t) => t + 1);
  }, [meshView.node_id, generateMesh]);

  const handleFitView = useCallback(() => {
    setFitTrigger((t) => t + 1);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomTrigger((t) => t + 1);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomTrigger((t) => t - 1);
  }, []);

  const stats = meshView.statistics;
  const qualityPct = Math.round(stats.avg_quality * 100);
  const qualityColor =
    qualityPct >= 70 ? "#44cc88" : qualityPct >= 40 ? "#cccc44" : "#cc4444";

  return (
    <div className="mesh-viewer">
      <MeshViewerToolbar
        onBack={onBack}
        onGenerateMesh={handleGenerateMesh}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        wireframe={wireframe}
        onToggleWireframe={() => setWireframe((w) => !w)}
        showSurface={showSurface}
        onToggleShowSurface={() => setShowSurface((s) => !s)}
        nodeName={nodeName}
        hasMesh={hasMesh}
      />

      <div className="mesh-canvas-container">
        {!hasMesh ? (
          <div className="mesh-empty">
            <p>No mesh generated yet.</p>
            <p>Click "Generate Mesh" to mesh from upstream geometry.</p>
            <button onClick={handleGenerateMesh}>Generate Mesh</button>
          </div>
        ) : (
          <Canvas
            camera={{ position: [3, 3, 3], fov: 50 }}
            style={{ background: "#1a1a2e" }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[10, 10, 5]} intensity={0.8} />
            <directionalLight position={[-5, -5, -3]} intensity={0.3} />

            {wireframe && (
              <MeshWireframe edgeVertices={meshView.edge_vertices} />
            )}

            {showSurface &&
              meshView.surface_vertices.length > 0 && (
                <MeshSurface
                  vertices={meshView.surface_vertices}
                  normals={meshView.surface_normals}
                  indices={meshView.surface_indices}
                />
              )}

            <gridHelper args={[10, 10, "#333355", "#222244"]} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
            <FitViewHelper triggerFit={fitTrigger} />
            <ZoomHelper zoomTrigger={zoomTrigger} />
          </Canvas>
        )}

        {hasMesh && (
          <div className="mesh-stats-panel">
            <div className="mesh-stats-header">Mesh Statistics</div>
            <div className="mesh-stat-row">
              <span className="stat-label">Name</span>
              <span className="stat-value">{meshView.name}</span>
            </div>
            <div className="mesh-stat-row">
              <span className="stat-label">Nodes</span>
              <span className="stat-value">
                {stats.total_nodes.toLocaleString()}
              </span>
            </div>
            <div className="mesh-stat-row">
              <span className="stat-label">Elements</span>
              <span className="stat-value">
                {stats.total_elements.toLocaleString()}
              </span>
            </div>

            <div className="mesh-stat-section">Element Types</div>
            {Object.entries(stats.element_counts).map(([kind, count]) => (
              <div className="mesh-stat-row" key={kind}>
                <span className="stat-label">{kind}</span>
                <span className="stat-value">{count.toLocaleString()}</span>
              </div>
            ))}

            <div className="mesh-stat-section">Quality</div>
            <div className="mesh-stat-row">
              <span className="stat-label">Min</span>
              <span className="stat-value">{stats.min_quality.toFixed(3)}</span>
            </div>
            <div className="mesh-stat-row">
              <span className="stat-label">Avg</span>
              <span className="stat-value">{stats.avg_quality.toFixed(3)}</span>
            </div>
            <div className="mesh-stat-row">
              <span className="stat-label">Max</span>
              <span className="stat-value">{stats.max_quality.toFixed(3)}</span>
            </div>
            <div className="mesh-quality-bar">
              <div
                className="mesh-quality-fill"
                style={{
                  width: `${qualityPct}%`,
                  background: qualityColor,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
