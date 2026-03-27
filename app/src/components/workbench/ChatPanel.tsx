import { useState, useCallback, useRef, useEffect } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useProjectStore } from "../../stores/projectStore";
import { PROVIDER_MODELS } from "../../utils/llmProviders";
import type { LLMProvider } from "../../types/simulation";
import "./ChatPanel.css";

interface ChatPanelProps {
  onOpenSettings: () => void;
}

export function ChatPanel({ onOpenSettings }: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    settings,
    sendMessage,
    clearHistory,
    speakLastResponse,
    stopSpeaking,
  } = useChatStore();
  const { schematic, runTestBedSimulation } = useProjectStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await sendMessage(text, {
      getSchematic: () => schematic,
      runTestBedSimulation,
    });
  }, [input, isStreaming, sendMessage, schematic, runTestBedSimulation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const providerLabel = (p: LLMProvider) =>
    ({ claude: "Claude", openai: "OpenAI", gemini: "Gemini", perplexity: "Perplexity" })[p];

  const currentModel =
    PROVIDER_MODELS[settings.provider]?.find((m) => m.id === settings.model)
      ?.label ?? settings.model;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-title">AI Assistant</span>
          <span className="chat-model-badge" onClick={onOpenSettings}>
            {providerLabel(settings.provider)} / {currentModel}
          </span>
        </div>
        <div className="chat-header-actions">
          <button
            className="chat-btn-icon"
            onClick={speakLastResponse}
            title="Read last response aloud"
          >
            &#x1F50A;
          </button>
          <button
            className="chat-btn-icon"
            onClick={stopSpeaking}
            title="Stop speaking"
          >
            &#x23F9;
          </button>
          <button
            className="chat-btn-icon"
            onClick={clearHistory}
            title="Clear chat"
          >
            &#x1F5D1;
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="chat-empty-title">Simulation Assistant</p>
            <p className="chat-empty-hint">
              Ask me to create test cases, run simulations, analyze results, or generate reports.
            </p>
            <div className="chat-suggestions">
              {[
                "Run a cantilever beam test with 1kN load",
                "Compare the last two simulations",
                "Generate a report of all thermal tests",
                "Set up a heat sink analysis at 100W",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  className="chat-suggestion"
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages
          .filter((m) => m.role !== "system")
          .map((msg) => (
            <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
              <div className="chat-msg-header">
                <span className="chat-msg-role">
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <span className="chat-msg-time">
                  {new Date(msg.timestamp).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="chat-msg-content">{msg.content}</div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="chat-msg-actions">
                  {msg.actions.map((action, i) => {
                    const result = msg.actionResults?.[i];
                    return (
                      <div
                        key={i}
                        className={`chat-action-card ${
                          result?.success ? "action-success" : "action-error"
                        }`}
                      >
                        <span className="action-icon">
                          {result?.success ? "\u2713" : "\u2717"}
                        </span>
                        <span className="action-tool">{action.tool}</span>
                        {result?.error && (
                          <span className="action-error-text">
                            {result.error}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

        {isStreaming && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-msg-content chat-typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            settings.apiKey
              ? "Describe a simulation to run..."
              : "Configure API key in Settings first"
          }
          disabled={isStreaming}
          rows={2}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
        >
          {isStreaming ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
