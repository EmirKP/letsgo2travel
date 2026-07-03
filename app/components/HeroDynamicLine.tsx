"use client";

import { useEffect, useMemo, useState } from "react";
import { l2tDictionaries, type L2tLocale } from "@/lib/i18n";

export default function HeroDynamicLine() {
  const [locale, setLocale] = useState<L2tLocale>("tr");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("l2t-locale") as L2tLocale | null;
    if (saved === "tr" || saved === "en") setLocale(saved);

    const handler = (event: Event) => {
      const custom = event as CustomEvent<L2tLocale>;
      if (custom.detail === "tr" || custom.detail === "en") {
        setLocale(custom.detail);
        setIndex(0);
      }
    };
    window.addEventListener("l2t-locale-change", handler);
    return () => window.removeEventListener("l2t-locale-change", handler);
  }, []);

  const lines = useMemo(() => l2tDictionaries[locale].hero.dynamicLines, [locale]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [lines.length]);

  return (
    <div className="l2t-hero-dynamic-line" aria-live="polite">
      <span key={`${locale}-${index}`}>{lines[index]}</span>
    </div>
  );
}
