"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ExternalLink, Pencil, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";

type EventStatus = "scheduled" | "postponed" | "cancelled" | "completed";
type EventCategory = "concert" | "festival" | "sport" | "culture" | "food" | "family" | "other";
type TravelEvent = {
  id: string; title: string; description: string; category: EventCategory; countryCode: string;
  city: string; venue: string; startsAt: string; endsAt: string | null; status: EventStatus;
  imageUrl: string | null; ticketUrl: string | null; sourceUrl: string; featured: boolean;
  published: boolean; updatedAt: string;
};

type EventForm = Omit<TravelEvent, "id" | "updatedAt">;

const emptyForm: EventForm = {
  title: "", description: "", category: "concert", countryCode: "", city: "", venue: "",
  startsAt: "", endsAt: null, status: "scheduled", imageUrl: null, ticketUrl: null,
  sourceUrl: "https://", featured: false, published: true,
};

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function displayDate(value: string) {
  try { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return value; }
}

function apiMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<TravelEvent[]>([]);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/events", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(payload, "Etkinlikler alınamadı."));
      setEvents(Array.isArray(payload.data) ? payload.data : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Etkinlikler alınamadı.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reset = () => { setForm(emptyForm); setEditingId(""); setFormOpen(false); };

  const edit = (item: TravelEvent) => {
    setEditingId(item.id);
    setForm({ ...item, startsAt: localDateTime(item.startsAt), endsAt: localDateTime(item.endsAt) || null });
    setFormOpen(true); setError(""); setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(editingId || "new"); setError(""); setMessage("");
    const body = { ...form, id: editingId || undefined, countryCode: form.countryCode.trim().toUpperCase() };
    try {
      const response = await fetch("/api/admin/events", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(payload, "Etkinlik kaydedilemedi."));
      const saved = payload.data as TravelEvent;
      setEvents((current) => (editingId ? current.map((item) => item.id === editingId ? saved : item) : [...current, saved]).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setMessage(editingId ? "Etkinlik değişikliği site ve uygulamaya işlendi." : "Etkinlik site ve uygulamada yayınlandı.");
      reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Etkinlik kaydedilemedi."); }
    finally { setBusy(""); }
  };

  const quickUpdate = async (item: TravelEvent, patch: Partial<TravelEvent>) => {
    if (busy) return;
    setBusy(item.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/events", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, ...patch }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiMessage(payload, "Etkinlik güncellenemedi."));
      setEvents((current) => current.map((candidate) => candidate.id === item.id ? payload.data : candidate));
      setMessage("Değişiklik site ve uygulamaya anında işlendi.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Etkinlik güncellenemedi."); }
    finally { setBusy(""); }
  };

  return <section className="l2t-page l2t-wrap event-admin-page">
    <header className="event-admin-hero">
      <div><Link href="/admin">← Admin Merkezi</Link><p><ShieldCheck size={16} /> YALNIZ SUPER ADMIN</p><h1>Dünya Etkinlik Radarı</h1><span>Site ve mobil uygulamadaki konser, festival, spor ve kültür duyurularını tek kaynaktan yönet.</span></div>
      <div className="event-admin-actions"><button onClick={() => void load()} disabled={loading || Boolean(busy)}><RefreshCw size={18} /> Yenile</button><button className="primary" onClick={() => { if (formOpen) reset(); else setFormOpen(true); }}><Plus size={18} /> Etkinlik ekle</button></div>
    </header>

    <div className="event-admin-sync"><i /><strong>Web ve uygulama canlı senkron</strong><span>İptal, erteleme ve tarih değişiklikleri aynı kayda uygulanır.</span></div>
    {error && <div className="event-admin-feedback error" role="alert">{error}</div>}
    {message && <div className="event-admin-feedback success" role="status"><CheckCircle2 size={18} /> {message}</div>}

    {formOpen && <form className="event-admin-form" onSubmit={save}>
      <div className="event-form-title"><div><small>{editingId ? "ETKİNLİĞİ DÜZENLE" : "YENİ DUYURU"}</small><h2>{editingId ? "Tarih, durum veya içeriği güncelle" : "Güvenilir bir etkinlik ekle"}</h2></div><button type="button" aria-label="Formu kapat" onClick={reset}><X size={20} /></button></div>
      <label>Etkinlik adı<input required maxLength={240} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <div className="event-form-grid"><label>Ülke kodu<input required pattern="[A-Za-z]{2}" maxLength={2} placeholder="XK" value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /></label><label>Şehir<input required maxLength={120} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label><label>Mekân<input maxLength={180} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label></div>
      <div className="event-form-grid"><label>Başlangıç<input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label><label>Bitiş (isteğe bağlı)<input type="datetime-local" value={form.endsAt || ""} onChange={(e) => setForm({ ...form, endsAt: e.target.value || null })} /></label><label>Durum<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}><option value="scheduled">Planlandı</option><option value="postponed">Ertelendi</option><option value="cancelled">İptal edildi</option><option value="completed">Tamamlandı</option></select></label></div>
      <div className="event-form-grid"><label>Kategori<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}><option value="concert">Konser</option><option value="festival">Festival</option><option value="sport">Spor</option><option value="culture">Kültür</option><option value="food">Yeme-içme</option><option value="family">Aile</option><option value="other">Diğer</option></select></label><label>Resmî kaynak URL<input required type="url" inputMode="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></label><label>Bilet URL (isteğe bağlı)<input type="url" inputMode="url" value={form.ticketUrl || ""} onChange={(e) => setForm({ ...form, ticketUrl: e.target.value || null })} /></label></div>
      <label>Kapak görseli URL (isteğe bağlı)<input type="url" inputMode="url" placeholder="https://" value={form.imageUrl || ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value || null })} /></label>
      <label>Kısa açıklama<textarea maxLength={2000} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="event-form-checks"><label><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Ana sayfada öne çıkar</label><label><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Site ve uygulamada yayınla</label></div>
      <button className="event-save" disabled={Boolean(busy)}>{busy ? "Kaydediliyor…" : editingId ? "Değişiklikleri iki platforma uygula" : "Site ve uygulamada yayınla"}</button>
    </form>}

    <div className="event-admin-list-head"><div><small>ORTAK İÇERİK KAYNAĞI</small><h2>Etkinlikler ({events.length})</h2></div></div>
    {loading ? <div className="event-admin-loading">Etkinlikler yükleniyor…</div> : <div className="event-admin-list">
      {events.map((item) => <article key={item.id} className={item.status === "cancelled" ? "cancelled" : ""}>
        <div className="event-admin-status"><span className={item.published ? "live" : "draft"}>{item.published ? "YAYINDA" : "TASLAK"}</span><span>{item.status === "scheduled" ? "PLANLANDI" : item.status === "postponed" ? "ERTELENDİ" : item.status === "cancelled" ? "İPTAL" : "TAMAMLANDI"}</span>{item.featured && <span>ÖNE ÇIKAN</span>}</div>
        <div className="event-admin-main"><div><small>{item.countryCode} · {item.city}{item.venue ? ` · ${item.venue}` : ""}</small><h3>{item.title}</h3><p>{displayDate(item.startsAt)}</p></div><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Resmî kaynağı aç"><ExternalLink size={18} /></a></div>
        <div className="event-admin-row-actions"><button onClick={() => edit(item)}><Pencil size={16} /> Düzenle</button><button onClick={() => void quickUpdate(item, { published: !item.published })}>{item.published ? "Yayından kaldır" : "Yayınla"}</button><button className={item.status === "cancelled" ? "restore" : "cancel"} onClick={() => void quickUpdate(item, { status: item.status === "cancelled" ? "scheduled" : "cancelled" })}>{item.status === "cancelled" ? "Geri aç" : "İptal et"}</button></div>
      </article>)}
      {!events.length && <div className="event-admin-empty"><CalendarDays size={34} /><strong>Henüz editoryal etkinlik yok</strong><p>İlk güvenilir etkinliği eklediğinde web ve uygulamada aynı anda görünür.</p></div>}
    </div>}

    <style jsx>{`
      .event-admin-page{min-height:80vh;padding:40px 0 80px}.event-admin-hero{background:linear-gradient(135deg,#061d35,#0c4057);border-radius:28px;padding:34px;color:#fff;display:flex;justify-content:space-between;gap:24px;align-items:flex-end;box-shadow:0 20px 55px rgba(6,29,53,.16)}.event-admin-hero a{color:#b7dbe6;text-decoration:none;font-weight:700}.event-admin-hero p{display:flex;align-items:center;gap:7px;color:#ffd166;font-weight:900;letter-spacing:.14em;font-size:.75rem;margin:24px 0 8px}.event-admin-hero h1{font-size:clamp(2rem,4vw,3.25rem);margin:0 0 10px}.event-admin-hero span{color:#c7d7e0;font-size:1.05rem}.event-admin-actions{display:flex;gap:10px;flex-wrap:wrap}.event-admin-actions button,.event-admin-row-actions button,.event-form-title button{border:1px solid rgba(255,255,255,.2);background:#fff;color:#082941;border-radius:13px;padding:12px 16px;font-weight:800;display:flex;align-items:center;gap:7px;cursor:pointer}.event-admin-actions .primary{background:#ffc83d;border-color:#ffc83d}.event-admin-sync{margin:18px 0 28px;padding:15px 18px;background:#eaf8f3;border:1px solid #bde8d7;border-radius:16px;display:flex;align-items:center;gap:10px;color:#096c4c}.event-admin-sync i{width:9px;height:9px;border-radius:50%;background:#19ae78;box-shadow:0 0 0 5px rgba(25,174,120,.12)}.event-admin-sync span{margin-left:auto;color:#477366}.event-admin-feedback{padding:14px 18px;border-radius:14px;margin:14px 0;font-weight:700;display:flex;gap:8px}.event-admin-feedback.error{background:#fff1f2;color:#b4233e}.event-admin-feedback.success{background:#ecfdf5;color:#087653}.event-admin-form{background:#fff;border:1px solid #dce8ee;border-radius:24px;padding:26px;margin:26px 0;display:grid;gap:18px;box-shadow:0 14px 40px rgba(9,38,57,.08)}.event-form-title{display:flex;justify-content:space-between;align-items:flex-start}.event-form-title small,.event-admin-list-head small{font-weight:900;letter-spacing:.14em;color:#23758a}.event-form-title h2,.event-admin-list-head h2{margin:5px 0 0;color:#071d35}.event-form-title button{padding:9px;border-color:#dce8ee}.event-admin-form label{display:grid;gap:7px;color:#0c2b43;font-weight:800}.event-admin-form input,.event-admin-form select,.event-admin-form textarea{width:100%;border:1px solid #cbdce4;background:#f9fcfd;color:#071d35;border-radius:12px;padding:13px;font:inherit;box-sizing:border-box}.event-form-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.event-form-checks{display:flex;gap:24px;flex-wrap:wrap}.event-form-checks label{display:flex;align-items:center;gap:8px}.event-form-checks input{width:auto}.event-save{border:0;border-radius:14px;background:#ffc83d;color:#071d35;font-weight:900;padding:15px;cursor:pointer}.event-admin-list-head{margin:34px 0 14px}.event-admin-list{display:grid;gap:14px}.event-admin-list article{background:#fff;border:1px solid #dce8ee;border-radius:20px;padding:20px;display:grid;gap:15px}.event-admin-list article.cancelled{border-color:#f2c3ca;background:#fffafb}.event-admin-status{display:flex;gap:7px;flex-wrap:wrap}.event-admin-status span{font-size:.68rem;letter-spacing:.08em;font-weight:900;padding:5px 8px;border-radius:999px;background:#eef4f7;color:#506777}.event-admin-status .live{background:#dff7ed;color:#087653}.event-admin-status .draft{background:#fff3cc;color:#805b00}.event-admin-main{display:flex;justify-content:space-between;gap:18px}.event-admin-main small{color:#5b7280}.event-admin-main h3{margin:6px 0;color:#071d35;font-size:1.25rem}.event-admin-main p{margin:0;color:#385261}.event-admin-main a{color:#17718a}.event-admin-row-actions{display:flex;gap:9px;flex-wrap:wrap;border-top:1px solid #e6eef2;padding-top:14px}.event-admin-row-actions button{border-color:#dce8ee;padding:9px 12px}.event-admin-row-actions .cancel{color:#b4233e}.event-admin-row-actions .restore{color:#087653}.event-admin-loading,.event-admin-empty{background:#fff;border:1px dashed #bbced7;border-radius:20px;padding:36px;text-align:center;color:#5b7280}.event-admin-empty{display:grid;justify-items:center;gap:8px}.event-admin-empty strong{color:#071d35}@media(max-width:780px){.event-admin-page{padding:20px 14px 60px}.event-admin-hero{align-items:stretch;flex-direction:column;padding:24px}.event-admin-actions button{flex:1;justify-content:center}.event-admin-sync{align-items:flex-start;flex-wrap:wrap}.event-admin-sync span{width:100%;margin:0}.event-form-grid{grid-template-columns:1fr}.event-admin-row-actions button{flex:1;justify-content:center}}
    `}</style>
  </section>;
}
