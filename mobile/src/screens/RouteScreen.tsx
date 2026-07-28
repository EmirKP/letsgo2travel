import { useState } from "react";
import Icon from "../components/Icon";
import { createAiRoute, type RouteInput } from "../lib/api";
import { fallbackRoutes } from "../data/routes";
import { insertRows } from "../lib/supabase";
import type { RouteOption, RouteResponse, SavedPlan, Session } from "../types";

const initialForm: RouteInput = {
  origin: "İstanbul",
  days: "4 gün",
  month: "Eylül",
  budget: "35.000 TL'ye kadar",
  accommodation: "Orta seviye otel",
  who: "Tek başıma",
  tempo: "Dengeli",
  vibe: ["Şehir", "Yeme içme"],
  visa: "Vizesiz veya kimlikle",
};

const vibeOptions = ["Şehir", "Deniz", "Doğa", "Tarih", "Yeme içme", "Gece hayatı", "Alışveriş", "Fotoğraf"];

export default function RouteScreen({
  session,
  isOnline,
  onSavePlan,
  notify,
}: {
  session: Session | null;
  isOnline: boolean;
  onSavePlan: (plan: SavedPlan) => void;
  notify: (message: string) => void;
}) {
  const [form, setForm] = useState<RouteInput>(initialForm);
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(0);

  function update<K extends keyof RouteInput>(key: K, value: RouteInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleVibe(value: string) {
    update("vibe", form.vibe.includes(value) ? form.vibe.filter((item) => item !== value) : [...form.vibe, value].slice(0, 5));
  }

  async function generate() {
    setLoading(true);
    try {
      if (isOnline) {
        const response = await createAiRoute(form);
        setResult(response.data || fallbackRoutes(form));
        if (!response.data) notify("Canlı AI yerine cihazdaki rota önerileri gösterildi.");
      } else {
        setResult(fallbackRoutes(form));
        notify("Çevrimdışı rota önerileri hazırlandı.");
      }
      setExpanded(0);
      window.setTimeout(() => document.querySelector(".route-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (error) {
      setResult(fallbackRoutes(form));
      notify(error instanceof Error ? `${error.message} Yerel öneriler gösterildi.` : "Yerel öneriler gösterildi.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRoute(route: RouteOption) {
    const plan: SavedPlan = {
      id: crypto.randomUUID(),
      kind: "route",
      title: `${route.name}, ${route.country}`,
      subtitle: `${route.idealDuration} · ${route.estimatedBudget} · ${route.visaStatus}`,
      savedAt: Date.now(),
      payload: { route, form },
    };
    onSavePlan(plan);

    if (session) {
      try {
        const rows = await insertRows<{ id: number }>("user_trips", [{
          user_id: session.user.id,
          title: plan.title,
          destination: route.name,
          trip_data: { route, form, source: "mobile" },
        }], session);
        if (rows[0]?.id) plan.cloudId = rows[0].id;
        notify("Rota cihazına ve hesabına kaydedildi.");
        return;
      } catch {
        notify("Rota cihazına kaydedildi; hesap senkronu daha sonra tekrar denenebilir.");
        return;
      }
    }
    notify("Rota cihazına kaydedildi.");
  }

  return (
    <main className="content route-content">
      <section className="page-hero route-hero">
        <span className="page-hero-icon"><Icon name="sparkles" size={27}/></span>
        <div><small>AKILLI PLANLAYICI</small><h1>Rota Asistanı</h1><p>Tercihlerini seç; sana uygun üç farklı seyahat rotası hazırlayalım.</p></div>
      </section>

      <section className="panel route-form-panel">
        <div className="form-grid">
          <label className="form-field"><span>Çıkış noktası</span><div className="input-shell"><Icon name="location" size={18}/><input value={form.origin} onChange={(event) => update("origin", event.target.value)} placeholder="İstanbul"/></div></label>
          <label className="form-field"><span>Süre</span><div className="input-shell"><Icon name="calendar" size={18}/><select value={form.days} onChange={(event) => update("days", event.target.value)}><option>3 gün</option><option>4 gün</option><option>5 gün</option><option>7 gün</option><option>10 gün</option></select></div></label>
          <label className="form-field"><span>Dönem</span><div className="input-shell"><Icon name="calendar" size={18}/><select value={form.month} onChange={(event) => update("month", event.target.value)}>{["Ağustos","Eylül","Ekim","Kasım","Aralık","Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz"].map((item) => <option key={item}>{item}</option>)}</select></div></label>
          <label className="form-field"><span>Bütçe</span><div className="input-shell"><Icon name="wallet" size={18}/><select value={form.budget} onChange={(event) => update("budget", event.target.value)}><option>20.000 TL'ye kadar</option><option>35.000 TL'ye kadar</option><option>50.000 TL'ye kadar</option><option>75.000 TL ve üzeri</option></select></div></label>
          <label className="form-field"><span>Konaklama</span><div className="input-shell"><Icon name="hotel" size={18}/><select value={form.accommodation} onChange={(event) => update("accommodation", event.target.value)}><option>Ekonomik</option><option>Orta seviye otel</option><option>Konforlu otel</option><option>Hostel / sosyal</option></select></div></label>
          <label className="form-field"><span>Kiminle?</span><div className="input-shell"><Icon name="users" size={18}/><select value={form.who} onChange={(event) => update("who", event.target.value)}><option>Tek başıma</option><option>Partnerimle</option><option>Arkadaşlarla</option><option>Ailemle</option></select></div></label>
          <label className="form-field"><span>Tempo</span><div className="input-shell"><Icon name="route" size={18}/><select value={form.tempo} onChange={(event) => update("tempo", event.target.value)}><option>Sakin</option><option>Dengeli</option><option>Yoğun</option></select></div></label>
          <label className="form-field"><span>Vize tercihi</span><div className="input-shell"><Icon name="passport" size={18}/><select value={form.visa} onChange={(event) => update("visa", event.target.value)}><option>Vizesiz veya kimlikle</option><option>Sadece kimlikle</option><option>Vize fark etmez</option><option>Schengen vizem var</option></select></div></label>
        </div>

        <div className="vibe-block"><span>Seyahat tarzın</span><div>{vibeOptions.map((item) => <button key={item} className={form.vibe.includes(item) ? "vibe-chip active" : "vibe-chip"} onClick={() => toggleVibe(item)}>{item}</button>)}</div></div>
        <button className="wide-primary" disabled={loading} onClick={generate}><Icon name="sparkles" size={19}/>{loading ? "Rotalar hazırlanıyor..." : "Bana rota oluştur"}</button>
      </section>

      {result ? (
        <section className="route-results">
          <div className="section-head-row"><div><span className="section-kicker">SANA ÖZEL</span><h2>3 rota önerisi</h2></div><button className="round-action" onClick={generate} aria-label="Yenile"><Icon name="refresh" size={18}/></button></div>
          <p className="route-summary">{result.summary}</p>
          <div className="route-option-list">
            {result.routes.map((route, index) => (
              <article className="route-option" key={`${route.name}-${index}`}>
                <button className="route-option-head" onClick={() => setExpanded(expanded === index ? null : index)}>
                  <span className="route-rank">{index + 1}</span>
                  <span><small>{route.country} · {route.visaStatus}</small><strong>{route.name}</strong><em>{route.idealDuration} · {route.estimatedBudget}</em></span>
                  <Icon name="chevron" size={18}/>
                </button>
                {expanded === index ? (
                  <div className="route-option-body">
                    <p>{route.why}</p>
                    <div className="route-meta"><span><Icon name="star" size={15}/> Genel puan <strong>{route.scores?.overall || 80}/100</strong></span><span><Icon name="route" size={15}/> Zorluk <strong>{route.difficulty || "Kolay"}</strong></span></div>
                    {route.dailyPlan?.length ? <div className="daily-plan"><h4>Örnek günlük plan</h4>{route.dailyPlan.map((day) => <p key={day}><Icon name="check" size={14}/>{day}</p>)}</div> : null}
                    {route.safetyNote ? <div className="safety-note"><Icon name="shield" size={17}/><span>{route.safetyNote}</span></div> : null}
                    <button className="save-route-button" onClick={() => saveRoute(route)}><Icon name="bookmark" size={17}/>Bu rotayı kaydet</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
