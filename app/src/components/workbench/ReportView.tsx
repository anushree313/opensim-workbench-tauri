import { useCallback, useRef, useState } from "react";
import { speak, stop, isSpeaking } from "../../utils/speechSynthesis";
import "./ReportView.css";

interface ReportViewProps {
  html: string;
  onClose: () => void;
}

export function ReportView({ html, onClose }: ReportViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [speaking, setSpeaking] = useState(false);

  const handlePrint = useCallback(() => {
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Simulation Report</title>
        <style>
          body { font-family: "Segoe UI", system-ui, sans-serif; padding: 24px; color: #222; }
          table { border-collapse: collapse; width: 100%; margin: 12px 0; }
          th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
          th { background: #f0f0f0; }
          h1, h2, h3 { margin-top: 16px; }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  }, [html]);

  const handleDownload = useCallback(() => {
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Simulation Report</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; padding: 24px; color: #222; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f0f0f0; }
    h1, h2, h3 { margin-top: 16px; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simulation-report.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [html]);

  const handleSpeak = useCallback(() => {
    if (isSpeaking()) {
      stop();
      setSpeaking(false);
      return;
    }
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || "";
    if (!text.trim()) return;
    speak(text);
    setSpeaking(true);

    // Monitor when speech ends
    const check = setInterval(() => {
      if (!isSpeaking()) {
        setSpeaking(false);
        clearInterval(check);
      }
    }, 500);
  }, [html]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="report-overlay" onClick={handleOverlayClick}>
      <div className="report-panel">
        <div className="report-header">
          <h2>Simulation Report</h2>
          <div className="report-actions">
            <button onClick={handlePrint}>Print</button>
            <button onClick={handleDownload}>Download HTML</button>
            <button
              className={`btn-speak${speaking ? " speaking" : ""}`}
              onClick={handleSpeak}
            >
              {speaking ? "Stop" : "Speak"}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        <div
          className="report-content"
          ref={contentRef}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
