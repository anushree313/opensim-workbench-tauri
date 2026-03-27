import type { SimulationRecord } from "../types/simulation";

/**
 * Generates a self-contained HTML report from simulation records.
 * Dark theme with inline CSS, print-friendly via @media print.
 */
export function generateReportHTML(
  records: SimulationRecord[],
  projectName: string,
): string {
  const timestamp = new Date().toLocaleString();

  const recordSections = records
    .map((record) => {
      const durationSec = (record.duration_ms / 1000).toFixed(2);

      /* -- Config table (test bed) ---------------------------------- */
      let configHtml = "";
      if (record.test_bed_config) {
        const env = record.test_bed_config.environment;
        const load = record.test_bed_config.loadScenario;
        const loadParams = Object.entries(load.params)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");

        configHtml = `
      <h3>Test Bed Configuration</h3>
      <table>
        <thead><tr><th>Property</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Ambient Temperature</td><td>${env.ambientTemp} &deg;C</td></tr>
          <tr><td>Mounting</td><td>${env.mounting}</td></tr>
          <tr><td>Convection</td><td>${env.convection}${env.convectionVelocity != null ? ` (${env.convectionVelocity} m/s)` : ""}</td></tr>
          <tr><td>Load Scenario</td><td>${load.type}</td></tr>
          <tr><td>Load Parameters</td><td>${loadParams}</td></tr>
        </tbody>
      </table>`;
      }

      /* -- Solver params table -------------------------------------- */
      const solverParamRows = Object.entries(record.solver_params)
        .map(
          ([key, value]) =>
            `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(String(value))}</td></tr>`,
        )
        .join("\n          ");

      const solverParamsHtml = `
      <h3>Solver Parameters</h3>
      <table>
        <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
        <tbody>
          ${solverParamRows}
        </tbody>
      </table>`;

      /* -- Results table -------------------------------------------- */
      const resultRows = record.field_summaries
        .map(
          (fs) =>
            `<tr><td>${escapeHtml(fs.field_name)}</td><td>${fs.min.toFixed(4)}</td><td>${fs.max.toFixed(4)}</td><td>${fs.mean.toFixed(4)}</td></tr>`,
        )
        .join("\n          ");

      const resultsHtml = `
      <h3>Results Summary</h3>
      <table>
        <thead><tr><th>Field</th><th>Min</th><th>Max</th><th>Mean</th></tr></thead>
        <tbody>
          ${resultRows}
        </tbody>
      </table>`;

      /* -- Pass/fail table ------------------------------------------ */
      let passFailHtml = "";
      if (record.pass_criteria && record.pass_criteria.length > 0) {
        const opLabels: Record<string, string> = {
          lt: "<",
          gt: ">",
          lte: "<=",
          gte: ">=",
        };
        const criteriaRows = record.pass_criteria
          .map((pc) => {
            const color = pc.passed ? "#4caf50" : "#f44336";
            const label = pc.passed ? "PASS" : "FAIL";
            return `<tr>
            <td>${escapeHtml(pc.field)}</td>
            <td>${opLabels[pc.operator] ?? pc.operator}</td>
            <td>${pc.threshold}</td>
            <td>${pc.actual.toFixed(4)}</td>
            <td style="color:${color};font-weight:bold;">${label}</td>
          </tr>`;
          })
          .join("\n          ");

        const overallPass = record.overall_pass !== false;
        const badgeColor = overallPass ? "#4caf50" : "#f44336";
        const badgeLabel = overallPass ? "PASS" : "FAIL";

        passFailHtml = `
      <h3>Pass / Fail Criteria</h3>
      <table>
        <thead><tr><th>Field</th><th>Operator</th><th>Threshold</th><th>Actual</th><th>Result</th></tr></thead>
        <tbody>
          ${criteriaRows}
        </tbody>
      </table>
      <div class="badge" style="background:${badgeColor};">Overall: ${badgeLabel}</div>`;
      }

      return `
    <div class="record">
      <h2>${escapeHtml(record.node_name)} &mdash; ${escapeHtml(record.solver_type)}</h2>
      <p class="meta">Timestamp: ${escapeHtml(record.timestamp)} &bull; Duration: ${durationSec}s</p>
      ${configHtml}
      ${solverParamsHtml}
      ${resultsHtml}
      ${passFailHtml}
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Simulation Report — ${escapeHtml(projectName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #1e1e2e;
      color: #e0e0f0;
      padding: 2rem;
      line-height: 1.6;
    }
    h1 {
      color: #5b8def;
      font-size: 1.8rem;
      margin-bottom: 0.25rem;
    }
    .subtitle {
      color: #888;
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    .record {
      background: #262640;
      border: 1px solid #3a3a55;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    h2 {
      color: #5b8def;
      font-size: 1.3rem;
      margin-bottom: 0.5rem;
    }
    h3 {
      color: #ccc;
      font-size: 1rem;
      margin: 1rem 0 0.5rem;
    }
    .meta {
      color: #999;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0.75rem;
    }
    th, td {
      border: 1px solid #3a3a55;
      padding: 0.4rem 0.75rem;
      text-align: left;
      font-size: 0.9rem;
    }
    th {
      background: #2a2a45;
      color: #5b8def;
      font-weight: 600;
    }
    td {
      background: #1e1e2e;
    }
    .badge {
      display: inline-block;
      padding: 0.3rem 1rem;
      border-radius: 4px;
      color: #fff;
      font-weight: bold;
      font-size: 1rem;
      margin-top: 0.5rem;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 0.8rem;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #3a3a55;
    }
    @media print {
      body {
        background: white;
        color: black;
      }
      .record {
        background: #f5f5f5;
        border-color: #ccc;
      }
      th {
        background: #e0e0e0;
        color: #333;
      }
      td {
        background: white;
        border-color: #ccc;
      }
      h1, h2 {
        color: #333;
      }
    }
  </style>
</head>
<body>
  <h1>Simulation Report &mdash; ${escapeHtml(projectName)}</h1>
  <p class="subtitle">Generated: ${escapeHtml(timestamp)}</p>
  ${recordSections}
  <div class="footer">Generated by OpenSim Workbench v0.3.0</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
