"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { L2tLocale } from "@/lib/i18n";
import styles from "./LanguageSelector.module.css";

const languages: Array<{
  code: L2tLocale;
  flag: string;
  alt: string;
  label: string;
  short: string;
  disabled?: boolean;
}> = [
  { code: "tr", flag: "/flags/tr.svg", alt: "Türkiye bayrağı", label: "Türkçe", short: "TR" },
  { code: "en", flag: "/flags/us.svg", alt: "Amerika Birleşik Devletleri bayrağı", label: "English · Yakında", short: "EN", disabled: true },
];

export default function LanguageSelector() {
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<L2tLocale>("tr");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    const saved = window.localStorage.getItem("l2t-locale") as L2tLocale | null;
    if (saved === "en") window.localStorage.removeItem("l2t-locale");
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const active = languages.find((language) => language.code === locale) ?? languages[0];

  const selectLocale = (code: L2tLocale) => {
    if (code !== "tr") return;
    setLocale(code);
    window.localStorage.setItem("l2t-locale", code);
    window.dispatchEvent(new CustomEvent("l2t-locale-change", { detail: code }));
    setOpen(false);
  };

  return (
    <div className={styles.switcher} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Dil seçimi: ${active.label}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
      >
        <span className={styles.flagFrame} aria-hidden="true">
          <Image className={styles.flag} src={active.flag} alt="" width={24} height={16} priority />
        </span>
        <span className={styles.short}>{active.short}</span>
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className={styles.menu} id={menuId} role="menu" aria-label="Dil seçenekleri">
          {languages.map((language) => {
            const isActive = language.code === locale;
            return (
              <button
                type="button"
                key={language.code}
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                onClick={() => selectLocale(language.code)}
                disabled={language.disabled}
                role="menuitemradio"
                aria-checked={isActive}
                aria-disabled={language.disabled}
              >
                <span className={styles.flagFrame}>
                  <Image className={styles.flag} src={language.flag} alt={language.alt} width={24} height={16} />
                </span>
                <span>{language.label}</span>
                <span className={isActive ? styles.check : styles.code} aria-hidden="true">
                  {isActive ? "✓" : language.short}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
