import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { createFallbackPlan } from "../data/routes";
import { generateRoutePlan, getWeather } from "../lib/api";
import { hapticSuccess } from "../lib/native";
import { createId } from "../lib/id";
import { saveRoutePlan } from "../lib/storage";
import type { PlannerInput, RoutePlan, RouteSuggestion, WeatherSummary } from "../types";

const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const VIBES = ["Şehir", "Kültür", "Yeme-içme", "Deniz", "Doğa", "Gece hayatı", "Alışveriş", "Macera"];

const INITIAL: PlannerInput = {
  origin: "İstanbul",
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

export function RouteAssistantScreen({ onFlightSearch, onNotice, surpriseRoute }: {
  onFlightSearch: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
  surpriseRoute?: RouteSuggestion | null;
}) {
  const [form, setForm] = useState<PlannerInput>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<RoutePlan | null>(surpriseRoute ? { summary: "Sana sürpriz olarak seçtiğimiz rota.", routes: [surpriseRoute] } : null);
  const [source, setSource] = useState<"ai" | "local" | "surprise">(surpriseRoute ? "surprise" : "local");
  const [expanded, setExpanded] = useState<string>(surpriseRoute?.name || "");
  const [weather, setWeather] = useState<Record<string, WeatherSummary>>({});
  const [weatherLoading, setWeatherLoading] = useState("");

  useEffect(() => {
    if (!surpriseRoute) return;
    setPlan({ summary: "Sana sürpriz olarak seçtiğimiz rota.", routes: [surpriseRoute] });
    setSource("surprise");
    setExpanded(surpriseRoute.name);
  }, [surpriseRoute]);

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
    setLoading(true);
    try {
      const response = await generateRoutePlan(form);
      if (response.data?.routes?.length) {
        setPlan(response.data);
        setSource("ai");
        setExpanded(response.data.routes[0]?.name || "");
      } else {
        const fallback = createFallbackPlan(form);
        setPlan(fallback);
        setSource("local");
        setExpanded(fallback.routes[0]?.name || "");
        onNotice("Canlı asistan yanıt vermedi; güvenli yerel öneriler hazırlandı.");
      }
      await hapticSuccess();
    } catch {
      const fallback = createFallbackPlan(form);
      setPlan(fallback);
      setSource("local");
      setExpanded(fallback.routes[0]?.name || "");
      onNotice("Bağlantı kurulamadı; rota cihazdaki seçeneklerden oluşturuldu.");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!plan) return;
    saveRoutePlan({ id: createId(), createdAt: new Date().toISOString(), input: form, plan });
    await hapticSuccess();
    onNotice("Rota Planlarım'a kaydedildi.");
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
      <section className="page-intro route-intro">
        <span className="page-icon"><Icon name="route" size={27} /></span>
        <div><small>AKILLI KEŞİF</small><h1>Rota Asistanı</h1><p>Tercihlerini seç; canlı asistan uygun değilse cihazdaki rota motoru yine öneri üretir.</p></div>
      </section>

      <section className="form-card planner-form">
        <div className="form-grid two">
          <label>Çıkış noktası<input value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} placeholder="İstanbul" /></label>
          <label>Süre<select value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })}><option>2–3 gün</option><option>4–6 gün</option><option>7–10 gün</option><option>10+ gün</option></select></label>
        </div>
        <div className="form-grid two">
          <label>Dönem<select value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })}>{MONTHS.map((month) => <option key={month}>{month}</option>)}</select></label>
          <label>Bütçe<select value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })}><option>Ekonomik</option><option>Orta</option><option>Yüksek / premium</option></select></label>
        </div>
        <div className="form-grid two">
          <label>Konaklama<select value={form.accommodation} onChange={(event) => setForm({ ...form, accommodation: event.target.value })}><option>Hostel</option><option>Otel</option><option>Apart / ev</option><option>Fark etmez</option></select></label>
          <label>Kiminle?<select value={form.who} onChange={(event) => setForm({ ...form, who: event.target.value })}><option>Tek başıma</option><option>Partnerimle</option><option>Arkadaşlarımla</option><option>Ailemle</option><option>İlk yurt dışı deneyimim</option></select></label>
        </div>
        <div className="form-grid two">
          <label>Tempo<select value={form.tempo} onChange={(event) => setForm({ ...form, tempo: event.target.value })}><option>Rahat</option><option>Dengeli</option><option>Yoğun</option></select></label>
          <label>Giriş tercihi<select value={form.visa} onChange={(event) => setForm({ ...form, visa: event.target.value })}><option>Vizesiz veya kolay giriş</option><option>Vize olabilir</option><option>Fark etmez</option></select></label>
        </div>
        <fieldset className="vibe-fieldset"><legend>Nasıl bir seyahat?</legend><div className="choice-grid">{VIBES.map((vibe) => <button type="button" key={vibe} className={form.vibe.includes(vibe) ? "active" : ""} onClick={() => toggleVibe(vibe)}>{form.vibe.includes(vibe) && <Icon name="check" size={15} />}{vibe}</button>)}</div></fieldset>
        <button className="primary-wide" disabled={!ready || loading} onClick={() => void generate()}>{loading ? <span className="button-loader" /> : <Icon name="route" size={19} />} {loading ? "Rotalar hazırlanıyor" : "Bana rota öner"}</button>
      </section>

      {plan && <section className="plan-results">
        <div className="results-heading">
          <div><span>{source === "ai" ? "CANLI ASİSTAN" : source === "surprise" ? "SÜRPRİZ ROTA" : "YEREL ROTA MOTORU"}</span><h2>Senin için seçtiklerimiz</h2></div>
          <button className="save-plan-button" onClick={() => void save()}><Icon name="bookmark" size={17} /> Kaydet</button>
        </div>
        <p className="plan-summary">{plan.summary}</p>
        <div className="route-result-list">
          {plan.routes.map((route, index) => {
            const open = expanded === route.name;
            const currentWeather = weather[route.name];
            return <article className={`route-result ${open ? "open" : ""}`} key={`${route.name}-${index}`}>
              <button className="route-result-head" onClick={() => setExpanded(open ? "" : route.name)}>
                <span className={`route-score ${scoreColor(route.scores.overall)}`}>{route.scores.overall}</span>
                <span><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong><em>{route.estimatedBudget} · {route.idealDuration}</em></span>
                <Icon name="chevron" size={19} />
              </button>
              {open && <div className="route-result-body">
                <p>{route.why}</p>
                <div className="route-meta-grid">
                  <div><Icon name="wallet" size={17} /><span>Bütçe<strong>{route.estimatedBudget}</strong></span></div>
                  <div><Icon name="users" size={17} /><span>Uygunluk<strong>{route.bestFor}</strong></span></div>
                  <div><Icon name="map" size={17} /><span>Ulaşım<strong>{route.transportEase}</strong></span></div>
                  <div><Icon name="passport" size={17} /><span>Giriş<strong>{route.visaStatus}</strong></span></div>
                </div>
                <div className="daily-plan"><h3>Örnek plan</h3>{route.dailyPlan.map((day) => <div key={day}><Icon name="check" size={15} /><span>{day}</span></div>)}</div>
                {route.warnings.length > 0 && <div className="warning-list">{route.warnings.map((warning) => <div key={warning}><Icon name="alert" size={16} /><span>{warning}</span></div>)}</div>}
                {currentWeather ? <div className="weather-card"><Icon name={currentWeather.weatherCode <= 2 ? "sun" : "cloud"} size={25} /><div><small>{currentWeather.place}</small><strong>{currentWeather.temperature}° · {currentWeather.description}</strong><span>Bugün {currentWeather.min}° / {currentWeather.max}° · Rüzgâr {currentWeather.windSpeed} km/sa</span></div></div> : <button className="secondary-wide" disabled={weatherLoading === route.name} onClick={() => void loadWeather(route)}>{weatherLoading === route.name ? <span className="button-loader dark" /> : <Icon name="cloud" size={18} />} Güncel havayı göster</button>}
                <button className="primary-wide" onClick={() => onFlightSearch(route)}><Icon name="plane" size={18} /> Bu rota için bilet ara</button>
              </div>}
            </article>;
          })}
        </div>
      </section>}
    </div>
  );
}
