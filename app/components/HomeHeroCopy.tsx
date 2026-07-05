"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Globe, ShieldCheck, Sparkles } from "lucide-react";
import { getL2tDictionary, type L2tLocale } from "@/lib/i18n";
import HeroDynamicLine from "./HeroDynamicLine";
import ScrollReveal from "./ScrollReveal";

export default function HomeHeroCopy() {
  const [locale, setLocale] = useState<L2tLocale>("tr");
  const dict = useMemo(() => getL2tDictionary(locale), [locale]);

  useEffect(() => {
    const saved = window.localStorage.getItem("l2t-locale") as L2tLocale | null;
    if (saved === "tr" || saved === "en") setLocale(saved);

    const handler = (event: Event) => {
      const custom = event as CustomEvent<L2tLocale>;
      if (custom.detail === "tr" || custom.detail === "en") setLocale(custom.detail);
    };
    window.addEventListener("l2t-locale-change", handler);
    return () => window.removeEventListener("l2t-locale-change", handler);
  }, []);

  return (
    <div className="hp-hero-copy">
      <ScrollReveal delay={0.1} yOffset={20}>
        <span className="hp-badge l2t-hide-mobile"><Globe size={14} style={{ marginRight: "6px" }} /> {dict.hero.eyebrow}</span>
      </ScrollReveal>

      <ScrollReveal delay={0.2} yOffset={30}>
        <h1 className="l2t-hero-main-title">Pasaportuna göre dünyayı keşfet</h1>
      </ScrollReveal>

      <ScrollReveal delay={0.25} yOffset={18}>
        <HeroDynamicLine />
      </ScrollReveal>

      <ScrollReveal delay={0.3} yOffset={20}>
        <p className="l2t-hero-subtitle l2t-hide-mobile" style={{ color: "var(--l2t-text)" }}>Pasaport gücü, vize durumu, rota önerileri, gerçek gezgin deneyimleri ve uçuş arama tek yerde.</p>
      </ScrollReveal>

      <ScrollReveal delay={0.34} yOffset={20}>
        <div className="hp-hero-buttons l2t-hide-mobile">
          <Link href="/pasaport-gucu" className="l2t-btn l2t-hero-primary-cta">
            <ShieldCheck size={18} /> Pasaportuna göre keşfet
          </Link>
          <Link href="/rota-asistani" className="l2t-btn l2t-btn-ghost l2t-hero-secondary-cta" style={{ background: "transparent", border: "1px solid var(--l2t-blue)", color: "var(--l2t-blue)", boxShadow: "none" }}>
            <Sparkles size={18} /> Rota Asistanı'nı aç
          </Link>
        </div>
      </ScrollReveal>
    </div>
  );
}
