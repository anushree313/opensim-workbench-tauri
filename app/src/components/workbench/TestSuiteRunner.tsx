/* ================================================================== */
/*  TestSuiteRunner – modal overlay for batch test suite execution      */
/* ================================================================== */

import { useState, useCallback, useMemo } from "react";
import { getScenarioById } from "../../data/sampleScenarios";
import {
  getTestById,
  PHASE_LABELS,
} from "../../data/chipTestLibrary";
import {
  recordSimulation,
  getRecord,
} from "../../stores/simulationStore";
import { generateReportHTML } from "../../utils/reportGenerator";
import type { SimulationRecord } from "../../types/simulation";
import "./TestSuiteRunner.css";

/* ---- Types --------------------------------------------------------- */

interface TestStatus {
  testId: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  recordId?: string;
  error?: string;
}

interface TestSuiteRunnerProps {
  scenarioId: string;
  onClose: () => void;
  onOpenReport: (html: string) => void;
}

/* ---- Status icon helper -------------------------------------------- */

function statusIcon(status: TestStatus["status"]): string {
  switch (status) {
    case "pending":
      return "\u23F3"; // hourglass
    case "running":
      return "\u23F1"; // stopwatch
    case "passed":
      return "\u2713"; // check
    case "failed":
      return "\u2717"; // cross
    case "skipped":
      return "\u2298"; // circled dash
  }
}

const OP_LABELS: Record<string, string> = {
  lt: "<",
  gt: ">",
  lte: "\u2264",
  gte: "\u2265",
};

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */

export function TestSuiteRunner({
  scenarioId,
  onClose,
  onOpenReport,
}: TestSuiteRunnerProps) {
  const scenario = getScenarioById(scenarioId);

  /* -- State --------------------------------------------------------- */

  const initialStatuses: TestStatus[] = useMemo(
    () =>
      (scenario?.testIds ?? []).map((testId) => ({
        testId,
        status: "pending" as const,
      })),
    [scenario],
  );

  const [testStatuses, setTestStatuses] = useState<TestStatus[]>(initialStatuses);
  const [isRunning, setIsRunning] = useState(false);
  const [, setCurrentTestIndex] = useState(0);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  /* -- Derived -------------------------------------------------------- */

  const completedCount = testStatuses.filter(
    (t) => t.status === "passed" || t.status === "failed" || t.status === "skipped",
  ).length;
  const totalCount = testStatuses.length;
  const passedCount = testStatuses.filter((t) => t.status === "passed").length;
  const failedCount = testStatuses.filter((t) => t.status === "failed").length;
  const allDone = completedCount === totalCount && totalCount > 0 && !isRunning;
  const hasFail = failedCount > 0;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  /* -- Helpers -------------------------------------------------------- */

  const updateTestStatus = useCallback(
    (
      index: number,
      status: TestStatus["status"],
      recordId?: string,
      error?: string,
    ) => {
      setTestStatuses((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status, recordId, error };
        return next;
      });
    },
    [],
  );

  /* -- Run All -------------------------------------------------------- */

  const handleRunAll = useCallback(async () => {
    setIsRunning(true);
    setCancelled(false);

    // Reset all to pending
    setTestStatuses((prev) => prev.map((t) => ({ ...t, status: "pending" as const, recordId: undefined, error: undefined })));

    for (let i = 0; i < testStatuses.length; i++) {
      // Check for cancellation via ref-like pattern
      // We use a local variable that gets set in the cancel handler
      if (cancelled) {
        // Mark remaining as skipped
        for (let j = i; j < testStatuses.length; j++) {
          updateTestStatus(j, "skipped");
        }
        break;
      }

      setCurrentTestIndex(i);
      updateTestStatus(i, "running");

      try {
        // Simulate running (in production, this would call projectStore.runSingleLibraryTest())
        await new Promise((resolve) =>
          setTimeout(resolve, 500 + Math.random() * 500),
        );

        const test = getTestById(testStatuses[i].testId);
        if (!test) {
          updateTestStatus(i, "failed", undefined, "Test not found");
          continue;
        }

        const passCriteriaResults = test.passCriteria.map((c) => {
          const actual = c.threshold * (0.5 + Math.random() * 0.4);
          const passed =
            c.operator === "lt"
              ? actual < c.threshold
              : c.operator === "gt"
                ? actual > c.threshold
                : c.operator === "lte"
                  ? actual <= c.threshold
                  : actual >= c.threshold;
          return {
            field: c.field,
            operator: c.operator as "lt" | "gt" | "lte" | "gte",
            threshold: c.threshold,
            actual,
            passed,
          };
        });

        const allPassed = passCriteriaResults.every((c) => c.passed);

        const recordId = recordSimulation({
          timestamp: new Date().toISOString(),
          duration_ms: 500 + Math.floor(Math.random() * 500),
          solver_type: test.solverType === "shear" ? "structural" : "thermal",
          node_id: "suite-" + test.id,
          node_name: test.name,
          solver_params: test.defaultParams,
          field_summaries: test.passCriteria.map((c) => ({
            field_name: c.field,
            location: "Node",
            min: c.threshold * 0.3,
            max: c.threshold * 0.8,
            mean: c.threshold * 0.5,
          })),
          result_fields: test.passCriteria.map((c) => c.field),
          pass_criteria: passCriteriaResults,
          overall_pass: allPassed,
        });

        updateTestStatus(i, allPassed ? "passed" : "failed", recordId);
      } catch (e) {
        updateTestStatus(i, "failed", undefined, String(e));
      }
    }

    setIsRunning(false);
  }, [testStatuses, cancelled, updateTestStatus]);

  /* -- Cancel --------------------------------------------------------- */

  const handleCancel = useCallback(() => {
    setCancelled(true);
  }, []);

  /* -- Generate Report ------------------------------------------------ */

  const handleGenerateReport = useCallback(() => {
    const recordIds = testStatuses
      .filter((t) => t.recordId)
      .map((t) => t.recordId!);
    const records: SimulationRecord[] = recordIds
      .map((id) => getRecord(id))
      .filter((r): r is SimulationRecord => r != null);

    const html = generateReportHTML(
      records,
      scenario?.name ?? "Test Suite Report",
    );
    onOpenReport(html);
  }, [testStatuses, scenario, onOpenReport]);

  /* -- Expand / collapse ---------------------------------------------- */

  const toggleExpand = useCallback(
    (testId: string) => {
      setExpandedTestId((prev) => (prev === testId ? null : testId));
    },
    [],
  );

  /* -- Worst margin calculation --------------------------------------- */

  const worstMargin = useMemo(() => {
    let worst: { field: string; margin: number } | null = null;

    for (const ts of testStatuses) {
      if (!ts.recordId) continue;
      const rec = getRecord(ts.recordId);
      if (!rec?.pass_criteria) continue;

      for (const pc of rec.pass_criteria) {
        const margin = Math.abs(pc.actual - pc.threshold) / Math.abs(pc.threshold || 1);
        if (worst === null || margin < worst.margin) {
          worst = { field: pc.field, margin };
        }
      }
    }

    return worst;
  }, [testStatuses, allDone]);

  /* -- Guard ---------------------------------------------------------- */

  if (!scenario) {
    return (
      <div className="suite-runner-overlay" onClick={onClose}>
        <div className="suite-runner-panel" onClick={(e) => e.stopPropagation()}>
          <div className="suite-runner-header">
            <div className="suite-runner-header-info">
              <h2>Scenario not found</h2>
            </div>
            <button className="suite-runner-close" onClick={onClose}>
              &times;
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="suite-runner-overlay" onClick={onClose}>
      <div
        className="suite-runner-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Header ------------------------------------------------ */}
        <div className="suite-runner-header">
          <div className="suite-runner-header-info">
            <h2>{scenario.name}</h2>
            <p>{scenario.description}</p>
          </div>
          <button className="suite-runner-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* ---- Progress bar ------------------------------------------ */}
        <div className="suite-progress">
          <div
            className={`suite-progress-bar ${hasFail ? "has-fail" : "all-pass"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="suite-progress-label">
          {completedCount} of {totalCount} complete
        </div>

        {/* ---- Controls ---------------------------------------------- */}
        <div className="suite-controls">
          <button
            className="suite-btn-run"
            disabled={isRunning}
            onClick={handleRunAll}
          >
            Run All
          </button>
          {isRunning && (
            <button className="suite-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
          )}
          {allDone && (
            <button className="suite-btn-report" onClick={handleGenerateReport}>
              Generate Report
            </button>
          )}
        </div>

        {/* ---- Test list --------------------------------------------- */}
        <div className="suite-test-list">
          {testStatuses.map((ts) => {
            const test = getTestById(ts.testId);
            const isExpanded = expandedTestId === ts.testId;
            const record = ts.recordId ? getRecord(ts.recordId) : undefined;

            return (
              <div key={ts.testId}>
                {/* Row */}
                <div
                  className="suite-test-row"
                  onClick={() => toggleExpand(ts.testId)}
                >
                  <div className="suite-test-row-left">
                    <span
                      className={`suite-status-icon status-${ts.status}`}
                    >
                      {statusIcon(ts.status)}
                    </span>
                    <span className="suite-test-name">
                      {test?.name ?? ts.testId}
                    </span>
                    {test && (
                      <span className="suite-standard-badge">
                        {test.standard}
                      </span>
                    )}
                  </div>
                  <div className="suite-test-row-right">
                    {test && (
                      <span className="suite-phase-tag">
                        {PHASE_LABELS[test.phase]}
                      </span>
                    )}
                    <span
                      className={`suite-expand-arrow ${isExpanded ? "expanded" : ""}`}
                    >
                      &#9654;
                    </span>
                  </div>
                </div>

                {/* Detail (expanded) */}
                {isExpanded && test && (
                  <div className="suite-test-detail">
                    {/* Default params */}
                    <h4>Default Parameters</h4>
                    <table className="suite-detail-table">
                      <thead>
                        <tr>
                          <th>Parameter</th>
                          <th>Value</th>
                          <th>Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(test.defaultParams).map(
                          ([key, value]) => (
                            <tr key={key}>
                              <td>{test.paramLabels[key] ?? key}</td>
                              <td>{value}</td>
                              <td>{test.paramUnits[key] ?? ""}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>

                    {/* Pass criteria with verdict */}
                    {record?.pass_criteria && record.pass_criteria.length > 0 && (
                      <>
                        <h4>Pass Criteria</h4>
                        <table className="suite-detail-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Operator</th>
                              <th>Threshold</th>
                              <th>Actual</th>
                              <th>Result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {record.pass_criteria.map((pc, idx) => (
                              <tr key={idx}>
                                <td>{pc.field}</td>
                                <td>{OP_LABELS[pc.operator] ?? pc.operator}</td>
                                <td>{pc.threshold}</td>
                                <td>{pc.actual.toFixed(4)}</td>
                                <td>
                                  <span
                                    className={
                                      pc.passed
                                        ? "suite-criterion-pass"
                                        : "suite-criterion-fail"
                                    }
                                  >
                                    {pc.passed ? "\u2714" : "\u2718"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {/* Show criteria templates if not yet run */}
                    {!record && test.passCriteria.length > 0 && (
                      <>
                        <h4>Pass Criteria (not yet evaluated)</h4>
                        <table className="suite-detail-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Operator</th>
                              <th>Threshold</th>
                              <th>Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {test.passCriteria.map((c, idx) => (
                              <tr key={idx}>
                                <td>{c.fieldLabel}</td>
                                <td>{OP_LABELS[c.operator] ?? c.operator}</td>
                                <td>{c.threshold}</td>
                                <td>{c.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    {/* Error message */}
                    {ts.error && (
                      <div className="suite-error-msg">{ts.error}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- Summary dashboard ------------------------------------- */}
        {allDone && (
          <div className="suite-summary">
            <span className="suite-summary-stat">
              Total: <strong>{totalCount}</strong>
            </span>
            <span className="suite-summary-stat">
              Passed: <strong style={{ color: "var(--success)" }}>{passedCount}</strong>
            </span>
            <span className="suite-summary-stat">
              Failed: <strong style={{ color: "var(--error)" }}>{failedCount}</strong>
            </span>
            {worstMargin && (
              <span className="suite-summary-stat worst-margin">
                Worst margin: {worstMargin.field} ({(worstMargin.margin * 100).toFixed(1)}%)
              </span>
            )}
            <span className={`suite-verdict ${hasFail ? "fail" : "pass"}`}>
              {hasFail ? "FAIL" : "PASS"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
