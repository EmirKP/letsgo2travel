import { useEffect, useMemo, useState } from "react";
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
import type { PlannerInput, RoutePlan, RouteSuggestion, WeatherSummary } from "../types";

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
  const source = JSON.stringify({ input, routes: plan.routes.map((route) => [route.name, route.country, route.destinationCode]) });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `route-${(hash >>> 0).toString(36)}-${plan.routes.length}`;
}

export function RouteAssistantScreen({ onNotice, surpriseRoute, routeSeedKind = "surprise", ownerId, accessToken }: {
  onNotice: (message: string) => void;
  surpriseRoute?: RouteSuggestion | null;
  routeSeedKind?: "surprise" | "explore";
  ownerId?: string | null;
  accessToken: string;
}) {
  const { copy, locale } = useI18n();
  const [form, setForm] = useState<PlannerInput>(INITIAL);
  const [plannerTab, setPlannerTab] = useState<"plan" | "ready" | "preferences">("plan");
  const [originAirport, setOriginAirport] = useState<AirportOption | null>(null);
  const [loading, setLoading] = useState(false);
  const seededSummary = routeSeedKind === "explore" ? copy("Keşfettiğin rota için ayrıntılı plan.", "A detailed plan for the route you discovered.") : copy("Sana sürpriz olarak seçtiğimiz rota.", "The surprise route we picked for you.");
  const [plan, setPlan] = useState<RoutePlan | null>(surpriseRoute ? { summary: seededSummary, routes: [surpriseRoute] } : null);
  const [planInput, setPlanInput] = useState<PlannerInput>(() => snapshotPlannerInput(INITIAL));
  const [source, setSource] = useState<"ai" | "local" | "surprise" | "explore">(surpriseRoute ? routeSeedKind : "local");
  const [expanded, setExpanded] = useState<string>(surpriseRoute?.name || "");
  const [weather, setWeather] = useState<Record<string, WeatherSummary>>({});
  const [weatherLoading, setWeatherLoading] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [savedKey, setSavedKey] = useState("");

  useEffect(() => {
    if (!surpriseRoute) return;
    setPlan({ summary: routeSeedKind === "explore" ? copy("Keşfettiğin rota için ayrıntılı plan.", "A detailed plan for the route you discovered.") : copy("Sana sürpriz olarak seçtiğimiz rota.", "The surprise route we picked for you."), routes: [surpriseRoute] });
    setPlanInput(snapshotPlannerInput(form));
    setSource(routeSeedKind);
    setExpanded(surpriseRoute.name);
  }, [copy, routeSeedKind, surpriseRoute]);

  const ready = useMemo(() => Boolean(form.origin && form.days && form.month && form.budget && form.vibe.length), [form]);

  const toggleVibe = (vibe: string) => {
    setForm((current) => {
      const exists = current.vibe.includes(vibe);
      if (exists && current.vibe.length === 1) return current;
      return { ...current, vibe: exists ? current.vibe.filter((item) => item !== vibe) : [...current.vibe, vibe].slice(0, 4) };
    });
  };

  const generate = async () => {
    if (!ready) return onNotice(copy("Rota oluşturmak için temel seçimleri tamamla.", "Complete the required choices to build a route."));
    const requestInput = snapshotPlannerInput(form);
    setLoading(true);
    try {
      const response = await generateRoutePlan(requestInput, locale);
      if (response.data?.routes?.length) {
        setPlan(response.data);
        setPlanInput(requestInput);
        setSource(response.isFallback ? "local" : "ai");
        setExpanded(response.data.routes[0]?.name || "");
        setSavedKey("");
      } else {
        const fallback = createFallbackPlan(requestInput, locale);
        setPlan(fallback);
        setPlanInput(requestInput);
        setSource("local");
        setExpanded(fallback.routes[0]?.name || "");
        setSavedKey("");
        onNotice(copy("Önerilerin hazır.", "Your suggestions are ready."));
      }
      await hapticSuccess();
    } catch {
      const fallback = createFallbackPlan(requestInput, locale);
      setPlan(fallback);
      setPlanInput(requestInput);
      setSource("local");
      setExpanded(fallback.routes[0]?.name || "");
      setSavedKey("");
      onNotice(copy("Şu an çevrimdışı önerilerle devam ediyoruz; bağlantı gelince tekrar deneyebilirsin.", "We are using offline suggestions for now; try again when you are online."));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!plan || saveBusy) return;
    const input = snapshotPlannerInput(planInput);
    const clientKey = planClientKey(plan, input);
    if (savedKey === clientKey) return onNotice(copy("Bu rota zaten kayıtlı.", "This route is already saved."));
    setSaveBusy(true);
    const createdAt = new Date().toISOString();
    try {
      const saved = { id: clientKey, createdAt, input, plan };
      saveRoutePlan(saved, ownerId);
      setSavedKey(clientKey);
      if (ownerId && accessToken) await syncRoutePlan(ownerId, accessToken, saved);
      setSavedKey(clientKey);
      await hapticSuccess();
      onNotice(ownerId && accessToken ? copy("Rota web ve mobil hesabına kaydedildi.", "Route saved to your web and mobile account.") : copy("Rota bu cihaza kaydedildi.", "Route saved on this device."));
    } catch (error) {
      let queued = false;
      try { queued = Boolean(ownerId && readRouteOutbox(ownerId)[clientKey]?.kind === "save"); } catch { /* Preserve unreadable storage. */ }
      onNotice(queued ? copy("Rota cihazda kayıtlı; bağlantı gelince hesabına eşitlenecek.", "Route saved on this device; it will sync when connected.") : getSupabaseDataErrorMessage(error, copy("Rota kaydedilemedi. Cihazda boş alan açıp tekrar dene.", "Route could not be saved. Free some device storage and retry.")));
    } finally {
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
      <PageHero scene="journey" title={copy("Rota Asistanı", "Route Assistant")} subtitle={copy("Hayalindeki seyahati birlikte planlayalım.", "Let's plan the journey you have in mind.")} />

      <div className="editorial-segments planner-modes" role="group" aria-label={copy("Planlama bölümleri", "Planning sections")}>
        {(["plan", "ready", "preferences"] as const).map((tab, index) => <button type="button" key={tab} aria-pressed={plannerTab === tab} onClick={() => setPlannerTab(tab)}>{[copy("Rota Planı", "Route Plan"), copy("Hazır Rotalar", "Ready Routes"), copy("Tercihlerim", "Preferences")][index]}</button>)}
      </div>
      {plannerTab !== "ready" && <section className="form-card planner-form reference-planner">
        {plannerTab === "plan" ? <>
          <AirportField label={copy("Nereden?", "From?")} placeholder={copy("Şehir veya havalimanı", "City or airport")} value={originAirport} required onChange={(airport) => { setOriginAirport(airport); setForm(current => ({ ...current, origin: airport ? airport.city || airport.name : "" })); }} />
          <div className="form-grid two">
            <label>{copy("Süre", "Duration")}<select value={form.days} onChange={event => setForm({ ...form, days: event.target.value })}>{["2–3 gün","4–6 gün","7–10 gün","10+ gün"].map((value,index) => <option key={value} value={value}>{copy(value,["2–3 days","4–6 days","7–10 days","10+ days"][index])}</option>)}</select></label>
            <label>{copy("Dönem", "Month")}<select value={form.month} onChange={event => setForm({ ...form, month: event.target.value })}>{MONTHS.map((month,index) => <option key={month} value={month}>{copy(month,["January","February","March","April","May","June","July","August","September","October","November","December"][index])}</option>)}</select></label>
          </div>
          <label className="planner-inline-field"><Icon name="users" size={18} /><span>{copy("Kiminle?", "With whom?")}</span><select value={form.who} onChange={event => setForm({ ...form, who: event.target.value })}>{["Tek başıma","Partnerimle","Arkadaşlarımla","Ailemle","İlk yurt dışı deneyimim"].map((value,index) => <option key={value} value={value}>{copy(value,["Solo","With my partner","With friends","With family","My first trip"][index])}</option>)}</select></label>
          <label className="planner-inline-field"><Icon name="wallet" size={18} /><span>{copy("Bütçe", "Budget")}</span><select value={form.budget} onChange={event => setForm({ ...form, budget: event.target.value })}><option value="Ekonomik">{copy("Ekonomik","Economy")}</option><option value="Orta">{copy("Orta","Balanced")}</option><option value="Yüksek / premium">Premium</option></select></label>
          <button type="button" className="planner-preferences-link" onClick={() => setPlannerTab("preferences")}><Icon name="settings" size={17} /><span>{copy("Seyahat tarzı ve diğer tercihler", "Travel style and more preferences")}</span><Icon name="chevron" size={15} /></button>
        </> : <>
          <h2>{copy("Sana göre bir yolculuk", "A journey that feels like you")}</h2>
          <div className="form-grid two">
            <label>{copy("Konaklama", "Stay")}<select value={form.accommodation} onChange={event => setForm({ ...form, accommodation: event.target.value })}><option>Hostel</option><option value="Otel">{copy("Otel","Hotel")}</option><option value="Apart / ev">{copy("Apart / ev","Apartment / home")}</option><option value="Fark etmez">{copy("Fark etmez","Any")}</option></select></label>
            <label>{copy("Tempo", "Pace")}<select value={form.tempo} onChange={event => setForm({ ...form, tempo: event.target.value })}>{["Rahat","Dengeli","Yoğun"].map((value,index) => <option key={value} value={value}>{copy(value,["Easy","Balanced","Busy"][index])}</option>)}</select></label>
          </div>
          <label>{copy("Giriş tercihi", "Entry preference")}<select value={form.visa} onChange={event => setForm({ ...form, visa: event.target.value })}>{["Vizesiz veya kolay giriş","Vize olabilir","Fark etmez"].map((value,index) => <option key={value} value={value}>{copy(value,["Visa-free / easy","Visa is okay","Any"][index])}</option>)}</select></label>
          <fieldset className="vibe-fieldset"><legend>{copy("İlgi alanların", "Your interests")}</legend><div className="choice-grid">{VIBES.map((vibe,index) => <button type="button" key={vibe} className={form.vibe.includes(vibe) ? "active" : ""} aria-pressed={form.vibe.includes(vibe)} onClick={() => toggleVibe(vibe)}>{copy(vibe,["City","Culture","Food","Coast","Nature","Nightlife","Shopping","Adventure"][index])}</button>)}</div></fieldset>
          <button type="button" className="secondary-wide" onClick={() => setPlannerTab("plan")}><Icon name="back" size={16} />{copy("Rota planına dön", "Back to route plan")}</button>
        </>}
        <button type="button" className="primary-wide" disabled={!ready || loading} onClick={() => void generate()}>{loading ? <span className="button-loader" /> : null}{loading ? copy("Hazırlanıyor", "Building") : copy("Rota Oluştur", "Create Route")}<Icon name="chevron" size={18} /></button>
        {!form.origin && <p className="planner-hint">{copy("Başlamak için çıkış şehrini seç.", "Choose your departure city to begin.")}</p>}
      </section>}
      <section className="planner-inspiration">
        <div className="editorial-heading"><h2>{copy("İlham Al", "Get Inspired")}</h2><button type="button" onClick={() => setPlannerTab(plannerTab === "ready" ? "plan" : "ready")}>{plannerTab === "ready" ? copy("Planıma dön","Back to plan") : copy("Rotaları keşfet","Explore routes")}<Icon name="chevron" size={14} /></button></div>
        <div className="planner-photo-grid">{(plannerTab === "ready" ? ["SJJ","FCO","BKK","TBS","DXB","BEG"] : ["SJJ","FCO","BKK"]).map(code => {
          const route = routeByDestinationCode(code, locale);
          if (!route) return null;
          return <button type="button" key={code} onClick={() => { setPlan({ summary: copy("Kaydedebilir veya tercihlerinle yeni öneriler alabilirsin.", "Save this route or get new ideas with your preferences."), routes:[route] }); setPlanInput(snapshotPlannerInput(form)); setSource("explore"); setExpanded(route.name); setSavedKey(""); }}><img src={destinationArtwork(code)} alt="" loading="lazy" width="180" height="150" /><span><strong>{route.name}</strong><small>{route.idealDuration}</small></span></button>;
        })}</div>
      </section>

      {plan && <section className="plan-results">
        <div className="results-heading">
          <div><span>{source === "surprise" ? copy("SÜRPRİZ ROTA", "SURPRISE ROUTE") : source === "explore" ? copy("SEÇTİĞİN ROTA", "YOUR ROUTE") : copy("SANA ÖZEL ÖNERİLER", "PERSONALISED PICKS")}</span><h2>{source === "explore" ? copy("Planlamaya hazır", "Ready to plan") : copy("Senin için seçtiklerimiz", "Picked for you")}</h2></div>
          <button className="save-plan-button" disabled={saveBusy} onClick={() => void save()}>{saveBusy ? <span className="button-loader dark" /> : <Icon name={savedKey === planClientKey(plan, planInput) ? "check" : "bookmark"} size={17} />} {saveBusy ? copy("Kaydediliyor", "Saving") : savedKey === planClientKey(plan, planInput) ? copy("Kaydedildi", "Saved") : copy("Kaydet", "Save")}</button>
        </div>
        <p className="plan-summary">{plan.summary}</p>
        <div className="route-result-list">
          {plan.routes.map((route, index) => {
            const open = expanded === route.name;
            const currentWeather = weather[route.name];
            const triggerId = `route-result-trigger-${index}`;
            const panelId = `route-result-panel-${index}`;
            return <article className={`route-result ${open ? "open" : ""}`} key={`${route.name}-${index}`}>
              <button id={triggerId} className="route-result-head" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(open ? "" : route.name)}>
                <span className={`route-score ${scoreColor(route.scores.overall)}`}>{route.scores.overall}</span>
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
                <div className="daily-plan"><h3>{copy("Örnek plan", "Sample plan")}</h3>{route.dailyPlan.map((day) => <div key={day}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>
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
