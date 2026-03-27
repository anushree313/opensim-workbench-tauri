import "./MessagesPanel.css";

export function MessagesPanel() {
  return (
    <div className="messages-panel">
      <div className="messages-header">Messages</div>
      <div className="messages-content">
        <div className="message-item message-info">
          OpenSim Workbench initialized. Add systems from the Toolbox to begin.
        </div>
      </div>
    </div>
  );
}
