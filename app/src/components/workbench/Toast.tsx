import { useProjectStore } from "../../stores/projectStore";
import "./Toast.css";

export function ToastContainer() {
  const { toasts, removeToast } = useProjectStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === "success" ? "\u2713" : t.type === "error" ? "\u2717" : "\u26A0"}
          </span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>&times;</button>
        </div>
      ))}
    </div>
  );
}
