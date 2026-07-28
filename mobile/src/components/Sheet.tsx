import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Sheet({ open, title, onClose, children, size = "normal" }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "normal" | "large";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className={`sheet ${size === "large" ? "sheet-large" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-button compact" onClick={onClose} aria-label="Kapat"><Icon name="close" size={20} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
