import { useEffect, useId, useRef, type ReactNode } from "react";
import { isTopSheet, registerSheet, unregisterSheet } from "../lib/sheetStack";
import { Icon } from "./Icon";

let openSheetCount = 0;

function lockBodyScroll() {
  openSheetCount += 1;
  document.body.classList.add("sheet-open");
}

function unlockBodyScroll() {
  openSheetCount = Math.max(0, openSheetCount - 1);
  if (openSheetCount === 0) document.body.classList.remove("sheet-open");
}

export function Sheet({ open, title, onClose, children, size = "normal" }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "normal" | "large";
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const sheetToken = useRef(Symbol("sheet"));
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const token = sheetToken.current;
    registerSheet(token, () => onCloseRef.current());
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (!isTopSheet(token)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
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
    lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      const sheet = sheetRef.current;
      if (!sheet || !isTopSheet(token)) return;
      const preferred = sheet.querySelector<HTMLElement>("[data-autofocus]")
        || sheet.querySelector<HTMLElement>(".sheet-body input:not([disabled]), .sheet-body select:not([disabled]), .sheet-body textarea:not([disabled])")
        || sheet.querySelector<HTMLElement>(".sheet-header button:not([disabled])")
        || sheet.querySelector<HTMLElement>("button:not([disabled]), a[href]");
      preferred?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKey);
      const wasTopSheet = isTopSheet(token);
      unregisterSheet(token);
      unlockBodyScroll();
      if (wasTopSheet && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section ref={sheetRef} className={`sheet ${size === "large" ? "sheet-large" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button compact" onClick={onClose} aria-label="Kapat"><Icon name="close" size={20} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
