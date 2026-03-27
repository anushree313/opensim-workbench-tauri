import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";
import type { TessellatedMeshDto } from "../../types/project";

interface BodyMeshProps {
  mesh: TessellatedMeshDto;
  color?: string;
  wireframe?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function BodyMesh({
  mesh,
  color = "#6699cc",
  wireframe = false,
  selected = false,
  onClick,
}: BodyMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Flatten arrays for Three.js
    const positions = new Float32Array(mesh.vertices.length * 3);
    const normals = new Float32Array(mesh.normals.length * 3);

    for (let i = 0; i < mesh.vertices.length; i++) {
      positions[i * 3] = mesh.vertices[i][0];
      positions[i * 3 + 1] = mesh.vertices[i][1];
      positions[i * 3 + 2] = mesh.vertices[i][2];
    }

    for (let i = 0; i < mesh.normals.length; i++) {
      normals[i * 3] = mesh.normals[i][0];
      normals[i * 3 + 1] = mesh.normals[i][1];
      normals[i * 3 + 2] = mesh.normals[i][2];
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));

    return geo;
  }, [mesh]);

  return (
    <mesh ref={meshRef} geometry={geometry} onClick={onClick}>
      <meshPhongMaterial
        color={selected ? "#ff9944" : color}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        flatShading
      />
      {!wireframe && (
        <Edges linewidth={1} threshold={15} color="#333333" />
      )}
    </mesh>
  );
}
