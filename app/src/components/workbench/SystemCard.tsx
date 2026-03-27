import { useCallback } from "react";
import type { SystemNodeDto, NodeState } from "../../types/project";
import { useProjectStore } from "../../stores/projectStore";
import "./SystemCard.css";

interface Props {
  node: SystemNodeDto;
  position: [number, number];
  selected: boolean;
  connecting: boolean;
  isConnectTarget: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
  onDragStart: (nodeId: string, offsetX: number, offsetY: number, startX: number, startY: number) => void;
  onPortClick: () => void;
}

export function SystemCard({ node, position, selected, connecting, isConnectTarget, onSelect, onDoubleClick, onDragStart, onPortClick }: Props) {
  const { removeSystem } = useProjectStore();
  const isOpenable = node.kind === "Geometry" || node.kind === "Mesh" || node.category === "Analysis" || node.category === "DesignExploration";

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("system-card-remove")) return;
    e.preventDefault();
    const cardEl = (e.currentTarget as HTMLElement).parentElement!;
    const rect = cardEl.getBoundingClientRect();
    onDragStart(node.id, e.clientX - rect.left, e.clientY - rect.top, position[0], position[1]);
  }, [node.id, position, onDragStart]);

  return (
    <div
      className={`system-card ${selected ? "selected" : ""} category-${node.category.toLowerCase()} ${isOpenable ? "openable" : ""} ${connecting ? "connecting-source" : ""} ${isConnectTarget ? "connect-target" : ""}`}
      style={{ left: position[0], top: position[1] }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); if (onDoubleClick) onDoubleClick(); }}
    >
      {/* Input port (left) */}
      <div
        className={`card-port card-port-in ${isConnectTarget ? "port-active" : ""}`}
        title="Connect input"
        onClick={(e) => { e.stopPropagation(); onPortClick(); }}
      />
      {/* Output port (right) */}
      <div
        className={`card-port card-port-out ${connecting ? "port-source" : ""}`}
        title="Connect output"
        onClick={(e) => { e.stopPropagation(); onPortClick(); }}
      />

      <div className="system-card-header" onMouseDown={handleHeaderMouseDown}>
        <span className="system-card-title">{node.name}</span>
        <button
          className="system-card-remove"
          onClick={(e) => { e.stopPropagation(); removeSystem(node.id); }}
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
    case "NotConfigured": return "Not Configured";
    case "Clean": return "Up to Date";
    case "Dirty": return "Needs Update";
    case "Solving": return "Solving...";
    case "Solved": return "Solved";
    case "Failed": return "Failed";
  }
}
