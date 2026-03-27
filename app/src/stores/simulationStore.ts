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
  };
}
