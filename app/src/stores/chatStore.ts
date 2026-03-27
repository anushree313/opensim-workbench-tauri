/* ================================================================== */
/*  Chat Store — LLM message state + agent tool execution              */
/* ================================================================== */

import { useState, useCallback, useEffect } from "react";
import type {
  ChatMessage,
  LLMSettings,
  AgentAction,
  ActionResult,
} from "../types/simulation";
import { callLLM, PROVIDER_MODELS } from "../utils/llmProviders";
import {
  SYSTEM_PROMPT,
  AGENT_TOOL_DEFS,
  executeAction,
} from "../utils/agentTools";
import type { TestBedConfiguration } from "../components/viewer/TestBedConfig";
import { speak, stop as stopSpeech } from "../utils/speechSynthesis";
import {
  getRecords as simGetRecords,
  getRecord as simGetRecord,
  openReportDirect,
} from "./simulationStore";

/* ---- Constants --------------------------------------------------- */

const STORAGE_KEY = "opensim-llm-settings";

function defaultSettings(): LLMSettings {
  return {
    provider: "claude",
    model: PROVIDER_MODELS.claude[0].id,
    apiKey: "",
  };
}

/* ---- Module-level state ----------------------------------------- */

let _messages: ChatMessage[] = [];
let _isStreaming = false;
let _settings: LLMSettings = loadSettings();

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  listeners.forEach((l) => l());
}

/* ---- Persistence ------------------------------------------------ */

function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

function saveSettings(s: LLMSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* ---- Public API ------------------------------------------------- */

function updateSettings(partial: Partial<LLMSettings>) {
  _settings = { ..._settings, ...partial };
  saveSettings(_settings);
  notify();
}

function getSettings(): LLMSettings {
  return _settings;
}

function clearHistory() {
  _messages = [];
  notify();
}

function addSystemMessage(content: string) {
  _messages = [
    ..._messages,
    {
      id: crypto.randomUUID(),
      role: "system",
      content,
      timestamp: new Date().toISOString(),
    },
  ];
  notify();
}

/* Store accessor builder for agent tools */
function buildStoreAccessors() {
  // Lazy import to avoid circular dependencies
  return {
    getSchematic: () => {
      // Access projectStore's schematic via the module state
      // We import at call-time to avoid circularity
      return null; // Will be overridden by the caller
    },
    runTestBedSimulation: async (
      _nodeId: string,
      _config: TestBedConfiguration,
      _analysisType: "structural" | "thermal"
    ) => {
      return { recordId: "" }; // Placeholder — overridden at call time
    },
    getRecords: () => simGetRecords(),
    getRecord: (id: string) => simGetRecord(id),
    openReport: (html: string) => openReportDirect(html),
  };
}

async function sendMessage(
  text: string,
  storeOverrides?: {
    getSchematic: () => unknown;
    runTestBedSimulation: (
      nodeId: string,
      config: TestBedConfiguration,
      analysisType: "structural" | "thermal"
    ) => Promise<{ recordId: string }>;
  }
) {
  if (!_settings.apiKey) {
    _messages = [
      ..._messages,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Please configure your API key in Settings before using the chat. Click the gear icon in the toolbar.",
        timestamp: new Date().toISOString(),
      },
    ];
    notify();
    return;
  }

  // Append user message
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: text,
    timestamp: new Date().toISOString(),
  };
  _messages = [..._messages, userMsg];
  _isStreaming = true;
  notify();

  const stores = buildStoreAccessors();
  if (storeOverrides) {
    stores.getSchematic = storeOverrides.getSchematic as () => null;
    stores.runTestBedSimulation = storeOverrides.runTestBedSimulation;
  }

  try {
    // Build message history for LLM
    const llmMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ..._messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    // Call LLM
    const response = await callLLM(_settings, llmMessages, AGENT_TOOL_DEFS);

    // Execute tool calls if any
    let actions: AgentAction[] = [];
    let actionResults: ActionResult[] = [];

    if (response.toolCalls.length > 0) {
      actions = response.toolCalls;
      actionResults = [];
      for (const action of actions) {
        const result = await executeAction(action, stores);
        actionResults.push(result);
      }

      // If there were tool calls, call LLM again with tool results for a final response
      const toolResultText = actionResults
        .map(
          (r) =>
            `Tool "${r.tool}": ${r.success ? "Success" : "Failed"}\n${
              r.success
                ? JSON.stringify(r.result, null, 2)
                : `Error: ${r.error}`
            }`
        )
        .join("\n\n");

      const followUpMessages = [
        ...llmMessages,
        {
          role: "assistant" as const,
          content: response.content || "I'll execute the requested actions.",
        },
        {
          role: "user" as const,
          content: `Tool execution results:\n\n${toolResultText}\n\nPlease provide a summary of what was done and the results.`,
        },
      ];

      const followUp = await callLLM(_settings, followUpMessages);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: followUp.content,
        timestamp: new Date().toISOString(),
        actions,
        actionResults,
      };
      _messages = [..._messages, assistantMsg];
    } else {
      // Simple text response
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.content,
        timestamp: new Date().toISOString(),
      };
      _messages = [..._messages, assistantMsg];
    }
  } catch (e) {
    const errorMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Error communicating with ${_settings.provider}: ${
        e instanceof Error ? e.message : String(e)
      }. Please check your API key and try again.`,
      timestamp: new Date().toISOString(),
    };
    _messages = [..._messages, errorMsg];
  }

  _isStreaming = false;
  notify();
}

function speakLastResponse() {
  const last = [..._messages].reverse().find((m: ChatMessage) => m.role === "assistant");
  if (last) {
    speak(last.content);
  }
}

function stopSpeaking() {
  stopSpeech();
}

/* ---- Hook ------------------------------------------------------- */

export function useChatStore() {
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    listeners.add(forceUpdate);
    return () => {
      listeners.delete(forceUpdate);
    };
  }, [forceUpdate]);

  return {
    messages: _messages,
    isStreaming: _isStreaming,
    settings: _settings,
    sendMessage,
    clearHistory,
    updateSettings,
    getSettings,
    addSystemMessage,
    speakLastResponse,
    stopSpeaking,
  };
}

// Direct exports for use outside React components
export { updateSettings, getSettings, clearHistory, sendMessage };
