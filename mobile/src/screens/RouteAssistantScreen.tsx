import { useEffect, useMemo, useRef, useState } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { destinationArtwork } from "../data/artwork";
import type { AirportOption } from "../lib/airports";
import { createFallbackPlan, routeByDestinationCode } from "../data/routes";
import { generateRoutePlan, getWeather } from "../lib/api";
import { hapticSuccess } from "../lib/native";
import { openExternal } from "../lib/native";
import { snapshotPlannerInput } from "../lib/plannerState";
import { syncRoutePlan } from "../lib/routeSync";
import { readRouteOutbox } from "../lib/routeOutbox";
import { saveRoutePlan } from "../lib/storage";
import { getSupabaseDataErrorMessage } from "../lib/supabaseData";
import { useI18n } from "../lib/i18n";
import { editPlanStops, fixedDestinationStarter, routeMatchesDestination } from "../../../lib/route-planner";
import type { PlannerInput, RoutePlan, RouteSuggestion, ViewId, WeatherSummary } from "../types";
import "./route-planning-clarity.css";
import "./travel-flow-polish.css";

const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const VIBES = ["Şehir", "Kültür", "Yeme-içme", "Deniz", "Doğa", "Gece hayatı", "Alışveriş", "Macera"];

const INITIAL: PlannerInput = {
  origin: "",
  days: "4–6 gün",
  month: MONTHS[new Date().getMonth()],
  budget: "Orta",
  accommodation: "Otel",
  who: "Tek başıma",
  tempo: "Dengeli",
  vibe: ["Şehir", "Yeme-içme"],
  visa: "Vizesiz veya kolay giriş",
};

function scoreColor(score: number) {
  if (score >= 88) return "great";
  if (score >= 78) return "good";
  return "fair";
}

function planClientKey(plan: RoutePlan, input: PlannerInput) {
  const source = JSON.stringify({ input, routes: plan.routes.map((route) => [route.name, route.country, route.destinationCode, route.dailyPlan]) });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `route-${(hash >>> 0).toString(36)}-${plan.routes.length}`;
}

export function RouteAssistantScreen({ onNotice, onNavigate, surpriseRoute, routeSeedKind = "surprise", ownerId, accessToken }: {
  onNotice: (message: string) => void;
  onNavigate: (view: ViewId) => void;
  surpriseRoute?: RouteSuggestion | null;
  routeSeedKind?: "surprise" | "explore";
  ownerId?: string | null;
  accessToken: string;
}) {
  const { copy, locale } = useI18n();
  const [form, setForm] = useState<PlannerInput>(INITIAL);
  const [plannerTab, setPlannerTab] = useState<"plan" | "ready" | "preferences">("plan");
  const [originAirport, setOriginAirport] = useState<AirportOption | null>(null);
  const [destinationAirport, setDestinationAirport] = useState<AirportOption | null>(null);
  const [editingRoute, setEditingRoute] = useState<number | null>(null);
  const [editStops, setEditStops] = useState<string[]>([]);
  const [newStop, setNewStop] = useState("");
  const [editError, setEditError] = useState("");
  const [loading, setLoading] = useState(false);
  const seededSummary = routeSeedKind === "explore" ? copy("Keşfettiğin rota için ayrıntılı plan.", "A detailed plan for the route you discovered.") : copy("Sana sürpriz olarak seçtiğimiz rota.", "The surprise route we picked for you.");
  const [plan, setPlan] = useState<RoutePlan | null>(surpriseRoute ? { summary: seededSummary, routes: [surpriseRoute] } : null);
  const [planInput, setPlanInput] = useState<PlannerInput>(() => snapshotPlannerInput(surpriseRoute ? { ...INITIAL, days: surpriseRoute.idealDuration } : INITIAL));
  const [source, setSource] = useState<"ai" | "local" | "surprise" | "explore">(surpriseRoute ? routeSeedKind : "local");
  const [expanded, setExpanded] = useState<string>(surpriseRoute?.name || "");
  const [weather, setWeather] = useState<Record<string, WeatherSummary>>({});
  const [weatherLoading, setWeatherLoading] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [saveLocation, setSaveLocation] = useState<"device" | "account" | "pending">("device");
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [interestNotice, setInterestNotice] = useState("");
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const plannerModes = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const generating = useRef(false);
  const appliedSeed = useRef<RouteSuggestion | null>(null);
  const selectedRoute = (source === "explore" || source === "surprise") && plan?.routes.length === 1 ? plan.routes[0] : null;
  const planIsSaved = !!plan && savedKey === planClientKey(plan, planInput);
  const saveLabel = planIsSaved ? copy("Kaydedildi", "Saved") : plan && plan.routes.length > 1 ? copy(`${plan.routes.length} öneriyi kaydet`, `Save ${plan.routes.length} suggestions`) : copy("Bu planı kaydet", "Save this plan");
  const saveMessage = saveLocation === "account" ? copy("Hesabına kaydedildi. Kaydedilenler → Rotalar bölümünde bulabilirsin.", "Saved to your account. Find it under Saved → Routes.")
    : saveLocation === "pending" ? copy("Bu cihazda kayıtlı; hesabına eşitleme bekliyor. Kaydedilenler → Rotalar bölümünde bulabilirsin.", "Saved on this device; waiting to sync to your account. Find it under Saved → Routes.")
      : copy("Bu cihazda kayıtlı. Kaydedilenler → Rotalar bölümünden tekrar açabilirsin.", "Saved on this device. Open it again under Saved → Routes.");

  function focusResults() {
    resultsHeading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    resultsHeading.current?.focus({ preventScroll: true });
  }

  function selectPlannerTab(next: "plan" | "ready" | "preferences") {
    setPlannerTab(next);
    requestAnimationFrame(() => {
      const activeTab = plannerModes.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      activeTab?.scrollIntoView({ block: "nearest", behavior: "auto" });
      activeTab?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    // Activity reactivates effects on tab return. Apply a chosen route only
    // once so returning does not discard edits, save state or expanded days.
    if (!surpriseRoute || appliedSeed.current === surpriseRoute) return;
    appliedSeed.current = surpriseRoute;
    setPlan({ summary: routeSeedKind === "explore" ? copy("Keşfettiğin rota için ayrıntılı plan.", "A detailed plan for the route you discovered.") : copy("Sana sürpriz olarak seçtiğimiz rota.", "The surprise route we picked for you."), routes: [surpriseRoute] });
    setPlanInput(snapshotPlannerInput({ ...form, days: surpriseRoute.idealDuration }));
    setSource(routeSeedKind);
    setExpanded(surpriseRoute.name);
    setAlternativesOpen(false);
  }, [copy, routeSeedKind, surpriseRoute]);

  const ready = useMemo(() => Boolean(form.origin && form.days && form.month && form.budget && form.vibe.length && (form.mode !== "fixed" || (form.destination && form.dayCount && destinationAirport?.iata !== originAirport?.iata))), [form, destinationAirport, originAirport]);
  const whoLabel = copy(form.who, ({ "Tek başıma": "Solo", "Partnerimle": "With my partner", "Arkadaşlarımla": "With friends", "Ailemle": "With family", "İlk yurt dışı deneyimim": "My first trip" } as Record<string, string>)[form.who] || form.who);
  const budgetLabel = copy(form.budget, ({ "Ekonomik": "Economy", "Orta": "Balanced", "Yüksek / premium": "Premium" } as Record<string, string>)[form.budget] || form.budget);

  const toggleVibe = (vibe: string) => {
    const exists = form.vibe.includes(vibe);
    if (exists && form.vibe.length === 1) { setInterestNotice(copy("En az bir ilgi alanı seçili kalmalı.", "Keep at least one interest selected.")); return; }
    if (!exists && form.vibe.length >= 4) { setInterestNotice(copy("En fazla 4 ilgi alanı seçebilirsin. Değiştirmek için bir seçimi kaldır.", "Choose up to 4 interests. Remove one to choose another.")); return; }
    setInterestNotice("");
    setForm((current) => ({ ...current, vibe: exists ? current.vibe.filter((item) => item !== vibe) : [...current.vibe, vibe] }));
  };

  const generate = async () => {
    if (generating.current || !ready) return;
    generating.current = true;
    const requestInput = snapshotPlannerInput(form.mode === "fixed" ? { ...form, days: `${form.dayCount} gün` } : { ...form, destination: undefined, dayCount: undefined });
    const starter = () => requestInput.mode === "fixed" && requestInput.destination ? fixedDestinationStarter(requestInput, locale) : createFallbackPlan(requestInput, locale);
    setLoading(true);
    setEditingRoute(null);
    try {
      const response = await generateRoutePlan(requestInput, locale);
      const matchesTarget = requestInput.mode !== "fixed" || (requestInput.destination && response.data?.routes.length === 1 && routeMatchesDestination(response.data.routes[0], requestInput.destination));
      if (response.data?.routes?.length && matchesTarget) {
        setPlan(response.data);
        setPlanInput(requestInput);
        setSource(response.isFallback ? "local" : "ai");
        setExpanded(response.data.routes[0]?.name || "");
        setSavedKey("");
      } else {
        const fallback = starter();
        setPlan(fallback);
        setPlanInput(requestInput);
        setSource("local");
        setExpanded(fallback.routes[0]?.name || "");
        setSavedKey("");
        onNotice(copy("Önerilerin hazır.", "Your suggestions are ready."));
      }
      await hapticSuccess();
    } catch {
      const fallback = starter();
      setPlan(fallback);
      setPlanInput(requestInput);
      setSource("local");
      setExpanded(fallback.routes[0]?.name || "");
      setSavedKey("");
      onNotice(copy("Şu an çevrimdışı önerilerle devam ediyoruz; bağlantı gelince tekrar deneyebilirsin.", "We are using offline suggestions for now; try again when you are online."));
    } finally {
      setLoading(false);
      generating.current = false;
    }
  };

  const applyStopEdits = () => {
    if (editingRoute === null || !plan || editStops.some(stop => !stop.trim())) {
      setEditError(copy("Boş durağı doldur veya kaldır.", "Fill in or remove the empty stop.", "Plotëso ose hiqe ndalesën bosh."));
      return;
    }
    const routeIndex = editingRoute;
    setPlan(current => current ? { ...current, routes: current.routes.map((route, index) => index === routeIndex ? { ...route, dailyPlan: editStops.map(stop => stop.trim()) } : route) } : current);
    setSavedKey("");
    setEditingRoute(null);
    onNotice(copy("Plan güncellendi. Saklamak için planı kaydet.", "Plan updated. Save it to keep your changes.", "Plani u përditësua. Ruaje për të mbajtur ndryshimet."));
  };

  const save = async () => {
    if (!plan || saveBusy || saving.current) return;
    const input = snapshotPlannerInput(planInput);
    const clientKey = planClientKey(plan, input);
    if (savedKey === clientKey) return onNotice(copy("Bu rota zaten kayıtlı.", "This route is already saved."));
    saving.current = true;
    setSaveBusy(true);
    let localSaved = false;
    const createdAt = new Date().toISOString();
    try {
      const saved = { id: clientKey, createdAt, input, plan };
      saveRoutePlan(saved, ownerId);
      localSaved = true;
      setSaveLocation("device");
      setSavedKey(clientKey);
      if (ownerId && accessToken) {
        await syncRoutePlan(ownerId, accessToken, saved);
        setSaveLocation("account");
      }
      setSavedKey(clientKey);
      await hapticSuccess();
      onNotice(ownerId && accessToken ? copy("Rota web ve mobil hesabına kaydedildi.", "Route saved to your web and mobile account.") : copy("Rota bu cihaza kaydedildi.", "Route saved on this device."));
    } catch (error) {
      let queued = false;
      try { queued = Boolean(ownerId && readRouteOutbox(ownerId)[clientKey]?.kind === "save"); } catch { /* Preserve unreadable storage. */ }
      if (localSaved) setSaveLocation(queued ? "pending" : "device");
      onNotice(queued ? copy("Rota cihazda kayıtlı; bağlantı gelince hesabına eşitlenecek.", "Route saved on this device; it will sync when connected.") : localSaved ? copy("Rota cihazında kayıtlı; hesabına eşitlenemedi. Kaydedilenler'den tekrar açabilirsin.", "The route is saved on this device but could not sync. You can open it from Saved.") : getSupabaseDataErrorMessage(error, copy("Rota kaydedilemedi. Cihazda boş alan açıp tekrar dene.", "Route could not be saved. Free some device storage and retry.")));
    } finally {
      saving.current = false;
      setSaveBusy(false);
    }
  };

  const loadWeather = async (route: RouteSuggestion) => {
    setWeatherLoading(route.name);
    try {
      const result = await getWeather(route.cityOrRegion || route.name, locale);
      setWeather((current) => ({ ...current, [route.name]: result }));
    } catch (error) {
      onNotice(locale === "tr" && error instanceof Error && error.message
        ? error.message
        : copy("Hava durumu alınamadı.", "Weather data is unavailable."));
    } finally {
      setWeatherLoading("");
    }
  };

  return (
    <div className="screen route-screen">
      <PageHero scene="journey" title={copy("Hayalindeki rotayı planla", "Plan your next adventure")} subtitle={copy("Birkaç seçimle sana uygun yerleri birlikte bulalım.", "A few choices to find the places that suit you.")} note={copy("Hayal et,\nyola çık!", "Dream it,\nlive it!")} />

      {selectedRoute && <section className="planner-selected-route" aria-label={copy("Seçili rota", "Selected route")}>
        <span className="planner-selection-eyebrow">{copy("SEÇİLİ ROTAN", "YOUR SELECTED ROUTE")}</span>
        <h2 ref={selectedHeading} tabIndex={-1}>{selectedRoute.name}</h2>
        <p>{selectedRoute.country} · {selectedRoute.idealDuration}</p>
        <p>{copy("Bu örnek planı inceleyip kaydedebilirsin. Kaydetmek için çıkış şehri seçmen gerekmez.", "Review and save this sample plan. You do not need to choose a departure city to save it.")}</p>
        <div className="planner-selection-actions">
          <button type="button" className="primary-wide" disabled={saveBusy} onClick={() => void save()}><Icon name={planIsSaved ? "check" : "bookmark"} size={18}/>{saveBusy ? copy("Kaydediliyor", "Saving") : saveLabel}</button>
          <button type="button" className="secondary-wide" onClick={focusResults}>{copy("Plan ayrıntılarını gör", "View plan details")}</button>
        </div>
        {planIsSaved && <div className="planner-save-confirmation"><p role="status">{saveMessage}</p><button type="button" className="secondary-wide" onClick={() => onNavigate("trips")}>{copy("Kaydedilenlere git", "Go to Saved")}<Icon name="chevron" size={17}/></button></div>}
        <button type="button" className="planner-alternatives-toggle" aria-expanded={alternativesOpen} aria-controls="planner-alternative-options" onClick={() => setAlternativesOpen(open => !open)}>{alternativesOpen ? copy("Diğer rota seçeneklerini gizle", "Hide other route options") : copy("Farklı rota önerileri bul", "Find other route ideas")}</button>
        {alternativesOpen && <p className="planner-alternatives-note">{copy("Aşağıdaki tercihler yeni destinasyonlar önerir; seçili şehri düzenlemez. Yeni öneri oluşturmak bu ekrandaki planı değiştirir; önce kaydedebilirsin.", "The preferences below suggest new destinations; they do not edit your selected city. Generating new suggestions replaces the plan on this screen, so you can save it first.")}</p>}
      </section>}

      <div id="planner-alternative-options" hidden={!!selectedRoute && !alternativesOpen}>
      <div ref={plannerModes} className="editorial-segments planner-modes" role="group" aria-label={copy("Planlama bölümleri", "Planning sections")}>
        {(["plan", "ready", "preferences"] as const).map((tab, index) => <button type="button" key={tab} aria-pressed={plannerTab === tab} onClick={() => selectPlannerTab(tab)}>{[copy("Rota Planı", "Route Plan"), copy("Hazır Rotalar", "Ready Routes"), copy("Tercihlerim", "Preferences")][index]}</button>)}
      </div>
      {plannerTab !== "ready" && <section className="form-card planner-form reference-planner">
        {plannerTab === "plan" ? <>
          <div className="planner-form-intro"><span><Icon name="route" size={23}/></span><div><h2>{copy("Rotanı sen seç, birlikte planlayalım", "Your destination, your plan", "Destinacioni yt, plani yt")}</h2><p>{copy("Hedefin belli olabilir; istersen yeni yerler de önerebiliriz.", "Choose your destination or discover somewhere new.", "Zgjidh destinacionin tënd ose zbulo një vend të ri.")}</p></div></div>
          <div className="planner-target-modes" role="group" aria-label={copy("Rota seçimi", "Destination choice", "Zgjedhja e destinacionit")}>
            <button type="button" disabled={loading} aria-pressed={form.mode === "fixed"} onClick={() => setForm(current => ({ ...current, mode: "fixed", dayCount: current.dayCount || 3 }))}><Icon name="map" size={19}/><span>{copy("Gideceğim yer belli", "I know where to go", "E di ku do të shkoj")}<small>{copy("Sen seç, AI planlasın", "You choose, AI plans", "Ti zgjedh, AI planifikon")}</small></span></button>
            <button type="button" disabled={loading} aria-pressed={form.mode !== "fixed"} onClick={() => setForm(current => ({ ...current, mode: "discover" }))}><Icon name="compass" size={19}/><span>{copy("Bana yer öner", "Suggest a destination", "Më sugjero një destinacion")}<small>{copy("Yeni rotalar keşfet", "Discover new routes", "Zbulo rrugë të reja")}</small></span></button>
          </div>
          <AirportField label={copy("Nereden?", "From?")} placeholder={copy("Şehir veya havalimanı", "City or airport")} value={originAirport} required onChange={(airport) => { setOriginAirport(airport); setForm(current => ({ ...current, origin: airport ? airport.city || airport.name : "" })); }} />
          {form.mode === "fixed" && <>
            <AirportField label={copy("Nereye?", "To?", "Ku?")} placeholder={copy("Örn. Bodrum, Roma, Tiran", "E.g. Bodrum, Rome, Tirana", "P.sh. Bodrum, Romë, Tiranë")} value={destinationAirport} required onChange={airport => { setDestinationAirport(airport); setForm(current => ({ ...current, destination: airport ? { code: airport.iata, name: airport.city || airport.name, country: airport.country, countryCode: airport.countryCode } : undefined })); }}/>
            <p className="planner-target-note">{copy("Şehir araması için yakın havalimanını seçebilirsin; plan yalnız uçakla seyahat etmeyi gerektirmez. Hedefin değişmez.", "Select a nearby airport to identify the city; the plan does not require flying. Your destination stays fixed.", "Zgjidh një aeroport pranë për të përcaktuar qytetin; plani nuk kërkon fluturim. Destinacioni mbetet i njëjtë.")}</p>
            {destinationAirport && destinationAirport.iata === originAirport?.iata && <p className="planner-interest-notice" role="status">{copy("Başlangıçtan farklı bir hedef seç.", "Choose a destination different from your departure.", "Zgjidh një destinacion të ndryshëm nga nisja.")}</p>}
          </>}
          <div className="form-grid two">
            {form.mode === "fixed" ? <label>{copy("Kaç gün?", "How many days?", "Sa ditë?")}<select value={form.dayCount || 3} onChange={event => setForm(current => ({ ...current, dayCount: Number(event.target.value) }))}>{Array.from({ length: 14 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{copy(`${day} gün`, `${day} days`, `${day} ditë`)}</option>)}</select></label> : <label>{copy("Süre", "Duration")}<select value={form.days} onChange={event => setForm({ ...form, days: event.target.value })}>{["2–3 gün","4–6 gün","7–10 gün","10+ gün"].map((value,index) => <option key={value} value={value}>{copy(value,["2–3 days","4–6 days","7–10 days","10+ days"][index])}</option>)}</select></label>}
            <label>{copy("Dönem", "Month")}<select value={form.month} onChange={event => setForm({ ...form, month: event.target.value })}>{MONTHS.map((month,index) => <option key={month} value={month}>{copy(month,["January","February","March","April","May","June","July","August","September","October","November","December"][index])}</option>)}</select></label>
          </div>
          <details className="planner-optional-preferences"><summary><span><Icon name="settings" size={18}/><strong>{copy("Seyahat tercihlerin", "Travel preferences")}</strong></span><small>{whoLabel} · {budgetLabel}</small><Icon name="chevron" size={17}/></summary>
          <p className="planner-defaults">{copy("Başlangıçta tek kişi, orta bütçe ve dengeli tempo seçili. Dilediğin gibi değiştirebilirsin.", "We start with solo travel, a balanced budget and an easy-to-moderate pace. You can change these here.")}</p>
          <label className="planner-inline-field"><Icon name="users" size={18} /><span>{copy("Kiminle?", "With whom?")}</span><select value={form.who} onChange={event => setForm({ ...form, who: event.target.value })}>{["Tek başıma","Partnerimle","Arkadaşlarımla","Ailemle","İlk yurt dışı deneyimim"].map((value,index) => <option key={value} value={value}>{copy(value,["Solo","With my partner","With friends","With family","My first trip"][index])}</option>)}</select></label>
          <label className="planner-inline-field"><Icon name="wallet" size={18} /><span>{copy("Bütçe", "Budget")}</span><select value={form.budget} onChange={event => setForm({ ...form, budget: event.target.value })}><option value="Ekonomik">{copy("Ekonomik","Economy")}</option><option value="Orta">{copy("Orta","Balanced")}</option><option value="Yüksek / premium">Premium</option></select></label>
          <button type="button" className="planner-preferences-link" onClick={() => selectPlannerTab("preferences")}><Icon name="settings" size={17} /><span>{copy("Seyahat tarzı ve diğer tercihler", "Travel style and more preferences")}</span><Icon name="chevron" size={15} /></button>
          </details>
        </> : <>
          <h2>{copy("Sana göre bir yolculuk", "A journey that feels like you")}</h2>
          <div className="form-grid two">
            <label>{copy("Konaklama", "Stay")}<select value={form.accommodation} onChange={event => setForm({ ...form, accommodation: event.target.value })}><option>Hostel</option><option value="Otel">{copy("Otel","Hotel")}</option><option value="Apart / ev">{copy("Apart / ev","Apartment / home")}</option><option value="Fark etmez">{copy("Fark etmez","Any")}</option></select></label>
            <label>{copy("Tempo", "Pace")}<select value={form.tempo} onChange={event => setForm({ ...form, tempo: event.target.value })}>{["Rahat","Dengeli","Yoğun"].map((value,index) => <option key={value} value={value}>{copy(value,["Easy","Balanced","Busy"][index])}</option>)}</select></label>
          </div>
          <label>{copy("Giriş tercihi", "Entry preference")}<select value={form.visa} onChange={event => setForm({ ...form, visa: event.target.value })}>{["Vizesiz veya kolay giriş","Vize olabilir","Fark etmez"].map((value,index) => <option key={value} value={value}>{copy(value,["Visa-free / easy","Visa is okay","Any"][index])}</option>)}</select></label>
          <fieldset className="vibe-fieldset"><legend>{copy("İlgi alanların · 1–4 seçim", "Your interests · choose 1–4")}</legend><p className="planner-interest-count" role="status">{copy(`${form.vibe.length}/4 seçildi`, `${form.vibe.length}/4 selected`)}</p><div className="choice-grid">{VIBES.map((vibe,index) => <button type="button" key={vibe} disabled={form.vibe.length >= 4 && !form.vibe.includes(vibe)} className={form.vibe.includes(vibe) ? "active" : ""} aria-pressed={form.vibe.includes(vibe)} onClick={() => toggleVibe(vibe)}>{copy(vibe,["City","Culture","Food","Coast","Nature","Nightlife","Shopping","Adventure"][index])}</button>)}</div><p className="planner-hint">{copy("Bir ilgi alanını değiştirmek için önce seçimini kaldır.", "Remove a selected interest before choosing another.")}</p>{interestNotice && <p className="planner-interest-notice" role="status">{interestNotice}</p>}</fieldset>
          <button type="button" className="secondary-wide" onClick={() => selectPlannerTab("plan")}><Icon name="back" size={16} />{copy("Rota planına dön", "Back to route plan")}</button>
        </>}
        <button type="button" className="primary-wide" disabled={!ready || loading} onClick={() => void generate()}>{loading ? <span className="button-loader" /> : null}{loading ? copy("Hazırlanıyor", "Building") : copy("Rota Oluştur", "Create Route")}<Icon name="chevron" size={18} /></button>
        {!form.origin && <p className="planner-hint">{copy("Başlamak için çıkış şehrini seç.", "Choose your departure city to begin.")}</p>}
      </section>}
      <section className="planner-inspiration">
        <div className="editorial-heading"><h2>{copy("İlham Al", "Get Inspired")}</h2><button type="button" onClick={() => selectPlannerTab(plannerTab === "ready" ? "plan" : "ready")}>{plannerTab === "ready" ? copy("Planıma dön","Back to plan") : copy("Rotaları keşfet","Explore routes")}<Icon name="chevron" size={14} /></button></div>
        <div className="planner-photo-grid">{(plannerTab === "ready" ? ["SJJ","FCO","BKK","TBS","DXB","BEG"] : ["SJJ","FCO","BKK"]).map(code => {
          const route = routeByDestinationCode(code, locale);
          if (!route) return null;
          return <button type="button" key={code} onClick={() => { setPlan({ summary: copy("Kaydedebilir veya tercihlerinle yeni öneriler alabilirsin.", "Save this route or get new ideas with your preferences."), routes:[route] }); setPlanInput(snapshotPlannerInput({ ...form, days: route.idealDuration })); setSource("explore"); setExpanded(route.name); setSavedKey(""); setAlternativesOpen(false); requestAnimationFrame(() => { selectedHeading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); selectedHeading.current?.focus({ preventScroll: true }); }); }}><img src={destinationArtwork(code)} alt="" loading="lazy" width="180" height="150" /><span><strong>{route.name}</strong><small>{route.idealDuration}</small></span></button>;
        })}</div>
      </section>
      </div>

      {plan && <section className="plan-results">
        <div className="results-heading">
          <div><span>{source === "surprise" ? copy("SÜRPRİZ ROTA", "SURPRISE ROUTE") : source === "explore" ? copy("SEÇTİĞİN ROTA", "YOUR ROUTE") : copy("SANA ÖZEL ÖNERİLER", "PERSONALISED PICKS")}</span><h2 ref={resultsHeading} tabIndex={-1}>{source === "explore" ? copy("Planlamaya hazır", "Ready to plan") : copy("Senin için seçtiklerimiz", "Picked for you")}</h2></div>
          {!selectedRoute && <button className="save-plan-button" disabled={saveBusy} onClick={() => void save()}>{saveBusy ? <span className="button-loader dark" /> : <Icon name={planIsSaved ? "check" : "bookmark"} size={17} />} {saveBusy ? copy("Kaydediliyor", "Saving") : saveLabel}</button>}
        </div>
        {planIsSaved && !selectedRoute && <div className="planner-save-confirmation"><p role="status">{saveMessage}</p><button type="button" className="secondary-wide" onClick={() => onNavigate("trips")}>{copy("Kaydedilenlere git", "Go to Saved")}<Icon name="chevron" size={17}/></button></div>}
        <p className="plan-summary">{plan.summary}</p>
        {source === "local" && <p className="planner-target-note" role="status">{copy("Hazır başlangıç taslağı · AI tarafından yeni oluşturulmadı. Ayrıntıları düzenleyebilir veya yeniden deneyebilirsin.", "Starter outline · Not newly generated by AI. Edit the details or try again.", "Plan fillestar · Nuk është krijuar rishtazi nga AI. Redakto hollësitë ose provo sërish.")}</p>}
        <div className="route-result-list">
          {plan.routes.map((route, index) => {
            const open = expanded === route.name;
            const currentWeather = weather[route.name];
            const triggerId = `route-result-trigger-${index}`;
            const panelId = `route-result-panel-${index}`;
            return <article className={`route-result ${open ? "open" : ""}`} key={`${route.name}-${index}`}>
              <button id={triggerId} className="route-result-head" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(open ? "" : route.name)}>
                {route.scores.overall > 0 ? <span className={`route-score ${scoreColor(route.scores.overall)}`}>{route.scores.overall}</span> : <span className="route-score"><Icon name="route" size={22} /></span>}
                <span><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong><em>{route.estimatedBudget} · {route.idealDuration}</em></span>
                <Icon name="chevron" size={19} />
              </button>
              <div id={panelId} className="route-result-body" role="region" aria-labelledby={triggerId} hidden={!open}>{open && <>
                <p>{route.why}</p>
                <div className="route-meta-grid">
                  <div><Icon name="wallet" size={17} /><span>{copy("Bütçe", "Budget")}<strong>{route.estimatedBudget}</strong></span></div>
                  <div><Icon name="users" size={17} /><span>{copy("Uygunluk", "Best for")}<strong>{route.bestFor}</strong></span></div>
                  <div><Icon name="map" size={17} /><span>{copy("Ulaşım", "Transport")}<strong>{route.transportEase}</strong></span></div>
                  <div><Icon name="passport" size={17} /><span>{copy("Giriş", "Entry")}<strong>{route.visaStatus}</strong></span></div>
                </div>
                {route.visaNote && <div className="info-box"><Icon name="passport" size={19} /><p>{route.visaNote}{route.visaVerifiedAt ? ` · Son kontrol: ${route.visaVerifiedAt}` : ""}</p></div>}
                {route.visaSourceUrl && <button className="secondary-wide" onClick={() => void openExternal(route.visaSourceUrl!)}><Icon name="external" size={17} /> {copy("Resmî giriş kaynağını aç", "Open official entry source")}</button>}
                <div className="daily-plan"><div className="planner-itinerary-heading"><h3>{copy("Günlük planın", "Your daily plan", "Plani yt ditor")}</h3><button type="button" className="planner-edit-link" disabled={saveBusy} onClick={() => { setEditingRoute(index); setEditStops([...route.dailyPlan]); setNewStop(""); setEditError(""); }}>{copy("Düzenle", "Edit", "Redakto")}</button></div>{editingRoute === index ? <div className="planner-stop-editor">
                  <p>{copy("Durakları düzenle, ekle veya sırala. Gün numaralarını metinde de güncelleyebilirsin.", "Edit, add or reorder stops. You can also update day numbers in the text.", "Redakto, shto ose rendit ndalesat. Mund të ndryshosh edhe numrat e ditëve në tekst.")}</p>
                  {editStops.map((stop, stopIndex) => <div className="planner-stop-row" key={stopIndex}><label>{copy(`Durak ${stopIndex + 1}`, `Stop ${stopIndex + 1}`, `Ndalesa ${stopIndex + 1}`)}<textarea maxLength={600} rows={3} value={stop} onChange={event => setEditStops(current => editPlanStops(current, { type: "edit", index: stopIndex, text: event.target.value }))}/></label><div className="planner-stop-actions"><button type="button" disabled={stopIndex === 0} aria-label={copy(`${stopIndex + 1}. durağı yukarı taşı`, `Move stop ${stopIndex + 1} up`, `Lëvize ndalesën ${stopIndex + 1} lart`)} onClick={() => setEditStops(current => editPlanStops(current, { type: "move", index: stopIndex, delta: -1 }))}>↑</button><button type="button" disabled={stopIndex === editStops.length - 1} aria-label={copy(`${stopIndex + 1}. durağı aşağı taşı`, `Move stop ${stopIndex + 1} down`, `Lëvize ndalesën ${stopIndex + 1} poshtë`)} onClick={() => setEditStops(current => editPlanStops(current, { type: "move", index: stopIndex, delta: 1 }))}>↓</button><button type="button" disabled={editStops.length <= 1} onClick={() => setEditStops(current => editPlanStops(current, { type: "remove", index: stopIndex }))}>{copy("Kaldır", "Remove", "Hiq")}</button></div></div>)}
                  <label>{copy("Yeni durak", "New stop", "Ndalesë e re")}<textarea rows={2} maxLength={600} value={newStop} onChange={event => setNewStop(event.target.value)} placeholder={copy("Örn. Akşam sahil yürüyüşü", "E.g. An evening coastal walk", "P.sh. Shëtitje në bregdet në mbrëmje")}/></label><button type="button" className="secondary-wide" disabled={!newStop.trim() || editStops.length >= 30} onClick={() => { setEditStops(current => editPlanStops(current, { type: "add", text: newStop })); setNewStop(""); }}><Icon name="plus" size={17}/>{copy("Durak ekle", "Add stop", "Shto ndalesë")}</button>
                  {editError && <p role="alert">{editError}</p>}<div className="planner-editor-footer"><button type="button" className="secondary-wide" onClick={() => setEditingRoute(null)}>{copy("Vazgeç", "Cancel", "Anulo")}</button><button type="button" className="primary-wide" onClick={applyStopEdits}>{copy("Değişiklikleri uygula", "Apply changes", "Zbato ndryshimet")}</button></div>
                </div> : route.dailyPlan.map((day, stopIndex) => <div key={stopIndex}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>
                {route.warnings.length > 0 && <div className="warning-list">{route.warnings.map((warning) => <div key={warning}><Icon name="alert" size={16} /><span>{warning}</span></div>)}</div>}
                {currentWeather ? <div className="weather-card"><Icon name={currentWeather.weatherCode <= 2 ? "sun" : "cloud"} size={25} /><div><small>{currentWeather.place}</small><strong>{currentWeather.temperature}° · {currentWeather.description}</strong><span>{copy("Bugün", "Today")} {currentWeather.min}° / {currentWeather.max}° · {copy("Rüzgâr", "Wind")} {currentWeather.windSpeed} km/h</span></div></div> : <button className="secondary-wide" disabled={weatherLoading === route.name} onClick={() => void loadWeather(route)}>{weatherLoading === route.name ? <span className="button-loader dark" /> : <Icon name="cloud" size={18} />} {copy("Güncel havayı göster", "Show current weather")}</button>}
              </>}</div>
            </article>;
          })}
        </div>
      </section>}
    </div>
  );
}
