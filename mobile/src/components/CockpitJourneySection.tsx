import { lazy, useEffect, useRef, useState } from "react";
import { TodayTripProgram } from "./TodayTripProgram";
import { RouteTranslation } from "./RouteTranslation";
import { savedRouteDisplay } from "../lib/savedRouteDisplay";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/api";
import { readCockpitJourney, saveCockpitJourney, validJourneyIntent, type CockpitJourneyDetails, type CockpitJourneyIntent } from "../lib/cockpitJourney";
import type { CockpitTrip } from "../lib/supabaseData";
import { createRouteCockpitIntent } from "../lib/routeCockpitIntent";
import { mapJourneyToSavedRoute, validateMapJourney, type MapJourney } from "../lib/mapJourney";
import { activeTripContextFromTrip, readActiveTripContext, writeActiveTripContext } from "../lib/activeTripContext";
import type { JourneyGuideRequest } from "../lib/journeyGuideIntent";
import { Sheet } from "./Sheet";
import { LazyOverlay } from "./LazyOverlay";
import "./cockpit-journey-details.css";
import "./map-journey-planner.css";

const MapJourneyPlanner = lazy(() => import("./MapJourneyPlanner").then(module => ({ default: module.MapJourneyPlanner })));

export function CockpitJourneySection({ ownerId, accessToken, trips, selectedTrip, intent, onSelectTrip, onCreateTrip, onHandled, onRefreshTrips, todayTripId, onTodayHandled, onOpenAccount,journeyGuideRequest,onJourneyGuideHandled }: {
  ownerId: string; accessToken: string; trips: CockpitTrip[]; selectedTrip: CockpitTrip | null; intent?: CockpitJourneyIntent | null;
  onSelectTrip: (id: string) => void; onCreateTrip: (intent: CockpitJourneyIntent) => void; onHandled: () => void;
  onRefreshTrips?: () => Promise<void>;
  todayTripId?: string; onTodayHandled?: () => void;
  onOpenAccount?: () => void;
  journeyGuideRequest?:JourneyGuideRequest|null;onJourneyGuideHandled?:()=>void;
}) {
  const { copy, dateLocale, locale } = useI18n();
  const [storedDetails, setDetails] = useState<CockpitJourneyDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [mapCopy, setMapCopy] = useState<{ ownerId: string; tripId: string; journey: MapJourney; base: CockpitJourneyDetails; startDate: string; endDate: string;initialDay?:number;dayRequestId?:number } | null>(null);
  const [mapNotice, setMapNotice] = useState("");
  const generation = useRef(0), pending = useRef(false);
  const tripId = selectedTrip?.id || "";
  const live = useRef({ ownerId, tripId, active: true });
  useEffect(() => { live.current = { ownerId, tripId, active: true }; return () => { live.current.active = false; }; }, [ownerId, tripId]);
  const details = storedDetails?.ownerId === ownerId && storedDetails.tripId === tripId ? storedDetails : null;
  useEffect(() => {
    if (!selectedTrip || readActiveTripContext(ownerId)?.tripId !== selectedTrip.id) return;
    const base = activeTripContextFromTrip(selectedTrip);
    const preferences = details?.budget?.personalPreferences;
    if (base && preferences) writeActiveTripContext(ownerId, { ...base, adults: Number(preferences.adults), children: Number(preferences.children), rooms: Number(preferences.rooms), currency: details.budget!.displayCurrency });
  }, [ownerId, selectedTrip, details?.budget]);
  useEffect(() => { setMapCopy(null); setMapNotice(""); }, [ownerId, tripId]);
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
  useEffect(()=>{
    if(!journeyGuideRequest||!selectedTrip||journeyGuideRequest.tripId!==selectedTrip.id||!ready||loading)return;
    const map=details?.route?.route.mapJourney;
    if(!map||!validateMapJourney(map)||map.id!==journeyGuideRequest.journeyId||journeyGuideRequest.day>map.dayCount){
      setError(copy('İstenen gezi günü bu seyahatte bulunamadı. Programı kontrol edip yeniden aç.','The requested itinerary day is unavailable in this trip. Check the itinerary and reopen it.','Dita e kërkuar nuk gjendet në këtë udhëtim. Kontrollo itinerarin dhe rihape.'));
      onJourneyGuideHandled?.();return;
    }
    const journey:MapJourney={...JSON.parse(JSON.stringify(map)),startDate:selectedTrip.startDate};
    setMapCopy(previous=>previous?.ownerId===ownerId&&previous.tripId===selectedTrip.id&&previous.journey.id===map.id
      ?{...previous,initialDay:journeyGuideRequest.day,dayRequestId:journeyGuideRequest.requestId}
      :{ownerId,tripId:selectedTrip.id,journey,base:details!,startDate:selectedTrip.startDate,endDate:selectedTrip.endDate,initialDay:journeyGuideRequest.day,dayRequestId:journeyGuideRequest.requestId});setMapNotice('');
    onJourneyGuideHandled?.();
  },[journeyGuideRequest,selectedTrip,ready,loading,details,ownerId,onJourneyGuideHandled,copy]);
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
  const savedMap = details?.route?.route.mapJourney;
  const displayRoute = details?.route ? savedRouteDisplay(details.route.route, locale) : null;
  const openMap = () => {
    if (!savedMap || !validateMapJourney(savedMap) || !details || !selectedTrip) return;
    // Edit the attached snapshot independently until the explicit, version-checked update.
    const journey: MapJourney = { ...JSON.parse(JSON.stringify(savedMap)), startDate: selectedTrip.startDate };
    setMapCopy({ ownerId, tripId, journey, base: details, startDate: selectedTrip.startDate, endDate: selectedTrip.endDate }); setMapNotice("");
  };
  const updateMap = async (journey: MapJourney) => {
    const editor = mapCopy;
    const current = () => live.current.active && live.current.ownerId === ownerId && live.current.tripId === tripId;
    if (!editor || !selectedTrip || !current() || editor.ownerId !== ownerId || editor.tripId !== tripId
      || journey.id !== editor.journey.id || !validateMapJourney(journey) || pending.current) {
      throw new Error(copy("Seyahat değişti. Düzenlemek istediğin seyahati yeniden aç.", "The trip changed. Reopen the trip you want to edit.", "Udhëtimi ndryshoi. Rihap udhëtimin që do të redaktosh."));
    }
    if (selectedTrip.startDate !== editor.startDate || selectedTrip.endDate !== editor.endDate) {
      throw new Error(copy("Seyahat tarihleri değişti. Düzenlemelerini kopya olarak kaydedip güncel seyahati yeniden aç.", "Trip dates changed. Save your edits as a copy and reopen the current trip.", "Datat ndryshuan. Ruaji ndryshimet si kopje dhe rihap udhëtimin."));
    }
    const days = Math.round((Date.parse(selectedTrip.endDate) - Date.parse(selectedTrip.startDate)) / 86400000) + 1;
    if (journey.dayCount > days) throw new Error(copy("Program seyahatinden uzun. Önce seyahat tarihlerini uzat.", "The itinerary is longer than your trip. Extend the trip dates first.", "Programi është më i gjatë se udhëtimi. Zgjat datat së pari."));
    const intent = createRouteCockpitIntent(mapJourneyToSavedRoute({ ...journey, startDate: selectedTrip.startDate }, locale), 0, ownerId);
    if (!intent) throw new Error(copy("Plan kaydedilemedi. Düzenlemelerin açık kaldı.", "The plan could not be saved. Your edits remain open.", "Plani nuk u ruajt. Ndryshimet mbeten të hapura."));
    intent.dates = { startDate: selectedTrip.startDate, endDate: selectedTrip.endDate };
    pending.current = true;
    try {
      const saved = await saveCockpitJourney(ownerId, tripId, accessToken, intent, editor.base);
      if (!current()) return;
      // Fence a read started before this write (including token-refresh reads).
      generation.current++; setDetails(saved); setReady(true); setLoading(false); setError("");
      setMapCopy(previous => previous === editor ? { ...previous, base: saved } : previous);
    } catch (cause) {
      throw new Error(cause instanceof ApiError && cause.status === 409
        ? copy("Bu seyahat başka bir yerde değişti. Düzenlemelerin duruyor; kopya kaydedip güncel seyahati yeniden aç.", "This trip changed elsewhere. Your edits remain; save a copy and reopen the current trip.", "Udhëtimi ndryshoi diku tjetër. Ndryshimet ruhen; ruaj një kopje dhe rihap udhëtimin.")
        : copy("Seyahat güncellenemedi. Düzenlemelerin duruyor; tekrar dene.", "The trip could not be updated. Your edits remain; retry.", "Udhëtimi nuk u përditësua. Ndryshimet ruhen; provo sërish."), { cause });
    } finally { if (current()) pending.current = false; }
  };
  const money = (amount: number, currency: string) => new Intl.NumberFormat(dateLocale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  const budget = details?.budget;
  const personalEstimate = budget?.model === "personal-budget-v1" && "totalRange" in budget.estimate ? budget.estimate : null;
  // Saved estimates retain their original exchange rate, even when opened later.
  const savedBudgetRate = budget?.exchangeRate?.rate;
  const budgetRate = budget?.displayCurrency === "GBP" ? 1
    : typeof savedBudgetRate === "number" && Number.isFinite(savedBudgetRate) && savedBudgetRate > 0 ? savedBudgetRate : null;
  const budgetCurrency = budget && budgetRate !== null ? budget.displayCurrency : "GBP";
  const budgetMoney = (amount: number) => money(amount * (budgetRate ?? 1), budgetCurrency);
  return <section className="cockpit-journey-details" aria-label={copy("Seyahat programın", "Your itinerary", "Programi yt i udhëtimit")}>
    <TodayTripProgram accessToken={accessToken} loading={loading} trip={selectedTrip} details={details} ready={ready} requestedTripId={todayTripId} onHandled={onTodayHandled}/>
    {validIntent && <div className="cockpit-import-card">
      <span className="cockpit-section-label"><Icon name={validIntent.kind === "saved-route" ? "route" : "wallet"} size={18}/>{copy("KOKPİTE EKLE", "ADD TO COCKPIT", "SHTO NË KABINË")}</span>
      <h2>{validIntent.kind === "saved-route" ? validIntent.route.mapJourney?.city === validIntent.route.name ? validIntent.route.name : <RouteTranslation text={validIntent.route.name} accessToken={accessToken}/> : validIntent.city}</h2>
      <p>{validIntent.kind === "saved-route"
        ? copy("Seçtiğin rotanın bir kopyası seyahatinde saklanır. İlk rota silinse de programın kalır.", "A copy of your selected route is saved with the trip, even if the original is removed.", "Një kopje e itinerarit ruhet me udhëtimin, edhe nëse origjinali fshihet.")
        : copy("Gün, kişi, kaynak fiyatı ve kullanılan kurla birlikte tahmin kaydedilir. Bu bir harcama kaydı değildir.", "The estimate keeps its days, travellers, source prices and exchange rate. It is not an expense.", "Vlerësimi ruan ditët, personat, çmimet burimore dhe kursin. Nuk është shpenzim i kryer.")}</p>
      {validIntent.kind === "saved-route" && validIntent.route.mapJourney && !validIntent.route.country && <p role="note">{copy("Bu harita planında ülke bilgisi doğrulanmadı. Yeni seyahat oluştururken ülkeyi sen seç; mevcut bir seyahate eklemeden önce seçili seyahatin hedefini kontrol et.", "This map plan has no verified country. Choose the country when creating a trip, or check the destination of the selected trip before attaching it.", "Ky plan harte nuk ka shtet të verifikuar. Zgjidh shtetin kur krijon udhëtimin ose kontrollo destinacionin e udhëtimit para se ta shtosh.")}</p>}
      {trips.length > 0 && <label>{copy("Hangi seyahat?", "Which trip?", "Cili udhëtim?")}<select value={tripId} disabled={saving} onChange={event => onSelectTrip(event.target.value)}>{trips.map(trip => <option key={trip.id} value={trip.id}>{[trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ")} · {trip.startDate} – {trip.endDate}</option>)}</select></label>}
      {((validIntent.kind === "saved-route" && details?.route) || (validIntent.kind === "city-budget" && details?.budget)) && <p role="note">{copy("Bu seyahatteki mevcut kayıt seçtiğinle değiştirilecek.", "The existing attachment in this trip will be replaced with your selection.", "Regjistrimi ekzistues do të zëvendësohet me zgjedhjen tënde.")}</p>}
      <div className="cockpit-journey-actions"><button className="primary-button" disabled={!selectedTrip || !ready || loading || saving} onClick={() => void attach()}>{saving ? copy("Kaydediliyor…", "Saving…", "Po ruhet…") : copy("Seçili seyahate ekle", "Attach to selected trip", "Shto në udhëtimin e zgjedhur")}</button><button className="secondary-button" disabled={saving} onClick={() => onCreateTrip(validIntent)}>{copy("Yeni seyahat oluştur", "Create a trip", "Krijo udhëtim")}</button><button className="text-button" disabled={saving} onClick={onHandled}>{copy("Vazgeç", "Cancel", "Anulo")}</button></div>
    </div>}
    {loading && <p role="status">{copy("Seyahat programı yükleniyor…", "Loading itinerary…", "Po ngarkohet programi…")}</p>}
    {error && <div className="cockpit-journey-error" role="alert"><p>{error}</p><button className="secondary-button" disabled={loading || saving} onClick={async () => { setLoading(true); try { await onRefreshTrips?.(); } finally { setReload(value => value + 1); } }}>{copy("Yenile", "Reload", "Rifresko")}</button></div>}
    {routeDatesChanged && <p role="status">{copy("Seyahat tarihlerin değişti. Kayıtlı programın günlerini yeni tarihlerine göre gözden geçir.", "Your trip dates changed. Review the saved itinerary days against the new dates.", "Datat e udhëtimit ndryshuan. Kontrollo ditët e programit sipas datave të reja.")}</p>}
    {displayRoute && <article className="cockpit-attached-route"><span className="cockpit-section-label"><Icon name="route" size={18}/>{copy("SEYAHAT PROGRAMIN", "YOUR ITINERARY", "PROGRAMI YT")}</span><h2>{savedMap?.city === displayRoute.name ? displayRoute.name : <RouteTranslation text={displayRoute.name} accessToken={accessToken}/>}</h2><p><RouteTranslation text={displayRoute.why} sourceLocale={savedMap?.planning && !savedMap.planning.edited ? savedMap.planning.locale : savedMap ? locale : undefined} accessToken={accessToken}/></p>{savedMap && validateMapJourney(savedMap) && <><button className="secondary-button" onClick={openMap}><Icon name="map" size={18}/>{copy("Haritada aç", "Open on map", "Hap në hartë")}</button><p>{copy("Duraklarını düzenle ve “Bu seyahati güncelle” ile aynı seyahate kaydet. İstersen ayrı bir kopya da saklayabilirsin.", "Edit the stops and choose “Update this trip” to save them to this trip. You can also save a separate copy.", "Ndrysho ndalesat dhe zgjidh “Përditëso këtë udhëtim”. Mund të ruash edhe një kopje të veçantë.")}</p></>}<ol>{displayRoute.dailyPlan.map((day, index) => <li key={index}><strong>{copy(`${index + 1}. gün`, `Day ${index + 1}`, `Dita ${index + 1}`)}</strong><span>{savedMap ? day : <RouteTranslation text={day} accessToken={accessToken}/>}</span></li>)}</ol></article>}
    {budget && <article className="cockpit-attached-budget"><span className="cockpit-section-label"><Icon name="wallet" size={18}/>{copy("BÜTÇE TAHMİNİN", "YOUR BUDGET ESTIMATE", "VLERËSIMI I BUXHETIT")}</span><h2>{budget.city}</h2>
      <strong className="cockpit-budget-total">{personalEstimate ? `${budgetMoney(personalEstimate.totalRange.low)} – ${budgetMoney(personalEstimate.totalRange.high)}` : budgetMoney(budget.estimate.total)}</strong>
      <p>{budget.estimate.days} {copy("gün", "days", "ditë")} · {budget.estimate.people} {copy("kişi", "travellers", "persona")} · {budget.estimate.nights} {copy("gece", "nights", "netë")}</p>
      {budget.displayCurrency !== "GBP" && budgetRate === null && <p role="status">{copy("Kayıtlı kur bulunamadığı için tüm tutarlar GBP olarak gösteriliyor.", "The saved exchange rate is unavailable, so all amounts are shown in GBP.", "Kursi i ruajtur mungon, ndaj të gjitha shumat shfaqen në GBP.")}</p>}
      <dl><div><dt>{copy("Konaklama", "Accommodation", "Akomodimi")}</dt><dd>{budgetMoney(budget.estimate.hotel)}</dd></div><div><dt>{personalEstimate ? copy("Yeme içme (tüm öğünler)", "Food (all meals)", "Ushqimi (të gjitha vaktet)") : copy("Akşam yemeği", "Dinner", "Darka")}</dt><dd>{budgetMoney(budget.estimate.meals)}</dd></div><div><dt>{personalEstimate ? copy("Şehir içi ulaşım", "Local transport", "Transporti lokal") : copy("Toplu taşıma", "Public transport", "Transporti publik")}</dt><dd>{budgetMoney(budget.estimate.travel)}</dd></div>{personalEstimate && <><div><dt>{copy("Aktiviteler", "Activities", "Aktivitetet")}</dt><dd>{personalEstimate.activities === null ? copy("Bütçe belirtilmedi", "Allowance not set", "Buxheti nuk është caktuar") : budgetMoney(personalEstimate.activities)}</dd></div><div><dt>{copy("Beklenmedik gider payı", "Contingency", "Shpenzime të paparashikuara")}</dt><dd>{budgetMoney(personalEstimate.contingency)}</dd></div></>}</dl>
      <p>{personalEstimate ? personalEstimate.partial ? copy("Aktivite veya ulaşım fiyatları eksik olduğu için tahmin kısmi. Uçuşlar dahil değildir.", "The estimate is partial because some activity or transport costs are missing. Flights are excluded.", "Vlerësimi është i pjesshëm sepse mungojnë disa kosto aktivitetesh ose transporti. Fluturimet përjashtohen.") : copy("Planlama aralığıdır; uçuşlar dahil değildir.", "A planning range; flights are excluded.", "Interval planifikimi; fluturimet përjashtohen.") : copy("Kısmi tahmin; uçuş ve diğer harcamalar dahil değildir.", "Partial estimate; flights and other expenses are excluded.", "Vlerësim i pjesshëm; fluturimet dhe shpenzimet e tjera nuk përfshihen.")} {copy("Kaynak fiyat ayı", "Source price month", "Muaji i çmimeve burimore")}: {budget.sourceMonth}.{budgetCurrency !== "GBP" && budget.exchangeRate && <> {copy("Kur tarihi", "Exchange date", "Data e kursit")}: {budget.exchangeRate.date}.</>}</p>
    </article>}
    {mapNotice && !mapCopy && <p role="status">{mapNotice}</p>}
    {mapCopy && mapCopy.ownerId === ownerId && mapCopy.tripId === tripId && <LazyOverlay title={copy("Haritalı plan", "Map itinerary", "Plani në hartë")} loadingMessage={copy("Harita açılıyor…", "Opening map…", "Po hapet harta…")} onClose={() => setMapCopy(null)}><Sheet open size="large" className="mj-sheet" title={copy("Haritalı plan", "Map itinerary", "Plani në hartë")} onClose={() => setMapCopy(null)}><MapJourneyPlanner onOpenAccount={onOpenAccount} onClose={() => setMapCopy(null)} ownerId={ownerId} accessToken={accessToken} initialJourney={mapCopy.journey} initialDay={mapCopy.initialDay} initialDayRequestId={mapCopy.dayRequestId} tripId={tripId} onUpdateTrip={updateMap} onNotice={setMapNotice}/></Sheet></LazyOverlay>}
  </section>;
}
