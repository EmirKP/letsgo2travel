import { useRef, useState } from "react";
import { AirportField } from "./AirportField";
import { CountryPicker } from "./CountryPicker";
import { DateTimeField } from "./DateTimeField";
import { Sheet } from "./Sheet";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { cockpitEditForm, cockpitEditInput, cockpitEditTimeZone, rebaseCockpitEditForm } from "../lib/cockpitEdit";
import { flightTimes, normalizeFlightNumber, normalizePnr } from "../lib/cockpitForm";
import { localIsoDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import type { CockpitTrip, UpdateCockpitTripInput } from "../lib/supabaseData";

export function CockpitTripEditor({ trip, busy, error, conflict, onReload, onSave, onClose }: {
  trip: CockpitTrip; busy: boolean; error: string; conflict?: boolean;
  onReload?: (trip: CockpitTrip) => Promise<CockpitTrip | null>;
  onSave: (trip: CockpitTrip, update: UpdateCockpitTripInput) => Promise<boolean>;
  onClose: () => void;
}) {
  const { copy, countryName, locale } = useI18n();
  const [form, setForm] = useState(() => cockpitEditForm(trip));
  const [validation, setValidation] = useState("");
  const [review, setReview] = useState(false);
  const baseline = useRef(form);
  const pending = useRef(false);
  const ambiguities = flightTimes({ ...form, departureUtc: undefined, arrivalUtc: undefined });
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC", "Europe/Istanbul", "Europe/Tirane", "Europe/London"];
  return <Sheet open title={copy("Seyahati düzenle", "Edit trip", "Ndrysho udhëtimin")} onClose={onClose} dismissible={!busy}>
    <form className="cockpit-ticket-import cockpit-edit-form" onSubmit={async event => {
      event.preventDefault();
      if (pending.current || busy || conflict) return;
      const result = cockpitEditInput(trip, form, locale);
      setValidation(result.error);
      if (!result.update) return;
      pending.current = true;
      try { if (await onSave(trip, result.update)) onClose(); } finally { pending.current = false; }
    }}>
      {(validation || error) && <p role="alert" className="inline-error">{validation || error}</p>}
      {conflict && onReload && <div className="info-box"><p>{copy("Bu seyahat başka bir yerde değişti. Güncel kaydı yükle; yazdıkların korunacak. Değişiklikleri inceleyip yeniden kaydetmen gerekecek.", "This trip changed elsewhere. Reload the latest record; your edits will be kept. Review the changes before saving again.", "Ky udhëtim ndryshoi diku tjetër. Ngarko regjistrimin e fundit; ndryshimet e tua do të ruhen. Kontrolloji para se të ruash përsëri.")}</p><button type="button" className="secondary-wide" disabled={busy} onClick={async () => {
        if (pending.current || busy) return;
        pending.current = true;
        try {
          const latest = await onReload(trip);
          if (!latest) return;
          const previous = baseline.current, next = cockpitEditForm(latest);
          setForm(current => rebaseCockpitEditForm(previous, current, next));
          baseline.current = next; setValidation(""); setReview(true);
        } finally { pending.current = false; }
      }}>{copy("Güncel kaydı yükle", "Reload latest record", "Ngarko regjistrimin e fundit")}</button></div>}
      {review && !conflict && <p role="status">{copy("Güncel kayıt yüklendi. Değiştirmediğin alanlar sunucudan yenilendi; kendi değişikliklerin korundu. Aşağıdaki alanları kontrol edip kaydet.", "Latest record loaded. Untouched fields were refreshed; your own edits were kept. Review the fields below, then save.", "Regjistrimi i fundit u ngarkua. Fushat e paprekura u rifreskuan; ndryshimet e tua u ruajtën. Kontrollo fushat më poshtë, pastaj ruaj.")}</p>}
      {trip.flightLookupManaged ? <p>{copy("Uçuş bilgileri sağlayıcıdan gelir. Bitiş tarihini ve kendi rezervasyon kodunu düzenleyebilirsin.", "Flight details come from the provider. You can edit the end date and your booking code.", "Të dhënat e fluturimit vijnë nga ofruesi. Mund të ndryshosh datën e përfundimit dhe kodin e rezervimit.")}</p> : <>
        {form.mode === "flight" ? <>
          <AirportField label={copy("Kalkış havalimanı", "Departure airport", "Aeroporti i nisjes")} value={form.originAirport} onChange={originAirport => setForm(current => ({ ...current, originAirport, departureUtc: undefined }))}/>
          <AirportField label={copy("Varış havalimanı", "Arrival airport", "Aeroporti i mbërritjes")} value={form.airport} onChange={airport => setForm(current => ({ ...current, airport, destinationCountry: airport?.country || "", destinationCode: airport?.countryCode || "", destinationCity: airport?.city || "", arrivalUtc: undefined }))}/>
        </> : <>
          <CountryPicker label={copy("Ülke", "Country", "Shteti")} placeholder={copy("Ülke seç", "Choose a country", "Zgjidh shtetin")} disabled={busy} value={form.countryAlpha3} options={COUNTRY_LIST.map(country => ({ code: country.alpha3, flagCode: alpha2FromAlpha3(country.alpha3), name: countryName(country.alpha3, country.name) }))} onChange={code => {
            const country = COUNTRY_LIST.find(item => item.alpha3 === code);
            setForm(current => ({ ...current, countryAlpha3: code, destinationCountry: country ? countryName(code, country.name) : "", destinationCode: alpha2FromAlpha3(code) }));
          }}/>
          <label>{copy("Şehir", "City", "Qyteti")}<input value={form.destinationCity} maxLength={100} disabled={busy} onChange={event => setForm(current => ({ ...current, destinationCity: event.target.value }))}/></label>
        </>}
        <DateTimeField type="date" label={copy("Başlangıç", "Start date", "Data e fillimit")} value={form.startDate} max={localIsoDate(730)} required disabled={busy} onChange={startDate => setForm(current => ({ ...current, startDate, departureUtc: undefined }))}/>
        {form.mode === "flight" && <>
          <DateTimeField type="time" label={copy("Kalkış · yerel saat", "Departure · local time", "Nisja · ora lokale")} value={form.departureTime} required disabled={busy} onChange={departureTime => setForm(current => ({ ...current, departureTime, departureUtc: undefined }))}/>
          <DateTimeField type="date" label={copy("Varış tarihi", "Arrival date", "Data e mbërritjes")} value={form.arrivalDate} max={localIsoDate(730)} required disabled={busy} onChange={arrivalDate => setForm(current => ({ ...current, arrivalDate, arrivalUtc: undefined }))}/>
          <DateTimeField type="time" label={copy("Varış · yerel saat", "Arrival · local time", "Mbërritja · ora lokale")} value={form.arrivalTime} required disabled={busy} onChange={arrivalTime => setForm(current => ({ ...current, arrivalTime, arrivalUtc: undefined }))}/>
          {(["originAirport", "airport"] as const).map(key => form[key] && <label key={key}>{key === "originAirport" ? copy("Kalkış saat dilimi", "Departure time zone", "Zona kohore e nisjes") : copy("Varış saat dilimi", "Arrival time zone", "Zona kohore e mbërritjes")}<select disabled={busy} value={form[key]?.timeZone || ""} onChange={event => setForm(current => cockpitEditTimeZone(trip, baseline.current, current, key, event.target.value))}><option value="">{copy("Saat dilimi seç", "Select time zone", "Zgjidh zonën kohore")}</option>{[...new Set([form[key]?.timeZone || "", ...zones])].filter(Boolean).map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>)}
          {(["departure", "arrival"] as const).map(key => {
            const result = ambiguities[key];
            if (result.ok !== false || result.reason !== "ambiguous") return null;
            return <label key={key}>{copy("Biletindeki UTC saati", "UTC time on your ticket", "Ora UTC në biletën tënde")}<select value={key === "departure" ? form.departureUtc || "" : form.arrivalUtc || ""} disabled={busy} onChange={event => setForm(current => ({ ...current, [key === "departure" ? "departureUtc" : "arrivalUtc"]: event.target.value }))}><option value="">{copy("Seç", "Choose", "Zgjidh")}</option>{result.candidates?.map(instant => <option key={instant} value={instant}>{instant}</option>)}</select></label>;
          })}
          <label>{copy("Uçuş numarası", "Flight number", "Numri i fluturimit")}<input value={form.flightNumber} maxLength={8} disabled={busy} onChange={event => setForm(current => ({ ...current, flightNumber: normalizeFlightNumber(event.target.value) }))}/></label>
          <label>{copy("Havayolu", "Airline", "Kompania ajrore")}<input value={form.airline} maxLength={80} disabled={busy} onChange={event => setForm(current => ({ ...current, airline: event.target.value }))}/></label>
        </>}
      </>}
      <DateTimeField type="date" label={copy("Seyahat bitişi", "Trip end date", "Përfundimi i udhëtimit")} value={form.endDate} min={form.startDate} max={localIsoDate(730)} required disabled={busy} onChange={endDate => setForm(current => ({ ...current, endDate }))}/>
      <label>{copy("PNR · rezervasyon kodu", "PNR · booking code", "PNR · kodi i rezervimit")}<input value={form.flightPnr} maxLength={20} disabled={busy} onChange={event => setForm(current => ({ ...current, flightPnr: normalizePnr(event.target.value) }))}/></label>
      <p>{copy("Hazırlık listen ve eklediğin etkinlikler korunur.", "Your checklist and attached events are kept.", "Lista e përgatitjeve dhe aktivitetet e shtuara ruhen.")}</p>
      <button type="submit" className="primary-wide" disabled={busy || conflict}>{busy ? copy("Kaydediliyor…", "Saving…", "Po ruhet…") : copy("Değişiklikleri kaydet", "Save changes", "Ruaj ndryshimet")}</button>
    </form>
  </Sheet>;
}
