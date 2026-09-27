import { Component, Suspense, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { Sheet } from "./Sheet";

class OverlayErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Mount only while open so closing also discards the failed overlay state. */
export function LazyOverlay({ children, title, loadingMessage, onClose }: {
  children: ReactNode;
  title: string;
  loadingMessage: string;
  onClose: () => void;
}) {
  const { copy } = useI18n();
  return <OverlayErrorBoundary fallback={
    <Sheet open title={title} onClose={onClose}>
      <p role="alert">{copy("Bu pencere açılamadı. Kapatıp uygulamaya devam edebilirsin.", "This window couldn't open. Close it to continue using the app.")}</p>
      <button className="primary-wide" onClick={onClose}>{copy("Kapat ve devam et", "Close and continue")}</button>
    </Sheet>
  }>
    <Suspense fallback={<Sheet open title={title} onClose={onClose}><p role="status">{loadingMessage}</p></Sheet>}>
      {children}
    </Suspense>
  </OverlayErrorBoundary>;
}
