import { useProjectStore } from "../../stores/projectStore";
import type { SystemCategory, ToolboxEntry } from "../../types/project";
import "./Toolbox.css";

const CATEGORY_ORDER: SystemCategory[] = [
  "Analysis",
  "Component",
  "DesignExploration",
];

const CATEGORY_LABELS: Record<SystemCategory, string> = {
  Analysis: "Analysis Systems",
  Component: "Component Systems",
  DesignExploration: "Design Exploration",
};

export function Toolbox() {
  const { toolbox, addSystem, schematic } = useProjectStore();

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    entries: toolbox.filter((e: ToolboxEntry) => e.category === cat),
  }));

  const handleAdd = async (entry: ToolboxEntry) => {
    const nodeCount = schematic?.nodes.length ?? 0;
    const x = 100 + (nodeCount % 4) * 220;
    const y = 80 + Math.floor(nodeCount / 4) * 260;
    await addSystem(entry.kind, [x, y]);
  };

  return (
    <div className="toolbox">
      <div className="toolbox-header">Toolbox</div>
      {grouped.map((group) => (
        <div key={group.category} className="toolbox-group">
          <div className="toolbox-group-header">{group.label}</div>
          {group.entries.map((entry: ToolboxEntry) => (
            <div
              key={entry.kind}
              className="toolbox-item"
              onClick={() => handleAdd(entry)}
              title={`Add ${entry.display_name} to schematic`}
            >
              <span className="toolbox-item-icon">
                {getIcon(entry.category)}
              </span>
              <span className="toolbox-item-label">{entry.display_name}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function getIcon(category: SystemCategory): string {
  switch (category) {
    case "Analysis":
      return "\u25B6";
    case "Component":
      return "\u25A0";
    case "DesignExploration":
      return "\u25C6";
  }
}
