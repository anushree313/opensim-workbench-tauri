export type NodeState =
  | "NotConfigured"
  | "Clean"
  | "Dirty"
  | "Solving"
  | "Solved"
  | "Failed";

export type SystemCategory = "Component" | "Analysis" | "DesignExploration";

export type SystemKind =
  | "Geometry"
  | "EngineeringData"
  | "Mesh"
  | "Result"
  | "StaticStructural"
  | "Modal"
  | "Harmonic"
  | "TransientStructural"
  | "SteadyThermal"
  | "TransientThermal"
  | "FluidFlow"
  | "Magnetostatic"
  | "Electrostatic"
  | "ThermalStructural"
  | "FluidStructureInteraction"
  | "ParameterSet"
  | "DesignOfExperiments"
  | "ResponseSurface"
  | "Optimization"
  | "SixSigma"
  | "ChipPackageAnalysis";

export type CellKind =
  | "EngineeringData"
  | "Geometry"
  | "Model"
  | "Mesh"
  | "Setup"
  | "Solution"
  | "Results"
  | "ParameterSet"
  | "DesignOfExperiments"
  | "ResponseSurface"
  | "Optimization"
  | "SixSigma";

export type ConnectionKind =
  | "GeometryShare"
  | "MeshShare"
  | "EngineeringDataShare"
  | "ResultTransfer"
  | "ParameterLink";

export interface CellDto {
  id: string;
  kind: CellKind;
  display_name: string;
  state: NodeState;
}

export interface SystemNodeDto {
  id: string;
  kind: SystemKind;
  category: SystemCategory;
  name: string;
  display_name: string;
  state: NodeState;
  cells: CellDto[];
  position: [number, number];
  geometry_id?: string;
  mesh_id?: string;
  result_id?: string;
  study_id?: string;
}

export interface ConnectionDto {
  id: string;
  source: string;
  target: string;
  kind: ConnectionKind;
}

export interface ProjectSchematicDto {
  project_id: string;
  project_name: string;
  nodes: SystemNodeDto[];
  connections: ConnectionDto[];
}

export interface ToolboxEntry {
  kind: SystemKind;
  display_name: string;
  category: SystemCategory;
}

export interface OperationResult {
  success: boolean;
  message: string;
  id?: string;
}

// -- Geometry types --

export type PrimitiveKind = "Box" | "Cylinder" | "Sphere" | "Plate";

export interface TessellatedMeshDto {
  vertices: [number, number, number][];
  normals: [number, number, number][];
  indices: number[];
}

export interface BodyDto {
  id: string;
  name: string;
  primitive_kind?: string;
  bounding_box?: [[number, number, number], [number, number, number]];
}

export interface GeometryModelDto {
  id: string;
  name: string;
  bodies: BodyDto[];
}

export interface GeometryViewDto {
  node_id: string;
  model: GeometryModelDto;
  meshes: TessellatedMeshDto[];
}

// -- Mesh types --

export interface MeshStatisticsDto {
  total_nodes: number;
  total_elements: number;
  element_counts: Record<string, number>;
  min_quality: number;
  max_quality: number;
  avg_quality: number;
}

export interface MeshViewDto {
  node_id: string;
  mesh_id: string;
  name: string;
  statistics: MeshStatisticsDto;
  edge_vertices: [number, number, number][];
  surface_vertices: [number, number, number][];
  surface_normals: [number, number, number][];
  surface_indices: number[];
}

// -- Result types --

export interface ResultSummaryDto {
  field_name: string;
  location: string;
  min: number;
  max: number;
  mean: number;
}

export interface ResultViewDto {
  node_id: string;
  result_id: string;
  name: string;
  field_name: string;
  field_summaries: ResultSummaryDto[];
  surface_vertices: [number, number, number][];
  surface_normals: [number, number, number][];
  surface_indices: number[];
  vertex_colors: [number, number, number][];
  color_range: [number, number];
}

// -- Design Exploration types --

export interface ParameterDto {
  name: string;
  value: number;
  lower_bound: number;
  upper_bound: number;
}

export interface DesignPointDto {
  id: string;
  parameter_values: number[];
  output_values: number[];
  status: string;
}

export interface ResponseSurfaceDto {
  r_squared: number;
  grid: number[][];
  param_names: string[];
}

export interface OptimizationResultDto {
  optimal_params: number[];
  param_names: string[];
  optimal_value: number;
  history: number[];
}

export interface DesignExplorationViewDto {
  node_id: string;
  study_id: string;
  name: string;
  parameters: ParameterDto[];
  output_names: string[];
  doe_algorithm: string;
  design_points: DesignPointDto[];
  response_surface?: ResponseSurfaceDto;
  optimization_result?: OptimizationResultDto;
  pareto_indices?: number[];
  six_sigma?: SixSigmaResultDto;
}

export interface SixSigmaResultDto {
  mean: number;
  std_dev: number;
  cpk: number;
  histogram_bins: number[];
  histogram_counts: number[];
  sample_count: number;
}

// -- Chip Package types --

export interface ChipPackageResultDto {
  node_id: string;
  analysis_type: string;
  result_view: ResultViewDto;
  layer_summaries: LayerSummaryDto[];
  dba_material: string;
}

export interface LayerSummaryDto {
  layer_name: string;
  field_name: string;
  min: number;
  max: number;
  mean: number;
}

export interface DbaComparisonDto {
  node_id: string;
  materials: string[];
  results: DbaComparisonRow[];
}

export interface DbaComparisonRow {
  material_name: string;
  max_temperature?: number;
  thermal_resistance?: number;
  max_shear_stress?: number;
  max_deformation?: number;
}
