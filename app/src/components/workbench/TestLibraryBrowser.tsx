import { useState, useMemo } from "react";
import {
  CHIP_TEST_LIBRARY,
  PHASE_LABELS,
  CATEGORY_LABELS,
  getTestsByPhase,
  searchTests,
} from "../../data/chipTestLibrary";
import type { ChipTestPhase, ChipTestDefinition } from "../../data/chipTestLibrary";
import { SAMPLE_SCENARIOS } from "../../data/sampleScenarios";
import "./TestLibraryBrowser.css";

interface TestLibraryBrowserProps {
  onClose: () => void;
  onSelectTest: (testId: string) => void;
  onRunSuite: (scenarioId: string) => void;
}

const PHASE_ORDER: ChipTestPhase[] = [
  "die_wafer",
  "package_assembly",
  "package_reliability",
  "board_level",
  "system_validation",
];

const CATEGORY_COLORS: Record<string, string> = {
  thermal: "#ff6b6b",
  mechanical: "#4ecdc4",
  cte: "#ffd93d",
  reliability: "#6c5ce7",
  qualification: "#a29bfe",
};

const OPERATOR_SYMBOLS: Record<string, string> = {
  lt: "<",
  gt: ">",
  lte: "\u2264",
  gte: "\u2265",
};

export function TestLibraryBrowser({
  onClose,
  onSelectTest,
  onRunSuite,
}: TestLibraryBrowserProps) {
  const [selectedPhase, setSelectedPhase] = useState<ChipTestPhase>("die_wafer");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  const filteredTests = useMemo(() => {
    if (searchQuery.trim()) {
      const results = searchTests(searchQuery);
      return results.filter((t) => t.phase === selectedPhase);
    }
    return getTestsByPhase(selectedPhase);
  }, [selectedPhase, searchQuery]);

  function handleDetailsToggle(testId: string) {
    setExpandedTestId((prev) => (prev === testId ? null : testId));
  }

  function renderTestCard(test: ChipTestDefinition) {
    const isExpanded = expandedTestId === test.id;
    const catColor = CATEGORY_COLORS[test.category] || "#888";

    return (
      <div key={test.id} className="test-card">
        <div className="test-card-top">
          <span
            className="test-card-standard"
            style={{
              color: catColor,
              borderColor: catColor,
            }}
          >
            {test.standard}
          </span>
        </div>
        <div className="test-card-name">{test.name}</div>
        <div className="test-card-desc">{test.description}</div>
        <span
          className="test-card-category"
          style={{
            background: `${catColor}22`,
            color: catColor,
          }}
        >
          {CATEGORY_LABELS[test.category]}
        </span>
        <div className="test-card-actions">
          <button
            className="test-card-btn test-card-btn-accent"
            onClick={() => onSelectTest(test.id)}
          >
            Select
          </button>
          <button
            className="test-card-btn test-card-btn-secondary"
            onClick={() => handleDetailsToggle(test.id)}
          >
            {isExpanded ? "Hide" : "Details"}
          </button>
        </div>

        {isExpanded && (
          <div className="test-detail">
            <p className="test-detail-desc">{test.description}</p>

            <h4 className="test-detail-heading">Default Parameters</h4>
            <table>
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(test.defaultParams).map(([key, value]) => (
                  <tr key={key}>
                    <td>{test.paramLabels[key] || key}</td>
                    <td>{value}</td>
                    <td>{test.paramUnits[key] || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4 className="test-detail-heading">Pass Criteria</h4>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Op</th>
                  <th>Threshold</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {test.passCriteria.map((pc, i) => (
                  <tr key={i}>
                    <td>{pc.fieldLabel}</td>
                    <td>{OPERATOR_SYMBOLS[pc.operator] || pc.operator}</td>
                    <td>{pc.threshold}</td>
                    <td>{pc.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {test.recommendedDBA && (
              <div className="test-detail-dba">
                <strong>Recommended DBA:</strong> {test.recommendedDBA}
              </div>
            )}

            <button
              className="test-card-btn test-card-btn-accent test-detail-apply"
              onClick={() => onSelectTest(test.id)}
            >
              Apply Test
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="test-library-overlay" onClick={onClose}>
      <div className="test-library-panel" onClick={(e) => e.stopPropagation()}>
        <div className="test-library-header">
          <div className="test-library-header-left">
            <h2>Chip Test Library</h2>
            <span className="test-library-badge">
              {CHIP_TEST_LIBRARY.length} Tests
            </span>
          </div>
          <button className="test-library-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="test-library-search">
          <input
            type="text"
            placeholder="Search tests by name, standard, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="test-library-tabs">
          {PHASE_ORDER.map((phase) => (
            <button
              key={phase}
              className={`test-library-tab ${selectedPhase === phase ? "active" : ""}`}
              onClick={() => {
                setSelectedPhase(phase);
                setExpandedTestId(null);
              }}
            >
              {PHASE_LABELS[phase]}
            </button>
          ))}
        </div>

        <div className="test-library-grid">
          {filteredTests.length === 0 && (
            <div className="test-library-empty">
              No tests found{searchQuery ? ` matching "${searchQuery}"` : ""}.
            </div>
          )}
          {filteredTests.map((test) => renderTestCard(test))}
        </div>

        <div className="test-library-separator" />

        <div className="scenarios-section">
          <h3 className="scenarios-heading">Sample Scenarios</h3>
          <div className="scenario-cards">
            {SAMPLE_SCENARIOS.map((scenario) => (
              <div key={scenario.id} className="scenario-card">
                <div className="scenario-card-name">{scenario.name}</div>
                <div className="scenario-card-desc">{scenario.description}</div>
                <div className="scenario-card-bottom">
                  <span className="scenario-card-count">
                    {scenario.testIds.length} tests
                  </span>
                  <button
                    className="test-card-btn test-card-btn-accent"
                    onClick={() => onRunSuite(scenario.id)}
                  >
                    Run Suite
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
