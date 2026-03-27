import { useState, useCallback, useEffect } from "react";
import type { SimulationRecord } from "../types/simulation";

/* ================================================================== */
/*  Module-level state                                                 */
/* ================================================================== */

let _records: SimulationRecord[] = [];
let _selectedRecordIds: string[] = []; // max 2 for compare
let _historyOpen = false;
let _compareOpen = false;
let _reportOpen = false;
let _reportHtml = "";
let _suiteRunnerOpen = false;
let _suiteScenarioId = "";

/* ---- Scenario Persistence --------------------------------------- */

export interface SavedScenario {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  recordCount: number;
  records: SimulationRecord[];
}

const SCENARIOS_KEY = "opensim-saved-scenarios";

let _savedScenarios: SavedScenario[] = loadScenariosFromStorage();

function loadScenariosFromStorage(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistScenarios(): void {
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(_savedScenarios));
}

export function saveScenario(name: string, description: string): string {
  const id = crypto.randomUUID();
  const scenario: SavedScenario = {
    id,
    name,
    description,
    createdAt: new Date().toISOString(),
    recordCount: _records.length,
    records: [..._records],
  };
  _savedScenarios = [..._savedScenarios, scenario];
  persistScenarios();
  notify();
  return id;
}

export function loadScenario(id: string): boolean {
  const scenario = _savedScenarios.find((s) => s.id === id);
  if (!scenario) return false;
  _records = [...scenario.records];
  _selectedRecordIds = [];
  notify();
  return true;
}

export function deleteScenario(id: string): void {
  _savedScenarios = _savedScenarios.filter((s) => s.id !== id);
  persistScenarios();
  notify();
}

export function getSavedScenarios(): SavedScenario[] {
  return _savedScenarios;
}

export function exportScenarioJSON(id: string): string | null {
  const scenario = _savedScenarios.find((s) => s.id === id);
  return scenario ? JSON.stringify(scenario, null, 2) : null;
}

export function importScenarioJSON(json: string): boolean {
  try {
    const scenario = JSON.parse(json) as SavedScenario;
    scenario.id = crypto.randomUUID(); // new ID to avoid conflicts
    _savedScenarios = [..._savedScenarios, scenario];
    persistScenarios();
    notify();
    return true;
  } catch { return false; }
}

/* ================================================================== */
/*  Listener / notify pattern                                          */
/* ================================================================== */

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

/* ================================================================== */
/*  Hook                                                               */
/* ================================================================== */

/* ================================================================== */
/*  Standalone exports (for non-React callers like chatStore)          */
/* ================================================================== */

export function recordSimulation(record: Omit<SimulationRecord, "id">): string {
  const id = crypto.randomUUID();
  const full: SimulationRecord = { ...record, id };
  _records = [..._records, full];
  notify();
  return id;
}

export function getRecord(id: string): SimulationRecord | undefined {
  return _records.find((r) => r.id === id);
}

export function getRecords(): SimulationRecord[] {
  return _records;
}

export function openReportDirect(html: string) {
  _reportHtml = html;
  _reportOpen = true;
  notify();
}

export function openSuiteRunner(scenarioId: string) {
  _suiteScenarioId = scenarioId;
  _suiteRunnerOpen = true;
  notify();
}

export function closeSuiteRunner() {
  _suiteRunnerOpen = false;
  _suiteScenarioId = "";
  notify();
}

/* ================================================================== */
/*  Hook                                                               */
/* ================================================================== */

export function useSimulationStore() {
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    listeners.add(forceUpdate);
    return () => {
      listeners.delete(forceUpdate);
    };
  }, [forceUpdate]);

  /* ---- Getters --------------------------------------------------- */

  const records = _records;
  const selectedRecordIds = _selectedRecordIds;
  const historyOpen = _historyOpen;
  const compareOpen = _compareOpen;
  const reportOpen = _reportOpen;
  const reportHtml = _reportHtml;

  /* ---- Record management ----------------------------------------- */

  const recordSimulation = useCallback(
    (record: Omit<SimulationRecord, "id">): string => {
      const id = crypto.randomUUID();
      const full: SimulationRecord = { ...record, id };
      _records = [..._records, full];
      notify();
      return id;
    },
    [],
  );

  const getRecord = useCallback(
    (id: string): SimulationRecord | undefined => {
      return _records.find((r) => r.id === id);
    },
    [],
  );

  const getFilteredRecords = useCallback(
    (solverType?: string, search?: string): SimulationRecord[] => {
      let result = _records;
      if (solverType) {
        result = result.filter((r) => r.solver_type === solverType);
      }
      if (search) {
        const lower = search.toLowerCase();
        result = result.filter((r) =>
          r.node_name.toLowerCase().includes(lower),
        );
      }
      return result;
    },
    [],
  );

  const deleteRecord = useCallback((id: string) => {
    _records = _records.filter((r) => r.id !== id);
    _selectedRecordIds = _selectedRecordIds.filter((sid) => sid !== id);
    notify();
  }, []);

  /* ---- Compare selection ----------------------------------------- */

  const selectForCompare = useCallback((id: string) => {
    const idx = _selectedRecordIds.indexOf(id);
    if (idx >= 0) {
      // Toggle off
      _selectedRecordIds = _selectedRecordIds.filter((sid) => sid !== id);
    } else if (_selectedRecordIds.length < 2) {
      _selectedRecordIds = [..._selectedRecordIds, id];
    } else {
      // Already 2 selected — replace oldest (first)
      _selectedRecordIds = [_selectedRecordIds[1], id];
    }
    notify();
  }, []);

  const clearCompare = useCallback(() => {
    _selectedRecordIds = [];
    notify();
  }, []);

  /* ---- Panel toggles --------------------------------------------- */

  const toggleHistory = useCallback(() => {
    _historyOpen = !_historyOpen;
    notify();
  }, []);

  const openCompare = useCallback(() => {
    _compareOpen = true;
    notify();
  }, []);

  const closeCompare = useCallback(() => {
    _compareOpen = false;
    notify();
  }, []);

  const openReport = useCallback((html: string) => {
    _reportHtml = html;
    _reportOpen = true;
    notify();
  }, []);

  const closeReport = useCallback(() => {
    _reportOpen = false;
    _reportHtml = "";
    notify();
  }, []);

  /* ---- Import / Export ------------------------------------------- */

  const exportRecords = useCallback((): string => {
    return JSON.stringify(_records);
  }, []);

  const importRecords = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as SimulationRecord[];
      _records = parsed;
      _selectedRecordIds = [];
      notify();
    } catch (e) {
      console.error("Failed to import simulation records:", e);
    }
  }, []);

  return {
    // Getters
    records,
    selectedRecordIds,
    historyOpen,
    compareOpen,
    reportOpen,
    reportHtml,

    // Record management
    recordSimulation,
    getRecord,
    getFilteredRecords,
    deleteRecord,

    // Compare
    selectForCompare,
    clearCompare,

    // Panels
    toggleHistory,
    openCompare,
    closeCompare,
    openReport,
    closeReport,

    // Import / Export
    exportRecords,
    importRecords,

    // Suite runner
    suiteRunnerOpen: _suiteRunnerOpen,
    suiteScenarioId: _suiteScenarioId,
    openSuiteRunner: useCallback((scenarioId: string) => { openSuiteRunner(scenarioId); }, []),
    closeSuiteRunner: useCallback(() => { closeSuiteRunner(); }, []),

    // Scenarios
    savedScenarios: _savedScenarios,
    saveScenario: useCallback((name: string, desc: string) => saveScenario(name, desc), []),
    loadScenario: useCallback((id: string) => loadScenario(id), []),
    deleteScenario: useCallback((id: string) => deleteScenario(id), []),
    exportScenarioJSON: useCallback((id: string) => exportScenarioJSON(id), []),
    importScenarioJSON: useCallback((json: string) => importScenarioJSON(json), []),
  };
}
