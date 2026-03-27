import type { SystemNodeDto, GeometryViewDto } from "../../types/project";
import "./PropertiesPanel.css";

interface Props {
  node: SystemNodeDto | null;
  geometryView?: GeometryViewDto;
}

export function PropertiesPanel({ node, geometryView }: Props) {
  return (
    <div className="properties-panel">
      <div className="properties-header">Properties</div>

      {geometryView ? (
        <div className="properties-content">
          <div className="property-section">
            <div className="property-section-title">Geometry Model</div>
            <div className="property-row">
              <span className="property-label">Name</span>
              <span className="property-value">
                {geometryView.model.name}
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">Bodies</span>
              <span className="property-value">
                {geometryView.model.bodies.length}
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">ID</span>
              <span className="property-value property-id">
                {geometryView.model.id.slice(0, 8)}...
              </span>
            </div>
          </div>

          {geometryView.model.bodies.map((body) => (
            <div key={body.id} className="property-section">
              <div className="property-section-title">{body.name}</div>
              <div className="property-row">
                <span className="property-label">Type</span>
                <span className="property-value">
                  {body.primitive_kind ?? "Imported Mesh"}
                </span>
              </div>
              {body.bounding_box && (
                <>
                  <div className="property-row">
                    <span className="property-label">Min</span>
                    <span className="property-value property-id">
                      [{body.bounding_box[0].map((v) => v.toFixed(2)).join(", ")}]
                    </span>
                  </div>
                  <div className="property-row">
                    <span className="property-label">Max</span>
                    <span className="property-value property-id">
                      [{body.bounding_box[1].map((v) => v.toFixed(2)).join(", ")}]
                    </span>
                  </div>
                </>
              )}
              <div className="property-row">
                <span className="property-label">ID</span>
                <span className="property-value property-id">
                  {body.id.slice(0, 8)}...
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : node ? (
        <div className="properties-content">
          <div className="property-section">
            <div className="property-section-title">System Info</div>
            <div className="property-row">
              <span className="property-label">Name</span>
              <span className="property-value">{node.name}</span>
            </div>
            <div className="property-row">
              <span className="property-label">Type</span>
              <span className="property-value">{node.display_name}</span>
            </div>
            <div className="property-row">
              <span className="property-label">Category</span>
              <span className="property-value">{node.category}</span>
            </div>
            <div className="property-row">
              <span className="property-label">State</span>
              <span className={`property-value state-text-${node.state.toLowerCase()}`}>
                {node.state}
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">ID</span>
              <span className="property-value property-id">
                {node.id.slice(0, 8)}...
              </span>
            </div>
            {node.geometry_id && (
              <div className="property-row">
                <span className="property-label">Geometry</span>
                <span className="property-value property-id">
                  {node.geometry_id.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>

          <div className="property-section">
            <div className="property-section-title">
              Cells ({node.cells.length})
            </div>
            {node.cells.map((cell) => (
              <div key={cell.id} className="property-row">
                <span className="property-label">{cell.display_name}</span>
                <span className={`property-value state-text-${cell.state.toLowerCase()}`}>
                  {cell.state}
                </span>
              </div>
            ))}
          </div>

          <div className="property-section">
            <div className="property-section-title">Position</div>
            <div className="property-row">
              <span className="property-label">X</span>
              <span className="property-value">
                {node.position[0].toFixed(0)}
              </span>
            </div>
            <div className="property-row">
              <span className="property-label">Y</span>
              <span className="property-value">
                {node.position[1].toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="properties-empty">
          Select a system to view its properties
        </div>
      )}
    </div>
  );
}
