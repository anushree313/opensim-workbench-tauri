import { useProjectStore } from "../../stores/projectStore";
import "./Toolbar.css";

export function Toolbar() {
  const { schematic, newProject, handleSave, handleOpen, isSaving } = useProjectStore();

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
      </div>
      <div className="toolbar-right">
        <span className="toolbar-status">v0.2.0</span>
      </div>
    </div>
  );
}
