import { useState, useCallback } from "react";
import { Toolbar } from "./Toolbar";
import { Toolbox } from "./Toolbox";
import { SchematicCanvas } from "./SchematicCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { MessagesPanel } from "./MessagesPanel";
import { ToastContainer } from "./Toast";
import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";
import { CompareView } from "./CompareView";
import { ReportView } from "./ReportView";
import { SettingsModal } from "./SettingsModal";
import { TestLibraryBrowser } from "./TestLibraryBrowser";
import { TestSuiteRunner } from "./TestSuiteRunner";
import { GeometryViewer } from "../viewer/GeometryViewer";
import { MeshViewer } from "../viewer/MeshViewer";
import { ResultViewer } from "../viewer/ResultViewer";
import { DEViewer } from "../viewer/DEViewer";
import { ChipPackageViewer } from "../viewer/ChipPackageViewer";
import { useProjectStore } from "../../stores/projectStore";
import { useSimulationStore } from "../../stores/simulationStore";
import type { SystemNodeDto } from "../../types/project";
import "./Workbench.css";

export function Workbench() {
  const [selectedNode, setSelectedNode] = useState<SystemNodeDto | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testLibraryOpen, setTestLibraryOpen] = useState(false);

  const {
    schematic,
    geometryView,
    meshView,
    resultView,
    deView,
    openGeometryViewer,
    closeGeometryViewer,
    openMeshViewer,
    closeMeshViewer,
    openResultViewer,
    closeResultViewer,
    openDEViewer,
    closeDEViewer,
    chipResult,
    openChipPackageViewer,
    closeChipPackageViewer,
  } = useProjectStore();

  const {
    historyOpen,
    compareOpen,
    reportOpen,
    reportHtml,
    toggleHistory,
    closeCompare,
    closeReport,
    openReport,
    suiteRunnerOpen,
    suiteScenarioId,
    openSuiteRunner,
    closeSuiteRunner,
  } = useSimulationStore();

  const handleOpenGeometry = useCallback(
    async (node: SystemNodeDto) => {
      await openGeometryViewer(node.id);
    },
    [openGeometryViewer]
  );

  const handleOpenMesh = useCallback(
    async (node: SystemNodeDto) => {
      await openMeshViewer(node.id);
    },
    [openMeshViewer]
  );

  const handleOpenResult = useCallback(
    async (node: SystemNodeDto) => {
      await openResultViewer(node.id);
    },
    [openResultViewer]
  );

  const handleOpenDE = useCallback(
    async (node: SystemNodeDto) => {
      await openDEViewer(node.id);
    },
    [openDEViewer]
  );

  const handleOpenChipPackage = useCallback(
    async (node: SystemNodeDto) => {
      await openChipPackageViewer(node.id);
    },
    [openChipPackageViewer]
  );

  const handleBackToSchematic = useCallback(() => {
    closeGeometryViewer();
    closeMeshViewer();
    closeResultViewer();
    closeDEViewer();
    closeChipPackageViewer();
  }, [closeGeometryViewer, closeMeshViewer, closeResultViewer, closeDEViewer, closeChipPackageViewer]);

  // Find node names for viewers
  const geoNodeName =
    geometryView && schematic
      ? schematic.nodes.find((n) => n.id === geometryView.node_id)?.name ?? "Geometry"
      : "Geometry";

  const meshNodeName =
    meshView && schematic
      ? schematic.nodes.find((n) => n.id === meshView.node_id)?.name ?? "Mesh"
      : "Mesh";

  const resultNodeName =
    resultView && schematic
      ? schematic.nodes.find((n) => n.id === resultView.node_id)?.name ?? "Results"
      : "Results";

  const deNodeName =
    deView && schematic
      ? schematic.nodes.find((n) => n.id === deView.node_id)?.name ?? "Design Study"
      : "Design Study";

  return (
    <div className="workbench">
      <Toolbar
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
        onToggleHistory={toggleHistory}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTestLibrary={() => setTestLibraryOpen(true)}
      />
      <div className="workbench-body">
        <Toolbox />
        <div className="workbench-center">
          {chipResult ? (
            <ChipPackageViewer nodeId={chipResult.node_id} onBack={handleBackToSchematic} />
          ) : deView ? (
            <DEViewer deView={deView} nodeName={deNodeName} onBack={handleBackToSchematic} />
          ) : resultView ? (
            <ResultViewer resultView={resultView} nodeName={resultNodeName} onBack={handleBackToSchematic} />
          ) : meshView ? (
            <MeshViewer meshView={meshView} nodeName={meshNodeName} onBack={handleBackToSchematic} />
          ) : geometryView ? (
            <GeometryViewer geometryView={geometryView} nodeName={geoNodeName} onBack={handleBackToSchematic} />
          ) : (
            <SchematicCanvas
              selectedNodeId={selectedNode?.id ?? null}
              onSelectNode={setSelectedNode}
              onOpenGeometry={handleOpenGeometry}
              onOpenMesh={handleOpenMesh}
              onOpenResult={handleOpenResult}
              onOpenDE={handleOpenDE}
              onOpenChipPackage={handleOpenChipPackage}
            />
          )}
          <MessagesPanel />
        </div>
        <PropertiesPanel node={selectedNode} geometryView={geometryView ?? undefined} />
        {chatOpen && (
          <ChatPanel onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </div>

      {/* Modal overlays */}
      {historyOpen && (
        <HistoryPanel
          onClose={toggleHistory}
          onOpenReport={(html: string) => openReport(html)}
        />
      )}
      {compareOpen && <CompareView onClose={closeCompare} />}
      {reportOpen && <ReportView html={reportHtml} onClose={closeReport} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {testLibraryOpen && (
        <TestLibraryBrowser
          onClose={() => setTestLibraryOpen(false)}
          onSelectTest={() => { setTestLibraryOpen(false); }}
          onRunSuite={(scenarioId) => { setTestLibraryOpen(false); openSuiteRunner(scenarioId); }}
        />
      )}
      {suiteRunnerOpen && suiteScenarioId && (
        <TestSuiteRunner
          scenarioId={suiteScenarioId}
          onClose={closeSuiteRunner}
          onOpenReport={(html: string) => openReport(html)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
