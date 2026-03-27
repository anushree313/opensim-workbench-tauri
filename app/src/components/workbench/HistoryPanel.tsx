import { useState, useMemo } from "react";
import { useSimulationStore } from "../../stores/simulationStore";
import { generateReportHTML } from "../../utils/reportGenerator";
import type { SimulationRecord } from "../../types/simulation";
import "./HistoryPanel.css";

interface HistoryPanelProps {
  onClose: () => void;
  onOpenReport: (html: string) => void;
}

const SOLVER_LABELS: Record<SimulationRecord["solver_type"], string> = {
  structural: "Structural",
  thermal: "Thermal",
  chippackage: "Chip Package",
};

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

export function HistoryPanel({ onClose, onOpenReport }: HistoryPanelProps) {
  const {
    records,
    selectedRecordIds,
    getFilteredRecords,
    selectForCompare,
    clearCompare,
    deleteRecord,
    openCompare,
  } = useSimulationStore();

  const [solverFilter, setSolverFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRecords = useMemo(() => {
    let result = getFilteredRecords();
    if (solverFilter !== "all") {
      result = result.filter((r) => r.solver_type === solverFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.node_name.toLowerCase().includes(q) ||
          r.solver_type.toLowerCase().includes(q) ||
          r.result_fields.some((f) => f.toLowerCase().includes(q))
      );
    }
    return result;
  }, [getFilteredRecords, solverFilter, searchQuery]);

  const isSelected = (id: string) => selectedRecordIds.includes(id);
  const canCompare = selectedRecordIds.length === 2;

  function handleToggleSelect(id: string) {
    if (isSelected(id)) {
      clearCompare();
    } else {
      selectForCompare(id);
    }
  }

  function handleCompareSelected() {
    if (canCompare) {
      openCompare();
    }
  }

  function handleGenerateReport() {
    const html = generateReportHTML(records, "OpenSim Workbench");
    onOpenReport(html);
  }

  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="history-header">
          <h2>Simulation History</h2>
          <button className="history-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="history-filters">
          <select
            value={solverFilter}
            onChange={(e) => setSolverFilter(e.target.value)}
          >
            <option value="all">All Solvers</option>
            <option value="structural">Structural</option>
            <option value="thermal">Thermal</option>
            <option value="chippackage">Chip Package</option>
          </select>
          <input
            type="text"
            placeholder="Search simulations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="history-list">
          {filteredRecords.length === 0 && (
            <div className="history-empty">No simulation records found.</div>
          )}
          {filteredRecords.map((rec) => (
            <div
              key={rec.id}
              className={`history-record ${isSelected(rec.id) ? "history-record-selected" : ""}`}
            >
              <div className="history-record-left">
                <span className={`solver-badge badge-${rec.solver_type}`}>
                  {SOLVER_LABELS[rec.solver_type]}
                </span>
                <span className="history-record-name">{rec.node_name}</span>
                <span className="history-record-time">
                  {formatTimestamp(rec.timestamp)}
                </span>
              </div>

              <div className="history-record-center">
                <span className="history-record-duration">
                  {formatDuration(rec.duration_ms)}
                </span>
                <span className="history-record-fields">
                  {rec.field_summaries.length} field
                  {rec.field_summaries.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="history-record-right">
                {rec.pass_criteria && rec.pass_criteria.length > 0 && (
                  <span
                    className={`pass-badge ${rec.overall_pass ? "badge-pass" : "badge-fail"}`}
                  >
                    {rec.overall_pass ? "PASS" : "FAIL"}
                  </span>
                )}
                <input
                  type="checkbox"
                  className="history-checkbox"
                  checked={isSelected(rec.id)}
                  onChange={() => handleToggleSelect(rec.id)}
                  title="Select for comparison"
                />
              </div>

              <div className="history-record-actions">
                <button
                  className="history-btn history-btn-report"
                  onClick={() => {
                    const html = generateReportHTML([rec], "OpenSim Workbench");
                    onOpenReport(html);
                  }}
                >
                  Report
                </button>
                <button
                  className="history-btn history-btn-delete"
                  onClick={() => deleteRecord(rec.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="history-footer">
          <span className="history-footer-count">
            {records.length} simulation{records.length !== 1 ? "s" : ""}{" "}
            recorded
          </span>
          <div className="history-footer-actions">
            <button
              className="history-btn history-btn-compare"
              disabled={!canCompare}
              onClick={handleCompareSelected}
            >
              Compare Selected
            </button>
            <button
              className="history-btn history-btn-primary"
              onClick={handleGenerateReport}
            >
              Generate Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
