import { useEffect, useMemo, useState } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import type { AirportOption } from "../lib/airports";
import { createFallbackPlan } from "../data/routes";
import { generateRoutePlan, getWeather } from "../lib/api";
import { hapticSuccess } from "../lib/native";
import { openExternal } from "../lib/native";
import { snapshotPlannerInput } from "../lib/plannerState";
import { saveRoutePlan } from "../lib/storage";
import { getSupabaseDataErrorMessage, upsertUserTrip } from "../lib/supabaseData";
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
  const [step, setStep] = useState(0);
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
        setPlan(response.isFallback ? createFallbackPlan(requestInput, locale) : response.data);
        setPlanInput(requestInput);
        setSource("ai");
        setExpanded((response.isFallback ? createFallbackPlan(requestInput, locale) : response.data).routes[0]?.name || "");
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
    saveRoutePlan({ id: clientKey, createdAt, input, plan }, ownerId);
    try {
      if (ownerId && accessToken) {
        await upsertUserTrip(ownerId, {
          title: plan.routes.map((route) => route.name).join(" · ").slice(0, 160),
          destination: plan.routes.map((route) => route.country).join(" · ").slice(0, 160),
          mobileKind: "route_plan",
          clientKey,
          tripData: { input, plan, source, saved_at: createdAt },
        }, accessToken);
      }
      setSavedKey(clientKey);
      await hapticSuccess();
      onNotice(ownerId && accessToken ? copy("Rota web ve mobil hesabına kaydedildi.", "Route saved to your web and mobile account.") : copy("Rota bu cihaza kaydedildi.", "Route saved on this device."));
    } catch (error) {
      onNotice(`${getSupabaseDataErrorMessage(error, copy("Rota hesabınla eşitlenemedi.", "The route could not sync with your account."))} ${copy("Cihaz kaydı korundu.", "The on-device copy was kept.")}`);
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
    <div className="screen">
      <section className="page-intro compact-intro route-intro">
        <span className="page-icon"><Icon name="route" size={27} /></span>
        <div><small>{copy("AKILLI KEŞİF", "SMART DISCOVERY")}</small><h1>{copy("Rota Asistanı", "Route Assistant")}</h1><p>{copy("Üç kısa adımda tercihlerini seç; sana uygun rotaları önerelim.", "Make your choices in three short steps and get routes that fit you.")}</p></div>
      </section>

      <section className="form-card planner-form planner-steps">
        <div className="planner-progress" aria-label={copy(`Adım ${step + 1} / 3`, `Step ${step + 1} / 3`)}>
          {[0, 1, 2].map((index) => <button type="button" key={index} className={index === step ? "active" : index < step ? "done" : ""} aria-label={copy(`Adım ${index + 1}`, `Step ${index + 1}`)} onClick={() => index < step && setStep(index)} />)}
        </div>

        {step === 0 && <div className="planner-step">
          <h2 className="planner-step-title">{copy("Nereden ve ne zaman?", "From where and when?")}</h2>
          <AirportField
            label={copy("Çıkış noktası", "Departure point")}
            placeholder={form.origin ? copy(`${form.origin} (değiştirmek için yaz)`, `${form.origin} (type to change)`) : copy("Şehir veya havalimanı yaz", "Type a city or airport")}
            value={originAirport}
            required
            onChange={(airport) => {
              setOriginAirport(airport);
              setForm({ ...form, origin: airport ? airport.city || airport.name : "" });
            }}
          />
          {!originAirport && <p className="planner-hint">{copy("Rota önerebilmemiz için çıkış şehrini veya havalimanını seç.", "Choose a departure city or airport so we can suggest a route.")}</p>}
          <div className="form-grid two stack-narrow">
            <label>{copy("Süre", "Duration")}<select value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })}><option value="2–3 gün">{copy("2–3 gün", "2–3 days")}</option><option value="4–6 gün">{copy("4–6 gün", "4–6 days")}</option><option value="7–10 gün">{copy("7–10 gün", "7–10 days")}</option><option value="10+ gün">{copy("10+ gün", "10+ days")}</option></select></label>
            <label>{copy("Dönem", "Month")}<select value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })}>{MONTHS.map((month, index) => <option key={month} value={month}>{copy(month, ["January","February","March","April","May","June","July","August","September","October","November","December"][index])}</option>)}</select></label>
          </div>
          <button className="primary-wide" disabled={!form.origin} onClick={() => setStep(1)}><Icon name="chevron" size={17} /> {copy("Devam et", "Continue")}</button>
        </div>}

        {step === 1 && <div className="planner-step">
          <h2 className="planner-step-title">{copy("Bütçe ve yol arkadaşların", "Budget and companions")}</h2>
          <div className="form-grid two stack-narrow">
            <label>{copy("Bütçe", "Budget")}<select value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })}><option value="Ekonomik">{copy("Ekonomik", "Economy")}</option><option value="Orta">{copy("Orta", "Balanced")}</option><option value="Yüksek / premium">Premium</option></select></label>
            <label>{copy("Konaklama", "Accommodation")}<select value={form.accommodation} onChange={(event) => setForm({ ...form, accommodation: event.target.value })}><option>Hostel</option><option value="Otel">{copy("Otel", "Hotel")}</option><option value="Apart / ev">{copy("Apart / ev", "Apartment / home")}</option><option value="Fark etmez">{copy("Fark etmez", "Any")}</option></select></label>
          </div>
          <div className="form-grid two stack-narrow">
            <label>{copy("Kiminle?", "With whom?")}<select value={form.who} onChange={(event) => setForm({ ...form, who: event.target.value })}><option value="Tek başıma">{copy("Tek başıma", "Solo")}</option><option value="Partnerimle">{copy("Partnerimle", "With my partner")}</option><option value="Arkadaşlarımla">{copy("Arkadaşlarımla", "With friends")}</option><option value="Ailemle">{copy("Ailemle", "With family")}</option><option value="İlk yurt dışı deneyimim">{copy("İlk seyahatim", "My first trip")}</option></select></label>
            <label>{copy("Tempo", "Pace")}<select value={form.tempo} onChange={(event) => setForm({ ...form, tempo: event.target.value })}><option value="Rahat">{copy("Rahat", "Easy")}</option><option value="Dengeli">{copy("Dengeli", "Balanced")}</option><option value="Yoğun">{copy("Yoğun", "Busy")}</option></select></label>
          </div>
          <label>{copy("Giriş tercihi", "Entry preference")}<select value={form.visa} onChange={(event) => setForm({ ...form, visa: event.target.value })}><option value="Vizesiz veya kolay giriş">{copy("Vizesiz / kolay", "Visa-free / easy")}</option><option value="Vize olabilir">{copy("Vize olabilir", "Visa is okay")}</option><option value="Fark etmez">{copy("Fark etmez", "Any")}</option></select></label>
          <div className="planner-step-nav">
            <button className="secondary-button" onClick={() => setStep(0)}><Icon name="back" size={16} /> {copy("Geri", "Back")}</button>
            <button className="primary-button" onClick={() => setStep(2)}>{copy("Devam et", "Continue")} <Icon name="chevron" size={16} /></button>
          </div>
        </div>}

        {step === 2 && <div className="planner-step">
          <h2 className="planner-step-title">{copy("Nasıl bir seyahat istiyorsun?", "What kind of trip do you want?")}</h2>
          <fieldset className="vibe-fieldset"><legend className="sr-only">{copy("İlgi alanların", "Your interests")}</legend><div className="choice-grid">{VIBES.map((vibe, index) => <button type="button" key={vibe} className={form.vibe.includes(vibe) ? "active" : ""} aria-pressed={form.vibe.includes(vibe)} onClick={() => toggleVibe(vibe)}>{form.vibe.includes(vibe) && <Icon name="check" size={15} />}{copy(vibe, ["City","Culture","Food","Coast","Nature","Nightlife","Shopping","Adventure"][index])}</button>)}</div></fieldset>
          <div className="planner-step-nav">
            <button className="secondary-button" onClick={() => setStep(1)}><Icon name="back" size={16} /> {copy("Geri", "Back")}</button>
            <button className="primary-button planner-generate" disabled={!ready || loading} onClick={() => void generate()}>{loading ? <span className="button-loader" /> : <Icon name="route" size={18} />} {loading ? copy("Hazırlanıyor", "Building") : copy("Bana rota öner", "Suggest a route")}</button>
          </div>
        </div>}
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
