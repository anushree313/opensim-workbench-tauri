import { useState, useCallback } from "react";
import {
  MATERIALS,
  BUILTIN_MATERIAL_NAMES,
  saveCustomMaterial,
  deleteCustomMaterial,
  getCustomMaterials,
} from "../../utils/chipCalculations";
import type { ChipMaterial } from "../../utils/chipCalculations";
import "./MaterialManager.css";

interface MaterialManagerProps {
  onClose: () => void;
}

function defaultMaterial(): ChipMaterial {
  return {
    name: "",
    k: 1.0,
    E: 1e9,
    nu: 0.3,
    cte: 10e-6,
    density: 1000,
    cp: 500,
    shearStrength: 10e6,
    color: "#888888",
  };
}

function buildMaterialList(): ChipMaterial[] {
  return Object.values(MATERIALS);
}

export function MaterialManager({ onClose }: MaterialManagerProps) {
  const [materialList, setMaterialList] = useState<ChipMaterial[]>(buildMaterialList);
  const [selectedMaterialName, setSelectedMaterialName] = useState<string | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<ChipMaterial | null>(null);

  const refreshList = useCallback(() => {
    setMaterialList(buildMaterialList());
  }, []);

  const handleSelect = useCallback((mat: ChipMaterial) => {
    setSelectedMaterialName(mat.name);
    setEditingMaterial({ ...mat });
  }, []);

  const handleAddNew = useCallback(() => {
    const blank = defaultMaterial();
    setSelectedMaterialName(null);
    setEditingMaterial(blank);
  }, []);

  const handleSave = useCallback(() => {
    if (!editingMaterial || !editingMaterial.name.trim()) return;
    saveCustomMaterial(editingMaterial);
    refreshList();
    setSelectedMaterialName(editingMaterial.name);
  }, [editingMaterial, refreshList]);

  const handleDelete = useCallback(
    (name: string) => {
      if (BUILTIN_MATERIAL_NAMES.has(name)) return;
      deleteCustomMaterial(name);
      refreshList();
      if (selectedMaterialName === name) {
        setSelectedMaterialName(null);
        setEditingMaterial(null);
      }
    },
    [selectedMaterialName, refreshList],
  );

  const handleFieldChange = useCallback(
    (field: keyof ChipMaterial, value: string | number) => {
      if (!editingMaterial) return;
      setEditingMaterial({ ...editingMaterial, [field]: value });
    },
    [editingMaterial],
  );

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleExport = useCallback(() => {
    const customs = getCustomMaterials();
    const json = JSON.stringify(customs, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opensim-custom-materials.json";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string) as Record<string, ChipMaterial>;
          for (const mat of Object.values(parsed)) {
            if (mat.name) {
              saveCustomMaterial(mat);
            }
          }
          refreshList();
        } catch {
          /* ignore parse errors */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [refreshList]);

  const isBuiltin = editingMaterial
    ? BUILTIN_MATERIAL_NAMES.has(editingMaterial.name)
    : false;

  const isSelectedBuiltin = selectedMaterialName
    ? BUILTIN_MATERIAL_NAMES.has(selectedMaterialName)
    : false;

  return (
    <div className="material-overlay" onClick={handleOverlayClick}>
      <div className="material-panel">
        <div className="material-header">
          <h2>Material Manager</h2>
          <button className="material-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="material-body">
          <div className="material-list">
            {materialList.map((mat) => {
              const builtin = BUILTIN_MATERIAL_NAMES.has(mat.name);
              return (
                <div
                  key={mat.name}
                  className={`material-list-item${selectedMaterialName === mat.name ? " active" : ""}`}
                  onClick={() => handleSelect(mat)}
                >
                  <div className="material-list-info">
                    <span className="material-list-name">{mat.name}</span>
                    <span className={`material-badge ${builtin ? "builtin" : "custom"}`}>
                      {builtin ? "Built-in" : "Custom"}
                    </span>
                  </div>
                  {builtin ? (
                    <span className="material-lock">&#x1F512;</span>
                  ) : (
                    <button
                      className="material-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(mat.name);
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
              );
            })}
            <button className="material-add-btn" onClick={handleAddNew}>
              + Add New
            </button>
          </div>

          <div className="material-editor">
            {editingMaterial ? (
              <>
                <div className="material-field">
                  <label>Name</label>
                  <input
                    type="text"
                    value={editingMaterial.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Conductivity k (W/m&middot;K)</label>
                  <input
                    type="number"
                    value={editingMaterial.k}
                    onChange={(e) => handleFieldChange("k", parseFloat(e.target.value) || 0)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Young&apos;s Modulus E (GPa)</label>
                  <input
                    type="number"
                    value={editingMaterial.E / 1e9}
                    onChange={(e) => handleFieldChange("E", (parseFloat(e.target.value) || 0) * 1e9)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Poisson&apos;s Ratio nu</label>
                  <input
                    type="number"
                    value={editingMaterial.nu}
                    min={0}
                    max={0.5}
                    step={0.01}
                    onChange={(e) => handleFieldChange("nu", parseFloat(e.target.value) || 0)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>CTE (ppm/K)</label>
                  <input
                    type="number"
                    value={editingMaterial.cte * 1e6}
                    onChange={(e) => handleFieldChange("cte", (parseFloat(e.target.value) || 0) * 1e-6)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Density (kg/m&sup3;)</label>
                  <input
                    type="number"
                    value={editingMaterial.density}
                    onChange={(e) => handleFieldChange("density", parseFloat(e.target.value) || 0)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Specific Heat cp (J/kg&middot;K)</label>
                  <input
                    type="number"
                    value={editingMaterial.cp}
                    onChange={(e) => handleFieldChange("cp", parseFloat(e.target.value) || 0)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Shear Strength (MPa)</label>
                  <input
                    type="number"
                    value={editingMaterial.shearStrength / 1e6}
                    onChange={(e) =>
                      handleFieldChange("shearStrength", (parseFloat(e.target.value) || 0) * 1e6)
                    }
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-field">
                  <label>Color</label>
                  <input
                    type="color"
                    value={editingMaterial.color}
                    onChange={(e) => handleFieldChange("color", e.target.value)}
                    disabled={isBuiltin}
                  />
                </div>
                <div className="material-actions">
                  <button
                    className="material-save-btn"
                    onClick={handleSave}
                    disabled={isBuiltin || !editingMaterial.name.trim()}
                  >
                    Save
                  </button>
                  {!isSelectedBuiltin && selectedMaterialName && (
                    <button
                      className="material-delete-action-btn"
                      onClick={() => handleDelete(selectedMaterialName)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="material-editor-empty">
                Select a material or click &quot;Add New&quot;
              </div>
            )}
          </div>
        </div>

        <div className="material-footer">
          <button onClick={handleImport}>Import JSON</button>
          <button onClick={handleExport}>Export JSON</button>
        </div>
      </div>
    </div>
  );
}
