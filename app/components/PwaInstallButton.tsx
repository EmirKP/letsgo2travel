"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import styles from "./PwaInstallButton.module.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone;
    setInstalled(Boolean(standalone));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <div className={styles.installed}><Smartphone size={16} /> Uygulama modunda kullanıyorsun</div>;
  if (!promptEvent) return null;

  return (
    <button type="button" className={styles.install} onClick={async () => {
      if (!promptEvent) return;
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setPromptEvent(null);
    }}>
      <Download size={17} />
      <span><strong>Telefona yükle</strong><small>Uygulama gibi kullan</small></span>
    </button>
  );
}
