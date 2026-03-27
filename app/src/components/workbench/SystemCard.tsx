import type { SystemNodeDto, NodeState } from "../../types/project";
import { useProjectStore } from "../../stores/projectStore";
import "./SystemCard.css";

interface Props {
  node: SystemNodeDto;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
}

export function SystemCard({ node, selected, onSelect, onDoubleClick }: Props) {
  const { removeSystem } = useProjectStore();
  const isOpenable = node.kind === "Geometry" || node.kind === "Mesh" || node.category === "Analysis" || node.category === "DesignExploration";

  return (
    <div
      className={`system-card ${selected ? "selected" : ""} category-${node.category.toLowerCase()} ${isOpenable ? "openable" : ""}`}
      style={{
        left: node.position[0],
        top: node.position[1],
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onDoubleClick) onDoubleClick();
      }}
    >
      <div className="system-card-header">
        <span className="system-card-title">{node.name}</span>
        <button
          className="system-card-remove"
          onClick={(e) => {
            e.stopPropagation();
            removeSystem(node.id);
          }}
          title="Remove system"
        >
          x
        </button>
      </div>
      <div className="system-card-cells">
        {node.cells.map((cell) => (
          <div key={cell.id} className="system-card-cell">
            <span className={`cell-state-dot state-${cell.state.toLowerCase()}`} />
            <span className="cell-label">{cell.display_name}</span>
          </div>
        ))}
      </div>
      <div className={`system-card-status state-${node.state.toLowerCase()}`}>
        {stateLabel(node.state)}
      </div>
      {isOpenable && (
        <div className="system-card-hint">Double-click to open</div>
      )}
    </div>
  );
}

function stateLabel(state: NodeState): string {
  switch (state) {
    case "NotConfigured":
      return "Not Configured";
    case "Clean":
      return "Up to Date";
    case "Dirty":
      return "Needs Update";
    case "Solving":
      return "Solving...";
    case "Solved":
      return "Solved";
    case "Failed":
      return "Failed";
  }
}
