import { useMemo } from "react";
import * as THREE from "three";

interface MeshWireframeProps {
  edgeVertices: [number, number, number][];
  color?: string;
}

/**
 * Renders mesh edges as line segments using THREE.js.
 */
export function MeshWireframe({
  edgeVertices,
  color = "#00ccaa",
}: MeshWireframeProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(edgeVertices.length * 3);
    for (let i = 0; i < edgeVertices.length; i++) {
      positions[i * 3] = edgeVertices[i][0];
      positions[i * 3 + 1] = edgeVertices[i][1];
      positions[i * 3 + 2] = edgeVertices[i][2];
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [edgeVertices]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.6} />
    </lineSegments>
  );
}
