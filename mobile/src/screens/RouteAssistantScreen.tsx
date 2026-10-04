import { useEffect, useMemo, useRef, useState } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import { PageHero } from "../components/PageHero";
import { RouteBudgetAnalysis } from "../components/RouteBudgetAnalysis";
import { normalizePlannerPreferences, validTravelParty, type TravelTier } from "../../../lib/planner-preferences";
import { destinationArtwork } from "../data/artwork";
import type { AirportOption } from "../lib/airports";
import { createFallbackPlan, routeByDestinationCode } from "../data/routes";
import { generateRoutePlan, getWeather } from "../lib/api";
import { hapticSuccess } from "../lib/native";
import { openExternal } from "../lib/native";
import { snapshotPlannerInput } from "../lib/plannerState";
import { syncRoutePlan } from "../lib/routeSync";
import { readRouteOutbox } from "../lib/routeOutbox";
import { getSavedRoutePlans, saveRoutePlan } from "../lib/storage";
import { matchingSavedRoute, newSavedRoute } from "../lib/savedRouteIdentity";
import { getSupabaseDataErrorMessage } from "../lib/supabaseData";
import { useI18n } from "../lib/i18n";
import { editPlanStops, fixedDestinationStarter, routeMatchesDestination } from "../../../lib/route-planner";
import type { PlannerInput, RoutePlan, RouteSuggestion, ViewId, WeatherSummary } from "../types";
import "./route-planning-clarity.css";
import "./travel-flow-polish.css";
import "./planner-family-budget.css";

const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const VIBES = ["Şehir", "Kültür", "Yeme-içme", "Deniz", "Doğa", "Gece hayatı", "Alışveriş", "Macera"];

const INITIAL: PlannerInput = {
  origin: "",
  days: "5 gün",
  dayCount: 5,
  month: MONTHS[new Date().getMonth()],
  budget: "Orta",
  tier: "balanced",
  party: { adults: 1, children: 0, childAges: [] },
  currency: "TRY",
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
  const [planInput, setPlanInput] = useState<PlannerInput>(() => snapshotPlannerInput(surpriseRoute ? { ...INITIAL, dayCount: undefined, days: surpriseRoute.idealDuration } : INITIAL));
  const [source, setSource] = useState<"ai" | "local" | "surprise" | "explore">(surpriseRoute ? routeSeedKind : "local");
  const [expanded, setExpanded] = useState<string>(surpriseRoute?.name || "");
  const [weather, setWeather] = useState<Record<string, WeatherSummary>>({});
  const [weatherLoading, setWeatherLoading] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState(() => getSavedRoutePlans(ownerId));
  const [saveLocation, setSaveLocation] = useState<"device" | "account" | "pending">("device");
  const [alternativesOpen, setAlternativesOpen] = useState(false);
  const [interestNotice, setInterestNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const formFields = useRef<HTMLElement>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const plannerModes = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const generating = useRef(false);
  const appliedSeed = useRef<RouteSuggestion | null>(null);
  const selectedRoute = (source === "explore" || source === "surprise") && plan?.routes.length === 1 ? plan.routes[0] : null;
  const planTierLabel = planInput.tier === "economy" ? copy("Ekonomik", "Economy", "Ekonomik") : planInput.tier === "plus" ? "Plus" : copy("Orta", "Balanced", "Mesatar");
  const savedRoute = plan ? matchingSavedRoute(savedRoutes, plan, planInput) : undefined;
  const planIsSaved = !!savedRoute;
  const saveLabel = planIsSaved ? copy("Kaydedildi", "Saved") : plan && plan.routes.length > 1 ? copy(`${plan.routes.length} öneriyi kaydet`, `Save ${plan.routes.length} suggestions`) : copy("Bu planı kaydet", "Save this plan");
  const saveMessage = saveLocation === "account" ? copy("Hesabına kaydedildi. Kaydedilenler → Rotalar bölümünde bulabilirsin.", "Saved to your account. Find it under Saved → Routes.")
    : saveLocation === "pending" ? copy("Bu cihazda kayıtlı; hesabına eşitleme bekliyor. Kaydedilenler → Rotalar bölümünde bulabilirsin.", "Saved on this device; waiting to sync to your account. Find it under Saved → Routes.")
      : copy("Bu cihazda kayıtlı. Kaydedilenler → Rotalar bölümünden tekrar açabilirsin.", "Saved on this device. Open it again under Saved → Routes.");

  useEffect(() => {
    const refresh = () => {
      try {
        const routes = getSavedRoutePlans(ownerId);
        setSavedRoutes(routes);
        const saved = plan ? matchingSavedRoute(routes, plan, planInput) : undefined;
        const operation = saved && ownerId ? readRouteOutbox(ownerId)[saved.id] : undefined;
        setSaveLocation(ownerId && saved ? operation?.kind === "save" && !operation.pending ? "account" : "pending" : "device");
      } catch { /* Keep the last readable snapshot; a save still reports errors. */ }
    };
    refresh();
    window.addEventListener("l2t:storage-change", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("l2t:storage-change", refresh); window.removeEventListener("storage", refresh); };
  }, [ownerId, plan, planInput]);

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
    setPlanInput(snapshotPlannerInput({ ...form, dayCount: undefined, days: surpriseRoute.idealDuration }));
    setSource(routeSeedKind);
    setExpanded(surpriseRoute.name);
    setAlternativesOpen(false);
  }, [copy, routeSeedKind, surpriseRoute]);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form.origin.trim()) errors.origin = copy("Çıkış şehrini seçmelisin.", "Choose your departure city.", "Zgjidh qytetin e nisjes.");
    if (form.mode === "fixed" && !form.destination) errors.destination = copy("Gideceğin şehri seçmelisin.", "Choose your destination city.", "Zgjidh qytetin e destinacionit.");
    else if (form.mode === "fixed" && destinationAirport?.iata === originAirport?.iata) errors.destination = copy("Başlangıçtan farklı bir hedef seç.", "Choose a destination different from your departure.", "Zgjidh një destinacion të ndryshëm nga nisja.");
    if (!Number.isInteger(form.dayCount) || form.dayCount! < 1 || form.dayCount! > 14) errors.duration = copy("1–14 gün arasında süre seç.", "Choose a duration of 1–14 days.", "Zgjidh një kohëzgjatje prej 1–14 ditësh.");
    if (!form.month) errors.month = copy("Seyahat dönemini seçmelisin.", "Choose your travel month.", "Zgjidh muajin e udhëtimit.");
    if (!validTravelParty(form.party)) errors.party = copy("En az 1 yetişkin, toplam en fazla 20 kişi seç; her çocuğun yaşını belirt.", "Choose at least 1 adult and at most 20 travellers; enter every child's age.", "Zgjidh të paktën 1 të rritur dhe jo më shumë se 20 persona; trego moshën e çdo fëmije.");
    if (!form.vibe.length) errors.interests = copy("En az bir ilgi alanı seç.", "Choose at least one interest.", "Zgjidh të paktën një interes.");
    return errors;
  }, [form, destinationAirport, originAirport, copy]);
  const errors = submitted ? validation : {};
  const party = form.party || INITIAL.party!;

  const setTier = (tier: TravelTier) => setForm(current => ({ ...current, tier, budget: normalizePlannerPreferences({ tier }).budget }));
  const setPartyCount = (field: "adults" | "children", value: string) => setForm(current => {
    const previous = current.party || INITIAL.party!;
    const count = value === "" ? NaN : Number(value);
    const children = field === "children" ? count : previous.children;
    const adults = field === "adults" ? count : previous.adults;
    const who = children > 0 ? "Ailemle" : adults > 1 && (current.who === "Tek başıma" || current.who === "İlk yurt dışı deneyimim") ? "Arkadaşlarımla" : current.who;
    return { ...current, who, party: { ...previous, [field]: count, childAges: field === "children" && Number.isInteger(count) && count >= 0 && count <= 19 ? Array.from({ length: count }, (_, index) => previous.childAges[index] ?? -1) : previous.childAges } };
  });

  const toggleVibe = (vibe: string) => {
    const exists = form.vibe.includes(vibe);
    if (exists && form.vibe.length === 1) { setInterestNotice(copy("En az bir ilgi alanı seçili kalmalı.", "Keep at least one interest selected.")); return; }
    if (!exists && form.vibe.length >= 4) { setInterestNotice(copy("En fazla 4 ilgi alanı seçebilirsin. Değiştirmek için bir seçimi kaldır.", "Choose up to 4 interests. Remove one to choose another.")); return; }
    setInterestNotice("");
    setForm((current) => ({ ...current, vibe: exists ? current.vibe.filter((item) => item !== vibe) : [...current.vibe, vibe] }));
  };

  const generate = async () => {
    if (generating.current) return;
    setSubmitted(true);
    const firstMissing = Object.keys(validation)[0];
    if (firstMissing) {
      setPlannerTab(firstMissing === "interests" ? "preferences" : "plan");
      requestAnimationFrame(() => {
        const field = formFields.current?.querySelector<HTMLElement>(`[data-planner-field="${firstMissing}"]`);
        field?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        const target = field?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? field?.querySelector<HTMLElement>('input, select, button');
        target?.focus({ preventScroll: true });
      });
      return;
    }
    generating.current = true;
    const requestInput = snapshotPlannerInput({ ...form, days: `${form.dayCount} gün`, ...(form.mode !== "fixed" ? { destination: undefined } : {}) });
    const starter = () => {
      if (requestInput.mode === "fixed" && requestInput.destination) return fixedDestinationStarter(requestInput, locale);
      const fallback = createFallbackPlan(requestInput, locale);
      return { ...fallback, routes: fallback.routes.map(route => {
        const tailored = fixedDestinationStarter({ ...requestInput, destination: { code: route.destinationCode || "", name: route.name, country: route.country, countryCode: "" } }, locale).routes[0];
        return { ...route, dailyPlan: tailored.dailyPlan, idealDuration: tailored.idealDuration, estimatedBudget: tailored.estimatedBudget, scores: tailored.scores };
      }) };
    };
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
      } else {
        const fallback = starter();
        setPlan(fallback);
        setPlanInput(requestInput);
        setSource("local");
        setExpanded(fallback.routes[0]?.name || "");
        onNotice(copy("Önerilerin hazır.", "Your suggestions are ready."));
      }
      await hapticSuccess();
    } catch {
      const fallback = starter();
      setPlan(fallback);
      setPlanInput(requestInput);
      setSource("local");
      setExpanded(fallback.routes[0]?.name || "");
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
    setEditingRoute(null);
    onNotice(copy("Plan güncellendi. Saklamak için planı kaydet.", "Plan updated. Save it to keep your changes.", "Plani u përditësua. Ruaje për të mbajtur ndryshimet."));
  };

  const save = async () => {
    if (!plan || saveBusy || saving.current) return;
    const input = snapshotPlannerInput(planInput);

    saving.current = true;
    setSaveBusy(true);
    let localSaved = false;
    let clientKey = "";
    try {
      // Re-read on click too, including deletions made while this tab was hidden.
      const current = getSavedRoutePlans(ownerId);
      if (matchingSavedRoute(current, plan, input)) {
        setSavedRoutes(current);
        return onNotice(copy("Bu rota zaten kayıtlı.", "This route is already saved."));
      }
      const next = saveRoutePlan(newSavedRoute(plan, input), ownerId);
      const saved = next[0];
      clientKey = saved.id;
      setSavedRoutes(next);
      localSaved = true;
      setSaveLocation("device");
      if (ownerId && accessToken) {
        await syncRoutePlan(ownerId, accessToken, saved);
        setSaveLocation("account");
      }
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
      {plannerTab !== "ready" && <section ref={formFields} className="form-card planner-form reference-planner">
        {plannerTab === "plan" ? <>
          <div className="planner-form-intro"><span><Icon name="route" size={23}/></span><div><h2>{copy("Rotanı sen seç, birlikte planlayalım", "Your destination, your plan", "Destinacioni yt, plani yt")}</h2><p>{copy("Hedefin belli olabilir; istersen yeni yerler de önerebiliriz.", "Choose your destination or discover somewhere new.", "Zgjidh destinacionin tënd ose zbulo një vend të ri.")}</p></div></div>
          <div className="planner-target-modes" role="group" aria-label={copy("Rota seçimi", "Destination choice", "Zgjedhja e destinacionit")}>
            <button type="button" disabled={loading} aria-pressed={form.mode === "fixed"} onClick={() => setForm(current => ({ ...current, mode: "fixed", dayCount: current.dayCount || 3 }))}><Icon name="map" size={19}/><span>{copy("Gideceğim yer belli", "I know where to go", "E di ku do të shkoj")}<small>{copy("Sen seç, AI planlasın", "You choose, AI plans", "Ti zgjedh, AI planifikon")}</small></span></button>
            <button type="button" disabled={loading} aria-pressed={form.mode !== "fixed"} onClick={() => setForm(current => ({ ...current, mode: "discover" }))}><Icon name="compass" size={19}/><span>{copy("Bana yer öner", "Suggest a destination", "Më sugjero një destinacion")}<small>{copy("Yeni rotalar keşfet", "Discover new routes", "Zbulo rrugë të reja")}</small></span></button>
          </div>
          <div data-planner-field="origin"><AirportField label={copy("Nereden?", "From?", "Nga?")} placeholder={copy("Şehir veya havalimanı", "City or airport", "Qyteti ose aeroporti")} value={originAirport} required error={errors.origin} onChange={(airport) => { setOriginAirport(airport); setForm(current => ({ ...current, origin: airport ? airport.city || airport.name : "" })); }} /></div>
          {form.mode === "fixed" && <>
            <div data-planner-field="destination"><AirportField label={copy("Nereye?", "To?", "Ku?")} placeholder={copy("Örn. Bodrum, Roma, Tiran", "E.g. Bodrum, Rome, Tirana", "P.sh. Bodrum, Romë, Tiranë")} value={destinationAirport} required error={errors.destination} onChange={airport => { setDestinationAirport(airport); setForm(current => ({ ...current, destination: airport ? { code: airport.iata, name: airport.city || airport.name, country: airport.country, countryCode: airport.countryCode } : undefined })); }}/></div>
            <p className="planner-target-note">{copy("Şehir araması için yakın havalimanını seçebilirsin; plan yalnız uçakla seyahat etmeyi gerektirmez. Hedefin değişmez.", "Select a nearby airport to identify the city; the plan does not require flying. Your destination stays fixed.", "Zgjidh një aeroport pranë për të përcaktuar qytetin; plani nuk kërkon fluturim. Destinacioni mbetet i njëjtë.")}</p>
            {destinationAirport && destinationAirport.iata === originAirport?.iata && <p className="planner-interest-notice" role="status">{copy("Başlangıçtan farklı bir hedef seç.", "Choose a destination different from your departure.", "Zgjidh një destinacion të ndryshëm nga nisja.")}</p>}
          </>}
          <div className="form-grid two">
            <label data-planner-field="duration">{copy("Kaç gün?", "How many days?", "Sa ditë?")}<select aria-invalid={!!errors.duration} aria-describedby={errors.duration ? "planner-duration-error" : undefined} value={form.dayCount || ""} onChange={event => setForm(current => ({ ...current, dayCount: Number(event.target.value), days: `${event.target.value} gün` }))}>{Array.from({ length: 14 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{copy(`${day} gün`, `${day} days`, `${day} ditë`)}</option>)}</select>{errors.duration && <span id="planner-duration-error" className="planner-field-error" role="alert">{errors.duration}</span>}</label>
            <label data-planner-field="month">{copy("Dönem", "Month", "Muaji")}<select aria-invalid={!!errors.month} aria-describedby={errors.month ? "planner-month-error" : undefined} value={form.month} onChange={event => setForm({ ...form, month: event.target.value })}>{MONTHS.map((month,index) => <option key={month} value={month}>{copy(month,["January","February","March","April","May","June","July","August","September","October","November","December"][index],["Janar","Shkurt","Mars","Prill","Maj","Qershor","Korrik","Gusht","Shtator","Tetor","Nëntor","Dhjetor"][index])}</option>)}</select>{errors.month && <span id="planner-month-error" className="planner-field-error" role="alert">{errors.month}</span>}</label>
          </div>
          <fieldset className="planner-tier-options"><legend>{copy("Seyahat seviyen", "Your travel level", "Niveli i udhëtimit")}</legend><div>{(["economy", "balanced", "plus"] as const).map((tier, index) => <button type="button" key={tier} aria-pressed={form.tier === tier} onClick={() => setTier(tier)}><Icon name={index === 0 ? "wallet" : index === 1 ? "compass" : "sparkles"} size={20}/><strong>{[copy("Ekonomik", "Economy", "Ekonomik"), copy("Orta", "Balanced", "Mesatar"), "Plus"][index]}</strong><small>{[copy("Uygun ve pratik", "Simple and affordable", "Praktik dhe ekonomik"), copy("Konfor ve denge", "Comfort and balance", "Rehati dhe ekuilibër"), copy("Daha fazla konfor", "Extra comfort", "Më shumë rehati")][index]}</small></button>)}</div></fieldset>
          <div className={`planner-party-controls${errors.party ? " planner-invalid" : ""}`} data-planner-field="party">
          <label className="planner-inline-field"><Icon name="users" size={18}/><span>{copy("Kiminle?", "With whom?", "Me kë?")}</span><select value={form.who} onChange={event => { const who = event.target.value; setForm(current => ({ ...current, who, party: who === "Tek başıma" || who === "İlk yurt dışı deneyimim" ? { adults: 1, children: 0, childAges: [] } : who === "Ailemle" ? { adults: 2, children: 1, childAges: [-1] } : { adults: 2, children: 0, childAges: [] } })); }}>{["Tek başıma","Partnerimle","Arkadaşlarımla","Ailemle","İlk yurt dışı deneyimim"].map((value,index) => <option key={value} value={value}>{copy(value,["Solo","With my partner","With friends","With family","My first trip"][index],["Vetëm","Me partnerin","Me miqtë","Me familjen","Udhëtimi im i parë"][index])}</option>)}</select></label>
          <div className="form-grid two"><label>{copy("Yetişkin", "Adults", "Të rritur")}<input type="number" inputMode="numeric" min="1" max="20" step="1" value={Number.isFinite(party.adults) ? party.adults : ""} aria-invalid={!!errors.party && (!Number.isInteger(party.adults) || party.adults < 1 || party.adults + party.children > 20)} aria-describedby={errors.party ? "planner-party-error" : undefined} onChange={event => setPartyCount("adults", event.target.value)}/></label><label>{copy("Çocuk · 0–17 yaş", "Children · ages 0–17", "Fëmijë · 0–17 vjeç")}<input type="number" inputMode="numeric" min="0" max="19" step="1" value={Number.isFinite(party.children) ? party.children : ""} aria-invalid={!!errors.party && (!Number.isInteger(party.children) || party.children < 0 || party.adults + party.children > 20)} aria-describedby={errors.party ? "planner-party-error" : undefined} onChange={event => setPartyCount("children", event.target.value)}/></label></div>
          {party.childAges.length > 0 && <div className="planner-child-ages">{party.childAges.map((age, index) => <label key={index}>{copy(`${index + 1}. çocuğun yaşı`, `Child ${index + 1} age`, `Mosha e fëmijës ${index + 1}`)}<select value={age} aria-invalid={!!errors.party && age < 0} aria-describedby={errors.party ? "planner-party-error" : undefined} onChange={event => { const value = Number(event.target.value); setForm(current => ({ ...current, party: { ...current.party!, childAges: current.party!.childAges.map((old, at) => at === index ? value : old) } })); }}><option value={-1}>{copy("Yaş seç", "Choose age", "Zgjidh moshën")}</option>{Array.from({ length: 18 }, (_, value) => <option key={value} value={value}>{value === 0 ? copy("1 yaşından küçük", "Under 1", "Nën 1 vjeç") : value}</option>)}</select></label>)}</div>}
          {errors.party && <p id="planner-party-error" className="planner-field-error" role="alert">{errors.party}</p>}
          {party.children > 0 && <p className="planner-hint">{copy("Plan çocukların yaşlarına göre kısa duraklar ve dinlenme molaları içerecek.", "The plan will include short stops and rest breaks suited to the children's ages.", "Plani do të përfshijë ndalesa të shkurtra dhe pushime sipas moshave të fëmijëve.")}</p>}
          </div>
          <label>{copy("Maliyet para birimi", "Cost currency", "Monedha e kostos")}<select value={form.currency} onChange={event => setForm(current => ({ ...current, currency: event.target.value as PlannerInput["currency"], activityBudgetPerPersonDay: undefined }))}>{["TRY", "EUR", "USD", "GBP"].map(currency => <option key={currency}>{currency}</option>)}</select></label>
          <button type="button" className="planner-preferences-link" onClick={() => selectPlannerTab("preferences")}><Icon name="settings" size={17} /><span>{copy("Seyahat tarzı ve diğer tercihler", "Travel style and more preferences")}</span><Icon name="chevron" size={15} /></button>
        </> : <>
          <h2>{copy("Sana göre bir yolculuk", "A journey that feels like you")}</h2>
          <div className="form-grid two">
            <label>{copy("Konaklama", "Stay")}<select value={form.accommodation} onChange={event => setForm({ ...form, accommodation: event.target.value })}><option>Hostel</option><option value="Otel">{copy("Otel","Hotel")}</option><option value="Apart / ev">{copy("Apart / ev","Apartment / home")}</option><option value="Fark etmez">{copy("Fark etmez","Any")}</option></select></label>
            <label>{copy("Tempo", "Pace")}<select value={form.tempo} onChange={event => setForm({ ...form, tempo: event.target.value })}>{["Rahat","Dengeli","Yoğun"].map((value,index) => <option key={value} value={value}>{copy(value,["Easy","Balanced","Busy"][index])}</option>)}</select></label>
          </div>
          <label>{copy("Giriş tercihi", "Entry preference")}<select value={form.visa} onChange={event => setForm({ ...form, visa: event.target.value })}>{["Vizesiz veya kolay giriş","Vize olabilir","Fark etmez"].map((value,index) => <option key={value} value={value}>{copy(value,["Visa-free / easy","Visa is okay","Any"][index])}</option>)}</select></label>
          <fieldset className="vibe-fieldset" data-planner-field="interests" aria-invalid={!!errors.interests}><legend>{copy("İlgi alanların · 1–4 seçim", "Your interests · choose 1–4")}</legend>{errors.interests && <p className="planner-field-error" role="alert">{errors.interests}</p>}<p className="planner-interest-count" role="status">{copy(`${form.vibe.length}/4 seçildi`, `${form.vibe.length}/4 selected`)}</p><div className="choice-grid">{VIBES.map((vibe,index) => <button type="button" key={vibe} disabled={form.vibe.length >= 4 && !form.vibe.includes(vibe)} className={form.vibe.includes(vibe) ? "active" : ""} aria-pressed={form.vibe.includes(vibe)} onClick={() => toggleVibe(vibe)}>{copy(vibe,["City","Culture","Food","Coast","Nature","Nightlife","Shopping","Adventure"][index])}</button>)}</div><p className="planner-hint">{copy("Bir ilgi alanını değiştirmek için önce seçimini kaldır.", "Remove a selected interest before choosing another.")}</p>{interestNotice && <p className="planner-interest-notice" role="status">{interestNotice}</p>}</fieldset>
          <button type="button" className="secondary-wide" onClick={() => selectPlannerTab("plan")}><Icon name="back" size={16} />{copy("Rota planına dön", "Back to route plan")}</button>
        </>}
        <button type="button" className="primary-wide" disabled={loading} onClick={() => void generate()}>{loading ? <span className="button-loader" /> : null}{loading ? copy("Hazırlanıyor", "Building") : copy("Rota Oluştur", "Create Route")}<Icon name="chevron" size={18} /></button>
        {!form.origin && <p className="planner-hint">{copy("Başlamak için çıkış şehrini seç.", "Choose your departure city to begin.")}</p>}
      </section>}
      <section className="planner-inspiration">
        <div className="editorial-heading"><h2>{copy("İlham Al", "Get Inspired")}</h2><button type="button" onClick={() => selectPlannerTab(plannerTab === "ready" ? "plan" : "ready")}>{plannerTab === "ready" ? copy("Planıma dön","Back to plan") : copy("Rotaları keşfet","Explore routes")}<Icon name="chevron" size={14} /></button></div>
        <div className="planner-photo-grid">{(plannerTab === "ready" ? ["SJJ","FCO","BKK","TBS","DXB","BEG"] : ["SJJ","FCO","BKK"]).map(code => {
          const route = routeByDestinationCode(code, locale);
          if (!route) return null;
          return <button type="button" key={code} onClick={() => { setPlan({ summary: copy("Kaydedebilir veya tercihlerinle yeni öneriler alabilirsin.", "Save this route or get new ideas with your preferences."), routes:[route] }); setPlanInput(snapshotPlannerInput({ ...form, dayCount: undefined, days: route.idealDuration })); setSource("explore"); setExpanded(route.name); setAlternativesOpen(false); requestAnimationFrame(() => { selectedHeading.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); selectedHeading.current?.focus({ preventScroll: true }); }); }}><img src={destinationArtwork(code)} alt="" loading="lazy" width="180" height="150" /><span><strong>{route.name}</strong><small>{route.idealDuration}</small></span></button>;
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
                <span><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong><em>{planTierLabel} · {route.idealDuration}</em></span>
                <Icon name="chevron" size={19} />
              </button>
              <div id={panelId} className="route-result-body" role="region" aria-labelledby={triggerId} hidden={!open}>{open && <>
                <p>{route.why}</p>
                <div className="route-meta-grid">
                  <div><Icon name="wallet" size={17} /><span>{copy("Seyahat seviyesi", "Travel level", "Niveli i udhëtimit")}<strong>{planTierLabel}</strong></span></div>
                  <div><Icon name="users" size={17} /><span>{copy("Uygunluk", "Best for")}<strong>{route.bestFor}</strong></span></div>
                  <div><Icon name="map" size={17} /><span>{copy("Ulaşım", "Transport")}<strong>{route.transportEase}</strong></span></div>
                  <div><Icon name="passport" size={17} /><span>{copy("Giriş", "Entry")}<strong>{route.visaStatus}</strong></span></div>
                </div>
                <RouteBudgetAnalysis route={route} input={planInput} onCurrency={currency => setPlanInput(current => ({ ...current, currency, activityBudgetPerPersonDay: undefined }))} onActivityBudget={value => setPlanInput(current => ({ ...current, activityBudgetPerPersonDay: value }))}/>
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
