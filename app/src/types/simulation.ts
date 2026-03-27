/* ================================================================== */
/*  Simulation Recording, Chat & LLM types for OpenSim Workbench      */
/* ================================================================== */

import type { ResultSummaryDto } from "./project";
import type { TestBedConfiguration } from "../components/viewer/TestBedConfig";

/* ---- Simulation Recording ---------------------------------------- */

export interface SimulationRecord {
  id: string;
  timestamp: string; // ISO 8601
  duration_ms: number;
  solver_type: "structural" | "thermal" | "chippackage";
  node_id: string;
  node_name: string;

  // Config snapshot
  test_bed_config?: TestBedConfiguration;
  solver_params: Record<string, unknown>;
  material?: string;
  mesh_info?: { total_nodes: number; total_elements: number };

  // Results snapshot
  field_summaries: ResultSummaryDto[];
  result_fields: string[];

  // Pass/fail
  pass_criteria?: PassCriterion[];
  overall_pass?: boolean;
}

export interface PassCriterion {
  field: string;
  operator: "lt" | "gt" | "lte" | "gte";
  threshold: number;
  actual: number;
  passed: boolean;
}

/* ---- LLM / Chat ------------------------------------------------- */

export type LLMProvider = "claude" | "openai" | "gemini" | "perplexity";

export interface LLMSettings {
  provider: LLMProvider;
  model: string;
  apiKey: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  actions?: AgentAction[];
  actionResults?: ActionResult[];
}

export interface AgentAction {
  tool: string;
  args: Record<string, unknown>;
}

export interface ActionResult {
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/* ---- Report ------------------------------------------------------ */

export interface ReportData {
  projectName: string;
  generatedAt: string;
  records: SimulationRecord[];
  comparison?: RecordComparison;
}

export interface RecordComparison {
  recordA: SimulationRecord;
  recordB: SimulationRecord;
  paramDiffs: ParamDiff[];
  resultDiffs: ResultDiff[];
}

export interface ParamDiff {
  key: string;
  valueA: unknown;
  valueB: unknown;
}

export interface ResultDiff {
  field: string;
  metric: string;
  valueA: number;
  valueB: number;
  delta: number;
  deltaPercent: number;
}
