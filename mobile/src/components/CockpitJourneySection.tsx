import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/api";
import { readCockpitJourney, saveCockpitJourney, validJourneyIntent, type CockpitJourneyDetails, type CockpitJourneyIntent } from "../lib/cockpitJourney";
import type { CockpitTrip } from "../lib/supabaseData";
import "./cockpit-journey-details.css";

export function CockpitJourneySection({ ownerId, accessToken, trips, selectedTrip, intent, onSelectTrip, onCreateTrip, onHandled, onRefreshTrips }: {
  ownerId: string; accessToken: string; trips: CockpitTrip[]; selectedTrip: CockpitTrip | null; intent?: CockpitJourneyIntent | null;
  onSelectTrip: (id: string) => void; onCreateTrip: (intent: CockpitJourneyIntent) => void; onHandled: () => void;
  onRefreshTrips?: () => Promise<void>;
}) {
  const { copy, dateLocale } = useI18n();
  const [details, setDetails] = useState<CockpitJourneyDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const generation = useRef(0), pending = useRef(false);
  const tripId = selectedTrip?.id || "";
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    setDetails(null); setError(""); setReady(false); setSaving(false); pending.current = false;
    if (!tripId) { setLoading(false); return () => { generation.current++; }; }
    setLoading(true);
    void readCockpitJourney(ownerId, tripId, accessToken, controller.signal).then(row => {
      if (version === generation.current) { setDetails(row); setReady(true); }
    }).catch(() => {
      if (version === generation.current) setError(copy("Seyahat programı yüklenemedi. Yeniden dene.", "The itinerary could not be loaded. Retry.", "Programi nuk u ngarkua. Provo sërish."));
    }).finally(() => { if (version === generation.current) setLoading(false); });
    return () => { generation.current++; controller.abort(); };
  }, [ownerId, accessToken, tripId, reload, copy]);
  const validIntent = intent && validJourneyIntent(intent, ownerId) ? intent : null;
  const attach = async () => {
    if (!validIntent || !selectedTrip || !ready || pending.current) return;
    const days = Math.round((Date.parse(selectedTrip.endDate) - Date.parse(selectedTrip.startDate)) / 86400000) + 1;
    if (validIntent.kind === "saved-route" && validIntent.route.dailyPlan.length > days) {
      setError(copy("Rota, seyahatinden daha uzun. Önce seyahat tarihlerini düzenle.", "This itinerary is longer than your trip. Edit the trip dates first.", "Programi është më i gjatë se udhëtimi. Ndrysho datat së pari.")); return;
    }
    const snapshot = validIntent.kind === "saved-route" ? { ...validIntent, dates: { startDate: selectedTrip.startDate, endDate: selectedTrip.endDate } } : validIntent;
    const version = generation.current;
    pending.current = true; setSaving(true); setError("");
    try {
      const saved = await saveCockpitJourney(ownerId, selectedTrip.id, accessToken, snapshot, details);
      if (version !== generation.current) return;
      setDetails(saved); onHandled();
    } catch (cause) {
      if (version !== generation.current) return;
      setError(cause instanceof ApiError && cause.status === 409
        ? copy("Bu seyahat başka bir yerde değişti. Yenileyip tekrar onayla; seçimin duruyor.", "This trip changed elsewhere. Reload and confirm again; your selection is kept.", "Udhëtimi ndryshoi diku tjetër. Rifresko dhe konfirmo sërish; zgjedhja u ruajt.")
        : copy("Seyahate eklenemedi. Seçimin duruyor; yeniden deneyebilirsin.", "Could not attach to the trip. Your selection is kept; you can retry.", "Nuk u shtua në udhëtim. Zgjedhja u ruajt; mund të provosh sërish."));
    } finally { if (version === generation.current) { pending.current = false; setSaving(false); } }
  };
  if (!validIntent && !selectedTrip) return null;
  const routeDatesChanged = details?.route?.dates && selectedTrip && (details.route.dates.startDate !== selectedTrip.startDate || details.route.dates.endDate !== selectedTrip.endDate);
  const money = (amount: number, currency: string) => new Intl.NumberFormat(dateLocale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  return <section className="cockpit-journey-details" aria-label={copy("Seyahat programın", "Your itinerary", "Programi yt i udhëtimit")}>
    {validIntent && <div className="cockpit-import-card">
      <span className="cockpit-section-label"><Icon name={validIntent.kind === "saved-route" ? "route" : "wallet"} size={18}/>{copy("KOKPİTE EKLE", "ADD TO COCKPIT", "SHTO NË KABINË")}</span>
      <h2>{validIntent.kind === "saved-route" ? validIntent.route.name : validIntent.city}</h2>
      <p>{validIntent.kind === "saved-route"
        ? copy("Seçtiğin rotanın bir kopyası seyahatinde saklanır. İlk rota silinse de programın kalır.", "A copy of your selected route is saved with the trip, even if the original is removed.", "Një kopje e itinerarit ruhet me udhëtimin, edhe nëse origjinali fshihet.")
        : copy("Gün, kişi, kaynak fiyatı ve kullanılan kurla birlikte tahmin kaydedilir. Bu bir harcama kaydı değildir.", "The estimate keeps its days, travellers, source prices and exchange rate. It is not an expense.", "Vlerësimi ruan ditët, personat, çmimet burimore dhe kursin. Nuk është shpenzim i kryer.")}</p>
      {trips.length > 0 && <label>{copy("Hangi seyahat?", "Which trip?", "Cili udhëtim?")}<select value={tripId} disabled={saving} onChange={event => onSelectTrip(event.target.value)}>{trips.map(trip => <option key={trip.id} value={trip.id}>{[trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ")} · {trip.startDate} – {trip.endDate}</option>)}</select></label>}
      {((validIntent.kind === "saved-route" && details?.route) || (validIntent.kind === "city-budget" && details?.budget)) && <p role="note">{copy("Bu seyahatteki mevcut kayıt seçtiğinle değiştirilecek.", "The existing attachment in this trip will be replaced with your selection.", "Regjistrimi ekzistues do të zëvendësohet me zgjedhjen tënde.")}</p>}
      <div className="cockpit-journey-actions"><button className="primary-button" disabled={!selectedTrip || !ready || loading || saving} onClick={() => void attach()}>{saving ? copy("Kaydediliyor…", "Saving…", "Po ruhet…") : copy("Seçili seyahate ekle", "Attach to selected trip", "Shto në udhëtimin e zgjedhur")}</button><button className="secondary-button" disabled={saving} onClick={() => onCreateTrip(validIntent)}>{copy("Yeni seyahat oluştur", "Create a trip", "Krijo udhëtim")}</button><button className="text-button" disabled={saving} onClick={onHandled}>{copy("Vazgeç", "Cancel", "Anulo")}</button></div>
    </div>}
    {loading && <p role="status">{copy("Seyahat programı yükleniyor…", "Loading itinerary…", "Po ngarkohet programi…")}</p>}
    {error && <div className="cockpit-journey-error" role="alert"><p>{error}</p><button className="secondary-button" disabled={loading || saving} onClick={async () => { setLoading(true); try { await onRefreshTrips?.(); } finally { setReload(value => value + 1); } }}>{copy("Yenile", "Reload", "Rifresko")}</button></div>}
    {routeDatesChanged && <p role="status">{copy("Seyahat tarihlerin değişti. Kayıtlı programın günlerini yeni tarihlerine göre gözden geçir.", "Your trip dates changed. Review the saved itinerary days against the new dates.", "Datat e udhëtimit ndryshuan. Kontrollo ditët e programit sipas datave të reja.")}</p>}
    {details?.route && <article className="cockpit-attached-route"><span className="cockpit-section-label"><Icon name="route" size={18}/>{copy("SEYAHAT PROGRAMIN", "YOUR ITINERARY", "PROGRAMI YT")}</span><h2>{details.route.route.name}</h2><p>{details.route.route.why}</p><ol>{details.route.route.dailyPlan.map((day, index) => <li key={index}><strong>{copy(`${index + 1}. gün`, `Day ${index + 1}`, `Dita ${index + 1}`)}</strong><span>{day}</span></li>)}</ol></article>}
    {details?.budget && <article className="cockpit-attached-budget"><span className="cockpit-section-label"><Icon name="wallet" size={18}/>{copy("BÜTÇE TAHMİNİN", "YOUR BUDGET ESTIMATE", "VLERËSIMI I BUXHETIT")}</span><h2>{details.budget.city}</h2><strong className="cockpit-budget-total">{details.budget.displayTotal !== null ? money(details.budget.displayTotal, details.budget.displayCurrency) : money(details.budget.estimate.total, "GBP")}</strong><p>{details.budget.estimate.days} {copy("gün", "days", "ditë")} · {details.budget.estimate.people} {copy("kişi", "travellers", "persona")} · {details.budget.estimate.nights} {copy("gece", "nights", "netë")}</p><dl><div><dt>{copy("Konaklama", "Accommodation", "Akomodimi")}</dt><dd>{money(details.budget.estimate.hotel, "GBP")}</dd></div><div><dt>{copy("Akşam yemeği", "Dinner", "Darka")}</dt><dd>{money(details.budget.estimate.meals, "GBP")}</dd></div><div><dt>{copy("Toplu taşıma", "Public transport", "Transporti publik")}</dt><dd>{money(details.budget.estimate.travel, "GBP")}</dd></div></dl><p>{copy("Kısmi tahmin; uçuş ve diğer harcamalar dahil değildir.", "Partial estimate; flights and other expenses are excluded.", "Vlerësim i pjesshëm; fluturimet dhe shpenzimet e tjera nuk përfshihen.")} {copy("Kaynak fiyat ayı", "Source price month", "Muaji i çmimeve burimore")}: {details.budget.sourceMonth}.{details.budget.exchangeRate && <> {copy("Kur tarihi", "Exchange date", "Data e kursit")}: {details.budget.exchangeRate.date}.</>}</p></article>}
  </section>;
}
