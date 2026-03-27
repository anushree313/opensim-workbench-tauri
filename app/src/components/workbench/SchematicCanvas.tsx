import { useProjectStore } from "../../stores/projectStore";
import { SystemCard } from "./SystemCard";
import type { SystemNodeDto } from "../../types/project";
import "./SchematicCanvas.css";

interface Props {
  selectedNodeId: string | null;
  onSelectNode: (node: SystemNodeDto | null) => void;
  onOpenGeometry?: (node: SystemNodeDto) => void;
  onOpenMesh?: (node: SystemNodeDto) => void;
  onOpenResult?: (node: SystemNodeDto) => void;
  onOpenDE?: (node: SystemNodeDto) => void;
  onOpenChipPackage?: (node: SystemNodeDto) => void;
}

export function SchematicCanvas({
  selectedNodeId,
  onSelectNode,
  onOpenGeometry,
  onOpenMesh,
  onOpenResult,
  onOpenDE,
  onOpenChipPackage,
}: Props) {
  const { schematic } = useProjectStore();

  if (!schematic) return null;

  return (
    <div
      className="schematic-canvas"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectNode(null);
      }}
    >
      <div className="schematic-header">
        Project Schematic
        <span className="schematic-count">
          {schematic.nodes.length} system
          {schematic.nodes.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="schematic-area">
        {schematic.nodes.length === 0 && (
          <div className="schematic-empty">
            Click items in the Toolbox to add analysis systems
          </div>
        )}
        <svg className="schematic-connections">
          {schematic.connections.map((conn) => {
            const sourceNode = schematic.nodes.find(
              (n) => n.id === conn.source
            );
            const targetNode = schematic.nodes.find(
              (n) => n.id === conn.target
            );
            if (!sourceNode || !targetNode) return null;
            const x1 = sourceNode.position[0] + 100;
            const y1 = sourceNode.position[1] + 40;
            const x2 = targetNode.position[0] + 100;
            const y2 = targetNode.position[1] + 40;
            return (
              <line
                key={conn.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--accent)"
                strokeWidth="2"
                strokeDasharray="4,4"
                opacity="0.5"
              />
            );
          })}
        </svg>
        {schematic.nodes.map((node) => (
          <SystemCard
            key={node.id}
            node={node}
            selected={node.id === selectedNodeId}
            onSelect={() => onSelectNode(node)}
            onDoubleClick={
              node.kind === "Geometry" && onOpenGeometry
                ? () => onOpenGeometry(node)
                : node.kind === "Mesh" && onOpenMesh
                  ? () => onOpenMesh(node)
                  : node.kind === "ChipPackageAnalysis" && onOpenChipPackage
                    ? () => onOpenChipPackage(node)
                    : node.category === "Analysis" && onOpenResult
                      ? () => onOpenResult(node)
                      : node.category === "DesignExploration" && onOpenDE
                        ? () => onOpenDE(node)
                        : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
