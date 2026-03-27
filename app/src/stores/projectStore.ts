import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ProjectSchematicDto,
  SystemKind,
  SystemCategory,
  ConnectionKind,
  CellKind,
  NodeState,
  ToolboxEntry,
  OperationResult,
  SystemNodeDto,
  GeometryViewDto,
  GeometryModelDto,
  BodyDto,
  TessellatedMeshDto,
  MeshViewDto,
  ResultViewDto,
  DesignExplorationViewDto,
  ChipPackageResultDto,
  DbaComparisonDto,
} from "../types/project";

// Detect if running inside Tauri or in a plain browser
const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

// Safe invoke wrapper: falls back gracefully in browser preview
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(`Tauri not available (cmd: ${cmd})`);
  }
  return invoke<T>(cmd, args);
}

// --- Toast notification system ---
export interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "warning";
}
let _toastIdCounter = 0;
let _toasts: ToastItem[] = [];
let _projectPath: string | null = null;
let _isSaving = false;

export function addToast(message: string, type: ToastItem["type"]) {
  const id = ++_toastIdCounter;
  _toasts = [..._toasts, { id, message, type }];
  notify();
  const delay = type === "error" ? 5000 : 3000;
  setTimeout(() => {
    _toasts = _toasts.filter((t) => t.id !== id);
    notify();
  }, delay);
}

function removeToast(id: number) {
  _toasts = _toasts.filter((t) => t.id !== id);
  notify();
}

// -- Mock mesh generators for browser preview --
function generateMockMesh(
  kind: string,
  params: Record<string, unknown>
): TessellatedMeshDto {
  switch (kind) {
    case "Box":
      return generateBoxMesh(params);
    case "Cylinder":
      return generateCylinderMesh(params);
    case "Sphere":
      return generateSphereMesh(params);
    case "Plate":
      return generateBoxMesh({ ...params, dimensions: [params.width ?? 2, params.height ?? 1, params.thickness ?? 0.1] });
    default:
      return generateBoxMesh(params);
  }
}

function generateBoxMesh(params: Record<string, unknown>): TessellatedMeshDto {
  const o = (params.origin as number[]) ?? [0, 0, 0];
  const d = (params.dimensions as number[]) ?? [1, 1, 1];
  const [x0, y0, z0] = [o[0], o[1], o[2]];
  const [x1, y1, z1] = [o[0] + d[0], o[1] + d[1], o[2] + d[2]];

  const corners: [number, number, number][] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const faces: [number[], [number, number, number]][] = [
    [[0,1,2,3], [0,0,-1]], [[4,7,6,5], [0,0,1]],
    [[0,3,7,4], [-1,0,0]], [[1,5,6,2], [1,0,0]],
    [[0,4,5,1], [0,-1,0]], [[3,2,6,7], [0,1,0]],
  ];
  const vertices: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];
  for (const [quad, normal] of faces) {
    const base = vertices.length;
    for (const ci of quad) { vertices.push(corners[ci]); normals.push(normal); }
    indices.push(base, base+1, base+2, base, base+2, base+3);
  }
  return { vertices, normals, indices };
}

function generateCylinderMesh(params: Record<string, unknown>): TessellatedMeshDto {
  const o = (params.origin as number[]) ?? [0, 0, 0];
  const r = (params.radius as number) ?? 0.5;
  const h = (params.height as number) ?? 1;
  const seg = 24;
  const vertices: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];

  // Side
  for (let i = 0; i <= seg; i++) {
    const a = (2 * Math.PI * i) / seg;
    const cx = Math.cos(a), sy = Math.sin(a);
    vertices.push([o[0] + r*cx, o[1] + r*sy, o[2]]);
    normals.push([cx, sy, 0]);
    vertices.push([o[0] + r*cx, o[1] + r*sy, o[2] + h]);
    normals.push([cx, sy, 0]);
  }
  for (let i = 0; i < seg; i++) {
    const bl = i*2, br = (i+1)*2, tl = bl+1, tr = br+1;
    indices.push(bl, br, tr, bl, tr, tl);
  }
  // Caps
  const bc = vertices.length;
  vertices.push([o[0], o[1], o[2]]); normals.push([0,0,-1]);
  for (let i = 0; i < seg; i++) {
    const a = (2*Math.PI*i)/seg;
    vertices.push([o[0]+r*Math.cos(a), o[1]+r*Math.sin(a), o[2]]); normals.push([0,0,-1]);
  }
  for (let i = 0; i < seg; i++) indices.push(bc, bc+1+((i+1)%seg), bc+1+i);
  const tc = vertices.length;
  vertices.push([o[0], o[1], o[2]+h]); normals.push([0,0,1]);
  for (let i = 0; i < seg; i++) {
    const a = (2*Math.PI*i)/seg;
    vertices.push([o[0]+r*Math.cos(a), o[1]+r*Math.sin(a), o[2]+h]); normals.push([0,0,1]);
  }
  for (let i = 0; i < seg; i++) indices.push(tc, tc+1+i, tc+1+((i+1)%seg));

  return { vertices, normals, indices };
}

function generateSphereMesh(params: Record<string, unknown>): TessellatedMeshDto {
  const c = (params.center as number[]) ?? [0, 0, 0];
  const r = (params.radius as number) ?? 0.5;
  const lonSeg = 24, latSeg = 12;
  const vertices: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= latSeg; lat++) {
    const theta = Math.PI * lat / latSeg;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let lon = 0; lon <= lonSeg; lon++) {
      const phi = 2 * Math.PI * lon / lonSeg;
      const nx = sinT * Math.cos(phi), ny = sinT * Math.sin(phi), nz = cosT;
      vertices.push([c[0]+r*nx, c[1]+r*ny, c[2]+r*nz]);
      normals.push([nx, ny, nz]);
    }
  }
  for (let lat = 0; lat < latSeg; lat++) {
    for (let lon = 0; lon < lonSeg; lon++) {
      const cur = lat * (lonSeg+1) + lon, nxt = cur + lonSeg + 1;
      if (lat !== 0) indices.push(cur, nxt, cur+1);
      if (lat !== latSeg-1) indices.push(cur+1, nxt, nxt+1);
    }
  }
  return { vertices, normals, indices };
}

// -- Mock mesh view generator for browser preview --
function generateMockMeshView(nodeId: string): MeshViewDto {
  // Generate a simple unit-cube wireframe + surface mesh for preview
  const size = 1.0;
  const divisions = 3;
  const step = size / divisions;

  const edgeVertices: [number, number, number][] = [];
  const surfaceVertices: [number, number, number][] = [];
  const surfaceNormals: [number, number, number][] = [];
  const surfaceIndices: number[] = [];

  // Grid edges along X
  for (let iy = 0; iy <= divisions; iy++) {
    for (let iz = 0; iz <= divisions; iz++) {
      edgeVertices.push([0, iy * step, iz * step]);
      edgeVertices.push([size, iy * step, iz * step]);
    }
  }
  // Grid edges along Y
  for (let ix = 0; ix <= divisions; ix++) {
    for (let iz = 0; iz <= divisions; iz++) {
      edgeVertices.push([ix * step, 0, iz * step]);
      edgeVertices.push([ix * step, size, iz * step]);
    }
  }
  // Grid edges along Z
  for (let ix = 0; ix <= divisions; ix++) {
    for (let iy = 0; iy <= divisions; iy++) {
      edgeVertices.push([ix * step, iy * step, 0]);
      edgeVertices.push([ix * step, iy * step, size]);
    }
  }

  // Surface: 6 faces of the cube, each subdivided
  const faces: { normal: [number, number, number]; corners: (ix: number, iy: number) => [number, number, number] }[] = [
    { normal: [0, 0, -1], corners: (ix, iy) => [ix * step, iy * step, 0] },
    { normal: [0, 0, 1], corners: (ix, iy) => [ix * step, iy * step, size] },
    { normal: [-1, 0, 0], corners: (iy, iz) => [0, iy * step, iz * step] },
    { normal: [1, 0, 0], corners: (iy, iz) => [size, iy * step, iz * step] },
    { normal: [0, -1, 0], corners: (ix, iz) => [ix * step, 0, iz * step] },
    { normal: [0, 1, 0], corners: (ix, iz) => [ix * step, size, iz * step] },
  ];

  for (const face of faces) {
    for (let i = 0; i < divisions; i++) {
      for (let j = 0; j < divisions; j++) {
        const base = surfaceVertices.length;
        const p00 = face.corners(i, j);
        const p10 = face.corners(i + 1, j);
        const p11 = face.corners(i + 1, j + 1);
        const p01 = face.corners(i, j + 1);
        surfaceVertices.push(p00, p10, p11, p01);
        surfaceNormals.push(face.normal, face.normal, face.normal, face.normal);
        surfaceIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  const totalTets = divisions * divisions * divisions * 5;
  const totalTris = divisions * divisions * 6 * 2;

  return {
    node_id: nodeId,
    mesh_id: "mock-mesh-" + Date.now(),
    name: "Mock Mesh",
    statistics: {
      total_nodes: (divisions + 1) ** 3,
      total_elements: totalTets + totalTris,
      element_counts: { Tri3: totalTris, Tet4: totalTets },
      min_quality: 0.45,
      max_quality: 0.98,
      avg_quality: 0.78,
    },
    edge_vertices: edgeVertices,
    surface_vertices: surfaceVertices,
    surface_normals: surfaceNormals,
    surface_indices: surfaceIndices,
  };
}

// -- Mock DE view generator for browser preview --
function generateMockDEView(nodeId: string): DesignExplorationViewDto {
  const params = [
    { name: "Force", value: 1000, lower_bound: 500, upper_bound: 2000 },
    { name: "Thickness", value: 0.1, lower_bound: 0.05, upper_bound: 0.2 },
  ];
  const outputNames = ["Displacement", "VonMises"];

  // Generate mock design points
  const designPoints = [];
  for (let i = 0; i < 10; i++) {
    const f = 500 + (1500 * i) / 9;
    const t = 0.05 + (0.15 * ((i * 7) % 10)) / 9;
    designPoints.push({
      id: `dp-${i}`,
      parameter_values: [f, t],
      output_values: [f * 0.001 / t, f * 10 / (t * t)],
      status: "Converged",
    });
  }

  return {
    node_id: nodeId,
    study_id: "mock-study-" + Date.now(),
    name: "Design Study",
    parameters: params,
    output_names: outputNames,
    doe_algorithm: "LatinHypercube { samples: 10 }",
    design_points: designPoints,
    response_surface: undefined,
    optimization_result: undefined,
  };
}

// -- Mock result view generator for browser preview --
function generateMockResultView(nodeId: string): ResultViewDto {
  // Generate a colored cube surface showing mock displacement contour
  const size = 1.0;
  const surfaceVertices: [number, number, number][] = [];
  const surfaceNormals: [number, number, number][] = [];
  const surfaceIndices: number[] = [];
  const vertexColors: [number, number, number][] = [];

  const faces: { normal: [number, number, number]; corners: [number, number, number][] }[] = [
    { normal: [0, 0, -1], corners: [[0,0,0],[size,0,0],[size,size,0],[0,size,0]] },
    { normal: [0, 0, 1], corners: [[0,0,size],[0,size,size],[size,size,size],[size,0,size]] },
    { normal: [-1, 0, 0], corners: [[0,0,0],[0,size,0],[0,size,size],[0,0,size]] },
    { normal: [1, 0, 0], corners: [[size,0,0],[size,0,size],[size,size,size],[size,size,0]] },
    { normal: [0, -1, 0], corners: [[0,0,0],[0,0,size],[size,0,size],[size,0,0]] },
    { normal: [0, 1, 0], corners: [[0,size,0],[size,size,0],[size,size,size],[0,size,size]] },
  ];

  for (const face of faces) {
    const base = surfaceVertices.length;
    for (const c of face.corners) {
      surfaceVertices.push(c);
      surfaceNormals.push(face.normal);
      // Color by Z position: blue (bottom) → red (top)
      const t = c[2] / size;
      const r = t < 0.5 ? 0 : (t - 0.5) * 4;
      const g = t < 0.25 ? t * 4 : t > 0.75 ? (1 - t) * 4 : 1;
      const b = t < 0.5 ? 1 - t * 2 : 0;
      vertexColors.push([Math.min(1, r), Math.min(1, g), Math.min(1, b)]);
    }
    surfaceIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return {
    node_id: nodeId,
    result_id: "mock-result-" + Date.now(),
    name: "Linear Static Results",
    field_name: "Displacement",
    field_summaries: [
      { field_name: "Displacement", location: "Node", min: 0.0, max: 0.00234, mean: 0.00112 },
      { field_name: "VonMises", location: "Element", min: 1205.3, max: 45678.2, mean: 18432.1 },
    ],
    surface_vertices: surfaceVertices,
    surface_normals: surfaceNormals,
    surface_indices: surfaceIndices,
    vertex_colors: vertexColors,
    color_range: [0.0, 0.00234],
  };
}

// Helper: generate cells for a given system kind (browser mock mode)
function getCellsForKind(kind: string): Array<{ id: string; kind: CellKind; display_name: string; state: NodeState }> {
  const mk = (name: string, cellKind: CellKind) => ({ id: `cell-${Date.now()}-${name}`, kind: cellKind, display_name: name, state: "NotConfigured" as NodeState });
  if (kind === "Geometry") return [mk("Geometry", "Geometry")];
  if (kind === "Mesh") return [mk("Mesh", "Model")];
  if (kind === "EngineeringData") return [mk("Engineering Data", "EngineeringData")];
  if (kind.includes("Structural") || kind.includes("Thermal") || kind === "Modal" || kind === "FluidFlow" || kind === "Magnetostatic" || kind === "Electrostatic")
    return [mk("Engineering Data", "EngineeringData"), mk("Geometry", "Geometry"), mk("Model", "Model"), mk("Setup", "Setup"), mk("Solution", "Solution"), mk("Results", "Results")];
  if (kind === "ChipPackageAnalysis")
    return [mk("Engineering Data", "EngineeringData"), mk("Geometry", "Geometry"), mk("Setup", "Setup"), mk("Solution", "Solution")];
  return [mk("Setup", "Setup"), mk("Results", "Results")];
}

// Simple store using module-level state and React hooks.
let _schematic: ProjectSchematicDto | null = null;
let _toolbox: ToolboxEntry[] = [];
let _geometryView: GeometryViewDto | null = null;
let _meshView: MeshViewDto | null = null;
let _resultView: ResultViewDto | null = null;
let _deView: DesignExplorationViewDto | null = null;
let _chipResult: ChipPackageResultDto | null = null;
let _listeners: Array<() => void> = [];

function notify() {
  _listeners.forEach((fn) => fn());
}

export function useProjectStore() {
  const [, setTick] = useState(0);

  // Subscribe to updates
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);
  if (!_listeners.includes(forceUpdate)) {
    _listeners.push(forceUpdate);
  }

  const newProject = useCallback(async (name: string) => {
    try {
      _schematic = await safeInvoke<ProjectSchematicDto>("new_project", { name });
      _toolbox = await safeInvoke<ToolboxEntry[]>("get_toolbox");
      _geometryView = null;
      _projectPath = null;
      notify();
    } catch (e) {
      addToast(`Failed to create project: ${e}`, "error");
    }
  }, []);

  const openProject = useCallback(async (path: string) => {
    try {
      _schematic = await safeInvoke<ProjectSchematicDto>("open_project", { path });
      _geometryView = null;
      _projectPath = path;
      notify();
      addToast("Project opened", "success");
    } catch (e) {
      addToast(`Failed to open project: ${e}`, "error");
    }
  }, []);

  const saveProject = useCallback(async (path?: string) => {
    try {
      _isSaving = true;
      notify();
      const savePath = path ?? _projectPath ?? null;
      await safeInvoke<OperationResult>("save_project", { path: savePath });
      if (path) _projectPath = path;
      _isSaving = false;
      notify();
      addToast("Project saved", "success");
    } catch (e) {
      _isSaving = false;
      notify();
      addToast(`Save failed: ${e}`, "error");
    }
  }, []);

  // Save with file dialog (for toolbar)
  const handleSave = useCallback(async () => {
    if (!isTauri) {
      addToast("Save not available in preview mode", "warning");
      return;
    }
    await saveProject();
  }, [saveProject]);

  // Open with file dialog (for toolbar)
  const handleOpen = useCallback(async () => {
    if (!isTauri) {
      addToast("Open not available in preview mode", "warning");
      return;
    }
    // In Tauri, prompt for path (dialog plugin needed, fallback to prompt)
    const path = window.prompt("Enter project file path (.osw):");
    if (path) await openProject(path);
  }, [openProject]);

  const addSystem = useCallback(
    async (kind: SystemKind, position: [number, number]) => {
      try {
        if (!isTauri) {
          // Browser mock: add to schematic directly
          if (_schematic) {
            const id = `node-${Date.now()}`;
            const entry = _toolbox.find((e) => e.kind === kind);
            const cells = getCellsForKind(kind);
            _schematic = {
              ..._schematic,
              nodes: [
                ..._schematic.nodes,
                {
                  id,
                  kind,
                  category: (entry?.category ?? "Analysis") as SystemCategory,
                  name: entry?.display_name ?? kind,
                  display_name: entry?.display_name ?? kind,
                  state: "NotConfigured" as NodeState,
                  cells,
                  position,
                },
              ],
            };
            notify();
            addToast(`Added ${entry?.display_name ?? kind}`, "success");
          }
          return;
        }
        await safeInvoke<SystemNodeDto>("add_system", { kind, position });
        _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
        notify();
      } catch (e) {
        addToast(`Failed to add system: ${e}`, "error");
      }
    },
    []
  );

  const removeSystem = useCallback(async (id: string) => {
    try {
      if (!isTauri) {
        if (_schematic) {
          _schematic = {
            ..._schematic,
            nodes: _schematic.nodes.filter((n) => n.id !== id),
            connections: _schematic.connections.filter((c) => c.source !== id && c.target !== id),
          };
          notify();
          addToast("System removed", "success");
        }
        return;
      }
      await safeInvoke<OperationResult>("remove_system", { id });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      if (_geometryView?.node_id === id) _geometryView = null;
      notify();
    } catch (e) {
      addToast(`Failed to remove system: ${e}`, "error");
    }
  }, []);

  const connectSystems = useCallback(
    async (source: string, target: string, kind: ConnectionKind) => {
      try {
        if (!isTauri) {
          if (_schematic) {
            _schematic = {
              ..._schematic,
              connections: [
                ..._schematic.connections,
                { id: `conn-${Date.now()}`, source, target, kind },
              ],
            };
            notify();
            addToast("Connection created", "success");
          }
          return;
        }
        await safeInvoke<OperationResult>("connect_systems", { source, target, kind });
        _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
        notify();
      } catch (e) {
        addToast(`Failed to connect: ${e}`, "error");
      }
    },
    []
  );

  const updateNodePosition = useCallback((nodeId: string, position: [number, number]) => {
    if (_schematic) {
      _schematic = {
        ..._schematic,
        nodes: _schematic.nodes.map((n) => n.id === nodeId ? { ...n, position } : n),
      };
      notify();
    }
  }, []);

  // -- Geometry operations --

  const openGeometryViewer = useCallback(async (nodeId: string) => {
    if (!isTauri) {
      // Browser preview: open with mock empty geometry
      if (!_geometryView || _geometryView.node_id !== nodeId) {
        _geometryView = {
          node_id: nodeId,
          model: { id: "mock-geo-model-1", name: "Geometry", bodies: [] },
          meshes: [],
        };
      }
      notify();
      return;
    }
    try {
      _geometryView = await safeInvoke<GeometryViewDto>("get_geometry_view", {
        nodeId,
      });
    } catch {
      await safeInvoke<GeometryModelDto>("create_geometry", { nodeId });
      _geometryView = await safeInvoke<GeometryViewDto>("get_geometry_view", {
        nodeId,
      });
    }
    notify();
  }, []);

  const closeGeometryViewer = useCallback(() => {
    _geometryView = null;
    notify();
  }, []);

  const addPrimitive = useCallback(
    async (
      nodeId: string,
      kind: string,
      name: string,
      params: Record<string, unknown>
    ) => {
      if (!isTauri) {
        // Browser preview: generate mock tessellation
        const mesh = generateMockMesh(kind, params);
        const bodyId = "mock-body-" + Date.now();
        const body: BodyDto = {
          id: bodyId,
          name,
          primitive_kind: kind,
          bounding_box: [[0, 0, 0], [1, 1, 1]],
        };
        if (_geometryView) {
          _geometryView = {
            ..._geometryView,
            model: {
              ..._geometryView.model,
              bodies: [..._geometryView.model.bodies, body],
            },
            meshes: [..._geometryView.meshes, mesh],
          };
        }
        notify();
        return;
      }
      await safeInvoke<BodyDto>("add_primitive", {
        nodeId,
        kind,
        name,
        params,
      });
      _geometryView = await safeInvoke<GeometryViewDto>("get_geometry_view", {
        nodeId,
      });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      notify();
    },
    []
  );

  const removeBody = useCallback(
    async (nodeId: string, bodyId: string) => {
      if (!isTauri) {
        if (_geometryView) {
          const idx = _geometryView.model.bodies.findIndex((b) => b.id === bodyId);
          if (idx >= 0) {
            _geometryView = {
              ..._geometryView,
              model: {
                ..._geometryView.model,
                bodies: _geometryView.model.bodies.filter((b) => b.id !== bodyId),
              },
              meshes: _geometryView.meshes.filter((_, i) => i !== idx),
            };
          }
        }
        notify();
        return;
      }
      await safeInvoke<OperationResult>("remove_body", { nodeId, bodyId });
      _geometryView = await safeInvoke<GeometryViewDto>("get_geometry_view", {
        nodeId,
      });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      notify();
    },
    []
  );

  const importGeometry = useCallback(
    async (nodeId: string, filePath: string) => {
      _geometryView = await safeInvoke<GeometryViewDto>("import_geometry", {
        nodeId,
        filePath,
      });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      notify();
    },
    []
  );

  // -- Mesh operations --

  const openMeshViewer = useCallback(async (nodeId: string) => {
    if (!isTauri) {
      // Browser preview: generate mock mesh view
      _meshView = generateMockMeshView(nodeId);
      notify();
      return;
    }
    try {
      _meshView = await safeInvoke<MeshViewDto>("get_mesh_view", { nodeId });
    } catch {
      await safeInvoke("create_mesh", { nodeId });
      _meshView = await safeInvoke<MeshViewDto>("get_mesh_view", { nodeId });
    }
    notify();
  }, []);

  const closeMeshViewer = useCallback(() => {
    _meshView = null;
    notify();
  }, []);

  const generateMesh = useCallback(
    async (nodeId: string, params: Record<string, unknown>) => {
      if (!isTauri) {
        _meshView = generateMockMeshView(nodeId);
        notify();
        return;
      }
      _meshView = await safeInvoke<MeshViewDto>("generate_mesh", {
        nodeId,
        params,
      });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      notify();
    },
    []
  );

  // -- Result operations --

  const openResultViewer = useCallback(async (nodeId: string, fieldName?: string) => {
    if (!isTauri) {
      _resultView = generateMockResultView(nodeId);
      notify();
      return;
    }
    try {
      _resultView = await safeInvoke<ResultViewDto>("get_result_view", {
        nodeId,
        fieldName: fieldName ?? "Displacement",
      });
    } catch {
      // No result yet — show empty view
      _resultView = generateMockResultView(nodeId);
    }
    notify();
  }, []);

  const closeResultViewer = useCallback(() => {
    _resultView = null;
    notify();
  }, []);

  const runSolver = useCallback(
    async (nodeId: string, params: Record<string, unknown>) => {
      if (!isTauri) {
        _resultView = generateMockResultView(nodeId);
        notify();
        return;
      }
      _resultView = await safeInvoke<ResultViewDto>("run_solver", {
        nodeId,
        params,
      });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      notify();
    },
    []
  );

  const changeResultField = useCallback(
    async (nodeId: string, fieldName: string) => {
      if (!isTauri) {
        // Mock: just change the field name in the existing view
        if (_resultView) {
          _resultView = { ..._resultView, field_name: fieldName };
        }
        notify();
        return;
      }
      _resultView = await safeInvoke<ResultViewDto>("get_result_view", {
        nodeId,
        fieldName,
      });
      notify();
    },
    []
  );

  // -- Design Exploration operations --

  const openDEViewer = useCallback(async (nodeId: string) => {
    if (!isTauri) {
      _deView = generateMockDEView(nodeId);
      notify();
      return;
    }
    try {
      _deView = await safeInvoke<DesignExplorationViewDto>("get_design_exploration_view", { nodeId });
    } catch {
      _deView = generateMockDEView(nodeId);
    }
    notify();
  }, []);

  const closeDEViewer = useCallback(() => {
    _deView = null;
    notify();
  }, []);

  const runDoe = useCallback(async (nodeId: string) => {
    if (!isTauri) {
      _deView = generateMockDEView(nodeId);
      notify();
      return;
    }
    _deView = await safeInvoke<DesignExplorationViewDto>("run_doe", { nodeId });
    notify();
  }, []);

  const fitSurface = useCallback(async (nodeId: string, outputIdx: number) => {
    if (!isTauri) {
      if (_deView) {
        _deView = { ..._deView, response_surface: { r_squared: 0.95, grid: [], param_names: _deView.parameters.map(p => p.name) } };
      }
      notify();
      return;
    }
    _deView = await safeInvoke<DesignExplorationViewDto>("fit_response_surface", { nodeId, outputIdx });
    notify();
  }, []);

  const runOptimization = useCallback(async (nodeId: string, outputIdx: number, minimize: boolean) => {
    if (!isTauri) {
      if (_deView) {
        _deView = {
          ..._deView,
          optimization_result: {
            optimal_params: _deView.parameters.map(p => (p.lower_bound + p.upper_bound) / 2),
            param_names: _deView.parameters.map(p => p.name),
            optimal_value: 0.42,
            history: [2.1, 1.5, 0.9, 0.6, 0.42],
          },
        };
      }
      notify();
      return;
    }
    _deView = await safeInvoke<DesignExplorationViewDto>("run_optimization", { nodeId, outputIdx, minimize });
    notify();
  }, []);

  // Browser preview mode: populate with mock data
  const initMockData = useCallback(() => {
    const geoId = "mock-geo-id-1234";
    _schematic = {
      project_id: "mock-project-0001",
      project_name: "Demo Project (Preview)",
      nodes: [
        {
          id: "node-geo-1",
          kind: "Geometry",
          category: "Component",
          name: "Geometry",
          display_name: "Geometry",
          state: "NotConfigured",
          cells: [
            { id: "cell-geo-1", kind: "Geometry", display_name: "Geometry", state: "NotConfigured" },
          ],
          position: [100, 80],
          geometry_id: geoId,
        },
        {
          id: "node-struct-1",
          kind: "StaticStructural",
          category: "Analysis",
          name: "Static Structural",
          display_name: "Static Structural",
          state: "NotConfigured",
          cells: [
            { id: "cell-ed-1", kind: "EngineeringData", display_name: "Engineering Data", state: "NotConfigured" },
            { id: "cell-geo-2", kind: "Geometry", display_name: "Geometry", state: "NotConfigured" },
            { id: "cell-mod-1", kind: "Model", display_name: "Model", state: "NotConfigured" },
            { id: "cell-set-1", kind: "Setup", display_name: "Setup", state: "NotConfigured" },
            { id: "cell-sol-1", kind: "Solution", display_name: "Solution", state: "NotConfigured" },
            { id: "cell-res-1", kind: "Results", display_name: "Results", state: "NotConfigured" },
          ],
          position: [380, 80],
        },
        {
          id: "node-thermal-1",
          kind: "SteadyThermal",
          category: "Analysis",
          name: "Steady-State Thermal",
          display_name: "Steady-State Thermal",
          state: "NotConfigured",
          cells: [
            { id: "cell-ed-2", kind: "EngineeringData", display_name: "Engineering Data", state: "NotConfigured" },
            { id: "cell-geo-3", kind: "Geometry", display_name: "Geometry", state: "NotConfigured" },
            { id: "cell-mod-2", kind: "Model", display_name: "Model", state: "NotConfigured" },
            { id: "cell-set-2", kind: "Setup", display_name: "Setup", state: "NotConfigured" },
            { id: "cell-sol-2", kind: "Solution", display_name: "Solution", state: "NotConfigured" },
            { id: "cell-res-2", kind: "Results", display_name: "Results", state: "NotConfigured" },
          ],
          position: [380, 360],
        },
        {
          id: "node-mesh-1",
          kind: "Mesh",
          category: "Component",
          name: "Mesh",
          display_name: "Mesh",
          state: "NotConfigured",
          cells: [
            { id: "cell-mesh-1", kind: "Mesh", display_name: "Mesh", state: "NotConfigured" },
          ],
          position: [100, 360],
          mesh_id: "mock-mesh-id-1234",
        },
        {
          id: "node-doe-1",
          kind: "DesignOfExperiments" as SystemKind,
          category: "DesignExploration" as SystemCategory,
          name: "DOE Study",
          display_name: "Design of Experiments",
          state: "NotConfigured" as NodeState,
          cells: [
            { id: "cell-doe-1", kind: "DesignOfExperiments" as CellKind, display_name: "Design of Experiments", state: "NotConfigured" as NodeState },
          ],
          position: [380, 500] as [number, number],
          study_id: "mock-study-id",
        },
        {
          id: "node-chip-1",
          kind: "ChipPackageAnalysis" as SystemKind,
          category: "Analysis" as SystemCategory,
          name: "Chip Package (DBA)",
          display_name: "Chip Package (DBA)",
          state: "NotConfigured" as NodeState,
          cells: [
            { id: "cell-chip-ed", kind: "EngineeringData" as CellKind, display_name: "Engineering Data", state: "NotConfigured" as NodeState },
            { id: "cell-chip-geo", kind: "Geometry" as CellKind, display_name: "Geometry", state: "NotConfigured" as NodeState },
            { id: "cell-chip-setup", kind: "Setup" as CellKind, display_name: "Setup", state: "NotConfigured" as NodeState },
            { id: "cell-chip-sol", kind: "Solution" as CellKind, display_name: "Solution", state: "NotConfigured" as NodeState },
          ],
          position: [560, 500] as [number, number],
        },
      ],
      connections: [
        { id: "conn-1", source: "node-geo-1", target: "node-struct-1", kind: "GeometryShare" },
        { id: "conn-2", source: "node-geo-1", target: "node-thermal-1", kind: "GeometryShare" },
        { id: "conn-3", source: "node-geo-1", target: "node-mesh-1", kind: "GeometryShare" },
        { id: "conn-4", source: "node-struct-1", target: "node-doe-1", kind: "ParameterLink" },
      ],
    };
    _toolbox = [
      { kind: "StaticStructural", display_name: "Static Structural", category: "Analysis" },
      { kind: "Modal", display_name: "Modal", category: "Analysis" },
      { kind: "SteadyThermal", display_name: "Steady-State Thermal", category: "Analysis" },
      { kind: "FluidFlow", display_name: "Fluid Flow", category: "Analysis" },
      { kind: "Magnetostatic", display_name: "Magnetostatic", category: "Analysis" },
      { kind: "Geometry", display_name: "Geometry", category: "Component" },
      { kind: "EngineeringData", display_name: "Engineering Data", category: "Component" },
      { kind: "Mesh", display_name: "Mesh", category: "Component" },
      { kind: "ChipPackageAnalysis", display_name: "Chip Package (DBA)", category: "Analysis" },
      { kind: "DesignOfExperiments", display_name: "Design of Experiments", category: "DesignExploration" },
      { kind: "Optimization", display_name: "Optimization", category: "DesignExploration" },
    ];
    notify();
  }, []);

  const runThermalSolver = useCallback(
    async (nodeId: string, params: Record<string, unknown>) => {
      if (!isTauri) {
        // Browser mock: generate thermal-like result
        const mock = generateMockResultView(nodeId);
        _resultView = {
          ...mock,
          name: "Thermal Results",
          field_name: "Temperature",
          field_summaries: [
            { field_name: "Temperature", location: "Node", min: 20.0, max: 100.0, mean: 55.3 },
            { field_name: "HeatFlux", location: "Element", min: 0, max: 5e4, mean: 2.1e4 },
          ],
        };
        notify();
        return _resultView;
      }
      _resultView = await safeInvoke<ResultViewDto>("run_thermal_solver", { nodeId, params });
      _schematic = await safeInvoke<ProjectSchematicDto>("get_schematic");
      notify();
      return _resultView;
    },
    []
  );

  const runTestBedSimulation = useCallback(
    async (
      nodeId: string,
      config: import("../components/viewer/TestBedConfig").TestBedConfiguration,
      analysisType: "structural" | "thermal"
    ): Promise<{ resultView: ResultViewDto; recordId: string }> => {
      const startTime = Date.now();
      const nodeName = _schematic?.nodes.find((n) => n.id === nodeId)?.name ?? "Unknown";

      // Translate TestBedConfig → solver params
      const solverParams: Record<string, unknown> = {};
      if (analysisType === "structural") {
        solverParams.youngs_modulus = 200e9;
        solverParams.poisson_ratio = 0.3;
        solverParams.force_y = -(config.loadScenario.params.force ?? 1000);
        if (config.loadScenario.params.pressure) {
          solverParams.pressure = config.loadScenario.params.pressure;
        }
        solverParams.bc_type = config.environment.mounting;
      } else {
        solverParams.conductivity = 50;
        solverParams.fixed_temperature_hot = config.loadScenario.params.T_max ?? config.loadScenario.params.heat_flux ? undefined : 100;
        solverParams.fixed_temperature_cold = config.environment.ambientTemp;
        solverParams.heat_flux = config.loadScenario.params.heat_flux ?? 0;
        solverParams.convection_h = config.environment.convection === "Forced" ? 50 : 10;
        solverParams.convection_t_inf = config.environment.ambientTemp;
      }

      let resultView: ResultViewDto;
      try {
        if (analysisType === "structural") {
          await runSolver(nodeId, solverParams);
        } else {
          await runThermalSolver(nodeId, solverParams);
        }
        resultView = _resultView!;
      } catch (e) {
        addToast(`Simulation failed: ${e}`, "error");
        throw e;
      }

      const duration = Date.now() - startTime;

      // Record the simulation
      const { recordSimulation } = await import("./simulationStore");
      const recordId = recordSimulation({
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        solver_type: analysisType,
        node_id: nodeId,
        node_name: nodeName,
        test_bed_config: config,
        solver_params: solverParams,
        material: analysisType === "structural" ? "Steel" : "Steel",
        mesh_info: _meshView ? { total_nodes: _meshView.statistics.total_nodes, total_elements: _meshView.statistics.total_elements } : undefined,
        field_summaries: resultView.field_summaries,
        result_fields: resultView.field_summaries.map((f) => f.field_name),
      });

      addToast(`Simulation recorded (${(duration / 1000).toFixed(1)}s)`, "success");
      return { resultView, recordId };
    },
    [runSolver]
  );

  const runSingleLibraryTest = useCallback(
    async (
      testId: string,
      paramOverrides?: Record<string, number>,
      dbaOverride?: string
    ): Promise<string> => {
      const { getTestById } = await import("../data/chipTestLibrary");
      const {
        solveThermal, solveShear, solveCTEMismatch,
        runFullComparison, solveTransientThermal, runParameterSweep,
        DEFAULT_GEOMETRY,
      } = await import("../utils/chipCalculations");
      const { recordSimulation } = await import("./simulationStore");
      type PassCriterionTemplate = import("../data/chipTestLibrary").PassCriterionTemplate;

      const test = getTestById(testId);
      if (!test) throw new Error(`Test ${testId} not found`);

      const startTime = Date.now();
      const params = { ...test.defaultParams, ...paramOverrides };
      const geo = { ...DEFAULT_GEOMETRY, ...test.geometryOverrides };
      const dbaMat = dbaOverride ?? test.recommendedDBA ?? "Epoxy DBA";

      // Build solver inputs from test params
      const heatFlux = params.heat_flux ?? (params.power_dissipation ? params.power_dissipation / ((geo.die_w * geo.die_h) * 1e-6) : 50000);
      const bottomTemp = params.bottom_temp ?? params.ambient_temp ?? test.defaultEnvironment.ambientTemp;
      const thermalBCs = { heatFlux, bottomTemp };
      const shearBCs = { force: params.force ?? params.pull_force ?? params.shear_force ?? 10, direction: "X" as const };
      const _deltaT = params.delta_T ?? (params.T_max && params.T_min ? params.T_max - params.T_min : 100);
      void _deltaT; // used conceptually for CTE analysis context

      // Execute based on solver type
      const fieldSummaries: Array<{ field_name: string; location: string; min: number; max: number; mean: number }> = [];

      if (test.solverType === "thermal" || test.solverType === "cte" || test.solverType === "combined") {
        const thermal = solveThermal(geo, thermalBCs, dbaMat);
        fieldSummaries.push(
          { field_name: "T_die_top", location: "Node", min: thermal.T_bottom, max: thermal.T_die_top, mean: (thermal.T_bottom + thermal.T_die_top) / 2 },
          { field_name: "R_jc", location: "Node", min: thermal.R_jc, max: thermal.R_jc, mean: thermal.R_jc },
        );
        if (test.solverType === "cte" || test.solverType === "combined") {
          const cte = solveCTEMismatch(geo, thermal, dbaMat);
          fieldSummaries.push(
            { field_name: "sigma_thermal", location: "Element", min: 0, max: cte.sigma_thermal, mean: cte.sigma_thermal * 0.6 },
            { field_name: "warpage", location: "Node", min: 0, max: cte.warpage, mean: cte.warpage * 0.5 },
          );
        }
      }
      if (test.solverType === "shear" || test.solverType === "combined") {
        const shear = solveShear(geo, shearBCs, dbaMat);
        fieldSummaries.push(
          { field_name: "tau_max", location: "Element", min: 0, max: shear.tau_max, mean: shear.tau_avg },
          { field_name: "safetyFactor", location: "Element", min: shear.safetyFactor, max: shear.safetyFactor, mean: shear.safetyFactor },
        );
      }
      if (test.solverType === "comparison") {
        const comparison = runFullComparison(geo, thermalBCs, shearBCs);
        const best = comparison[0];
        fieldSummaries.push(
          { field_name: "T_die_top", location: "Node", min: 0, max: best.T_junction, mean: best.T_junction * 0.8 },
          { field_name: "R_jc", location: "Node", min: best.R_jc, max: best.R_jc, mean: best.R_jc },
          { field_name: "safetyFactor", location: "Element", min: best.safetyFactor, max: best.safetyFactor, mean: best.safetyFactor },
        );
      }
      if (test.solverType === "transient") {
        const endTime = params.measurement_time ?? 300;
        const dt = params.dt ?? 1.0;
        const transient = solveTransientThermal(geo, { heatFlux, bottomTemp }, dbaMat, { endTime, dt });
        const maxT = Math.max(...transient.steps.map((s: { T_die: number }) => s.T_die));
        fieldSummaries.push(
          { field_name: "T_die_top", location: "Node", min: bottomTemp, max: maxT, mean: (bottomTemp + maxT) / 2 },
          { field_name: "R_jc", location: "Node", min: transient.steadyState.R_jc, max: transient.steadyState.R_jc, mean: transient.steadyState.R_jc },
        );
      }
      if (test.solverType === "sweep") {
        const sweepParam = params.dba_t_min !== undefined ? "dba_t" : "heat_flux";
        const sweepMin = params.dba_t_min ?? heatFlux * 0.1;
        const sweepMax = params.dba_t_max ?? (params.max_power ? params.max_power / ((geo.die_w * geo.die_h) * 1e-6) : heatFlux * 2);
        const steps = params.sweep_steps ?? params.sweep_points ?? 10;
        const { linspace } = await import("../utils/chipCalculations");
        const sweepValues = linspace(sweepMin, sweepMax, steps);
        const sweep = runParameterSweep(geo, thermalBCs, shearBCs, dbaMat, sweepParam as "dba_t", sweepValues);
        const lastPt = sweep[sweep.length - 1];
        fieldSummaries.push(
          { field_name: "T_die_top", location: "Node", min: sweep[0].T_junction, max: lastPt.T_junction, mean: (sweep[0].T_junction + lastPt.T_junction) / 2 },
          { field_name: "safetyFactor", location: "Element", min: Math.min(...sweep.map(s => s.safetyFactor)), max: Math.max(...sweep.map(s => s.safetyFactor)), mean: lastPt.safetyFactor },
        );
      }

      const duration = Date.now() - startTime;

      // Evaluate pass criteria
      const evaluatedCriteria = test.passCriteria.map((c: PassCriterionTemplate) => {
        const summary = fieldSummaries.find((f) => f.field_name === c.field);
        const actual = summary ? (c.operator === "lt" || c.operator === "lte" ? summary.max : summary.min) : 0;
        const passed =
          c.operator === "lt" ? actual < c.threshold :
          c.operator === "lte" ? actual <= c.threshold :
          c.operator === "gt" ? actual > c.threshold :
          actual >= c.threshold;
        return { field: c.field, operator: c.operator, threshold: c.threshold, actual, passed };
      });

      const recordId = recordSimulation({
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        solver_type: test.solverType === "shear" ? "structural" : "thermal",
        node_id: "library-" + test.id,
        node_name: test.name,
        solver_params: params,
        material: dbaMat,
        field_summaries: fieldSummaries,
        result_fields: fieldSummaries.map((f) => f.field_name),
        pass_criteria: evaluatedCriteria,
        overall_pass: evaluatedCriteria.every((c) => c.passed),
      });

      addToast(
        `${test.name}: ${evaluatedCriteria.every((c) => c.passed) ? "PASSED" : "FAILED"} (${duration}ms)`,
        evaluatedCriteria.every((c) => c.passed) ? "success" : "warning"
      );
      return recordId;
    },
    []
  );

  const runTestSuite = useCallback(
    async (scenarioId: string): Promise<string[]> => {
      const { getScenarioById } = await import("../data/sampleScenarios");
      const scenario = getScenarioById(scenarioId);
      if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

      addToast(`Running suite: ${scenario.name} (${scenario.testIds.length} tests)`, "success");
      const recordIds: string[] = [];

      for (const testId of scenario.testIds) {
        try {
          const overrides = scenario.paramOverrides?.[testId];
          const recordId = await runSingleLibraryTest(testId, overrides, scenario.dbaOverride);
          recordIds.push(recordId);
        } catch (e) {
          addToast(`Test ${testId} failed: ${e}`, "error");
        }
      }

      addToast(`Suite complete: ${recordIds.length}/${scenario.testIds.length} tests run`, "success");
      return recordIds;
    },
    [runSingleLibraryTest]
  );

  return {
    schematic: _schematic,
    toolbox: _toolbox,
    geometryView: _geometryView,
    meshView: _meshView,
    resultView: _resultView,
    deView: _deView,
    toasts: _toasts,
    removeToast,
    isSaving: _isSaving,
    handleSave,
    handleOpen,
    updateNodePosition,
    newProject,
    openProject,
    saveProject,
    addSystem,
    removeSystem,
    connectSystems,
    openGeometryViewer,
    closeGeometryViewer,
    addPrimitive,
    removeBody,
    importGeometry,
    openMeshViewer,
    closeMeshViewer,
    generateMesh,
    openResultViewer,
    closeResultViewer,
    runSolver,
    runThermalSolver,
    runTestBedSimulation,
    runSingleLibraryTest,
    runTestSuite,
    changeResultField,
    openDEViewer,
    closeDEViewer,
    runDoe,
    fitSurface,
    runOptimization,
    runPareto: useCallback(async (nodeId: string) => {
      if (!isTauri) {
        if (_deView) {
          _deView = { ..._deView, pareto_indices: [0, 2, 5, 7, 9] };
        }
        notify();
        return;
      }
      _deView = await safeInvoke<DesignExplorationViewDto>("run_pareto", { nodeId });
      notify();
    }, []),
    runSixSigma: useCallback(async (nodeId: string, outputIdx: number) => {
      if (!isTauri) {
        if (_deView) {
          _deView = {
            ..._deView,
            six_sigma: {
              mean: 8.5, std_dev: 2.1, cpk: 1.35, sample_count: 1000,
              histogram_bins: Array.from({ length: 20 }, (_, i) => 2 + i * 0.7),
              histogram_counts: [5, 12, 28, 55, 89, 120, 145, 155, 148, 125, 98, 72, 48, 30, 18, 12, 8, 5, 3, 2],
            },
          };
        }
        notify();
        return;
      }
      _deView = await safeInvoke<DesignExplorationViewDto>("run_six_sigma", { nodeId, outputIdx });
      notify();
    }, []),
    initMockData,
    // Chip Package
    chipResult: _chipResult,
    openChipPackageViewer: useCallback(async (nodeId: string) => {
      if (!isTauri) {
        _chipResult = generateMockChipPackageResult(nodeId, "thermal");
        notify();
        return;
      }
      _chipResult = await safeInvoke<ChipPackageResultDto>("run_chip_package_analysis", {
        nodeId, params: { analysis_type: "thermal", dba_material: "Epoxy DBA" },
      });
      notify();
    }, []),
    closeChipPackageViewer: useCallback(() => {
      _chipResult = null;
      notify();
    }, []),
    runChipPackageAnalysis: useCallback(async (nodeId: string, params: Record<string, unknown>) => {
      if (!isTauri) {
        _chipResult = generateMockChipPackageResult(nodeId, (params.analysis_type as string) || "thermal");
        notify();
        return;
      }
      _chipResult = await safeInvoke<ChipPackageResultDto>("run_chip_package_analysis", { nodeId, params });
      notify();
    }, []),
    runDbaComparison: useCallback(async (nodeId: string, params: Record<string, unknown>): Promise<DbaComparisonDto> => {
      if (!isTauri) {
        return generateMockDbaComparison(nodeId);
      }
      const result = await safeInvoke<DbaComparisonDto>("run_dba_comparison", { nodeId, params });
      return result!;
    }, []),
  };
}

function generateMockChipPackageResult(nodeId: string, analysisType: string): ChipPackageResultDto {
  // Generate a 3-layer colored box for chip package visualization
  const size = 10; // mm
  const layers = [
    { name: "Leadframe", z0: 0, z1: 0.25, w: 10, h: 10, color: [0.8, 0.6, 0.3] }, // copper
    { name: "DBA", z0: 0.25, z1: 0.275, w: 4.2, h: 4.2, color: [0.4, 0.8, 0.5] }, // green
    { name: "Die", z0: 0.275, z1: 0.575, w: 4.1, h: 4.1, color: [0.4, 0.5, 0.8] }, // blue
  ];

  const vertices: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];
  const vertexColors: [number, number, number][] = [];

  for (const layer of layers) {
    const ox = (size - layer.w) / 2;
    const oy = (size - layer.h) / 2;
    const x0 = ox, x1 = ox + layer.w;
    const y0 = oy, y1 = oy + layer.h;
    const { z0, z1 } = layer;

    // 8 corners of the box
    const corners: [number, number, number][] = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];

    // 6 faces (each 2 triangles)
    const faces: [number[], [number, number, number]][] = [
      [[0,1,2,3], [0,0,-1]], [[4,7,6,5], [0,0,1]],
      [[0,3,7,4], [-1,0,0]], [[1,5,6,2], [1,0,0]],
      [[0,4,5,1], [0,-1,0]], [[3,2,6,7], [0,1,0]],
    ];

    for (const [quad, normal] of faces) {
      const base = vertices.length;
      for (const ci of quad) {
        vertices.push(corners[ci]);
        normals.push(normal);
        // Color based on temperature/stress gradient (Z position)
        const t = (corners[ci][2] - 0) / 0.575;
        if (analysisType === "thermal") {
          // Blue (cold) → Red (hot) with Z
          const r = t; const g = Math.max(0, 1 - 2 * Math.abs(t - 0.5)); const b = 1 - t;
          vertexColors.push([Math.min(1, r), Math.min(1, g), Math.min(1, b)]);
        } else {
          // Green (low stress) → Red (high stress)
          const r = t * 0.8; const g = (1 - t) * 0.8; const b = 0.2;
          vertexColors.push([r, g, b]);
        }
      }
      indices.push(base, base+1, base+2, base, base+2, base+3);
    }
  }

  const fieldName = analysisType === "thermal" ? "Temperature" : "VonMises";
  const minVal = analysisType === "thermal" ? 25.0 : 0.0;
  const maxVal = analysisType === "thermal" ? 85.3 : 1.2e6;

  return {
    node_id: nodeId,
    analysis_type: analysisType,
    dba_material: "Epoxy DBA",
    result_view: {
      node_id: nodeId,
      result_id: "mock-chip-result",
      name: analysisType === "thermal" ? "Thermal Results" : "Shear Results",
      field_name: fieldName,
      field_summaries: [
        { field_name: fieldName, min: minVal, max: maxVal, mean: (minVal + maxVal) / 2, location: "node" },
        ...(analysisType === "shear" ? [
          { field_name: "ShearStressXY", min: -5e5, max: 8e5, mean: 1.5e5, location: "element" },
          { field_name: "Displacement", min: 0, max: 3.2e-6, mean: 1.1e-6, location: "node" },
        ] : [
          { field_name: "HeatFlux", min: 0, max: 5e4, mean: 2.5e4, location: "element" },
        ]),
      ],
      surface_vertices: vertices,
      surface_normals: normals,
      surface_indices: indices,
      vertex_colors: vertexColors,
      color_range: [minVal, maxVal] as [number, number],
    },
    layer_summaries: [
      { layer_name: "Leadframe", field_name: fieldName, min: analysisType === "thermal" ? 25.0 : 100, max: analysisType === "thermal" ? 35.2 : 5e5, mean: analysisType === "thermal" ? 30.1 : 2.5e5 },
      { layer_name: "DBA", field_name: fieldName, min: analysisType === "thermal" ? 35.2 : 1e5, max: analysisType === "thermal" ? 72.8 : 1.2e6, mean: analysisType === "thermal" ? 54.0 : 6.5e5 },
      { layer_name: "Die", field_name: fieldName, min: analysisType === "thermal" ? 72.8 : 50, max: analysisType === "thermal" ? 85.3 : 3e5, mean: analysisType === "thermal" ? 79.1 : 1.5e5 },
    ],
  };
}

function generateMockDbaComparison(nodeId: string): DbaComparisonDto {
  return {
    node_id: nodeId,
    materials: ["Epoxy DBA", "Solder SAC305", "Silver Sinter", "Conductive Adhesive"],
    results: [
      { material_name: "Epoxy DBA", max_temperature: 85.3, thermal_resistance: 1.21e-3, max_shear_stress: 1.2e6, max_deformation: 3.2e-6 },
      { material_name: "Solder SAC305", max_temperature: 32.1, thermal_resistance: 8.6e-5, max_shear_stress: 8.5e6, max_deformation: 1.1e-7 },
      { material_name: "Silver Sinter", max_temperature: 28.5, thermal_resistance: 2.0e-5, max_shear_stress: 2.1e6, max_deformation: 5.2e-7 },
      { material_name: "Conductive Adhesive", max_temperature: 62.7, thermal_resistance: 5.7e-4, max_shear_stress: 3.8e6, max_deformation: 1.8e-6 },
    ],
  };
}
