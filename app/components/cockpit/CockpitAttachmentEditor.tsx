"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { CITY_BENCHMARKS } from "../../../lib/country-intelligence/city-benchmarks";
import { BUDGET_CURRENCIES, type BudgetCurrency } from "../../../lib/country-intelligence/trip-budget";
import { createBudgetCockpitIntent } from "../../../mobile/src/lib/budgetCockpitIntent";
import { initialBudgetCityId, readWebSavedRoutes, type JourneyAttachment, type SavedRouteChoice } from "./web-journey";
import type { WebJourney } from "@/lib/cockpit/web-data";
import type { Trip } from "./types";
import styles from "./Cockpit.module.css";

type Quote = { base: string; quote: string; rate: number; date: string };
const money = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

export default function CockpitAttachmentEditor({ trip, journey, disabled, onAttach }: {
  trip: Trip; journey: WebJourney | null; disabled: boolean; onAttach: (intent: JourneyAttachment) => Promise<void>;
}) {
  const [kind, setKind] = useState<"route" | "budget">("route"), [routes, setRoutes] = useState<SavedRouteChoice[]>([]);
  const [routeKey, setRouteKey] = useState(""), [routesLoading, setRoutesLoading] = useState(true), [routesError, setRoutesError] = useState("");
  const [reload, setReload] = useState(0), [fxReload, setFxReload] = useState(0);
  const [cityId, setCityId] = useState(() => initialBudgetCityId(trip, CITY_BENCHMARKS));
  const [days, setDays] = useState(String(Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1));
  const [people, setPeople] = useState("1"), [currency, setCurrency] = useState<BudgetCurrency>("TRY");
  const [quote, setQuote] = useState<Quote | null>(null), [fxLoading, setFxLoading] = useState(false), [fxError, setFxError] = useState("");
  useEffect(() => {
    let active = true;
    setRoutesLoading(true); setRoutesError("");
    void readWebSavedRoutes(supabase, trip.userId).then(rows => { if (active) setRoutes(rows); })
      .catch(() => { if (active) setRoutesError("Kayıtlı rotalar yüklenemedi."); }).finally(() => { if (active) setRoutesLoading(false); });
    return () => { active = false; };
  }, [trip.userId, reload]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setQuote(null); setFxError("");
    if (kind !== "budget" || currency === "GBP") { setFxLoading(false); return () => controller.abort(); }
    setFxLoading(true);
    const deadline = setTimeout(() => controller.abort(), 12000);
    void fetch(`/api/travel-assistant/rates?base=GBP&quote=${currency}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("rate");
      const value = await response.json() as Quote;
      if (active) setQuote(value);
    }).catch(() => { if (active) setFxError("Güncel kur alınamadı. Yeniden dene veya GBP seç."); })
      .finally(() => { clearTimeout(deadline); if (active) setFxLoading(false); });
    return () => { active = false; clearTimeout(deadline); controller.abort(); };
  }, [currency, kind, fxReload]);
  const city = CITY_BENCHMARKS.find(row => row.id === cityId);
  const budget = useMemo(() => city ? createBudgetCockpitIntent(city, days, people, currency, quote, trip.userId, city.city.tr) : null, [city, days, people, currency, quote, trip.userId]);
  const route = routes.find(row => row.key === routeKey)?.intent;
  const candidate = kind === "route" ? route : budget?.displayTotal !== null ? budget : null;
  const replacing = kind === "route" ? !!journey?.route : !!journey?.budget;
  return <details className={`${styles.card} ${styles.tripSettings}`}><summary>Bu seyahate rota veya bütçe ekle</summary>
    <div className={styles.attachmentTabs} role="group" aria-label="Eklenecek içerik"><button type="button" aria-pressed={kind === "route"} disabled={disabled} onClick={() => setKind("route")}>Kayıtlı rota</button><button type="button" aria-pressed={kind === "budget"} disabled={disabled} onClick={() => setKind("budget")}>Bütçe tahmini</button></div>
    <form className={styles.tripForm} onSubmit={event => { event.preventDefault(); if (candidate && !disabled) void onAttach(candidate); }}>
      {kind === "route" ? <>
        <p className={styles.fullField}>Hesabına kaydettiğin son 100 plandan bir rota seç. Programın bir kopyası bu seyahatte saklanır.</p>
        {routesLoading && <p role="status">Kayıtlı rotalar yükleniyor…</p>}
        {routesError && <p role="alert">{routesError}</p>}
        <label className={styles.fullField}><span>Kayıtlı rota</span><select value={routeKey} disabled={disabled || routesLoading || !!routesError} onChange={event => setRouteKey(event.target.value)}><option value="">Rota seç</option>{routes.map(row => <option value={row.key} key={row.key}>{row.intent.route.name} · {row.intent.route.dailyPlan.length} gün · {row.intent.sourceSavedAt.slice(0, 10)}</option>)}</select></label>
        {!routesLoading && !routesError && routes.length === 0 && <p className={styles.fullField}>Henüz eklenebilecek bir kayıtlı rotan yok. <Link href="/planlarim">Planlarına git</Link></p>}
        <button className={styles.reloadJourney} type="button" disabled={disabled || routesLoading} onClick={() => setReload(value => value + 1)}>Kayıtlı rotaları yenile</button>
        {route && <div className={`${styles.attachmentPreview} ${styles.fullField}`}><h3>{route.route.name}</h3><p>{route.route.why}</p><ol>{route.route.dailyPlan.map((day, index) => <li key={index}>{day}</li>)}</ol><small>{trip.startDate} – {trip.endDate} seyahatine eklenecek.</small></div>}
      </> : <>
        <label className={styles.fullField}><span>Kaynak fiyatı olan şehir</span><select value={cityId} required disabled={disabled} onChange={event => setCityId(event.target.value)}><option value="">Şehir seç</option>{CITY_BENCHMARKS.map(row => <option value={row.id} key={row.id}>{row.city.tr}</option>)}</select></label>
        <label><span>Gün sayısı</span><input type="number" min={1} max={30} step={1} required value={days} disabled={disabled} onChange={event => setDays(event.target.value)}/></label>
        <label><span>Kişi sayısı</span><input type="number" min={1} max={20} step={1} required value={people} disabled={disabled} onChange={event => setPeople(event.target.value)}/></label>
        <label><span>Para birimi</span><select value={currency} disabled={disabled} onChange={event => setCurrency(event.target.value as BudgetCurrency)}>{BUDGET_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label>
        {fxLoading && <p role="status">Kur yükleniyor…</p>}
        {fxError && <div role="alert"><p>{fxError}</p><button type="button" disabled={disabled} onClick={() => setFxReload(value => value + 1)}>Kuru yeniden yükle</button></div>}
        {city && !budget && <p role="alert">Gün sayısı 1–30, kişi sayısı 1–20 arasında tam sayı olmalı.</p>}
        {budget && <div className={`${styles.attachmentPreview} ${styles.fullField}`}><h3>{budget.city}</h3><strong className={styles.budgetTotal}>{money(budget.displayTotal ?? budget.estimate.total, budget.displayTotal === null ? "GBP" : currency)}</strong><p>{budget.estimate.days} gün · {budget.estimate.people} kişi · {budget.estimate.nights} gece · {budget.estimate.rooms} oda</p><p>Konaklama, akşam yemeği ve toplu taşıma için kısmi tahmin. Uçuş ve diğer harcamalar dahil değildir.</p><small>Kaynak: {budget.sourceMonth}. {budget.exchangeRate && <>Kur: {budget.exchangeRate.date} · Frankfurter.</>}</small>{!fxLoading && budget.displayTotal === null && <p role="alert">Seçilen para birimi için doğrulanmış güncel kur yok. Kuru yeniden yükle veya GBP seç.</p>}</div>}
      </>}
      {replacing && <p className={styles.fullField} role="note">Bu seyahatin mevcut {kind === "route" ? "rota" : "bütçe"} kaydı, aşağıdaki düğmeye bastığında seçiminle değiştirilecek.</p>}
      <div className={styles.modalActions}><button type="submit" disabled={disabled || !candidate || kind === "route" && (routesLoading || !!routesError) || kind === "budget" && fxLoading}>{replacing ? "Mevcut kaydı değiştir" : "Bu seyahate ekle"}</button></div>
    </form>
  </details>;
}
