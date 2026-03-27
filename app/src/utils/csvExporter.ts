/* ================================================================== */
/*  CSV Export Utilities                                                */
/* ================================================================== */

import type { ResultSummaryDto } from "../types/project";
import type { SimulationRecord } from "../types/simulation";

/* ---- CSV Helpers ------------------------------------------------ */

function escapeCSV(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSVRow(values: unknown[]): string {
  return values.map(escapeCSV).join(",");
}

/* ---- Export Functions ------------------------------------------- */

export function exportFieldSummariesCSV(
  summaries: ResultSummaryDto[],
  projectName: string
): string {
  const lines: string[] = [
    `# Field Summaries — ${projectName}`,
    `# Exported: ${new Date().toISOString()}`,
    "",
    toCSVRow(["Field", "Location", "Min", "Max", "Mean"]),
  ];
  for (const s of summaries) {
    lines.push(toCSVRow([s.field_name, s.location, s.min, s.max, s.mean]));
  }
  return lines.join("\n");
}

export function exportSimulationRecordsCSV(
  records: SimulationRecord[]
): string {
  const lines: string[] = [
    `# Simulation Records Export`,
    `# Exported: ${new Date().toISOString()}`,
    `# Records: ${records.length}`,
    "",
    toCSVRow([
      "ID",
      "Timestamp",
      "Node Name",
      "Solver Type",
      "Duration (ms)",
      "Material",
      "Overall Pass",
      "Fields",
      "Criteria Count",
    ]),
  ];
  for (const r of records) {
    lines.push(
      toCSVRow([
        r.id,
        r.timestamp,
        r.node_name,
        r.solver_type,
        r.duration_ms,
        r.material ?? "",
        r.overall_pass !== undefined ? (r.overall_pass ? "PASS" : "FAIL") : "",
        r.result_fields.join("; "),
        r.pass_criteria?.length ?? 0,
      ])
    );
  }

  // Add detail section with field summaries per record
  lines.push("");
  lines.push("# --- Detailed Field Summaries ---");
  lines.push(
    toCSVRow(["Record ID", "Node Name", "Field", "Location", "Min", "Max", "Mean"])
  );
  for (const r of records) {
    for (const f of r.field_summaries) {
      lines.push(
        toCSVRow([r.id, r.node_name, f.field_name, f.location, f.min, f.max, f.mean])
      );
    }
  }

  // Add pass/fail criteria section
  if (records.some((r) => r.pass_criteria && r.pass_criteria.length > 0)) {
    lines.push("");
    lines.push("# --- Pass/Fail Criteria ---");
    lines.push(
      toCSVRow(["Record ID", "Node Name", "Field", "Operator", "Threshold", "Actual", "Passed"])
    );
    for (const r of records) {
      for (const c of r.pass_criteria ?? []) {
        lines.push(
          toCSVRow([r.id, r.node_name, c.field, c.operator, c.threshold, c.actual, c.passed ? "YES" : "NO"])
        );
      }
    }
  }

  return lines.join("\n");
}

export function exportVertexDataCSV(
  vertices: [number, number, number][],
  colors: [number, number, number][],
  fieldName: string
): string {
  const lines: string[] = [
    `# Vertex Data — ${fieldName}`,
    `# Exported: ${new Date().toISOString()}`,
    `# Vertices: ${vertices.length}`,
    "",
    toCSVRow(["Index", "X", "Y", "Z", "R", "G", "B"]),
  ];
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    const c = colors[i] ?? [0, 0, 0];
    lines.push(toCSVRow([i, v[0], v[1], v[2], c[0], c[1], c[2]]));
  }
  return lines.join("\n");
}

/* ---- Download Trigger ------------------------------------------ */

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
