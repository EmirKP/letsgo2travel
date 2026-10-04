"use client";

import { useRef, useState, type FormEvent } from "react";
import { WebTripConflict } from "@/lib/cockpit/web-data";
import { cockpitEditTimeZone } from "../../../mobile/src/lib/cockpitEdit";
import { flightTimes, normalizeFlightNumber, normalizePnr } from "../../../mobile/src/lib/cockpitForm";
import countries from "../../../mobile/src/data/iso3166.json";
import { detailedTripPatch, mobileTrip, rebaseWebEdit, webEditForm, webEditUpdate, webTripDetailsChanged } from "./web-edit";
import CockpitAirportField from "./CockpitAirportField";
import type { Trip, TripPersonalUpdate, TripStatus } from "./types";
import styles from "./Cockpit.module.css";

const statusLabels: Record<TripStatus, string> = { upcoming: "Yaklaşan", active: "Devam ediyor", completed: "Tamamlandı", cancelled: "İptal edildi" };
const countryNames = new Intl.DisplayNames(["tr"], { type: "region" });

export default function CockpitTripSettings({ trip, onSave, onReload }: {
  trip: Trip; onSave: (trip: Trip, input: TripPersonalUpdate) => Promise<void>; onReload: (id: string) => Promise<Trip>;
}) {
  const [baseline, setBaseline] = useState(trip), [draft, setDraft] = useState(() => webEditForm(trip));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const pending = useRef(false);
  const flightChanged = webTripDetailsChanged(baseline, draft);
  const ambiguous = flightTimes({ ...draft, departureUtc: undefined, arrivalUtc: undefined });
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC", "Europe/Istanbul", "Europe/London"];
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || conflict) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const update = webEditUpdate(draft);
      detailedTripPatch(baseline, update);
      await onSave(baseline, update);
      setMessage("Seyahat kaydedildi. Uygulamada aynı hesabın kokpitini yenileyince görünür.");
      // Obtain the server's CAS timestamp instead of inventing a local revision.
      const latest = await onReload(trip.id);
      setBaseline(latest); setDraft(webEditForm(latest));
    } catch (error) {
      setConflict(error instanceof WebTripConflict);
      setMessage(error instanceof Error ? error.message : "Seyahat kaydedilemedi.");
    } finally { pending.current = false; setBusy(false); }
  };
  const reload = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const latest = await onReload(trip.id), original = webEditForm(baseline), updated = webEditForm(latest);
      // Keep edits, adopt only untouched remote fields, then require another Save.
      setBaseline(latest); setDraft(rebaseWebEdit(original, draft, updated)); setConflict(false);
      setMessage("Güncel kayıt yüklendi. Değişikliklerin duruyor; kontrol edip yeniden kaydet.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Güncel kayıt yüklenemedi."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <details className={`${styles.card} ${styles.tripSettings}`}><summary>Seyahat bilgilerini düzenle</summary>
    <form onSubmit={save} className={styles.tripForm}>
      {!baseline.flightLookupManaged && <>
        {draft.mode === "flight" ? <>
          <CockpitAirportField label="Kalkış havalimanı" value={draft.originAirport} disabled={busy} onChange={originAirport => setDraft(current => ({ ...current, originAirport, departureUtc: undefined }))}/>
          <CockpitAirportField label="Varış havalimanı" value={draft.airport} disabled={busy} onChange={airport => setDraft(current => ({ ...current, airport, destinationCountry: airport?.country || "", destinationCode: airport?.countryCode || "", destinationCity: airport?.city || "", arrivalUtc: undefined }))}/>
        </> : <>
          <label><span>Ülke</span><select required disabled={busy} value={draft.destinationCode} onChange={event => { const country = countries.find(item => item.alpha2 === event.target.value); if (country) setDraft(current => ({ ...current, destinationCode: country.alpha2, destinationCountry: countryNames.of(country.alpha2) || country.name, countryAlpha3: country.alpha3 })); }}><option value="">Ülke seç</option>{countries.map(country => <option key={country.alpha2} value={country.alpha2}>{countryNames.of(country.alpha2) || country.name}</option>)}</select></label>
          <label><span>Şehir</span><input maxLength={100} disabled={busy} value={draft.destinationCity} onChange={event => setDraft(current => ({ ...current, destinationCity: event.target.value }))}/></label>
        </>}
        <label><span>Başlangıç tarihi</span><input type="date" required disabled={busy} value={draft.startDate} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value, departureUtc: undefined }))}/></label>
        {draft.mode === "flight" && <>
          <label><span>Kalkış · yerel saat</span><input type="time" required={flightChanged} disabled={busy} value={draft.departureTime} onChange={event => setDraft(current => ({ ...current, departureTime: event.target.value, departureUtc: undefined }))}/></label>
          <label><span>Varış tarihi</span><input type="date" required={flightChanged} disabled={busy} value={draft.arrivalDate} onChange={event => setDraft(current => ({ ...current, arrivalDate: event.target.value, arrivalUtc: undefined }))}/></label>
          <label><span>Varış · yerel saat</span><input type="time" required={flightChanged} disabled={busy} value={draft.arrivalTime} onChange={event => setDraft(current => ({ ...current, arrivalTime: event.target.value, arrivalUtc: undefined }))}/></label>
          {(["originAirport", "airport"] as const).map(key => draft[key] && <label key={key}><span>{key === "originAirport" ? "Kalkış saat dilimi" : "Varış saat dilimi"}</span><select value={draft[key]?.timeZone || ""} disabled={busy} onChange={event => setDraft(current => ({ ...cockpitEditTimeZone(mobileTrip(baseline), webEditForm(baseline), current, key, event.target.value), status: current.status }))}><option value="">Saat dilimi seç</option>{[...new Set([draft[key]?.timeZone || "", ...zones])].filter(Boolean).map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>)}
          {(["departure", "arrival"] as const).map(key => { const result = ambiguous[key]; return result.ok === false && result.reason === "ambiguous" && <label key={key}><span>{key === "departure" ? "Kalkış" : "Varış"} · biletindeki UTC saati</span><select required disabled={busy} value={key === "departure" ? draft.departureUtc || "" : draft.arrivalUtc || ""} onChange={event => setDraft(current => ({ ...current, [key === "departure" ? "departureUtc" : "arrivalUtc"]: event.target.value }))}><option value="">Saat değişimi: UTC karşılığını seç</option>{result.candidates?.map(instant => <option key={instant} value={instant}>{instant}</option>)}</select></label>; })}
          <label><span>Uçuş numarası · isteğe bağlı</span><input maxLength={8} disabled={busy} value={draft.flightNumber} onChange={event => setDraft(current => ({ ...current, flightNumber: normalizeFlightNumber(event.target.value) }))}/></label>
          <label><span>Havayolu · isteğe bağlı</span><input maxLength={80} disabled={busy} value={draft.airline} onChange={event => setDraft(current => ({ ...current, airline: event.target.value }))}/></label>
        </>}
      </>}
      <label><span>Bitiş tarihi</span><input type="date" required disabled={busy} min={draft.startDate} value={draft.endDate} onChange={event => setDraft(current => ({ ...current, endDate: event.target.value }))}/></label>
      <label><span>PNR · isteğe bağlı</span><input value={draft.flightPnr || ""} disabled={busy} maxLength={20} onChange={event => setDraft(current => ({ ...current, flightPnr: normalizePnr(event.target.value) }))}/></label>
      <label><span>Seyahat durumu</span><select disabled={busy} value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value as TripStatus }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {baseline.flightLookupManaged && <p className={styles.fullField}>Bu uçuşun havalimanları ve saatleri sağlayıcı tarafından yönetilir. Bitiş tarihi, PNR ve seyahat durumunu düzenleyebilirsin.</p>}
      <p className={styles.fullField}>Hazırlık listen, eklediğin etkinlikler, rota ve bütçe kopyası korunur; tarih değişince programını gözden geçir.</p>
      {message && <p className={styles.fullField} role="status">{message}</p>}
      <div className={styles.modalActions}><button type="button" disabled={busy} onClick={() => void reload()}>{conflict ? "Güncel kaydı yükle ve gözden geçir" : "Güncel kaydı yükle"}</button><button type="submit" disabled={busy || conflict}>{busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}</button></div>
    </form>
  </details>;
}
