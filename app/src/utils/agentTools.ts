/* ================================================================== */
/*  Agent Tool Definitions & Executor for AI-powered Simulation Chat   */
/* ================================================================== */

import type { AgentAction, ActionResult, SimulationRecord } from "../types/simulation";
import type { TestBedConfiguration } from "../components/viewer/TestBedConfig";
import type { ToolDef } from "./llmProviders";

/* ---- System Prompt ---------------------------------------------- */

export const SYSTEM_PROMPT = `You are an AI simulation assistant for OpenSim Workbench, a CAE (Computer-Aided Engineering) platform for finite element analysis (FEA) and thermal simulation.

You help users:
- Define test objectives and configurations
- Create and run simulations (structural and thermal)
- Analyze simulation results
- Generate reports
- Compare different simulation runs

You have access to tools that control the simulation workbench. When a user asks to run a simulation, use the tools to set it up and execute it.

Available analysis types:
- "structural": Linear static structural FEA (displacement, Von Mises stress, shear)
- "thermal": Steady-state thermal analysis (temperature, heat flux)

Available presets for structural: Cantilever Beam, Simply Supported, Fixed-Fixed, Compression Test
Available presets for thermal: Heat Sink Analysis, Uniform Heating, Spot Heating, Convective Cooling

When users describe a test scenario, translate it into appropriate test bed configuration parameters. Always explain what you're doing and what results mean.`;

/* ---- Tool Definitions ------------------------------------------- */

export const AGENT_TOOL_DEFS: ToolDef[] = [
  {
    name: "createTestCase",
    description:
      "Create a test bed configuration for simulation. Returns the configuration object.",
    parameters: {
      name: { type: "string", description: "Test case name" },
      analysisType: {
        type: "string",
        description: 'Analysis type: "structural" or "thermal"',
      },
      ambientTemp: {
        type: "number",
        description: "Ambient temperature in Celsius (default 25)",
      },
      mounting: {
        type: "string",
        description:
          'Mounting configuration: "Free", "Fixed-Base", or "Clamped-All"',
      },
      convection: {
        type: "string",
        description: 'Convection type: "Natural" or "Forced"',
      },
      loadType: {
        type: "string",
        description:
          'Load scenario type, e.g. "Static Load Test", "Cantilever Beam", "Heat Sink Analysis"',
      },
      loadParams: {
        type: "object",
        description:
          "Load parameters as key-value pairs, e.g. {force: 1000} or {T_max: 100, T_min: 20}",
      },
    },
  },
  {
    name: "runSimulation",
    description:
      "Execute a simulation with the given test configuration. Returns the simulation record ID.",
    parameters: {
      nodeId: {
        type: "string",
        description:
          "Node ID to run simulation on. Use the first analysis node if not specified.",
      },
      analysisType: {
        type: "string",
        description: '"structural" or "thermal"',
      },
      testConfig: {
        type: "object",
        description:
          "Test bed configuration object (from createTestCase or manually specified)",
      },
    },
  },
  {
    name: "analyzeResults",
    description:
      "Analyze a simulation record and return a summary with insights.",
    parameters: {
      recordId: {
        type: "string",
        description: "Simulation record ID to analyze",
      },
    },
  },
  {
    name: "generateReport",
    description:
      "Generate an HTML report from one or more simulation records.",
    parameters: {
      recordIds: {
        type: "array",
        description: "Array of simulation record IDs to include in the report",
      },
    },
  },
  {
    name: "compareResults",
    description:
      "Compare two simulation records and return differences in parameters and results.",
    parameters: {
      recordIdA: {
        type: "string",
        description: "First simulation record ID",
      },
      recordIdB: {
        type: "string",
        description: "Second simulation record ID",
      },
    },
  },
  {
    name: "listSimulations",
    description:
      "List all recorded simulations with their basic information.",
    parameters: {
      solverType: {
        type: "string",
        description:
          'Optional filter by solver type: "structural", "thermal", or "chippackage"',
      },
    },
  },
];

/* ---- Store Accessors (lazy-imported to avoid circular deps) ----- */

interface StoreAccessors {
  getSchematic: () => { nodes: Array<{ id: string; name: string; kind: string }> } | null;
  runTestBedSimulation: (
    nodeId: string,
    config: TestBedConfiguration,
    analysisType: "structural" | "thermal"
  ) => Promise<{ recordId: string }>;
  getRecords: () => SimulationRecord[];
  getRecord: (id: string) => SimulationRecord | undefined;
  openReport: (html: string) => void;
}

/* ---- Executor --------------------------------------------------- */

export async function executeAction(
  action: AgentAction,
  stores: StoreAccessors
): Promise<ActionResult> {
  try {
    switch (action.tool) {
      case "createTestCase": {
        const args = action.args;
        const config: TestBedConfiguration = {
          name: (args.name as string) || "AI Test Case",
          environment: {
            ambientTemp: (args.ambientTemp as number) ?? 25,
            mounting: (args.mounting as "Free" | "Fixed-Base" | "Clamped-All") ?? "Fixed-Base",
            convection: (args.convection as "Natural" | "Forced") ?? "Natural",
          },
          loadScenario: {
            type: (args.loadType as string) ?? "Static Load Test",
            params: (args.loadParams as Record<string, number>) ?? { force: 1000 },
          },
        };
        return { tool: "createTestCase", success: true, result: config };
      }

      case "runSimulation": {
        const args = action.args;
        const analysisType = (args.analysisType as "structural" | "thermal") ?? "structural";

        // Find target node
        let nodeId = args.nodeId as string;
        if (!nodeId) {
          const schematic = stores.getSchematic();
          const kindMap: Record<string, string[]> = {
            structural: ["StaticStructural", "Modal"],
            thermal: ["SteadyThermal", "TransientThermal"],
          };
          const validKinds = kindMap[analysisType] ?? kindMap.structural;
          const node = schematic?.nodes.find((n) => validKinds.includes(n.kind));
          if (!node) {
            return {
              tool: "runSimulation",
              success: false,
              error: `No ${analysisType} analysis node found in schematic. Add one first.`,
            };
          }
          nodeId = node.id;
        }

        const config = (args.testConfig as TestBedConfiguration) ?? {
          name: "Quick Test",
          environment: { ambientTemp: 25, mounting: "Fixed-Base", convection: "Natural" },
          loadScenario: { type: "Static Load Test", params: { force: 1000 } },
        };

        const { recordId } = await stores.runTestBedSimulation(nodeId, config, analysisType);
        return { tool: "runSimulation", success: true, result: { recordId, nodeId } };
      }

      case "analyzeResults": {
        const recordId = action.args.recordId as string;
        const record = stores.getRecord(recordId);
        if (!record) {
          return { tool: "analyzeResults", success: false, error: `Record ${recordId} not found` };
        }
        const summary = {
          id: record.id,
          node_name: record.node_name,
          solver_type: record.solver_type,
          duration_ms: record.duration_ms,
          timestamp: record.timestamp,
          fields: record.field_summaries.map((f) => ({
            name: f.field_name,
            min: f.min,
            max: f.max,
            mean: f.mean,
          })),
          pass_criteria: record.pass_criteria,
          overall_pass: record.overall_pass,
          test_config: record.test_bed_config,
        };
        return { tool: "analyzeResults", success: true, result: summary };
      }

      case "generateReport": {
        const recordIds = action.args.recordIds as string[];
        const records = recordIds
          .map((id) => stores.getRecord(id))
          .filter((r): r is SimulationRecord => r !== undefined);
        if (records.length === 0) {
          return { tool: "generateReport", success: false, error: "No valid records found" };
        }
        const { generateReportHTML } = await import("./reportGenerator");
        const html = generateReportHTML(records, "OpenSim Workbench");
        stores.openReport(html);
        return { tool: "generateReport", success: true, result: { recordCount: records.length } };
      }

      case "compareResults": {
        const idA = action.args.recordIdA as string;
        const idB = action.args.recordIdB as string;
        const recordA = stores.getRecord(idA);
        const recordB = stores.getRecord(idB);
        if (!recordA || !recordB) {
          return { tool: "compareResults", success: false, error: "One or both records not found" };
        }

        // Compute diffs
        const paramDiffs: Array<{ key: string; valueA: unknown; valueB: unknown }> = [];
        const allKeys = new Set([
          ...Object.keys(recordA.solver_params),
          ...Object.keys(recordB.solver_params),
        ]);
        for (const key of allKeys) {
          const vA = recordA.solver_params[key];
          const vB = recordB.solver_params[key];
          if (JSON.stringify(vA) !== JSON.stringify(vB)) {
            paramDiffs.push({ key, valueA: vA, valueB: vB });
          }
        }

        const resultDiffs: Array<{
          field: string;
          metric: string;
          valueA: number;
          valueB: number;
          delta: number;
        }> = [];
        for (const fA of recordA.field_summaries) {
          const fB = recordB.field_summaries.find((f) => f.field_name === fA.field_name);
          if (fB) {
            for (const metric of ["min", "max", "mean"] as const) {
              resultDiffs.push({
                field: fA.field_name,
                metric,
                valueA: fA[metric],
                valueB: fB[metric],
                delta: fB[metric] - fA[metric],
              });
            }
          }
        }

        return {
          tool: "compareResults",
          success: true,
          result: { paramDiffs, resultDiffs },
        };
      }

      case "listSimulations": {
        const solverType = action.args.solverType as string | undefined;
        let records = stores.getRecords();
        if (solverType) {
          records = records.filter((r) => r.solver_type === solverType);
        }
        const list = records.map((r) => ({
          id: r.id,
          node_name: r.node_name,
          solver_type: r.solver_type,
          timestamp: r.timestamp,
          duration_ms: r.duration_ms,
          field_count: r.field_summaries.length,
          overall_pass: r.overall_pass,
        }));
        return { tool: "listSimulations", success: true, result: list };
      }

      default:
        return { tool: action.tool, success: false, error: `Unknown tool: ${action.tool}` };
    }
  } catch (e) {
    return {
      tool: action.tool,
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
