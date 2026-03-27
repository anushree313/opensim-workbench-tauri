import { useProjectStore } from "../../stores/projectStore";
import "./Toolbar.css";

interface ToolbarProps {
  chatOpen?: boolean;
  onToggleChat?: () => void;
  onToggleHistory?: () => void;
  onOpenSettings?: () => void;
  onOpenTestLibrary?: () => void;
  onOpenMaterials?: () => void;
  onOpenScenarios?: () => void;
}

export function Toolbar({
  chatOpen,
  onToggleChat,
  onToggleHistory,
  onOpenSettings,
  onOpenTestLibrary,
  onOpenMaterials,
  onOpenScenarios,
}: ToolbarProps) {
  const { schematic, newProject, handleSave, handleOpen, isSaving } =
    useProjectStore();

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <span className="toolbar-brand">OpenSim Workbench</span>
        <span className="toolbar-separator">|</span>
        <span className="toolbar-project-name">
          {schematic?.project_name ?? "No Project"}
        </span>
      </div>
      <div className="toolbar-center">
        <button onClick={() => newProject("New Project")}>New</button>
        <button onClick={handleOpen}>Open</button>
        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button className="toolbar-run-btn" disabled>
          Run All
        </button>
        <button onClick={onOpenTestLibrary} title="Chip Test Library">
          Test Library
        </button>
        <button onClick={onOpenMaterials} title="Material Manager">
          Materials
        </button>
        <button onClick={onOpenScenarios} title="Scenario Manager">
          Scenarios
        </button>
      </div>
      <div className="toolbar-right">
        <button
          className="toolbar-icon-btn"
          onClick={onToggleHistory}
          title="Simulation History"
        >
          &#x1F552;
        </button>
        <button
          className={`toolbar-icon-btn ${chatOpen ? "toolbar-icon-active" : ""}`}
          onClick={onToggleChat}
          title="AI Chat"
        >
          &#x1F4AC;
        </button>
        <button
          className="toolbar-icon-btn"
          onClick={onOpenSettings}
          title="AI Settings"
        >
          &#x2699;
        </button>
        <span className="toolbar-status">v0.6.0</span>
      </div>
    </div>
  );
}
