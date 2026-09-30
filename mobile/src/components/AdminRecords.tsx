import { useEffect, useState } from "react";
import { requestJson } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import "./admin-records.css";

export type AdminCollection = "users" | "verifications" | "topics" | "replies" | "reports" | "visa" | "alerts";
type RecordRow = { id: string; fields: Record<string, string> };
type Result = { data: RecordRow[]; count: number; page: number; pageSize: number; generatedAt: string; legacy?: boolean };
const statuses: Record<AdminCollection, string[]> = {
  users: ["user", "moderator", "admin", "super_admin"], verifications: ["pending", "approved", "rejected", "expired"],
  topics: ["pending", "published", "rejected", "hidden", "closed"], replies: ["pending", "published", "rejected", "hidden"],
  reports: ["open", "resolved", "dismissed"], visa: ["active", "paused", "pending_activation", "match_found", "verification_required", "error", "expired"],
  alerts: ["active", "paused", "cancelled", "error", "triggered"],
};

export function AdminRecords({ accessToken, initialCollection = "users" }: { accessToken: string; initialCollection?: AdminCollection }) {
  const { copy, dateLocale } = useI18n();
  const [collection, setCollection] = useState(initialCollection);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false); setResult(null);
    const params = new URLSearchParams({ collection, page: String(page), search: query, status });
    void requestJson<Result>(`/api/admin/mobile-records?${params}`, { headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 15000 })
      .then(next => { if (active) setResult(next); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, collection, page, query, reload, status]);
  const labels: Record<AdminCollection, string> = {
    users: copy("Kullanıcılar", "Users", "Përdoruesit"), verifications: copy("Doğrulamalar", "Verifications", "Verifikimet"),
    topics: copy("Konular", "Topics", "Temat"), replies: copy("Yanıtlar", "Replies", "Përgjigjet"), reports: copy("Raporlar", "Reports", "Raportet"),
    visa: copy("Vize takipleri", "Visa trackers", "Ndjekjet e vizave"), alerts: copy("Fiyat alarmları", "Price alerts", "Njoftimet e çmimeve"),
  };
  const fieldLabels: Record<string, string> = {
    username: copy("Kullanıcı adı", "Username", "Emri i përdoruesit"), full_name: copy("Ad soyad", "Full name", "Emri i plotë"),
    role: copy("Yetki", "Role", "Roli"), status: copy("Durum", "Status", "Gjendja"), verification_status: copy("Durum", "Status", "Gjendja"),
    country_code: copy("Ülke kodu", "Country code", "Kodi i shtetit"), country_name: copy("Ülke", "Country", "Shteti"),
    title: copy("Başlık", "Title", "Titulli"), content: copy("İçerik", "Content", "Përmbajtja"), author_name: copy("Yazar", "Author", "Autori"),
    country_slug: copy("Ülke", "Country", "Shteti"), category: copy("Kategori", "Category", "Kategoria"), reason: copy("Gerekçe", "Reason", "Arsyeja"),
    target_type: copy("İçerik türü", "Content type", "Lloji i përmbajtjes"), target_id: copy("İçerik numarası", "Content ID", "ID e përmbajtjes"),
    topic_id: copy("Konu numarası", "Topic ID", "ID e temës"), user_note: copy("Başvuru notu", "Application note", "Shënimi i aplikimit"),
    admin_note: copy("İnceleme notu", "Review note", "Shënimi i shqyrtimit"), application_city: copy("Başvuru şehri", "Application city", "Qyteti i aplikimit"),
    provider_name: copy("Sağlayıcı", "Provider", "Ofruesi"), applicants_count: copy("Kişi sayısı", "Applicants", "Aplikuesit"),
    earliest_date: copy("İlk tarih", "Earliest date", "Data më e hershme"), latest_date: copy("Son tarih", "Latest date", "Data më e vonshme"),
    origin_code: copy("Kalkış", "Origin", "Nisja"), destination_code: copy("Varış", "Destination", "Mbërritja"),
    target_price: copy("Hedef fiyat", "Target price", "Çmimi i synuar"), last_checked_price: copy("Son fiyat", "Latest price", "Çmimi i fundit"),
    origin_label: copy("Kalkış", "Origin", "Nisja"), destination_label: copy("Varış", "Destination", "Mbërritja"),
    currency: copy("Para birimi", "Currency", "Monedha"), is_active: copy("Aktif", "Active", "Aktiv"),
    created_at: copy("Oluşturulma", "Created", "Krijuar"), reviewed_at: copy("İncelenme", "Reviewed", "Shqyrtuar"),
    last_checked_at: copy("Son kontrol", "Last check", "Kontrolli i fundit"), next_check_at: copy("Sonraki kontrol", "Next check", "Kontrolli i ardhshëm"),
  };
  const statusLabels: Record<string, string> = {
    user: copy("Kullanıcı", "User", "Përdorues"), moderator: copy("Moderatör", "Moderator", "Moderator"), admin: copy("Yönetici", "Admin", "Administrator"), super_admin: copy("Süper yönetici", "Super admin", "Super administrator"),
    pending: copy("Bekliyor", "Pending", "Në pritje"), approved: copy("Onaylandı", "Approved", "Miratuar"), rejected: copy("Reddedildi", "Rejected", "Refuzuar"), expired: copy("Süresi doldu", "Expired", "Skaduar"),
    published: copy("Yayında", "Published", "Publikuar"), hidden: copy("Gizli", "Hidden", "Fshehur"), closed: copy("Kapalı", "Closed", "Mbyllur"), open: copy("Açık", "Open", "Hapur"),
    resolved: copy("Çözüldü", "Resolved", "Zgjidhur"), dismissed: copy("Kapatıldı", "Dismissed", "Arkivuar"), active: copy("Aktif", "Active", "Aktiv"), paused: copy("Duraklatıldı", "Paused", "Pezulluar"), cancelled: copy("İptal", "Cancelled", "Anuluar"), error: copy("Hata", "Error", "Gabim"),
    pending_activation: copy("Etkinleştirme bekliyor", "Awaiting activation", "Në pritje të aktivizimit"), match_found: copy("Eşleşme bulundu", "Match found", "U gjet përputhje"), verification_required: copy("Doğrulama gerekiyor", "Verification needed", "Nevojitet verifikim"), triggered: copy("Bildirim gönderildi", "Alert triggered", "Njoftimi u dërgua"),
  };
  const format = (key: string, value: string) => {
    if (key.endsWith("_at") || key.endsWith("_date")) { const date = new Date(value); if (Number.isFinite(date.getTime())) return date.toLocaleString(dateLocale); }
    if (["status", "verification_status", "role"].includes(key)) return statusLabels[value] || value;
    if (value === "true") return copy("Evet", "Yes", "Po"); if (value === "false") return copy("Hayır", "No", "Jo");
    return value;
  };
  return <section className="admin-records">
    <div className="section-heading"><div><h2>{copy("Tüm kayıtlar", "All records", "Të gjitha regjistrimet")}</h2><p>{copy("Bölümü seç, ara ve ayrıntıları aç.", "Choose a section, search and open details.", "Zgjidh seksionin, kërko dhe hap hollësitë.")}</p></div></div>
    <form className="admin-record-filters" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); }}>
      <label>{copy("Bölüm", "Section", "Seksioni")}<select value={collection} onChange={event => { setCollection(event.target.value as AdminCollection); setPage(1); setStatus(""); setSearch(""); setQuery(""); }}>{Object.entries(labels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>{copy("Durum", "Status", "Gjendja")}<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">{copy("Tümü", "All", "Të gjitha")}</option>{statuses[collection].map(value => <option key={value} value={value}>{statusLabels[value] || value}</option>)}</select></label>
      <label className="admin-record-search">{copy("Kayıtlarda ara", "Search records", "Kërko regjistrimet")}<input maxLength={80} value={search} onChange={event => setSearch(event.target.value)} placeholder={collection === "verifications" ? "TR, DE, AL…" : copy("Ad, başlık veya açıklama", "Name, title or description", "Emri, titulli ose përshkrimi")} /></label>
      <button type="submit" className="primary-button"><Icon name="search" size={17} />{copy("Ara", "Search", "Kërko")}</button>
    </form>
    {loading ? <div className="skeleton-list" role="status" aria-label={copy("Yükleniyor", "Loading", "Duke ngarkuar")}><div /><div /></div> : error ? <div className="info-box error" role="alert"><p>{copy("Kayıtlar yüklenemedi. Boş bir liste olduğu anlamına gelmez.", "Records could not load. This does not mean the list is empty.", "Regjistrimet nuk u ngarkuan. Kjo nuk do të thotë se lista është bosh.")}</p><button type="button" onClick={() => setReload(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button></div> : result && <>
      <p className="admin-record-count" role="status">{result.count} {copy("kayıt", "records", "regjistrime")} · {copy("Sayfa", "Page", "Faqja")} {page} / {Math.max(1, Math.ceil(result.count / result.pageSize))}</p>
      <div className="admin-record-list">{result.data.map(row => <button type="button" key={row.id} onClick={() => setSelected(row)}><span><strong>{row.fields.title || row.fields.full_name || row.fields.username || row.fields.country_name || row.fields.country_code || [row.fields.origin_label || row.fields.origin_code, row.fields.destination_label || row.fields.destination_code].filter(Boolean).join(" → ") || row.fields.author_name || row.fields.target_type || labels[collection]}</strong><small>{(row.fields.content || row.fields.reason || row.fields.user_note || row.fields.provider_name || "").slice(0, 140)}</small><small>{row.fields.created_at ? format("created_at", row.fields.created_at) : ""}</small></span><span className="admin-record-state">{format("status", row.fields.status || row.fields.verification_status || row.fields.role || "")}</span><Icon name="chevron" size={17} /></button>)}</div>
      {!result.data.length && <p className="admin-empty">{copy("Bu filtrelerle eşleşen kayıt yok.", "No records match these filters.", "Nuk ka regjistrime që përputhen me filtrat.")}</p>}
      <div className="admin-record-pages"><button type="button" className="secondary-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{copy("Önceki", "Previous", "E mëparshmja")}</button><button type="button" className="secondary-button" onClick={() => setReload(value => value + 1)}>{copy("Yenile", "Refresh", "Rifresko")}</button><button type="button" className="secondary-button" disabled={page * result.pageSize >= result.count} onClick={() => setPage(value => value + 1)}>{copy("Sonraki", "Next", "Tjetra")}</button></div>
    </>}
    <Sheet open={Boolean(selected)} title={copy("Kayıt ayrıntısı", "Record details", "Hollësitë e regjistrimit")} onClose={() => setSelected(null)}><dl className="admin-record-details">{selected && Object.entries(selected.fields).map(([key, value]) => <div key={key}><dt>{fieldLabels[key] || key}</dt><dd>{format(key, value)}</dd></div>)}{selected && <div><dt>{copy("Kayıt numarası", "Record ID", "ID e regjistrimit")}</dt><dd>{selected.id}</dd></div>}</dl></Sheet>
  </section>;
}
