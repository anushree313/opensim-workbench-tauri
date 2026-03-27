import type {
  LLMSettings,
  LLMProvider,
  AgentAction,
} from "../types/simulation";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls: AgentAction[];
}

/* ================================================================== */
/*  Provider model catalogs                                            */
/* ================================================================== */

export const PROVIDER_MODELS: Record<
  LLMProvider,
  { id: string; label: string }[]
> = {
  claude: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  ],
  openai: [
    { id: "gpt-4", label: "GPT-4" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
  gemini: [
    { id: "gemini-pro", label: "Gemini Pro" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  perplexity: [
    {
      id: "llama-3.1-sonar-large-128k-online",
      label: "Llama 3.1 Sonar Large",
    },
    {
      id: "llama-3.1-sonar-small-128k-online",
      label: "Llama 3.1 Sonar Small",
    },
  ],
};

export const DEFAULT_SETTINGS: Record<LLMProvider, { model: string }> = {
  claude: { model: PROVIDER_MODELS.claude[0].id },
  openai: { model: PROVIDER_MODELS.openai[0].id },
  gemini: { model: PROVIDER_MODELS.gemini[0].id },
  perplexity: { model: PROVIDER_MODELS.perplexity[0].id },
};

/* ================================================================== */
/*  Main dispatch                                                      */
/* ================================================================== */

export async function callLLM(
  settings: LLMSettings,
  messages: LLMMessage[],
  tools?: ToolDef[],
): Promise<LLMResponse> {
  switch (settings.provider) {
    case "claude":
      return callClaude(settings, messages, tools);
    case "openai":
      return callOpenAI(settings, messages, tools);
    case "gemini":
      return callGemini(settings, messages, tools);
    case "perplexity":
      return callPerplexity(settings, messages);
    default:
      throw new Error(`Unknown LLM provider: ${settings.provider}`);
  }
}

/* ================================================================== */
/*  Claude (Anthropic)                                                 */
/* ================================================================== */

async function callClaude(
  settings: LLMSettings,
  messages: LLMMessage[],
  tools?: ToolDef[],
): Promise<LLMResponse> {
  const systemMsg = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");

  const nonSystemMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: 4096,
    system: systemMsg || undefined,
    messages: nonSystemMessages,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object",
        properties: t.parameters,
      },
    }));
  }

  const response = await fetchWithError("claude", "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  let content = "";
  const toolCalls: AgentAction[] = [];

  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          tool: block.name,
          args: block.input as Record<string, unknown>,
        });
      }
    }
  }

  return { content, toolCalls };
}

/* ================================================================== */
/*  OpenAI                                                             */
/* ================================================================== */

async function callOpenAI(
  settings: LLMSettings,
  messages: LLMMessage[],
  tools?: ToolDef[],
): Promise<LLMResponse> {
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: t.parameters,
        },
      },
    }));
  }

  const response = await fetchWithError("openai", "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  const choice = data.choices?.[0]?.message;

  const content = choice?.content ?? "";
  const toolCalls: AgentAction[] = [];

  if (Array.isArray(choice?.tool_calls)) {
    for (const tc of choice.tool_calls) {
      if (tc.type === "function") {
        toolCalls.push({
          tool: tc.function.name,
          args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });
      }
    }
  }

  return { content, toolCalls };
}

/* ================================================================== */
/*  Gemini                                                             */
/* ================================================================== */

async function callGemini(
  settings: LLMSettings,
  messages: LLMMessage[],
  tools?: ToolDef[],
): Promise<LLMResponse> {
  const systemMsg = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] };
  }

  if (tools && tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: {
            type: "OBJECT",
            properties: t.parameters,
          },
        })),
      },
    ];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;

  const response = await fetchWithError("gemini", url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  let content = "";
  const toolCalls: AgentAction[] = [];

  for (const part of parts) {
    if (part.text) {
      content += part.text;
    } else if (part.functionCall) {
      toolCalls.push({
        tool: part.functionCall.name,
        args: (part.functionCall.args ?? {}) as Record<string, unknown>,
      });
    }
  }

  return { content, toolCalls };
}

/* ================================================================== */
/*  Perplexity (OpenAI-compatible, no tools)                           */
/* ================================================================== */

async function callPerplexity(
  settings: LLMSettings,
  messages: LLMMessage[],
): Promise<LLMResponse> {
  const body = {
    model: settings.model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const response = await fetchWithError(
    "perplexity",
    "https://api.perplexity.ai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  return { content, toolCalls: [] };
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

async function fetchWithError(
  provider: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `${provider}: Network error — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `${provider}: HTTP ${response.status} — ${text || response.statusText}`,
    );
  }

  return response;
}
