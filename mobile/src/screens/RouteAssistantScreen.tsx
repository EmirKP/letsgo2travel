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
  const [form, setForm] = useState<PlannerInput>(INITIAL);
  const [step, setStep] = useState(0);
  const [originAirport, setOriginAirport] = useState<AirportOption | null>(null);
  const [loading, setLoading] = useState(false);
  const seededSummary = routeSeedKind === "explore" ? "Keşfettiğin rota için ayrıntılı plan." : "Sana sürpriz olarak seçtiğimiz rota.";
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
    setPlan({ summary: routeSeedKind === "explore" ? "Keşfettiğin rota için ayrıntılı plan." : "Sana sürpriz olarak seçtiğimiz rota.", routes: [surpriseRoute] });
    setPlanInput(snapshotPlannerInput(form));
    setSource(routeSeedKind);
    setExpanded(surpriseRoute.name);
  }, [routeSeedKind, surpriseRoute]);

  const ready = useMemo(() => Boolean(form.origin && form.days && form.month && form.budget && form.vibe.length), [form]);

  const toggleVibe = (vibe: string) => {
    setForm((current) => {
      const exists = current.vibe.includes(vibe);
      if (exists && current.vibe.length === 1) return current;
      return { ...current, vibe: exists ? current.vibe.filter((item) => item !== vibe) : [...current.vibe, vibe].slice(0, 4) };
    });
  };

  const generate = async () => {
    if (!ready) return onNotice("Rota oluşturmak için temel seçimleri tamamla.");
    const requestInput = snapshotPlannerInput(form);
    setLoading(true);
    try {
      const response = await generateRoutePlan(requestInput);
      if (response.data?.routes?.length) {
        setPlan(response.data);
        setPlanInput(requestInput);
        setSource("ai");
        setExpanded(response.data.routes[0]?.name || "");
        setSavedKey("");
      } else {
        const fallback = createFallbackPlan(requestInput);
        setPlan(fallback);
        setPlanInput(requestInput);
        setSource("local");
        setExpanded(fallback.routes[0]?.name || "");
        setSavedKey("");
        onNotice("Önerilerin hazır.");
      }
      await hapticSuccess();
    } catch {
      const fallback = createFallbackPlan(requestInput);
      setPlan(fallback);
      setPlanInput(requestInput);
      setSource("local");
      setExpanded(fallback.routes[0]?.name || "");
      setSavedKey("");
      onNotice("Şu an çevrimdışı önerilerle devam ediyoruz; bağlantı gelince tekrar deneyebilirsin.");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!plan || saveBusy) return;
    const input = snapshotPlannerInput(planInput);
    const clientKey = planClientKey(plan, input);
    if (savedKey === clientKey) return onNotice("Bu rota zaten kayıtlı.");
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
      onNotice(ownerId && accessToken ? "Rota web ve mobil hesabına kaydedildi." : "Rota bu cihaza kaydedildi.");
    } catch (error) {
      onNotice(`${getSupabaseDataErrorMessage(error, "Rota hesabınla eşitlenemedi.")} Cihaz kaydı korundu.`);
    } finally {
      setSaveBusy(false);
    }
  };

  const loadWeather = async (route: RouteSuggestion) => {
    setWeatherLoading(route.name);
    try {
      const result = await getWeather(route.cityOrRegion || route.name);
      setWeather((current) => ({ ...current, [route.name]: result }));
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Hava durumu alınamadı.");
    } finally {
      setWeatherLoading("");
    }
  };

  return (
    <div className="screen">
      <section className="page-intro compact-intro route-intro">
        <span className="page-icon"><Icon name="route" size={27} /></span>
        <div><small>AKILLI KEŞİF</small><h1>Rota Asistanı</h1><p>Üç kısa adımda tercihlerini seç; sana uygun rotaları önerelim.</p></div>
      </section>

      <section className="form-card planner-form planner-steps">
        <div className="planner-progress" aria-label={`Adım ${step + 1} / 3`}>
          {[0, 1, 2].map((index) => <button type="button" key={index} className={index === step ? "active" : index < step ? "done" : ""} aria-label={`Adım ${index + 1}`} onClick={() => index < step && setStep(index)} />)}
        </div>

        {step === 0 && <div className="planner-step">
          <h2 className="planner-step-title">Nereden ve ne zaman?</h2>
          <AirportField
            label="Çıkış noktası"
            placeholder={form.origin ? `${form.origin} (değiştirmek için yaz)` : "Şehir veya havalimanı yaz"}
            value={originAirport}
            required
            onChange={(airport) => {
              setOriginAirport(airport);
              setForm({ ...form, origin: airport ? airport.city || airport.name : "" });
            }}
          />
          {!originAirport && <p className="planner-hint">Rota önerebilmemiz için çıkış şehrini veya havalimanını seç.</p>}
          <div className="form-grid two stack-narrow">
            <label>Süre<select value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })}><option>2–3 gün</option><option>4–6 gün</option><option>7–10 gün</option><option>10+ gün</option></select></label>
            <label>Dönem<select value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })}>{MONTHS.map((month) => <option key={month}>{month}</option>)}</select></label>
          </div>
          <button className="primary-wide" disabled={!form.origin} onClick={() => setStep(1)}><Icon name="chevron" size={17} /> Devam et</button>
        </div>}

        {step === 1 && <div className="planner-step">
          <h2 className="planner-step-title">Bütçe ve yol arkadaşların</h2>
          <div className="form-grid two stack-narrow">
            <label>Bütçe<select value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })}><option>Ekonomik</option><option>Orta</option><option value="Yüksek / premium">Premium</option></select></label>
            <label>Konaklama<select value={form.accommodation} onChange={(event) => setForm({ ...form, accommodation: event.target.value })}><option>Hostel</option><option>Otel</option><option>Apart / ev</option><option>Fark etmez</option></select></label>
          </div>
          <div className="form-grid two stack-narrow">
            <label>Kiminle?<select value={form.who} onChange={(event) => setForm({ ...form, who: event.target.value })}><option>Tek başıma</option><option>Partnerimle</option><option>Arkadaşlarımla</option><option>Ailemle</option><option value="İlk yurt dışı deneyimim">İlk seyahatim</option></select></label>
            <label>Tempo<select value={form.tempo} onChange={(event) => setForm({ ...form, tempo: event.target.value })}><option>Rahat</option><option>Dengeli</option><option>Yoğun</option></select></label>
          </div>
          <label>Giriş tercihi<select value={form.visa} onChange={(event) => setForm({ ...form, visa: event.target.value })}><option value="Vizesiz veya kolay giriş">Vizesiz / kolay</option><option>Vize olabilir</option><option>Fark etmez</option></select></label>
          <div className="planner-step-nav">
            <button className="secondary-button" onClick={() => setStep(0)}><Icon name="back" size={16} /> Geri</button>
            <button className="primary-button" onClick={() => setStep(2)}>Devam et <Icon name="chevron" size={16} /></button>
          </div>
        </div>}

        {step === 2 && <div className="planner-step">
          <h2 className="planner-step-title">Nasıl bir seyahat istiyorsun?</h2>
          <fieldset className="vibe-fieldset"><legend className="sr-only">İlgi alanların</legend><div className="choice-grid">{VIBES.map((vibe) => <button type="button" key={vibe} className={form.vibe.includes(vibe) ? "active" : ""} aria-pressed={form.vibe.includes(vibe)} onClick={() => toggleVibe(vibe)}>{form.vibe.includes(vibe) && <Icon name="check" size={15} />}{vibe}</button>)}</div></fieldset>
          <div className="planner-step-nav">
            <button className="secondary-button" onClick={() => setStep(1)}><Icon name="back" size={16} /> Geri</button>
            <button className="primary-button planner-generate" disabled={!ready || loading} onClick={() => void generate()}>{loading ? <span className="button-loader" /> : <Icon name="route" size={18} />} {loading ? "Hazırlanıyor" : "Bana rota öner"}</button>
          </div>
        </div>}
      </section>

      {plan && <section className="plan-results">
        <div className="results-heading">
          <div><span>{source === "surprise" ? "SÜRPRİZ ROTA" : source === "explore" ? "SEÇTİĞİN ROTA" : "SANA ÖZEL ÖNERİLER"}</span><h2>{source === "explore" ? "Planlamaya hazır" : "Senin için seçtiklerimiz"}</h2></div>
          <button className="save-plan-button" disabled={saveBusy} onClick={() => void save()}>{saveBusy ? <span className="button-loader dark" /> : <Icon name={savedKey === planClientKey(plan, planInput) ? "check" : "bookmark"} size={17} />} {saveBusy ? "Kaydediliyor" : savedKey === planClientKey(plan, planInput) ? "Kaydedildi" : "Kaydet"}</button>
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
                  <div><Icon name="wallet" size={17} /><span>Bütçe<strong>{route.estimatedBudget}</strong></span></div>
                  <div><Icon name="users" size={17} /><span>Uygunluk<strong>{route.bestFor}</strong></span></div>
                  <div><Icon name="map" size={17} /><span>Ulaşım<strong>{route.transportEase}</strong></span></div>
                  <div><Icon name="passport" size={17} /><span>Giriş<strong>{route.visaStatus}</strong></span></div>
                </div>
                {route.visaNote && <div className="info-box"><Icon name="passport" size={19} /><p>{route.visaNote}{route.visaVerifiedAt ? ` · Son kontrol: ${route.visaVerifiedAt}` : ""}</p></div>}
                {route.visaSourceUrl && <button className="secondary-wide" onClick={() => void openExternal(route.visaSourceUrl!)}><Icon name="external" size={17} /> Resmî giriş kaynağını aç</button>}
                <div className="daily-plan"><h3>Örnek plan</h3>{route.dailyPlan.map((day) => <div key={day}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>
                {route.warnings.length > 0 && <div className="warning-list">{route.warnings.map((warning) => <div key={warning}><Icon name="alert" size={16} /><span>{warning}</span></div>)}</div>}
                {currentWeather ? <div className="weather-card"><Icon name={currentWeather.weatherCode <= 2 ? "sun" : "cloud"} size={25} /><div><small>{currentWeather.place}</small><strong>{currentWeather.temperature}° · {currentWeather.description}</strong><span>Bugün {currentWeather.min}° / {currentWeather.max}° · Rüzgâr {currentWeather.windSpeed} km/sa</span></div></div> : <button className="secondary-wide" disabled={weatherLoading === route.name} onClick={() => void loadWeather(route)}>{weatherLoading === route.name ? <span className="button-loader dark" /> : <Icon name="cloud" size={18} />} Güncel havayı göster</button>}
              </>}</div>
            </article>;
          })}
        </div>
      </section>}
    </div>
  );
}
