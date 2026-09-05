import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Icon, type IconName } from "../components/Icon";
import { DateTimeField } from "../components/DateTimeField";
import { Sheet } from "../components/Sheet";
import {
  closeForumReport,
  createAdminTravelEvent,
  getMobileAdminOverview,
  getVerificationEvidence,
  listAdminTravelEvents,
  moderateForumItem,
  reviewVerification,
  updateAdminTravelEvent,
  type AdminTravelEvent,
  type AdminTravelEventInput,
  type MobileAdminOverview,
} from "../lib/admin";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/api";
import { alpha3FromAlpha2 } from "../data/countryIso";
import { openExternal } from "../lib/native";
import { clampLocalDateTime, localIsoDateTime } from "../lib/dates";

type AdminTab = "overview" | "content" | "events" | "reports";
type EvidencePreview = { id: string; signedUrl: string; evidenceType: string };

const EMPTY_EVENT: AdminTravelEventInput = {
  title: "", description: "", category: "concert", countryCode: "", city: "", venue: "",
  startsAt: "", endsAt: null, status: "scheduled", imageUrl: null, ticketUrl: null,
  sourceUrl: "https://", featured: false, published: true,
};

function cleanEventInput(form: AdminTravelEventInput): AdminTravelEventInput {
  const startsAt = new Date(form.startsAt);
  const endsAt = form.endsAt ? new Date(form.endsAt) : null;
  if (!Number.isFinite(startsAt.getTime())) throw new Error("invalid start");
  if ((form.status === "scheduled" || form.status === "postponed") && startsAt.getTime() < Date.now()) throw new Error("past start");
  if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt < startsAt)) throw new Error("invalid end");
  return {
    ...form,
    countryCode: form.countryCode.trim().toUpperCase(),
    title: form.title.trim(), city: form.city.trim(), venue: form.venue.trim(),
    description: form.description.trim(), startsAt: startsAt.toISOString(),
    endsAt: endsAt ? endsAt.toISOString() : null,
    sourceUrl: form.sourceUrl.trim(), ticketUrl: form.ticketUrl?.trim() || null,
    imageUrl: form.imageUrl?.trim() || null,
  };
}

function localDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AdminScreen({ accessToken, initialOverview, checking, onOverviewChange, onNotice }: {
  accessToken: string;
  initialOverview: MobileAdminOverview | null;
  checking: boolean;
  onOverviewChange: (overview: MobileAdminOverview | null) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, countryName, dateLocale } = useI18n();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [overviewState, setOverviewState] = useState(() => ({ accessToken, value: initialOverview }));
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [openedEvidenceIds, setOpenedEvidenceIds] = useState<Set<string>>(() => new Set());
  const [missingEvidenceIds, setMissingEvidenceIds] = useState<Set<string>>(() => new Set(
    (initialOverview?.pendingVerifications || []).filter((item) => !item.hasEvidence).map((item) => item.id),
  ));
  const [evidencePreview, setEvidencePreview] = useState<EvidencePreview | null>(null);
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [events, setEvents] = useState<AdminTravelEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventForm, setEventForm] = useState<AdminTravelEventInput>(EMPTY_EVENT);
  const [editingEventId, setEditingEventId] = useState("");
  const mountedRef = useRef(true);
  const accessTokenRef = useRef(accessToken);
  const epochRef = useRef(0);
  const requestRef = useRef(0);
  const overview = overviewState.accessToken === accessToken ? overviewState.value : null;

  const formatDate = (value: string) => {
    try { return new Intl.DateTimeFormat(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
    catch { return value; }
  };
  const capture = () => ({ token: accessToken, epoch: epochRef.current });
  const current = (session: { token: string; epoch: number }) => mountedRef.current && accessTokenRef.current === session.token && epochRef.current === session.epoch;

  useEffect(() => () => { mountedRef.current = false; epochRef.current += 1; requestRef.current += 1; }, []);
  useLayoutEffect(() => {
    accessTokenRef.current = accessToken;
    epochRef.current += 1;
    requestRef.current += 1;
    setLoading(false); setBusyId(""); setOpenedEvidenceIds(new Set()); setMissingEvidenceIds(new Set((initialOverview?.pendingVerifications || []).filter((item) => !item.hasEvidence).map((item) => item.id))); setEvidencePreview(null); setEvidenceLoaded(false); setEvidenceError("");
    setEvents([]); setEventsLoaded(false); setEventFormOpen(false); setEditingEventId(""); setEventForm(EMPTY_EVENT);
    setOverviewState({ accessToken, value: initialOverview });
  }, [accessToken, initialOverview]);

  const refresh = async (session = capture()) => {
    if (!current(session)) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const next = await getMobileAdminOverview(session.token);
      if (!current(session) || requestRef.current !== requestId) return;
      setOverviewState({ accessToken: session.token, value: next });
      setMissingEvidenceIds((currentIds) => new Set([
        ...Array.from(currentIds).filter((id) => next.pendingVerifications.some((item) => item.id === id)),
        ...next.pendingVerifications.filter((item) => !item.hasEvidence).map((item) => item.id),
      ]));
      onOverviewChange(next);
    } catch { if (current(session)) onNotice(copy("Yönetim verileri yenilenemedi.", "Admin data could not be refreshed.")); }
    finally { if (current(session) && requestRef.current === requestId) setLoading(false); }
  };

  const loadEvents = async () => {
    const session = capture();
    if (!current(session)) return;
    setLoading(true);
    try {
      const next = await listAdminTravelEvents(session.token);
      if (!current(session)) return;
      setEvents(next); setEventsLoaded(true);
    } catch { if (current(session)) onNotice(copy("Etkinlik yönetimi yüklenemedi.", "Event management could not be loaded.")); }
    finally { if (current(session)) setLoading(false); }
  };

  useEffect(() => {
    if (tab === "events" && !eventsLoaded && !loading) void loadEvents();
  }, [eventsLoaded, loading, tab]);

  const run = async (id: string, action: (token: string) => Promise<unknown>, success: string) => {
    const session = capture();
    if (!current(session) || busyId) return;
    setBusyId(id);
    try {
      await action(session.token);
      if (!current(session)) return;
      onNotice(success);
      await refresh(session);
    } catch (reason) {
      if (current(session)) onNotice(reason instanceof ApiError && reason.message
        ? reason.message
        : copy("İşlem tamamlanamadı.", "The action could not be completed."));
    }
    finally { if (current(session)) setBusyId(""); }
  };

  const updateForum = (kind: "topics" | "replies", id: string, status: "published" | "rejected") => {
    const prompt = status === "published" ? copy("Bu içeriği yayınla?", "Publish this content?") : copy("Bu içeriği reddet?", "Reject this content?");
    if (!window.confirm(prompt)) return;
    void run(id, (token) => moderateForumItem(kind, id, status, token), status === "published" ? copy("İçerik site ve uygulamada yayınlandı.", "Content is live on web and app.") : copy("İçerik reddedildi.", "Content rejected."));
  };

  const openEvidence = async (id: string) => {
    const session = capture();
    if (!current(session) || busyId) return;
    setBusyId(id);
    try {
      const result = await getVerificationEvidence(id, session.token);
      if (!current(session) || !result.signedUrl) throw new Error("open");
      setEvidenceLoaded(false);
      setEvidenceError("");
      setEvidencePreview({ id, signedUrl: result.signedUrl, evidenceType: result.evidenceType || "" });
    } catch (reason) {
      if (current(session) && reason instanceof ApiError && (reason.status === 404 || reason.code === "EVIDENCE_MISSING")) {
        setMissingEvidenceIds((value) => new Set(value).add(id));
        setOpenedEvidenceIds((value) => { const next = new Set(value); next.delete(id); return next; });
        onNotice(copy("Belge kaydı eksik. Başvuru yalnızca gerekçe yazılarak reddedilebilir.", "Evidence is missing. The application can only be rejected with a reason."));
      } else if (current(session)) {
        onNotice(reason instanceof Error && reason.message && reason.message !== "open" ? reason.message : copy("Başvuru belgesi açılamadı.", "Evidence could not be opened."));
      }
    }
    finally { if (current(session)) setBusyId(""); }
  };

  const confirmEvidenceReviewed = () => {
    if (!evidencePreview || !evidenceLoaded) return;
    setOpenedEvidenceIds((value) => new Set(value).add(evidencePreview.id));
    setMissingEvidenceIds((value) => { const next = new Set(value); next.delete(evidencePreview.id); return next; });
    setEvidencePreview(null);
    onNotice(copy("Belge incelendi; onay ve red işlemleri açıldı.", "Evidence reviewed; approve and reject actions are now enabled."));
  };

  const openEvidenceExternally = async () => {
    if (!evidencePreview || !(await openExternal(evidencePreview.signedUrl))) {
      setEvidenceError(copy("Belge cihaz görüntüleyicisinde açılamadı.", "The evidence could not be opened in the device viewer."));
      return;
    }
    setEvidenceLoaded(true);
  };

  const decideVerification = (id: string, action: "approve" | "reject") => {
    const evidenceMissing = missingEvidenceIds.has(id);
    if (action === "approve" && evidenceMissing) { onNotice(copy("Belgesiz başvuru onaylanamaz.", "An application without evidence cannot be approved.")); return; }
    if (!evidenceMissing && !openedEvidenceIds.has(id)) { onNotice(copy("Önce belgeyi incele.", "Review the evidence first.")); return; }
    const defaultReason = evidenceMissing ? copy("Başvuru belgesi bulunamadı.", "Application evidence is missing.") : "";
    const note = action === "reject" ? window.prompt(copy("Red sebebini yaz:", "Enter a rejection reason:"), defaultReason) : window.confirm(copy("Başvuruyu onayla?", "Approve this verification?")) ? "" : null;
    if (note === null || (action === "reject" && !note.trim())) return;
    void run(id, (token) => reviewVerification(id, action, note.trim(), token), action === "approve" ? copy("Doğrulama onaylandı.", "Verification approved.") : copy("Doğrulama reddedildi.", "Verification rejected."));
  };

  const submitEvent = async (event: FormEvent) => {
    event.preventDefault();
    const session = capture();
    if (!current(session) || busyId) return;
    let payload: AdminTravelEventInput;
    try { payload = cleanEventInput(eventForm); } catch { onNotice(copy("Etkinlik tarihini kontrol et.", "Check the event date.")); return; }
    setBusyId("create-event");
    try {
      const existing = editingEventId ? events.find((item) => item.id === editingEventId) : null;
      const created = existing
        ? await updateAdminTravelEvent({ ...existing, ...payload }, session.token)
        : await createAdminTravelEvent(payload, session.token);
      if (!current(session)) return;
      setEvents((items) => (existing ? items.map((item) => item.id === created.id ? created : item) : [...items, created]).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setEventForm(EMPTY_EVENT); setEventFormOpen(false); setEditingEventId("");
      onNotice(existing ? copy("Etkinlik değişikliği site ve uygulamaya işlendi.", "Event changes synced to web and app.") : copy("Etkinlik site ve uygulamada yayınlandı.", "Event published to web and app."));
    } catch { if (current(session)) onNotice(copy("Etkinlik eklenemedi; zorunlu alanları ve kaynak adresini kontrol et.", "Event could not be added; check required fields and the source URL.")); }
    finally { if (current(session)) setBusyId(""); }
  };

  const patchEvent = async (item: AdminTravelEvent, patch: Partial<AdminTravelEvent>) => {
    const session = capture();
    if (!current(session) || busyId) return;
    setBusyId(item.id);
    try {
      const updated = await updateAdminTravelEvent({ ...item, ...patch }, session.token);
      if (!current(session)) return;
      setEvents((items) => items.map((value) => value.id === item.id ? updated : value));
      onNotice(copy("Etkinlik değişikliği site ve uygulamaya işlendi.", "Event change synced to web and app."));
    } catch { if (current(session)) onNotice(copy("Etkinlik güncellenemedi.", "Event could not be updated.")); }
    finally { if (current(session)) setBusyId(""); }
  };

  const editEvent = (item: AdminTravelEvent) => {
    setEditingEventId(item.id);
    setEventForm({
      ...item,
      startsAt: localDateTimeInput(item.startsAt),
      endsAt: localDateTimeInput(item.endsAt) || null,
    });
    setEventFormOpen(true);
  };

  const toggleEventForm = () => {
    if (eventFormOpen) {
      setEventFormOpen(false);
      setEditingEventId("");
      setEventForm(EMPTY_EVENT);
    } else {
      setEventFormOpen(true);
    }
  };

  const statCards = useMemo(() => overview ? [
    [copy("Kullanıcı", "Users"), overview.stats.profiles, "users"],
    [copy("Doğrulama", "Verifications"), overview.stats.pendingVerifications, "shield"],
    [copy("İçerik kuyruğu", "Content queue"), overview.stats.pendingTopics + overview.stats.pendingReplies, "info"],
    [copy("Açık rapor", "Open reports"), overview.stats.openReports, "flag"],
    [copy("Vize takibi", "Visa trackers"), overview.stats.activeVisaTracks, "passport"],
    [copy("Fiyat alarmı", "Price alerts"), overview.stats.activePriceAlerts, "bell"],
  ] as Array<[string, number, IconName]> : [], [copy, overview]);

  if ((checking || loading) && !overview) return <div className="screen admin-screen"><div className="skeleton-list"><div /><div /><div /></div></div>;
  if (!overview) return <div className="screen admin-screen"><div className="empty-state"><span><Icon name="lock" size={28} /></span><strong>{copy("Yönetici erişimi yok", "No admin access")}</strong><p>{copy("Bu alan yalnız sunucuda super admin olarak doğrulanan hesabına açılır.", "This area opens only for your server-verified super admin account.")}</p></div></div>;

  const tabs: Array<[AdminTab, string, IconName, number]> = [
    ["overview", copy("Özet", "Overview"), "home", 0],
    ["content", copy("İçerik", "Content"), "info", overview.stats.pendingTopics + overview.stats.pendingReplies],
    ["events", copy("Etkinlik", "Events"), "calendar", events.length],
    ["reports", copy("Rapor", "Reports"), "flag", overview.stats.openReports],
  ];

  return <div className="screen admin-screen admin-v14">
    <section className="admin-hero admin-v14-hero"><span><Icon name="shield" size={27} /></span><div><small>{copy("CANLI OPERASYON MERKEZİ", "LIVE OPERATIONS")}</small><h1>{copy("Yönetim Paneli", "Admin Console")}</h1><p>{copy("Web ve mobil aynı veriyi, aynı anda yönetir.", "Manage web and app from one live source.")}</p></div><button type="button" disabled={loading} onClick={() => tab === "events" ? void loadEvents() : void refresh()} aria-label={copy("Yenile", "Refresh")}><Icon name="refresh" size={19} /></button></section>
    <div className="admin-live-strip"><span /><strong>{copy("Canlı ve senkron", "Live and synced")}</strong><small>{copy("Yalnız super admin", "Super admin only")}</small></div>
    {overview.unavailableCount > 0 && <div className="info-box error admin-module-warning" role="alert"><Icon name="alert" size={18} /><p><strong>{copy("Bazı yönetim verileri yüklenemedi.", "Some admin data could not be loaded.")}</strong><span>{overview.unavailableModules.join(", ") || copy(`${overview.unavailableCount} modül`, `${overview.unavailableCount} modules`)}</span></p><button type="button" disabled={loading} onClick={() => void refresh()}>{copy("Tekrar dene", "Try again")}</button></div>}
    <nav className="admin-tabs" aria-label={copy("Yönetim bölümleri", "Admin sections")}>{tabs.map(([id, label, icon, count]) => <button key={id} type="button" className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon name={icon} size={18} /><span>{label}</span>{count > 0 && <em>{count}</em>}</button>)}</nav>

    {tab === "overview" && <><section className="admin-stat-grid" aria-label={copy("Yönetim özeti", "Admin overview")}>{statCards.map(([label, value, icon]) => <article key={label}><span><Icon name={icon} size={19} /></span><strong>{value}</strong><small>{label}</small></article>)}</section><VerificationQueue items={overview.pendingVerifications} busyId={busyId} opened={openedEvidenceIds} missing={missingEvidenceIds} formatCountry={(code, fallback) => countryName(alpha3FromAlpha2(code), fallback || code)} formatDate={formatDate} openEvidence={openEvidence} decide={decideVerification} copy={copy} /></>}
    {tab === "content" && <ContentQueues overview={overview} busyId={busyId} formatDate={formatDate} updateForum={updateForum} copy={copy} />}
    {tab === "events" && <EventManager events={events} loading={loading} busyId={busyId} formOpen={eventFormOpen} editingId={editingEventId} form={eventForm} setForm={setEventForm} toggleForm={toggleEventForm} submit={submitEvent} editEvent={editEvent} patchEvent={patchEvent} formatDate={formatDate} copy={copy} />}
    {tab === "reports" && <ReportQueue overview={overview} busyId={busyId} formatDate={formatDate} run={run} copy={copy} />}
    <p className="admin-sync-note"><Icon name="wifi" size={15} /> {copy("Son senkron", "Last sync")}: {formatDate(overview.generatedAt)} · {overview.role}</p>
    <Sheet open={Boolean(evidencePreview)} title={copy("Başvuru belgesi", "Application evidence")} onClose={() => setEvidencePreview(null)} size="large">
      {evidencePreview && <div className="admin-evidence-preview">
        <div className="admin-evidence-security"><Icon name="lock" size={18} /><p>{copy("Bu geçici bağlantı yalnız yönetici incelemesi içindir ve kısa süre sonra kapanır.", "This temporary link is only for admin review and expires shortly.")}</p></div>
        {evidencePreview.evidenceType === "application/pdf"
          ? <iframe title={copy("Başvuru PDF belgesi", "Application PDF evidence")} src={evidencePreview.signedUrl} onLoad={() => { setEvidenceLoaded(true); setEvidenceError(""); }} onError={() => setEvidenceError(copy("PDF önizlemesi yüklenemedi.", "The PDF preview could not be loaded."))} />
          : <img src={evidencePreview.signedUrl} alt={copy("Kullanıcının gönderdiği doğrulama belgesi", "Verification evidence submitted by the user")} onLoad={() => { setEvidenceLoaded(true); setEvidenceError(""); }} onError={() => setEvidenceError(copy("Görsel önizlemesi yüklenemedi.", "The image preview could not be loaded."))} />}
        {evidenceError && <div className="info-box error" role="alert"><Icon name="alert" size={18} /><p>{evidenceError}</p></div>}
        <div className="admin-evidence-actions">
          <button type="button" className="secondary-wide" onClick={() => void openEvidenceExternally()}><Icon name="external" size={17} /> {copy("Cihaz görüntüleyicisinde aç", "Open in device viewer")}</button>
          <button type="button" className="primary-wide" disabled={!evidenceLoaded} onClick={confirmEvidenceReviewed}><Icon name="check" size={17} /> {evidenceLoaded ? copy("İnceledim, işlemleri aç", "Reviewed, enable actions") : copy("Belge yükleniyor…", "Loading evidence…")}</button>
        </div>
      </div>}
    </Sheet>
  </div>;
}

type Copy = (tr: string, en: string) => string;

function VerificationQueue({ items, busyId, opened, missing, formatCountry, formatDate, openEvidence, decide, copy }: {
  items: MobileAdminOverview["pendingVerifications"]; busyId: string; opened: Set<string>; missing: Set<string>; formatCountry: (code: string, fallback: string) => string; formatDate: (value: string) => string;
  openEvidence: (id: string) => Promise<void>; decide: (id: string, action: "approve" | "reject") => void; copy: Copy;
}) {
  return <section className="admin-section"><div className="section-heading"><div><span>{copy("BELGELİ GEZGİN", "VERIFIED TRAVELLER")}</span><h2>{copy("Bekleyen doğrulamalar", "Pending verifications")}</h2></div></div><div className="admin-queue">{items.map((item) => {
    const evidenceMissing = missing.has(item.id) || !item.hasEvidence;
    return <article className={evidenceMissing ? "evidence-missing" : ""} key={item.id}><div><strong>{formatCountry(item.countryCode, item.countryName)}</strong><small>{formatDate(item.createdAt)}</small>{evidenceMissing && <em className="admin-missing-evidence"><Icon name="alert" size={13} /> {copy("Belge eksik", "Evidence missing")}</em>}</div><div className="admin-actions"><button disabled={busyId === item.id || evidenceMissing} onClick={() => void openEvidence(item.id)}><Icon name={evidenceMissing ? "alert" : "external"} size={15} /> {evidenceMissing ? copy("Belge yok", "No evidence") : copy("Belge", "Evidence")}</button><button disabled={busyId === item.id || evidenceMissing || !opened.has(item.id)} className="approve" onClick={() => decide(item.id, "approve")}><Icon name="check" size={15} /> {copy("Onayla", "Approve")}</button><button disabled={busyId === item.id || (!evidenceMissing && !opened.has(item.id))} className="reject" onClick={() => decide(item.id, "reject")}><Icon name="close" size={15} /> {copy("Reddet", "Reject")}</button></div></article>;
  })}{!items.length && <p className="admin-empty">{copy("Bekleyen doğrulama yok.", "No pending verifications.")}</p>}</div></section>;
}

function ContentQueues({ overview, busyId, formatDate, updateForum, copy }: { overview: MobileAdminOverview; busyId: string; formatDate: (value: string) => string; updateForum: (kind: "topics" | "replies", id: string, status: "published" | "rejected") => void; copy: Copy }) {
  const queue = (kind: "topics" | "replies") => {
    const items = kind === "topics" ? overview.pendingTopics.map((item) => ({ ...item, body: "", heading: item.title })) : overview.pendingReplies.map((item) => ({ ...item, title: item.topicTitle, heading: item.topicTitle || copy("Forum cevabı", "Forum reply") }));
    return <section className="admin-section"><div className="section-heading"><div><span>{kind === "topics" ? "FORUM" : copy("CEVAPLAR", "REPLIES")}</span><h2>{kind === "topics" ? copy("Bekleyen konular", "Pending topics") : copy("Bekleyen cevaplar", "Pending replies")}</h2></div></div><div className="admin-queue">{items.map((item) => <article key={item.id}><div><strong>{item.heading}</strong>{item.body && <p>{item.body}</p>}<small>@{item.authorName || "gezgin"} · {formatDate(item.createdAt)}</small></div><div className="admin-actions"><button className="approve" disabled={busyId === item.id} onClick={() => updateForum(kind, item.id, "published")}><Icon name="check" size={15} /> {copy("Yayınla", "Publish")}</button><button className="reject" disabled={busyId === item.id} onClick={() => updateForum(kind, item.id, "rejected")}><Icon name="close" size={15} /> {copy("Reddet", "Reject")}</button></div></article>)}{!items.length && <p className="admin-empty">{copy("Bekleyen içerik yok.", "No pending content.")}</p>}</div></section>;
  };
  return <>{queue("topics")}{queue("replies")}</>;
}

function EventManager({ events, loading, busyId, formOpen, editingId, form, setForm, toggleForm, submit, editEvent, patchEvent, formatDate, copy }: {
  events: AdminTravelEvent[]; loading: boolean; busyId: string; formOpen: boolean; editingId: string; form: AdminTravelEventInput;
  setForm: (form: AdminTravelEventInput) => void; toggleForm: () => void; submit: (event: FormEvent) => Promise<void>;
  editEvent: (item: AdminTravelEvent) => void; patchEvent: (item: AdminTravelEvent, patch: Partial<AdminTravelEvent>) => Promise<void>;
  formatDate: (value: string) => string; copy: Copy;
}) {
  return <section className="admin-section admin-events-section">
    <div className="section-heading"><div><span>{copy("DÜNYA ETKİNLİK RADARI", "WORLD EVENTS RADAR")}</span><h2>{copy("Etkinlik yönetimi", "Event management")}</h2></div><button className="primary-button" onClick={toggleForm}><Icon name={formOpen ? "close" : "plus"} size={16} /> {formOpen ? copy("Kapat", "Close") : copy("Etkinlik ekle", "Add event")}</button></div>
    {formOpen && <form className="admin-event-form" onSubmit={(event) => void submit(event)}>
      <div className="admin-event-form-title"><strong>{editingId ? copy("Etkinliği düzenle", "Edit event") : copy("Yeni güvenilir etkinlik", "New trusted event")}</strong><small>{copy("Değişiklikler web ve mobilde aynı anda görünür.", "Changes appear on web and mobile together.")}</small></div>
      <label>{copy("Etkinlik adı", "Event title")}<input required maxLength={240} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <div className="form-grid two"><label>{copy("Ülke kodu", "Country code")}<input required pattern="[A-Za-z]{2}" maxLength={2} autoCapitalize="characters" placeholder="XK" value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} /></label><label>{copy("Şehir", "City")}<input required maxLength={120} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label></div>
      <div className="form-grid two"><DateTimeField type="datetime-local" required label={copy("Başlangıç", "Starts")} min={form.status === "scheduled" || form.status === "postponed" ? localIsoDateTime(1) : undefined} value={form.startsAt} onChange={(requested) => {
        const next = form.status === "scheduled" || form.status === "postponed" ? clampLocalDateTime(requested, localIsoDateTime(1)) : requested;
        setForm({ ...form, startsAt: next, endsAt: form.endsAt && form.endsAt < next ? next : form.endsAt });
      }} /><DateTimeField type="datetime-local" label={copy("Bitiş (isteğe bağlı)", "Ends (optional)")} min={form.startsAt || undefined} value={form.endsAt || ""} onChange={(value) => setForm({ ...form, endsAt: value ? clampLocalDateTime(value, form.startsAt || localIsoDateTime(1)) : null })} /></div>
      <div className="form-grid two"><label>{copy("Mekân", "Venue")}<input maxLength={180} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></label><label>{copy("Durum", "Status")}<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdminTravelEventInput["status"] })}><option value="scheduled">{copy("Planlandı", "Scheduled")}</option><option value="postponed">{copy("Ertelendi", "Postponed")}</option><option value="cancelled">{copy("İptal edildi", "Cancelled")}</option><option value="completed">{copy("Tamamlandı", "Completed")}</option></select></label></div>
      <div className="form-grid two"><label>{copy("Kategori", "Category")}<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AdminTravelEventInput["category"] })}><option value="concert">{copy("Konser", "Concert")}</option><option value="festival">Festival</option><option value="sport">{copy("Spor", "Sport")}</option><option value="culture">{copy("Kültür", "Culture")}</option><option value="food">{copy("Yeme-içme", "Food")}</option><option value="family">{copy("Aile", "Family")}</option><option value="other">{copy("Diğer", "Other")}</option></select></label><label>{copy("Resmî kaynak", "Official source")}<input required type="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></label></div>
      <div className="form-grid two"><label>{copy("Kapak görseli URL (isteğe bağlı)", "Cover image URL (optional)")}<input type="url" inputMode="url" placeholder="https://" value={form.imageUrl || ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value || null })} /></label><label>{copy("Bilet bağlantısı (isteğe bağlı)", "Ticket link (optional)")}<input type="url" inputMode="url" placeholder="https://" value={form.ticketUrl || ""} onChange={(e) => setForm({ ...form, ticketUrl: e.target.value || null })} /></label></div>
      <label>{copy("Kısa açıklama", "Short description")}<textarea maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div className="admin-event-checks"><label><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> {copy("Ana sayfada öne çıkar", "Feature on home")}</label><label><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> {copy("Hemen yayınla", "Publish now")}</label></div>
      <button className="primary-wide" disabled={busyId === "create-event"}><Icon name="check" size={17} /> {editingId ? copy("Değişiklikleri iki platforma uygula", "Apply changes to both platforms") : copy("Site ve uygulamada yayınla", "Publish to web and app")}</button>
    </form>}
    <div className="admin-queue admin-event-list">{events.map((item) => <article key={item.id} className={item.status === "cancelled" ? "cancelled" : ""}><div><span className="admin-event-state">{item.published ? copy("YAYINDA", "LIVE") : copy("TASLAK", "DRAFT")} · {item.status === "scheduled" ? copy("planlandı", "scheduled") : item.status === "postponed" ? copy("ertelendi", "postponed") : item.status === "cancelled" ? copy("iptal", "cancelled") : copy("tamamlandı", "completed")}</span><strong>{item.title}</strong><p>{item.city}{item.venue ? ` · ${item.venue}` : ""}</p><small>{formatDate(item.startsAt)}</small></div><div className="admin-actions"><button disabled={busyId === item.id} onClick={() => editEvent(item)}><Icon name="settings" size={14} /> {copy("Düzenle", "Edit")}</button><button disabled={busyId === item.id} onClick={() => void patchEvent(item, { published: !item.published })}>{item.published ? copy("Gizle", "Hide") : copy("Yayınla", "Publish")}</button><button className={item.status === "cancelled" ? "approve" : "reject"} disabled={busyId === item.id} onClick={() => void patchEvent(item, { status: item.status === "cancelled" ? "scheduled" : "cancelled" })}>{item.status === "cancelled" ? copy("Geri aç", "Restore") : copy("İptal", "Cancel")}</button></div></article>)}{!loading && !events.length && <p className="admin-empty">{copy("Henüz elle eklenmiş etkinlik yok.", "No curated events yet.")}</p>}</div>
  </section>;
}

function ReportQueue({ overview, busyId, formatDate, run, copy }: { overview: MobileAdminOverview; busyId: string; formatDate: (value: string) => string; run: (id: string, action: (token: string) => Promise<unknown>, success: string) => Promise<void>; copy: Copy }) {
  return <section className="admin-section"><div className="section-heading"><div><span>{copy("RAPORLAR", "REPORTS")}</span><h2>{copy("Açık bildirimler", "Open reports")}</h2></div></div><div className="admin-queue">{overview.openReports.map((item) => <article key={item.id}><div><strong>{item.targetType === "reply" ? copy("Cevap raporu", "Reply report") : copy("Konu raporu", "Topic report")}</strong><p>{item.reason}</p><small>{formatDate(item.createdAt)}</small></div><div className="admin-actions"><button className="approve" disabled={busyId === item.id} onClick={() => void run(item.id, (token) => closeForumReport(item.id, "resolved", token), copy("Rapor çözüldü.", "Report resolved."))}><Icon name="check" size={15} /> {copy("Çözüldü", "Resolve")}</button><button disabled={busyId === item.id} onClick={() => void run(item.id, (token) => closeForumReport(item.id, "dismissed", token), copy("Rapor geçersiz kapatıldı.", "Report dismissed."))}>{copy("Geçersiz", "Dismiss")}</button></div></article>)}{!overview.openReports.length && <p className="admin-empty">{copy("Açık rapor yok.", "No open reports.")}</p>}</div></section>;
}
