"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dices, Plane, Sparkles } from "lucide-react";

const routes = [
  { name: "Gürcistan", flag: "🇬🇪", slug: "gurcistan", visa: "Kimlikle", idea: "Kimlikle gidilebilen hafta sonu rotası." },
  { name: "Azerbaycan", flag: "🇦🇿", slug: "azerbaycan", visa: "Kimlikle", idea: "Kısa uçuş, güçlü kültür ve şehir kaçamağı." },
  { name: "Bosna Hersek", flag: "🇧🇦", slug: "bosna-hersek", visa: "Vizesiz", idea: "Tarihi sokaklar ve kolay Balkan rotası." },
  { name: "Karadağ", flag: "🇲🇪", slug: "karadag", visa: "Vizesiz", idea: "Deniz, doğa ve kompakt tatil planı." },
  { name: "Sırbistan", flag: "🇷🇸", slug: "sirbistan", visa: "Vizesiz", idea: "Şehir hayatı ve uygun bütçeli kaçamak." },
  { name: "Dubai", flag: "🇦🇪", slug: "bae", visa: "e-Vize", idea: "Modern şehir, kısa tatil ve alışveriş rotası." },
];

export default function SurpriseButton() {
  const [rolling, setRolling] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selected = useMemo(() => routes[selectedIndex], [selectedIndex]);

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    window.setTimeout(() => {
      const next = Math.floor(Math.random() * routes.length);
      setSelectedIndex(next);
      setRolling(false);
    }, 950);
  };

  return (
    <div className={rolling ? "l2t-surprise-card is-rolling" : "l2t-surprise-card"}>
      <button type="button" onClick={roll} className="l2t-surprise-roll" disabled={rolling}>
        <span className="l2t-surprise-globe-dice" aria-hidden="true">
          <span className="l2t-globe-face">🌍</span>
          <span className="l2t-globe-spark"><Sparkles size={13} /></span>
        </span>
        <span>{rolling ? "Rota seçiliyor..." : "Beni Şaşırt"}</span>
        <Dices size={16} />
      </button>

      <div className="l2t-surprise-result">
        <span className="l2t-surprise-flag">{selected.flag}</span>
        <div>
          <strong>{selected.name}</strong>
          <p>{selected.idea}</p>
          <small>{selected.visa}</small>
        </div>
      </div>

      <div className="l2t-surprise-actions">
        <Link href={`/ulke-rehberi/${selected.slug}`}>Rotayı Gör</Link>
        <Link href="/kampanyalar">Uçuş Fiyatlarına Bak</Link>
      </div>
      {rolling && <span className="l2t-surprise-flash" />}
    </div>
  );
}
