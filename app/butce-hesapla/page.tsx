"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Bus,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Info,
  MapPin,
  Plane,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

type TravelStyle = "economy" | "balanced" | "comfort";

type CityBudget = {
  image: string;
  country: string;
  visa: string;
  daily: Record<TravelStyle, { hotel: number; food: number; transport: number; activities: number }>;
  flight: Record<TravelStyle, number>;
};

const cityBudgets: Record<string, CityBudget> = {
  "Saraybosna": {
    image: "/destinations/bosnia/sarajevo.jpg",
    country: "Bosna Hersek",
    visa: "Vizesiz",
    daily: {
      economy: { hotel: 1300, food: 700, transport: 180, activities: 250 },
      balanced: { hotel: 2300, food: 1200, transport: 350, activities: 600 },
      comfort: { hotel: 4200, food: 2200, transport: 750, activities: 1200 },
    },
    flight: { economy: 4200, balanced: 6000, comfort: 9500 },
  },
  "Tiflis": {
    image: "/destinations/georgia/tbilisi.jpg",
    country: "Gürcistan",
    visa: "Kimlikle",
    daily: {
      economy: { hotel: 1400, food: 650, transport: 150, activities: 250 },
      balanced: { hotel: 2500, food: 1200, transport: 350, activities: 650 },
      comfort: { hotel: 4800, food: 2300, transport: 850, activities: 1300 },
    },
    flight: { economy: 4500, balanced: 6500, comfort: 10500 },
  },
  "Bakü": {
    image: "/destinations/baku-flame.jpg",
    country: "Azerbaycan",
    visa: "Kimlikle",
    daily: {
      economy: { hotel: 1700, food: 800, transport: 180, activities: 300 },
      balanced: { hotel: 3000, food: 1450, transport: 450, activities: 750 },
      comfort: { hotel: 5600, food: 2800, transport: 1000, activities: 1600 },
    },
    flight: { economy: 5200, balanced: 7500, comfort: 12000 },
  },
  "Belgrad": {
    image: "/destinations/serbia/belgrade-fortress.jpg",
    country: "Sırbistan",
    visa: "Vizesiz",
    daily: {
      economy: { hotel: 1800, food: 900, transport: 220, activities: 350 },
      balanced: { hotel: 3200, food: 1600, transport: 480, activities: 800 },
      comfort: { hotel: 5800, food: 3000, transport: 1100, activities: 1700 },
    },
    flight: { economy: 5200, balanced: 7800, comfort: 12500 },
  },
  "Roma": {
    image: "/destinations/italy/colosseum.jpg",
    country: "İtalya",
    visa: "Schengen",
    daily: {
      economy: { hotel: 3200, food: 1500, transport: 430, activities: 900 },
      balanced: { hotel: 5600, food: 2700, transport: 850, activities: 1800 },
      comfort: { hotel: 10000, food: 5000, transport: 1900, activities: 3800 },
    },
    flight: { economy: 6500, balanced: 9500, comfort: 16000 },
  },
  "Dubai": {
    image: "/destinations/dubai-palm.jpg",
    country: "BAE",
    visa: "e-Vize",
    daily: {
      economy: { hotel: 3600, food: 1800, transport: 800, activities: 1200 },
      balanced: { hotel: 6500, food: 3400, transport: 1600, activities: 3000 },
      comfort: { hotel: 14500, food: 7000, transport: 4200, activities: 7500 },
    },
    flight: { economy: 8000, balanced: 12000, comfort: 22000 },
  },
};

const styleLabels: Record<TravelStyle, { title: string; text: string }> = {
  economy: { title: "Ekonomik", text: "Temel konfor, uygun konaklama ve kontrollü harcama." },
  balanced: { title: "Dengeli", text: "İyi konum, rahat yemek bütçesi ve birkaç ücretli aktivite." },
  comfort: { title: "Konforlu", text: "Daha iyi konaklama, esnek ulaşım ve geniş aktivite bütçesi." },
};

function formatTry(value: number) {
  return `${Math.round(value).toLocaleString("tr-TR")} TL`;
}

export default function BudgetCalculatorPage() {
  const [city, setCity] = useState("Saraybosna");
  const [days, setDays] = useState(3);
  const [people, setPeople] = useState(1);
  const [style, setStyle] = useState<TravelStyle>("balanced");
  const [includeFlight, setIncludeFlight] = useState(true);
  const [includeHotel, setIncludeHotel] = useState(true);

  const selected = cityBudgets[city];
  const costs = selected.daily[style];

  const summary = useMemo(() => {
    const hotel = includeHotel ? costs.hotel * days * people : 0;
    const food = costs.food * days * people;
    const transport = costs.transport * days * people;
    const activities = costs.activities * days * people;
    const flight = includeFlight ? selected.flight[style] * people : 0;
    const total = hotel + food + transport + activities + flight;
    const buffer = Math.round(total * .12);

    return { hotel, food, transport, activities, flight, total, buffer, safeTotal: total + buffer };
  }, [costs, days, includeFlight, includeHotel, people, selected.flight, style]);

  const assistantHref = `/rota-asistani?budget=${encodeURIComponent(`${summary.safeTotal.toLocaleString("tr-TR")} TL altı`)}&visa=${encodeURIComponent(selected.visa)}&days=${encodeURIComponent(`${days} gün`)}`;

  return (
    <div className="l2t-budget-v25-page">
      <section className="l2t-budget-v25-hero">
        <div className="l2t-wrap l2t-budget-v25-hero-grid">
          <div>
            <span className="l2t-v25-kicker"><Calculator size={15} /> Seyahat bütçe planlayıcı</span>
            <h1>Yola çıkmadan toplam maliyeti yaklaşık olarak gör.</h1>
            <p>Şehir, kişi sayısı, gün ve seyahat tarzını seç. Uçuş, konaklama, yemek, ulaşım ve aktiviteleri tek tabloda hesapla.</p>
          </div>
          <div className="l2t-budget-v25-hero-photo">
            <Image src={selected.image} alt={`${city} seyahat görünümü`} fill priority sizes="(max-width: 800px) 92vw, 44vw" />
            <span><MapPin size={15} /> {city}, {selected.country}</span>
          </div>
        </div>
      </section>

      <section className="l2t-wrap l2t-budget-v25-shell">
        <div className="l2t-budget-v25-form-card">
          <div className="l2t-budget-v25-card-head">
            <span><Wallet size={21} /></span>
            <div><small>Plan bilgileri</small><h2>Seyahatini tanımla</h2></div>
          </div>

          <div className="l2t-budget-v25-fields">
            <label>
              <span><MapPin size={16} /> Hedef şehir</span>
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                {Object.entries(cityBudgets).map(([name, data]) => <option key={name} value={name}>{name}, {data.country}</option>)}
              </select>
            </label>
            <div className="l2t-budget-v25-two-fields">
              <label>
                <span><CalendarDays size={16} /> Gün</span>
                <input type="number" min={1} max={30} value={days} onChange={(event) => setDays(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />
              </label>
              <label>
                <span><Users size={16} /> Kişi</span>
                <input type="number" min={1} max={10} value={people} onChange={(event) => setPeople(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} />
              </label>
            </div>
          </div>

          <fieldset className="l2t-budget-v25-style-select">
            <legend>Seyahat tarzı</legend>
            {Object.entries(styleLabels).map(([key, value]) => (
              <button type="button" key={key} className={style === key ? "is-active" : ""} onClick={() => setStyle(key as TravelStyle)}>
                <strong>{value.title}</strong><small>{value.text}</small>
              </button>
            ))}
          </fieldset>

          <div className="l2t-budget-v25-toggles">
            <label><input type="checkbox" checked={includeFlight} onChange={(event) => setIncludeFlight(event.target.checked)} /><span><Plane size={17} /> Uçuş dahil</span></label>
            <label><input type="checkbox" checked={includeHotel} onChange={(event) => setIncludeHotel(event.target.checked)} /><span><BedDouble size={17} /> Konaklama dahil</span></label>
          </div>

          <div className="l2t-budget-v25-info"><Info size={17} /><p>Hesaplama yaklaşık planlama aralığıdır. Fiyatlar tarih, kur, doluluk ve kişisel tercihlere göre değişebilir.</p></div>
        </div>

        <aside className="l2t-budget-v25-result-card">
          <div className="l2t-budget-v25-result-top">
            <span>{selected.visa}</span>
            <small>{people} kişi · {days} gün · {styleLabels[style].title}</small>
            <h2>{formatTry(summary.safeTotal)}</h2>
            <p>Önerilen güvenli toplam bütçe</p>
          </div>

          <div className="l2t-budget-v25-breakdown">
            <div><span><Plane size={17} /> Uçuş</span><strong>{formatTry(summary.flight)}</strong></div>
            <div><span><BedDouble size={17} /> Konaklama</span><strong>{formatTry(summary.hotel)}</strong></div>
            <div><span><Coffee size={17} /> Yeme içme</span><strong>{formatTry(summary.food)}</strong></div>
            <div><span><Bus size={17} /> Şehir içi ulaşım</span><strong>{formatTry(summary.transport)}</strong></div>
            <div><span><Ticket size={17} /> Aktivite</span><strong>{formatTry(summary.activities)}</strong></div>
            <div className="is-buffer"><span><CheckCircle2 size={17} /> Esneklik payı</span><strong>{formatTry(summary.buffer)}</strong></div>
          </div>

          <div className="l2t-budget-v25-actions">
            <Link href={assistantHref}><Sparkles size={18} /> Bu bütçeyle rota oluştur <ArrowRight size={17} /></Link>
            <Link href="/#bilet-ara"><Plane size={18} /> Uçuşları kontrol et</Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
