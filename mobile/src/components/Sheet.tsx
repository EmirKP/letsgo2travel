import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isTopSheet, registerSheet, subscribeSheetStack, unregisterSheet } from "../lib/sheetStack";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";

let openSheetCount = 0;
let rootWasInert = false;
let rootAriaHidden: string | null = null;

function lockBodyScroll() {
  openSheetCount += 1;
  document.body.classList.add("sheet-open");
  if (openSheetCount !== 1) return;
  const root = document.getElementById("root");
  if (!root) return;
  rootWasInert = root.inert;
  rootAriaHidden = root.getAttribute("aria-hidden");
  root.inert = true;
  root.setAttribute("aria-hidden", "true");
}

function unlockBodyScroll() {
  openSheetCount = Math.max(0, openSheetCount - 1);
  if (openSheetCount !== 0) return;
  document.body.classList.remove("sheet-open");
  const root = document.getElementById("root");
  if (!root) return;
  root.inert = rootWasInert;
  if (rootAriaHidden === null) root.removeAttribute("aria-hidden");
  else root.setAttribute("aria-hidden", rootAriaHidden);
}

export function Sheet({ open, title, onClose, children, size = "normal" }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "normal" | "large";
}) {
  const { copy } = useI18n();
  const sheetRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const sheetToken = useRef(Symbol("sheet"));
  const titleId = useId();
  const [topSheet, setTopSheet] = useState(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const token = sheetToken.current;
    const updateTopSheet = () => setTopSheet(isTopSheet(token));
    const unsubscribe = subscribeSheetStack(updateTopSheet);
    registerSheet(token, () => onCloseRef.current());
    updateTopSheet();
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
      unsubscribe();
      unregisterSheet(token);
      unlockBodyScroll();
      if (wasTopSheet && previousFocus?.isConnected) {
        window.requestAnimationFrame(() => {
          if (previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
        });
      }
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-layer" role="presentation" style={{ zIndex: topSheet ? 131 : 130 }} inert={!topSheet || undefined} aria-hidden={!topSheet || undefined} onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section ref={sheetRef} className={`sheet ${size === "large" ? "sheet-large" : ""}`} role="dialog" aria-modal={topSheet || undefined} aria-labelledby={titleId}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button compact" onClick={onClose} aria-label={copy("Kapat", "Close")}><Icon name="close" size={20} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
