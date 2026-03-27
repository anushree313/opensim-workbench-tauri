import { useState, useEffect, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Workbench } from "./components/workbench/Workbench";
import { useProjectStore } from "./stores/projectStore";

const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;

// Error boundary to catch render crashes
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="loading">
          <h2>OpenSim Workbench</h2>
          <p style={{ color: "#ff6666" }}>Something went wrong: {this.state.error}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: "" });
              window.location.reload();
            }}
            style={{ marginTop: 16, padding: "8px 20px" }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  return (
    <ErrorBoundary>
      <Workbench />
    </ErrorBoundary>
  );
}

export default App;
