import { useState, useRef, useCallback } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { SystemCard } from "./SystemCard";
import type { SystemNodeDto, SystemKind, ConnectionKind } from "../../types/project";
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

interface DragState {
  nodeId: string;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
}

interface ConnectingState {
  fromId: string;
  mouseX: number;
  mouseY: number;
}

function autoConnectionKind(sourceKind: string): ConnectionKind {
  if (sourceKind === "Geometry") return "GeometryShare";
  if (sourceKind === "Mesh") return "MeshShare";
  if (sourceKind === "EngineeringData") return "EngineeringDataShare";
  return "ResultTransfer";
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
  const { schematic, addSystem, connectSystems, updateNodePosition } = useProjectStore();
  const areaRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState<Record<string, [number, number]>>({});
  const [connecting, setConnecting] = useState<ConnectingState | null>(null);

  // --- Drop from toolbox ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/opensim-kind")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const kind = e.dataTransfer.getData("application/opensim-kind") as SystemKind;
    if (!kind || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + areaRef.current.scrollLeft - 100;
    const y = e.clientY - rect.top + areaRef.current.scrollTop - 40;
    await addSystem(kind, [Math.max(0, x), Math.max(0, y)]);
  }, [addSystem]);

  // --- Card dragging ---
  const handleCardDragStart = useCallback((nodeId: string, offsetX: number, offsetY: number, startX: number, startY: number) => {
    setDragging({ nodeId, offsetX, offsetY, startX, startY });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging && areaRef.current) {
      const rect = areaRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + areaRef.current.scrollLeft - dragging.offsetX;
      const y = e.clientY - rect.top + areaRef.current.scrollTop - dragging.offsetY;
      setDragPos((prev) => ({ ...prev, [dragging.nodeId]: [Math.max(0, x), Math.max(0, y)] }));
    }
    if (connecting && areaRef.current) {
      const rect = areaRef.current.getBoundingClientRect();
      setConnecting((prev) => prev ? {
        ...prev,
        mouseX: e.clientX - rect.left + areaRef.current!.scrollLeft,
        mouseY: e.clientY - rect.top + areaRef.current!.scrollTop,
      } : null);
    }
  }, [dragging, connecting]);

  const handleMouseUp = useCallback(() => {
    if (dragging && dragPos[dragging.nodeId]) {
      updateNodePosition(dragging.nodeId, dragPos[dragging.nodeId]);
    }
    setDragging(null);
  }, [dragging, dragPos, updateNodePosition]);

  // --- Connection builder ---
  const handleStartConnect = useCallback((nodeId: string) => {
    if (connecting) {
      // Complete connection
      if (connecting.fromId !== nodeId) {
        const sourceNode = schematic?.nodes.find((n) => n.id === connecting.fromId);
        if (sourceNode) {
          const kind = autoConnectionKind(sourceNode.kind);
          connectSystems(connecting.fromId, nodeId, kind);
        }
      }
      setConnecting(null);
    } else {
      setConnecting({ fromId: nodeId, mouseX: 0, mouseY: 0 });
    }
  }, [connecting, schematic, connectSystems]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("schematic-area")) {
      onSelectNode(null);
      setConnecting(null);
    }
  }, [onSelectNode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setConnecting(null);
  }, []);

  if (!schematic) return null;

  const getNodePos = (node: SystemNodeDto): [number, number] =>
    dragPos[node.id] ?? node.position;

  return (
    <div
      className="schematic-canvas"
      onClick={handleCanvasClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="schematic-header">
        Project Schematic
        <span className="schematic-count">
          {schematic.nodes.length} system
          {schematic.nodes.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div
        ref={areaRef}
        className={`schematic-area ${dragOver ? "drag-over" : ""} ${connecting ? "connecting-mode" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {schematic.nodes.length === 0 && !dragOver && (
          <div className="schematic-empty">
            Drag items from the Toolbox or click to add analysis systems
          </div>
        )}
        {dragOver && (
          <div className="schematic-drop-hint">
            Drop here to add system
          </div>
        )}
        <svg className="schematic-connections">
          {/* Existing connections */}
          {schematic.connections.map((conn) => {
            const sourceNode = schematic.nodes.find((n) => n.id === conn.source);
            const targetNode = schematic.nodes.find((n) => n.id === conn.target);
            if (!sourceNode || !targetNode) return null;
            const sp = getNodePos(sourceNode);
            const tp = getNodePos(targetNode);
            const x1 = sp[0] + 200; // right edge of source (output port)
            const y1 = sp[1] + 40;
            const x2 = tp[0];        // left edge of target (input port)
            const y2 = tp[1] + 40;
            return (
              <line
                key={conn.id}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--accent)"
                strokeWidth="2"
                strokeDasharray="6,3"
                opacity="0.6"
              />
            );
          })}
          {/* Rubber-band line while connecting */}
          {connecting && (() => {
            const fromNode = schematic.nodes.find((n) => n.id === connecting.fromId);
            if (!fromNode) return null;
            const fp = getNodePos(fromNode);
            return (
              <line
                x1={fp[0] + 200} y1={fp[1] + 40}
                x2={connecting.mouseX} y2={connecting.mouseY}
                stroke="var(--success)"
                strokeWidth="2"
                strokeDasharray="4,4"
                opacity="0.8"
              />
            );
          })()}
        </svg>
        {schematic.nodes.map((node) => (
          <SystemCard
            key={node.id}
            node={node}
            position={getNodePos(node)}
            selected={node.id === selectedNodeId}
            connecting={connecting?.fromId === node.id}
            isConnectTarget={connecting !== null && connecting.fromId !== node.id}
            onSelect={() => onSelectNode(node)}
            onDragStart={handleCardDragStart}
            onPortClick={() => handleStartConnect(node.id)}
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
