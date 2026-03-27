import { useState, useCallback } from "react";
import { useSimulationStore } from "../../stores/simulationStore";
import "./ScenarioManager.css";

interface ScenarioManagerProps {
  onClose: () => void;
}

export function ScenarioManager({ onClose }: ScenarioManagerProps) {
  const {
    savedScenarios,
    saveScenario,
    loadScenario,
    deleteScenario,
    exportScenarioJSON,
    importScenarioJSON,
    records,
  } = useSimulationStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSave = useCallback(() => {
    if (!name.trim() || records.length === 0) return;
    saveScenario(name.trim(), description.trim());
    setName("");
    setDescription("");
  }, [name, description, records, saveScenario]);

  const handleLoad = useCallback(
    (id: string) => {
      loadScenario(id);
      onClose();
    },
    [loadScenario, onClose],
  );

  const handleExport = useCallback(
    (id: string) => {
      const json = exportScenarioJSON(id);
      if (!json) return;
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const scenario = savedScenarios.find((s) => s.id === id);
      a.download = `${scenario?.name ?? "scenario"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [exportScenarioJSON, savedScenarios],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteScenario(id);
    },
    [deleteScenario],
  );

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importScenarioJSON(reader.result as string);
        } catch {
          /* ignore parse errors */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importScenarioJSON]);

  return (
    <div className="scenario-overlay" onClick={handleOverlayClick}>
      <div className="scenario-panel">
        <div className="scenario-header">
          <h2>Scenario Manager</h2>
          <button className="scenario-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="scenario-save-section">
          <input
            type="text"
            placeholder="Scenario name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            placeholder="Description (optional)"
            rows={1}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="scenario-save-row">
            <span className="scenario-record-count">
              {records.length} simulation record{records.length !== 1 ? "s" : ""} to save
            </span>
            <button
              className="scenario-save-btn"
              onClick={handleSave}
              disabled={!name.trim() || records.length === 0}
            >
              Save Snapshot
            </button>
          </div>
        </div>

        <div className="scenario-divider" />

        <div className="scenario-list">
          {savedScenarios.length === 0 ? (
            <div className="scenario-empty">No saved scenarios yet</div>
          ) : (
            savedScenarios.map((scenario) => (
              <div key={scenario.id} className="scenario-row">
                <div className="scenario-info">
                  <div className="scenario-name">{scenario.name}</div>
                  {scenario.description && (
                    <div className="scenario-desc">{scenario.description}</div>
                  )}
                  <div className="scenario-meta">
                    {new Date(scenario.createdAt).toLocaleDateString()} &middot;{" "}
                    {scenario.recordCount} record{scenario.recordCount !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="scenario-actions">
                  <button className="scenario-load-btn" onClick={() => handleLoad(scenario.id)}>
                    Load
                  </button>
                  <button
                    className="scenario-export-btn"
                    onClick={() => handleExport(scenario.id)}
                  >
                    Export
                  </button>
                  <button
                    className="scenario-delete-btn"
                    onClick={() => handleDelete(scenario.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="scenario-footer">
          <button onClick={handleImport}>Import Scenario</button>
        </div>
      </div>
    </div>
  );
}
