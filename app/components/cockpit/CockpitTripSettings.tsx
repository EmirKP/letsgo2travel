"use client";

import { useRef, useState, type FormEvent } from "react";
import { personalTripPatch, WebTripConflict } from "@/lib/cockpit/web-data";
import type { Trip, TripPersonalUpdate, TripStatus } from "./types";
import styles from "./Cockpit.module.css";

const formOf = (trip: Trip): TripPersonalUpdate => ({ startDate: trip.startDate, endDate: trip.endDate, flightPnr: trip.flightPnr || "", status: trip.status });
const statusLabels: Record<TripStatus, string> = { upcoming: "Yaklaşan", active: "Devam ediyor", completed: "Tamamlandı", cancelled: "İptal edildi" };

export default function CockpitTripSettings({ trip, onSave, onReload }: {
  trip: Trip; onSave: (trip: Trip, input: TripPersonalUpdate) => Promise<void>; onReload: (id: string) => Promise<Trip>;
}) {
  const [baseline, setBaseline] = useState(trip), [draft, setDraft] = useState(() => formOf(trip));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || conflict) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      personalTripPatch(baseline, draft);
      await onSave(baseline, draft);
      setMessage("Seyahat kaydedildi. Uygulamada aynı hesabın kokpitini yenileyince görünür.");
      // Obtain the server's CAS timestamp instead of inventing a local revision.
      const latest = await onReload(trip.id);
      setBaseline(latest); setDraft(formOf(latest));
    } catch (error) {
      setConflict(error instanceof WebTripConflict);
      setMessage(error instanceof Error ? error.message : "Seyahat kaydedilemedi.");
    } finally { pending.current = false; setBusy(false); }
  };
  const reload = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const latest = await onReload(trip.id), original = formOf(baseline), updated = formOf(latest);
      // Keep edits, adopt only untouched remote fields, then require another Save.
      for (const key of Object.keys(draft) as Array<keyof TripPersonalUpdate>) if (draft[key] !== original[key]) Object.assign(updated, { [key]: draft[key] });
      setBaseline(latest); setDraft(updated); setConflict(false);
      setMessage("Güncel kayıt yüklendi. Değişikliklerin duruyor; kontrol edip yeniden kaydet.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Güncel kayıt yüklenemedi."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <details className={`${styles.card} ${styles.tripSettings}`}><summary>Seyahat bilgilerini düzenle</summary>
    <form onSubmit={save} className={styles.tripForm}>
      <label><span>Başlangıç tarihi</span><input type="date" required disabled={busy || !!(baseline.flightLookupManaged || baseline.departureAt || baseline.originIata || baseline.destinationIata)} value={draft.startDate} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value }))}/></label>
      <label><span>Bitiş tarihi</span><input type="date" required disabled={busy} min={draft.startDate} value={draft.endDate} onChange={event => setDraft(current => ({ ...current, endDate: event.target.value }))}/></label>
      <label><span>PNR · isteğe bağlı</span><input value={draft.flightPnr || ""} disabled={busy} maxLength={20} onChange={event => setDraft(current => ({ ...current, flightPnr: event.target.value.toUpperCase() }))}/></label>
      <label><span>Seyahat durumu</span><select disabled={busy} value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value as TripStatus }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {(baseline.departureAt || baseline.flightLookupManaged || baseline.originIata || baseline.destinationIata) && <p className={styles.fullField}>Uçuşun havalimanı, yerel saati ve başlangıç tarihi uygulamadaki ayrıntılı düzenleme alanından değiştirilir. Buradaki düzenleme uçuş saatini değiştirmez.</p>}
      <p className={styles.fullField}>Kayıtlı rota ve bütçe kopyası korunur; tarih değişince programını gözden geçir.</p>
      {message && <p className={styles.fullField} role="status">{message}</p>}
      <div className={styles.modalActions}><button type="button" disabled={busy} onClick={() => void reload()}>{conflict ? "Güncel kaydı yükle ve gözden geçir" : "Güncel kaydı yükle"}</button><button type="submit" disabled={busy || conflict}>{busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
    </form>
  </details>;
}
