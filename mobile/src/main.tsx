import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { I18nProvider } from "./lib/i18n";

const root = document.getElementById("root");
if (!root) throw new Error("Uygulama kök elemanı bulunamadı.");

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled mobile promise rejection", event.reason);
});

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary><I18nProvider><App /></I18nProvider></ErrorBoundary>
  </StrictMode>,
);
