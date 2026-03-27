import { useMemo } from "react";
import { useSimulationStore } from "../../stores/simulationStore";
import type { SimulationRecord } from "../../types/simulation";
import type { ResultSummaryDto } from "../../types/project";
import "./CompareView.css";

interface CompareViewProps {
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0)) {
    return n.toExponential(3);
  }
  return n.toFixed(4);
}

function DeltaCell({ a, b }: { a: number; b: number }) {
  const delta = b - a;
  const pct = a !== 0 ? ((delta / Math.abs(a)) * 100) : 0;
  const cls = delta > 0 ? "delta-positive" : delta < 0 ? "delta-negative" : "";
  const arrow = delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "";

  return (
    <td className={cls}>
      {arrow} {formatNumber(delta)} ({pct.toFixed(1)}%)
    </td>
  );
}

function ConfigDiffSection({
  recordA,
  recordB,
}: {
  recordA: SimulationRecord;
  recordB: SimulationRecord;
}) {
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    Object.keys(recordA.solver_params).forEach((k) => keys.add(k));
    Object.keys(recordB.solver_params).forEach((k) => keys.add(k));
    return Array.from(keys).sort();
  }, [recordA.solver_params, recordB.solver_params]);

  return (
    <div className="compare-section">
      <h3>Configuration Diff</h3>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Record A</th>
            <th>Record B</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            const valA = recordA.solver_params[key];
            const valB = recordB.solver_params[key];
            const strA = valA !== undefined ? String(valA) : "\u2014";
            const strB = valB !== undefined ? String(valB) : "\u2014";
            const isDiff = strA !== strB;
            return (
              <tr key={key} className={isDiff ? "diff-changed" : ""}>
                <td>{key}</td>
                <td>{strA}</td>
                <td>{strB}</td>
              </tr>
            );
          })}
          {allKeys.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                No parameters to compare
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultsDiffSection({
  recordA,
  recordB,
}: {
  recordA: SimulationRecord;
  recordB: SimulationRecord;
}) {
  const fieldPairs = useMemo(() => {
    const fieldMap = new Map<string, { a?: ResultSummaryDto; b?: ResultSummaryDto }>();
    for (const s of recordA.field_summaries) {
      fieldMap.set(s.field_name, { a: s });
    }
    for (const s of recordB.field_summaries) {
      const existing = fieldMap.get(s.field_name) || {};
      fieldMap.set(s.field_name, { ...existing, b: s });
    }
    return Array.from(fieldMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [recordA.field_summaries, recordB.field_summaries]);

  return (
    <div className="compare-section">
      <h3>Results Diff</h3>
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Metric</th>
            <th>Record A</th>
            <th>Record B</th>
            <th>Delta</th>
          </tr>
        </thead>
        <tbody>
          {fieldPairs.map(([fieldName, { a, b }]) => {
            const metrics: Array<{ label: string; key: "min" | "max" | "mean" }> = [
              { label: "Min", key: "min" },
              { label: "Max", key: "max" },
              { label: "Mean", key: "mean" },
            ];
            return metrics.map((m) => (
              <tr key={`${fieldName}-${m.key}`}>
                {m.key === "min" && (
                  <td rowSpan={3} style={{ fontWeight: 500 }}>
                    {fieldName}
                  </td>
                )}
                <td>{m.label}</td>
                <td>{a ? formatNumber(a[m.key]) : "\u2014"}</td>
                <td>{b ? formatNumber(b[m.key]) : "\u2014"}</td>
                {a && b ? (
                  <DeltaCell a={a[m.key]} b={b[m.key]} />
                ) : (
                  <td style={{ color: "var(--text-muted)" }}>\u2014</td>
                )}
              </tr>
            ));
          })}
          {fieldPairs.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                No result fields to compare
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TestBedDiffSection({
  recordA,
  recordB,
}: {
  recordA: SimulationRecord;
  recordB: SimulationRecord;
}) {
  if (!recordA.test_bed_config && !recordB.test_bed_config) return null;

  const configA = recordA.test_bed_config;
  const configB = recordB.test_bed_config;

  const allEnvKeys = useMemo(() => {
    const keys = new Set<string>();
    if (configA?.environment) {
      Object.keys(configA.environment).forEach((k) => keys.add(k));
    }
    if (configB?.environment) {
      Object.keys(configB.environment).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort();
  }, [configA, configB]);

  const allLoadKeys = useMemo(() => {
    const keys = new Set<string>();
    if (configA?.loadScenario) {
      Object.keys(configA.loadScenario).forEach((k) => keys.add(k));
    }
    if (configB?.loadScenario) {
      Object.keys(configB.loadScenario).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort();
  }, [configA, configB]);

  return (
    <div className="compare-section">
      <h3>Test Bed Config Diff</h3>
      {allEnvKeys.length > 0 && (
        <>
          <h4 className="compare-subsection-title">Environment</h4>
          <table>
            <thead>
              <tr>
                <th>Setting</th>
                <th>Record A</th>
                <th>Record B</th>
              </tr>
            </thead>
            <tbody>
              {allEnvKeys.map((key) => {
                const envA = configA?.environment as Record<string, unknown> | undefined;
                const envB = configB?.environment as Record<string, unknown> | undefined;
                const valA = envA?.[key];
                const valB = envB?.[key];
                const strA = valA !== undefined ? String(valA) : "\u2014";
                const strB = valB !== undefined ? String(valB) : "\u2014";
                const isDiff = strA !== strB;
                return (
                  <tr key={key} className={isDiff ? "diff-changed" : ""}>
                    <td>{key}</td>
                    <td>{strA}</td>
                    <td>{strB}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      {allLoadKeys.length > 0 && (
        <>
          <h4 className="compare-subsection-title">Load Scenario</h4>
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Record A</th>
                <th>Record B</th>
              </tr>
            </thead>
            <tbody>
              {allLoadKeys.map((key) => {
                const loadA = configA?.loadScenario as Record<string, unknown> | undefined;
                const loadB = configB?.loadScenario as Record<string, unknown> | undefined;
                const valA = loadA?.[key];
                const valB = loadB?.[key];
                const strA = valA !== undefined ? String(valA) : "\u2014";
                const strB = valB !== undefined ? String(valB) : "\u2014";
                const isDiff = strA !== strB;
                return (
                  <tr key={key} className={isDiff ? "diff-changed" : ""}>
                    <td>{key}</td>
                    <td>{strA}</td>
                    <td>{strB}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function CompareView({ onClose }: CompareViewProps) {
  const { selectedRecordIds, getRecord } = useSimulationStore();

  const recordA = selectedRecordIds.length >= 1 ? getRecord(selectedRecordIds[0]) : undefined;
  const recordB = selectedRecordIds.length >= 2 ? getRecord(selectedRecordIds[1]) : undefined;

  if (!recordA || !recordB) {
    return (
      <div className="compare-overlay" onClick={onClose}>
        <div className="compare-panel" onClick={(e) => e.stopPropagation()}>
          <div className="compare-header">
            <h2>Compare Simulations</h2>
            <button className="compare-close-btn" onClick={onClose}>
              &times;
            </button>
          </div>
          <div className="compare-empty">
            Select 2 records to compare
          </div>
          <div className="compare-footer">
            <button className="compare-btn-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="compare-overlay" onClick={onClose}>
      <div className="compare-panel" onClick={(e) => e.stopPropagation()}>
        <div className="compare-header">
          <h2>Compare Simulations</h2>
          <button className="compare-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="compare-columns-header">
          <div className="compare-column-label">
            <span className="compare-column-name">{recordA.node_name}</span>
            <span className="compare-column-time">
              {formatTimestamp(recordA.timestamp)}
            </span>
          </div>
          <div className="compare-column-label">
            <span className="compare-column-name">{recordB.node_name}</span>
            <span className="compare-column-time">
              {formatTimestamp(recordB.timestamp)}
            </span>
          </div>
        </div>

        <div className="compare-body">
          <ConfigDiffSection recordA={recordA} recordB={recordB} />
          <ResultsDiffSection recordA={recordA} recordB={recordB} />
          <TestBedDiffSection recordA={recordA} recordB={recordB} />
        </div>

        <div className="compare-footer">
          <button className="compare-btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
