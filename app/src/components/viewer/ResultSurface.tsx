import { useMemo } from "react";
import * as THREE from "three";

interface ResultSurfaceProps {
  vertices: [number, number, number][];
  normals: [number, number, number][];
  indices: number[];
  colors: [number, number, number][];
}

/**
 * Renders a mesh surface with per-vertex colors for result contour visualization.
 */
export function ResultSurface({ vertices, normals, indices, colors }: ResultSurfaceProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    const pos = new Float32Array(vertices.length * 3);
    const norm = new Float32Array(normals.length * 3);
    const col = new Float32Array(colors.length * 3);

    for (let i = 0; i < vertices.length; i++) {
      pos[i * 3] = vertices[i][0];
      pos[i * 3 + 1] = vertices[i][1];
      pos[i * 3 + 2] = vertices[i][2];
      norm[i * 3] = normals[i][0];
      norm[i * 3 + 1] = normals[i][1];
      norm[i * 3 + 2] = normals[i][2];
      col[i * 3] = colors[i][0];
      col[i * 3 + 1] = colors[i][1];
      col[i * 3 + 2] = colors[i][2];
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    return geo;
  }, [vertices, normals, indices, colors]);

  return (
    <mesh geometry={geometry}>
      <meshPhongMaterial
        vertexColors
        side={THREE.DoubleSide}
        flatShading
      />
    </mesh>
  );
}
