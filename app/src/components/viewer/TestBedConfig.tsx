import { useState, useCallback } from "react";
import "./TestBedConfig.css";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface TestBedConfiguration {
  name: string;
  environment: {
    ambientTemp: number;
    mounting: "Free" | "Fixed-Base" | "Clamped-All";
    convection: "Natural" | "Forced";
    convectionVelocity?: number;
  };
  loadScenario: {
    type: string;
    params: Record<string, number>;
  };
  libraryTestId?: string;
  passCriteria?: Array<{
    field: string;
    fieldLabel: string;
    operator: "lt" | "gt" | "lte" | "gte";
    threshold: number;
    unit: string;
  }>;
}

export interface TestBedConfigProps {
  analysisType: "structural" | "thermal" | "chippackage" | "general";
  onApply: (config: TestBedConfiguration) => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Preset definitions                                                 */
/* ------------------------------------------------------------------ */

interface PresetDef {
  label: string;
  type: string;
  params: Record<string, number>;
  category: "structural" | "thermal" | "chippackage";
}

const ALL_PRESETS: PresetDef[] = [
  // Chip-package presets
  {
    label: "JEDEC Thermal Cycling",
    type: "JEDEC Thermal Cycling",
    params: { T_min: -40, T_max: 125, ramp_rate: 10, dwell_time: 15 },
    category: "chippackage",
  },
  {
    label: "IPC Shear Test",
    type: "IPC Shear Test",
    params: { force: 10, rate: 0.5 },
    category: "chippackage",
  },
  {
    label: "Power Cycling",
    type: "Power Cycling",
    params: { on_time: 60, off_time: 60, power: 5 },
    category: "chippackage",
  },

  // Structural presets
  {
    label: "Static Load Test",
    type: "Static Load Test",
    params: { force: 1000 },
    category: "structural",
  },
  {
    label: "Vibration Test",
    type: "Vibration Test",
    params: { freq_min: 20, freq_max: 2000, g_level: 5 },
    category: "structural",
  },
  {
    label: "Drop Test",
    type: "Drop Test",
    params: { height: 1.5, surface_rigid: 1 },
    category: "structural",
  },

  // Thermal presets
  {
    label: "Steady-State Heating",
    type: "Steady-State Heating",
    params: { heat_flux: 50000, bottom_temp: 25 },
    category: "thermal",
  },
  {
    label: "Thermal Cycling",
    type: "Thermal Cycling",
    params: { T_min: -20, T_max: 85, cycles: 1000 },
    category: "thermal",
  },
  {
    label: "Convective Cooling",
    type: "Convective Cooling",
    params: { h: 25, T_inf: 25 },
    category: "thermal",
  },
];

const PRESET_UNITS: Record<string, string> = {
  T_min: "\u00b0C",
  T_max: "\u00b0C",
  ramp_rate: "\u00b0C/min",
  dwell_time: "min",
  force: "N",
  rate: "mm/min",
  on_time: "s",
  off_time: "s",
  power: "W",
  freq_min: "Hz",
  freq_max: "Hz",
  g_level: "g",
  height: "m",
  surface_rigid: "",
  heat_flux: "W/m\u00b2",
  bottom_temp: "\u00b0C",
  cycles: "",
  h: "W/m\u00b2K",
  T_inf: "\u00b0C",
};

const PARAM_LABELS: Record<string, string> = {
  T_min: "T min",
  T_max: "T max",
  ramp_rate: "Ramp rate",
  dwell_time: "Dwell time",
  force: "Force",
  rate: "Rate",
  on_time: "On time",
  off_time: "Off time",
  power: "Power",
  freq_min: "Freq min",
  freq_max: "Freq max",
  g_level: "G level",
  height: "Height",
  surface_rigid: "Rigid surface",
  heat_flux: "Heat flux",
  bottom_temp: "Bottom temp",
  cycles: "Cycles",
  h: "h (coeff)",
  T_inf: "T inf",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function presetsForType(
  analysisType: TestBedConfigProps["analysisType"]
): PresetDef[] {
  if (analysisType === "general") return ALL_PRESETS;
  return ALL_PRESETS.filter((p) => p.category === analysisType);
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case "chippackage":
      return "Chip Package";
    case "structural":
      return "Structural";
    case "thermal":
      return "Thermal";
    default:
      return cat;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TestBedConfig({
  analysisType,
  onApply,
  onClose,
}: TestBedConfigProps) {
  /* ---- state ---- */
  const [configName, setConfigName] = useState("Custom Test Bed");
  const [ambientTemp, setAmbientTemp] = useState(25);
  const [mounting, setMounting] = useState<
    "Free" | "Fixed-Base" | "Clamped-All"
  >("Free");
  const [convection, setConvection] = useState<"Natural" | "Forced">(
    "Natural"
  );
  const [convectionVelocity, setConvectionVelocity] = useState(1.0);

  const [loadType, setLoadType] = useState("");
  const [loadParams, setLoadParams] = useState<Record<string, number>>({});

  /* ---- preset selection ---- */
  const applyPreset = useCallback((preset: PresetDef) => {
    setConfigName(preset.label);
    setLoadType(preset.type);
    setLoadParams({ ...preset.params });
  }, []);

  /* ---- param editing ---- */
  const updateLoadParam = useCallback((key: string, raw: string) => {
    const v = parseFloat(raw);
    setLoadParams((prev) => ({ ...prev, [key]: isNaN(v) ? 0 : v }));
  }, []);

  /* ---- submit ---- */
  const handleApply = useCallback(() => {
    const config: TestBedConfiguration = {
      name: configName,
      environment: {
        ambientTemp,
        mounting,
        convection,
        ...(convection === "Forced"
          ? { convectionVelocity }
          : {}),
      },
      loadScenario: {
        type: loadType || "Custom",
        params: { ...loadParams },
      },
    };
    onApply(config);
  }, [
    configName,
    ambientTemp,
    mounting,
    convection,
    convectionVelocity,
    loadType,
    loadParams,
    onApply,
  ]);

  /* ---- derived ---- */
  const presets = presetsForType(analysisType);

  /* Group presets by category when showing "general" */
  const grouped =
    analysisType === "general"
      ? (["chippackage", "structural", "thermal"] as const).map((cat) => ({
          cat,
          items: presets.filter((p) => p.category === cat),
        }))
      : [{ cat: analysisType, items: presets }];

  /* ---- render ---- */
  return (
    <div className="tbc-overlay" onClick={onClose}>
      <div className="tbc-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tbc-header">
          <h3 className="tbc-title">Test Bed Configuration</h3>
          <span className="tbc-analysis-badge">
            {categoryLabel(analysisType)}
          </span>
        </div>

        <div className="tbc-body">
          {/* -------- Environment Conditions -------- */}
          <section className="tbc-section">
            <div className="tbc-section-title">Environment Conditions</div>

            <div className="tbc-field">
              <label>Ambient Temperature</label>
              <div className="tbc-input-wrap">
                <input
                  type="number"
                  className="tbc-input"
                  value={ambientTemp}
                  onChange={(e) =>
                    setAmbientTemp(parseFloat(e.target.value) || 0)
                  }
                />
                <span className="tbc-unit">{"\u00b0C"}</span>
              </div>
            </div>

            <div className="tbc-field">
              <label>Mounting Configuration</label>
              <select
                className="tbc-select"
                value={mounting}
                onChange={(e) =>
                  setMounting(
                    e.target.value as "Free" | "Fixed-Base" | "Clamped-All"
                  )
                }
              >
                <option value="Free">Free</option>
                <option value="Fixed-Base">Fixed-Base</option>
                <option value="Clamped-All">Clamped-All</option>
              </select>
            </div>

            <div className="tbc-field">
              <label>Convection Environment</label>
              <select
                className="tbc-select"
                value={convection}
                onChange={(e) =>
                  setConvection(e.target.value as "Natural" | "Forced")
                }
              >
                <option value="Natural">Natural</option>
                <option value="Forced">Forced</option>
              </select>
            </div>

            {convection === "Forced" && (
              <div className="tbc-field">
                <label>Air Velocity</label>
                <div className="tbc-input-wrap">
                  <input
                    type="number"
                    className="tbc-input"
                    step="0.1"
                    value={convectionVelocity}
                    onChange={(e) =>
                      setConvectionVelocity(parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="tbc-unit">m/s</span>
                </div>
              </div>
            )}
          </section>

          {/* -------- Load Scenario Presets -------- */}
          <section className="tbc-section">
            <div className="tbc-section-title">Load Scenario Presets</div>

            {grouped.map(({ cat, items }) => (
              <div key={cat} className="tbc-preset-group">
                {analysisType === "general" && (
                  <div className="tbc-preset-group-label">
                    {categoryLabel(cat)}
                  </div>
                )}
                <div className="tbc-preset-grid">
                  {items.map((preset) => (
                    <button
                      key={preset.type}
                      className={`tbc-preset-card${
                        loadType === preset.type ? " tbc-preset-active" : ""
                      }`}
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="tbc-preset-name">{preset.label}</span>
                      <span className="tbc-preset-summary">
                        {Object.entries(preset.params)
                          .map(
                            ([k, v]) =>
                              `${PARAM_LABELS[k] ?? k}: ${v}${
                                PRESET_UNITS[k] ? " " + PRESET_UNITS[k] : ""
                              }`
                          )
                          .join(", ")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* -------- Custom Configuration -------- */}
          <section className="tbc-section">
            <div className="tbc-section-title">Custom Configuration</div>

            <div className="tbc-field">
              <label>Configuration Name</label>
              <input
                type="text"
                className="tbc-input tbc-input-full"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
              />
            </div>

            {Object.keys(loadParams).length > 0 && (
              <div className="tbc-custom-params">
                {Object.entries(loadParams).map(([key, val]) => (
                  <div className="tbc-field tbc-field-inline" key={key}>
                    <label>{PARAM_LABELS[key] ?? key}</label>
                    <div className="tbc-input-wrap">
                      <input
                        type="number"
                        className="tbc-input"
                        step="any"
                        value={val}
                        onChange={(e) => updateLoadParam(key, e.target.value)}
                      />
                      {PRESET_UNITS[key] && (
                        <span className="tbc-unit">{PRESET_UNITS[key]}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(loadParams).length === 0 && (
              <p className="tbc-hint">
                Select a preset above to populate parameters, then customise as
                needed.
              </p>
            )}
          </section>
        </div>

        {/* -------- Pass Criteria (if from library test) -------- */}
        {configName && (
          <div className="tbc-criteria-hint" style={{
            padding: "8px 16px",
            fontSize: "0.75rem",
            color: "var(--text-muted, #707090)",
            borderTop: "1px solid var(--border, #3a3a55)",
          }}>
            Pass/fail criteria will be auto-evaluated from the test library when using "Test Bed" from the ResultViewer.
            Open the <strong>Test Library</strong> (toolbar) for 32 industry-standard tests with built-in criteria.
          </div>
        )}

        {/* -------- Actions -------- */}
        <div className="tbc-actions">
          <button className="tbc-btn tbc-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="tbc-btn tbc-btn-apply" onClick={handleApply}>
            Apply Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
