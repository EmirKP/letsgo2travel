"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { readWebJourney, WebTripConflict, type WebJourney } from "@/lib/cockpit/web-data";
import { saveWebJourney, type JourneyAttachment } from "./web-journey";
import CockpitAttachmentEditor from "./CockpitAttachmentEditor";
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

export default function CockpitJourney({ trip, onReloadTrip }: { trip: Trip; onReloadTrip: (id: string) => Promise<Trip> }) {
  const tripId = trip.id, ownerId = trip.userId;
  const [journey, setJourney] = useState<WebJourney | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [conflict, setConflict] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0), pending = useRef(false);
  useEffect(() => {
    const version = ++generation.current;
    setLoading(true); setReady(false); setJourney(null); setError("");
    void readWebJourney(supabase, { id: tripId, userId: ownerId }).then(value => { if (version === generation.current) { setJourney(value); setReady(true); setConflict(false); } }).catch(cause => { if (version === generation.current) setError(cause instanceof Error ? cause.message : "Program yüklenemedi."); }).finally(() => { if (version === generation.current) setLoading(false); });
    return () => { generation.current = version + 1; };
  }, [tripId, ownerId, reload]);
  const attach = async (intent: JourneyAttachment) => {
    if (!ready || conflict || pending.current) return;
    const version = generation.current;
    pending.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const saved = await saveWebJourney(supabase, trip, intent, journey);
      if (version !== generation.current) return;
      setJourney(saved); setMessage("Seyahatine eklendi. Aynı hesabın uygulamasında kokpiti yenileyince görünür.");
    } catch (cause) {
      if (version !== generation.current) return;
      setConflict(cause instanceof WebTripConflict);
      setError(cause instanceof Error ? cause.message : "Seyahate eklenemedi.");
    } finally { if (version === generation.current) { pending.current = false; setSaving(false); } }
  };
  const refresh = async () => {
    if (pending.current) return;
    const version = generation.current;
    pending.current = true; setLoading(true); setReady(false);
    try {
      await onReloadTrip(tripId);
      if (version === generation.current) { setMessage("Güncel kayıt yüklendi. Seçimini kontrol edip eklemeyi yeniden onayla."); setReload(value => value + 1); }
    } catch (cause) { if (version === generation.current) { setLoading(false); setError(cause instanceof Error ? cause.message : "Seyahat yüklenemedi."); } }
    finally { if (version === generation.current) pending.current = false; }
  };
  return <section aria-label="Kayıtlı rota ve bütçe" className={styles.journeySection}>
    {loading && <p role="status">Kayıtlı rota ve bütçe yükleniyor…</p>}
    {error && <div className={styles.errorNotice} role="alert"><p>{error}</p><button type="button" disabled={loading || saving} onClick={() => void refresh()}>{conflict ? "Güncel kaydı yükle ve gözden geçir" : "Yeniden dene"}</button></div>}
    {!loading && !error && journey && <JourneyContent journey={journey} trip={trip}/>}
    {!loading && !error && (!journey || !journey.route && !journey.budget) && <p className={styles.demoNotice}>Bu seyahate henüz rota veya bütçe eklenmedi. Aşağıdan kayıtlı rotanı seçebilir, bütçe tahminini özelleştirebilirsin.</p>}
    {message && <p role="status">{message}</p>}
    {saving && <p role="status">Seyahate ekleniyor…</p>}
    <CockpitAttachmentEditor trip={trip} journey={journey} disabled={!ready || loading || saving || conflict} onAttach={attach}/>
    <button type="button" className={styles.reloadJourney} disabled={loading || saving} onClick={() => void refresh()}>Rota ve bütçeyi yenile</button>
  </section>;
}
