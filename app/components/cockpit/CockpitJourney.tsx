"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { readWebJourney, type WebJourney } from "@/lib/cockpit/web-data";
import type { Trip } from "./types";
import styles from "./Cockpit.module.css";

export function JourneyContent({ journey, trip }: { journey: WebJourney; trip: Trip }) {
  const money = (amount: number, currency: string) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  const { route, budget } = journey;
  return <>
    {route && <article className={`${styles.card} ${styles.journeyCard}`}>
      <span className={styles.cardEyebrow}>KAYITLI SEYAHAT PROGRAMIN</span><h2>{route.route.name}</h2><p>{route.route.why}</p>
      {route.dates && (route.dates.startDate !== trip.startDate || route.dates.endDate !== trip.endDate) && <p role="status">Seyahat tarihlerin değişti. Kayıtlı programın günlerini yeni tarihlerine göre gözden geçir.</p>}
      <ol>{route.route.dailyPlan.map((day, index) => <li key={index}><strong>{index + 1}. gün</strong><p>{day}</p></li>)}</ol>
      <small>Seçtiğin rotanın seyahatine eklenmiş kopyasıdır; kaynak rota silinse de burada kalır.</small>
    </article>}
    {budget && <article className={`${styles.card} ${styles.journeyCard}`}>
      <span className={styles.cardEyebrow}>KAYITLI BÜTÇE TAHMİNİN</span><h2>{budget.city}</h2>
      <strong className={styles.budgetTotal}>{money(budget.displayTotal ?? budget.estimate.total, budget.displayTotal === null ? "GBP" : budget.displayCurrency)}</strong>
      <p>{budget.estimate.days} gün · {budget.estimate.people} kişi · {budget.estimate.nights} gece · {budget.estimate.rooms} oda</p>
      <dl><div><dt>Konaklama</dt><dd>{money(budget.estimate.hotel, "GBP")}</dd></div><div><dt>Akşam yemeği</dt><dd>{money(budget.estimate.meals, "GBP")}</dd></div><div><dt>Toplu taşıma</dt><dd>{money(budget.estimate.travel, "GBP")}</dd></div></dl>
      <p>Kısmi tahmin; uçuş ve diğer harcamalar dahil değildir. Bu tutar harcama kaydı veya belirlenmiş bütçe hedefi değildir.</p>
      <p>Kaynak fiyat ayı: {budget.sourceMonth}. {budget.exchangeRate && <>Kur: 1 GBP = {budget.exchangeRate.rate} {budget.displayCurrency} · {budget.exchangeRate.date} · {budget.exchangeRate.provider}.</>}</p>
      <a href={budget.sourceUrl} target="_blank" rel="noopener noreferrer">Kaynak fiyat araştırması</a>
    </article>}
  </>;
}

export default function CockpitJourney({ trip }: { trip: Trip }) {
  const tripId = trip.id, ownerId = trip.userId;
  const [journey, setJourney] = useState<WebJourney | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setJourney(null); setError("");
    void readWebJourney(supabase, { id: tripId, userId: ownerId }).then(value => { if (active) setJourney(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Program yüklenemedi."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tripId, ownerId, reload]);
  return <section aria-label="Kayıtlı rota ve bütçe" className={styles.journeySection}>
    {loading && <p role="status">Kayıtlı rota ve bütçe yükleniyor…</p>}
    {error && <div className={styles.errorNotice} role="alert"><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>Yeniden dene</button></div>}
    {!loading && !error && journey && <JourneyContent journey={journey} trip={trip}/>}
    {!loading && !error && (!journey || !journey.route && !journey.budget) && <p className={styles.demoNotice}>Uygulamada Planlar veya Ülke Maliyetleri bölümünden bu seyahate eklediğin rota ve bütçe tahmini burada da görünür.</p>}
    <button type="button" className={styles.reloadJourney} disabled={loading} onClick={() => setReload(value => value + 1)}>Rota ve bütçeyi yenile</button>
  </section>;
}
