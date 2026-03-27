import { useState, useEffect } from "react";
import { PROVIDER_MODELS } from "../../utils/llmProviders";
import type { LLMProvider, LLMSettings } from "../../types/simulation";
import "./SettingsModal.css";

interface SettingsModalProps {
  onClose: () => void;
}

const STORAGE_KEY = "opensim-llm-settings";

const PROVIDERS: { key: LLMProvider; label: string }[] = [
  { key: "claude", label: "Claude" },
  { key: "openai", label: "OpenAI" },
  { key: "gemini", label: "Gemini" },
  { key: "perplexity", label: "Perplexity" },
];

function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LLMSettings;
  } catch {
    /* ignore */
  }
  return { provider: "claude", model: "", apiKey: "" };
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<LLMProvider>("claude");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  // Per-provider storage so switching tabs preserves input
  const [providerData, setProviderData] = useState<Record<LLMProvider, { model: string; apiKey: string }>>({
    claude: { model: "", apiKey: "" },
    openai: { model: "", apiKey: "" },
    gemini: { model: "", apiKey: "" },
    perplexity: { model: "", apiKey: "" },
  });

  useEffect(() => {
    const settings = loadSettings();
    setProvider(settings.provider);

    // Initialize the saved provider's data
    setProviderData((prev) => ({
      ...prev,
      [settings.provider]: { model: settings.model, apiKey: settings.apiKey },
    }));
    setModel(settings.model);
    setApiKey(settings.apiKey);
  }, []);

  const switchProvider = (p: LLMProvider) => {
    // Save current provider data
    setProviderData((prev) => ({
      ...prev,
      [provider]: { model, apiKey },
    }));

    // Switch to new provider
    setProvider(p);
    const data = providerData[p];
    setModel(data.model || (PROVIDER_MODELS[p]?.[0]?.id ?? ""));
    setApiKey(data.apiKey);
    setShowKey(false);
    setTestStatus("idle");
    setTestMessage("");
  };

  const handleSave = () => {
    const settings: LLMSettings = { provider, model, apiKey };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    onClose();
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestStatus("error");
      setTestMessage("API key is required");
      return;
    }

    setTestStatus("testing");
    setTestMessage("Testing connection...");

    try {
      // Dynamic import to avoid hard dependency if callLLM doesn't exist yet
      const { callLLM } = await import("../../utils/llmProviders");
      await callLLM(
        { provider, model, apiKey },
        [{ role: "user", content: "Hello" }],
      );
      setTestStatus("success");
      setTestMessage("Connection successful!");
    } catch (err: unknown) {
      setTestStatus("error");
      const msg = err instanceof Error ? err.message : "Connection failed";
      setTestMessage(msg);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const models = PROVIDER_MODELS[provider] ?? [];

  return (
    <div className="settings-overlay" onClick={handleOverlayClick}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>AI Settings</h2>
          <button className="settings-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="settings-tabs">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              className={`settings-tab${provider === p.key ? " active" : ""}`}
              onClick={() => switchProvider(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          <div className="settings-field">
            <label>API Key</label>
            <div className="password-wrapper">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter ${PROVIDERS.find((p) => p.key === provider)?.label} API key`}
              />
              <button
                className="password-toggle"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="settings-field">
            <label>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.length === 0 && <option value="">No models available</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button className="btn-test" onClick={handleTest} disabled={testStatus === "testing"}>
            {testStatus === "testing" ? "Testing..." : "Test Connection"}
          </button>

          {testMessage && (
            <div
              className={`settings-test-result ${testStatus === "success" ? "success" : ""} ${testStatus === "error" ? "error" : ""}`}
            >
              {testMessage}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
