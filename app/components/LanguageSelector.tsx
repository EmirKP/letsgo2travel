"use client";

import { useEffect, useState } from "react";
import type { L2tLocale } from "@/lib/i18n";

const languages: Array<{ code: L2tLocale; flag: string; label: string; short: string }> = [
  { code: "tr", flag: "🇹🇷", label: "Türkçe", short: "TR" },
  { code: "en", flag: "🇺🇸", label: "English", short: "EN" },
];

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<L2tLocale>("tr");

  useEffect(() => {
    const saved = window.localStorage.getItem("l2t-locale") as L2tLocale | null;
    if (saved === "tr" || saved === "en") setLocale(saved);
  }, []);

  const active = languages.find((lang) => lang.code === locale) ?? languages[0];

  const selectLocale = (code: L2tLocale) => {
    setLocale(code);
    window.localStorage.setItem("l2t-locale", code);
    window.dispatchEvent(new CustomEvent("l2t-locale-change", { detail: code }));
    setOpen(false);
  };

  return (
    <div className="l2t-language-switcher">
      <button
        type="button"
        className="l2t-language-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Dil seç"
        aria-expanded={open}
      >
        <span className="l2t-language-flag">{active.flag}</span>
        <span className="l2t-language-short">{active.short}</span>
        <span className="l2t-language-caret">▾</span>
      </button>
      {open && (
        <div className="l2t-language-menu" role="menu">
          {languages.map((lang) => (
            <button
              type="button"
              key={lang.code}
              className={lang.code === locale ? "l2t-language-option is-active" : "l2t-language-option"}
              onClick={() => selectLocale(lang.code)}
              role="menuitem"
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
