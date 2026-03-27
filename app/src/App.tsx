import { useState, useEffect } from "react";
import { Workbench } from "./components/workbench/Workbench";
import { useProjectStore } from "./stores/projectStore";

const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

function App() {
  const { schematic, newProject, initMockData } = useProjectStore();
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialized) return;

    if (isTauri) {
      newProject("Untitled Project")
        .then(() => setInitialized(true))
        .catch((e) => setError(String(e)));
    } else {
      // Browser preview mode — load mock data
      initMockData();
      setInitialized(true);
    }
  }, [initialized, newProject, initMockData]);

  if (error) {
    return (
      <div className="loading">
        <h2>OpenSim Workbench</h2>
        <p style={{ color: "#ff6666" }}>Error: {error}</p>
      </div>
    );
  }

  if (!initialized || !schematic) {
    return (
      <div className="loading">
        <h2>OpenSim Workbench</h2>
        <p>Initializing...</p>
      </div>
    );
  }

  return <Workbench />;
}

export default App;
