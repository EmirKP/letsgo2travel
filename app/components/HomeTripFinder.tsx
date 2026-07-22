"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  Compass,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useTripStore } from "../store/tripStore";
import styles from "./HomeTripFinder.module.css";

type VisaPreference = "all" | "easy" | "id_card" | "visa_free" | "evisa";

type FinderRoute = {
  city: string;
  country: string;
  image: string;
  href: string;
  visa: "id_card" | "visa_free" | "evisa" | "visa_required";
  visaLabel: string;
  estimatedBudget: number;
  idealDays: number[];
  flightTime: string;
  reason: string;
};

const finderRoutes: FinderRoute[] = [
  {
    city: "Bakü",
    country: "Azerbaycan",
    image: "/destinations/baku-oldcity.jpg",
    href: "/ulke-rehberi/azerbaycan",
    visa: "id_card",
    visaLabel: "Kimlikle",
    estimatedBudget: 12000,
    idealDays: [2, 3, 4],
    flightTime: "2s 45dk",
    reason: "Kısa uçuş, güçlü şehir deneyimi ve kimlikle giriş kolaylığı.",
  },
  {
    city: "Tiflis",
    country: "Gürcistan",
    image: "/destinations/georgia/tbilisi.jpg",
    href: "/ulke-rehberi/gurcistan",
    visa: "id_card",
    visaLabel: "Kimlikle",
    estimatedBudget: 13000,
    idealDays: [2, 3, 4, 5],
    flightTime: "2s 15dk",
    reason: "Yeme içme, kültür ve hafta sonu kaçamağı için dengeli bir rota.",
  },
  {
    city: "Saraybosna",
    country: "Bosna Hersek",
    image: "/destinations/bosnia/sarajevo.jpg",
    href: "/ulke-rehberi/bosna-hersek",
    visa: "visa_free",
    visaLabel: "Vizesiz",
    estimatedBudget: 14500,
    idealDays: [3, 4, 5],
    flightTime: "2s",
    reason: "İlk yurt dışı deneyimi için kolay, tarihi ve bütçe dostu.",
  },
  {
    city: "Belgrad",
    country: "Sırbistan",
    image: "/destinations/serbia/belgrade-fortress.jpg",
    href: "/ulke-rehberi/sirbistan",
    visa: "visa_free",
    visaLabel: "Vizesiz",
    estimatedBudget: 16000,
    idealDays: [3, 4, 5],
    flightTime: "1s 45dk",
    reason: "Kısa uçuş, hareketli şehir hayatı ve kolay planlama.",
  },
  {
    city: "Dubai",
    country: "BAE",
    image: "/destinations/dubai-marina.jpg",
    href: "/ulke-rehberi/bae",
    visa: "evisa",
    visaLabel: "e-Vize",
    estimatedBudget: 28000,
    idealDays: [4, 5, 7],
    flightTime: "4s",
    reason: "Şehir, plaj ve aktiviteyi aynı seyahatte birleştiren rota.",
  },
  {
    city: "Budapeşte",
    country: "Macaristan",
    image: "/destinations/budapest/parliament.jpg",
    href: "/ulke-rehberi/macaristan",
    visa: "visa_required",
    visaLabel: "Schengen",
    estimatedBudget: 22000,
    idealDays: [3, 4, 5],
    flightTime: "2s 10dk",
    reason: "Mimari, termal deneyim ve şehir gezisini sevenlere uygun.",
  },
  {
    city: "Roma",
    country: "İtalya",
    image: "/destinations/italy/colosseum.jpg",
    href: "/ulke-rehberi/italya",
    visa: "visa_required",
    visaLabel: "Schengen",
    estimatedBudget: 27000,
    idealDays: [4, 5, 7],
    flightTime: "2s 40dk",
    reason: "Tarih, gastronomi ve yürüyerek keşif için güçlü bir klasik.",
  },
  {
    city: "Prag",
    country: "Çekya",
    image: "/destinations/prague/charles-bridge.jpg",
    href: "/ulke-rehberi/cekya",
    visa: "visa_required",
    visaLabel: "Schengen",
    estimatedBudget: 24000,
    idealDays: [3, 4, 5],
    flightTime: "2s 45dk",
    reason: "Kompakt merkez, romantik atmosfer ve kolay şehir içi ulaşım.",
  },
];

const budgetOptions = [
  { value: 12000, label: "12.000 TL'ye kadar" },
  { value: 18000, label: "18.000 TL'ye kadar" },
  { value: 25000, label: "25.000 TL'ye kadar" },
  { value: 35000, label: "35.000 TL ve üzeri" },
];

const dayOptions = [2, 3, 4, 5, 7];

const visaOptions: Array<{ value: VisaPreference; label: string }> = [
  { value: "easy", label: "Kolay giriş" },
  { value: "id_card", label: "Sadece kimlikle" },
  { value: "visa_free", label: "Sadece vizesiz" },
  { value: "evisa", label: "e-Vize olabilir" },
  { value: "all", label: "Vize fark etmez" },
];

function matchesVisa(route: FinderRoute, preference: VisaPreference) {
  if (preference === "all") return true;
  if (preference === "easy") return route.visa !== "visa_required";
  return route.visa === preference;
}

export default function HomeTripFinder() {
  const [budget, setBudget] = useState(18000);
  const [days, setDays] = useState(3);
  const [visa, setVisa] = useState<VisaPreference>("easy");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const addTrip = useTripStore((state) => state.addTrip);

  const matches = useMemo(() => {
    const exact = finderRoutes
      .filter((route) => route.estimatedBudget <= budget)
      .filter((route) => route.idealDays.some((idealDay) => Math.abs(idealDay - days) <= 1))
      .filter((route) => matchesVisa(route, visa))
      .sort((a, b) => Math.abs(a.idealDays[0] - days) - Math.abs(b.idealDays[0] - days) || a.estimatedBudget - b.estimatedBudget);

    if (exact.length >= 3) return exact.slice(0, 3);

    const relaxed = finderRoutes
      .filter((route) => matchesVisa(route, visa))
      .sort((a, b) => Math.abs(a.estimatedBudget - budget) - Math.abs(b.estimatedBudget - budget));

    return Array.from(new Map([...exact, ...relaxed].map((route) => [route.city, route])).values()).slice(0, 3);
  }, [budget, days, visa]);

  const routeAssistantHref = `/rota-asistani?budget=${encodeURIComponent(`${budget.toLocaleString("tr-TR")} TL altı`)}&visa=${encodeURIComponent(
    visa === "id_card" ? "Kimlikle gidilenler" : visa === "visa_free" ? "Sadece vizesiz" : visa === "easy" ? "Kolay giriş" : visa === "evisa" ? "e-Vize olabilir" : "Fark etmez",
  )}&days=${encodeURIComponent(`${days} gün`)}`;

  const saveRoute = (route: FinderRoute) => {
    addTrip({
      type: "country",
      title: `${route.city}, ${route.country}`,
      subtitle: `${route.visaLabel} · Yaklaşık ${route.estimatedBudget.toLocaleString("tr-TR")} TL · ${days} gün`,
      url: route.href,
      image: route.image,
    });
    setSavedUrl(route.href);
    window.setTimeout(() => setSavedUrl(null), 1800);
  };

  return (
    <section className={styles.section} aria-labelledby="weekend-finder-title">
      <div className={`l2t-container ${styles.shell}`}>
        <div className={styles.intro}>
          <span className={styles.kicker}><Sparkles size={15} /> Akıllı keşif</span>
          <h2 id="weekend-finder-title">Bu bütçeyle nereye gidebilirsin?</h2>
          <p>Üç seçim yap. Sistem bütçe, süre ve giriş kolaylığını birlikte değerlendirip sana en mantıklı rotaları çıkarsın.</p>

          <div className={styles.controls}>
            <label>
              <span><Wallet size={17} /> Toplam bütçe</span>
              <select value={budget} onChange={(event) => setBudget(Number(event.target.value))}>
                {budgetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <label>
              <span><CalendarDays size={17} /> Seyahat süresi</span>
              <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {dayOptions.map((day) => <option key={day} value={day}>{day} gün</option>)}
              </select>
            </label>

            <label>
              <span><ShieldCheck size={17} /> Giriş tercihi</span>
              <select value={visa} onChange={(event) => setVisa(event.target.value as VisaPreference)}>
                {visaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <Link href={routeAssistantHref} className={styles.aiLink}>
            <Compass size={19} /> Daha detaylı rota oluştur <ArrowRight size={18} />
          </Link>
          <small className={styles.note}>Bütçeler planlama amaçlı yaklaşık aralıklardır; tarih ve doluluğa göre değişebilir.</small>
        </div>

        <div className={styles.results} aria-live="polite">
          {matches.map((route, index) => (
            <article className={`${styles.matchCard} ${index === 0 ? styles.featured : ""}`} key={route.city}>
              <div className={styles.matchImage}>
                <Image src={route.image} alt={`${route.city} seyahat görünümü`} fill sizes="(max-width: 760px) 92vw, 33vw" />
                <span className={styles.rank}>{index === 0 ? "En uygun eşleşme" : `${index + 1}. seçenek`}</span>
                <button type="button" onClick={() => saveRoute(route)} aria-label={`${route.city} rotasını seyahat panosuna kaydet`}>
                  {savedUrl === route.href ? <Check size={18} /> : <Bookmark size={18} />}
                </button>
              </div>
              <div className={styles.matchBody}>
                <div className={styles.matchTitleRow}>
                  <div><small>{route.country}</small><h3>{route.city}</h3></div>
                  <span>{route.visaLabel}</span>
                </div>
                <p>{route.reason}</p>
                <div className={styles.matchStats}>
                  <span><Wallet size={15} /> ~{route.estimatedBudget.toLocaleString("tr-TR")} TL</span>
                  <span><CalendarDays size={15} /> {days} gün</span>
                  <span><MapPin size={15} /> {route.flightTime}</span>
                </div>
                <Link href={route.href}>Rotayı incele <ArrowRight size={16} /></Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
