import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Sheet({ open, title, onClose, children, size = "normal" }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "normal" | "large";
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    window.requestAnimationFrame(() => sheetRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("sheet-open");
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section ref={sheetRef} className={`sheet ${size === "large" ? "sheet-large" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button compact" onClick={onClose} aria-label="Kapat"><Icon name="close" size={20} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
