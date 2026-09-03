import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import {
  closeForumReport,
  getMobileAdminOverview,
  getVerificationEvidence,
  moderateForumItem,
  reviewVerification,
  type MobileAdminOverview,
} from "../lib/admin";
import { openExternal } from "../lib/native";

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AdminScreen({ accessToken, initialOverview, checking, onOverviewChange, onNotice }: {
  accessToken: string;
  initialOverview: MobileAdminOverview | null;
  checking: boolean;
  onOverviewChange: (overview: MobileAdminOverview | null) => void;
  onNotice: (message: string) => void;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [openedEvidenceIds, setOpenedEvidenceIds] = useState<Set<string>>(() => new Set());

  useEffect(() => setOverview(initialOverview), [initialOverview]);

  const refresh = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    try {
      const next = await getMobileAdminOverview(accessToken);
      setOverview(next);
      onOverviewChange(next);
    } catch {
      onNotice("Yönetim verileri yenilenemedi.");
    } finally {
      setLoading(false);
    }
  };

  const updateForum = async (kind: "topics" | "replies", id: string, status: "published" | "rejected") => {
    const label = status === "published" ? "yayınlamak" : "reddetmek";
    if (!window.confirm(`Bu kaydı ${label} istediğine emin misin?`)) return;
    setBusyId(id);
    try {
      await moderateForumItem(kind, id, status, accessToken);
      onNotice(status === "published" ? "İçerik site ve uygulamada yayınlandı." : "İçerik reddedildi.");
      await refresh();
    } catch {
      onNotice("Moderasyon işlemi tamamlanamadı.");
    } finally {
      setBusyId("");
    }
  };

  const updateReport = async (id: string, status: "resolved" | "dismissed") => {
    setBusyId(id);
    try {
      await closeForumReport(id, status, accessToken);
      onNotice(status === "resolved" ? "Rapor çözüldü olarak kapatıldı." : "Rapor geçersiz olarak kapatıldı.");
      await refresh();
    } catch {
      onNotice("Rapor güncellenemedi.");
    } finally {
      setBusyId("");
    }
  };

  const openEvidence = async (id: string) => {
    setBusyId(id);
    try {
      const result = await getVerificationEvidence(id, accessToken);
      const opened = await openExternal(result.signedUrl);
      if (!opened) throw new Error("open failed");
      setOpenedEvidenceIds((current) => new Set(current).add(id));
      onNotice("Belge güvenli önizlemede açıldı. Bağlantı 5 dakika geçerlidir.");
    } catch {
      onNotice("Başvuru belgesi açılamadı.");
    } finally {
      setBusyId("");
    }
  };

  const decideVerification = async (id: string, action: "approve" | "reject") => {
    if (!openedEvidenceIds.has(id)) {
      onNotice("Karar vermeden önce belgeyi açıp incele.");
      return;
    }
    const note = action === "reject"
      ? window.prompt("Red sebebini yaz:", "")
      : window.confirm("Bu başvuruyu onaylamak istediğine emin misin?") ? "" : null;
    if (note === null || (action === "reject" && !note.trim())) return;
    setBusyId(id);
    try {
      await reviewVerification(id, action, note.trim(), accessToken);
      onNotice(action === "approve" ? "Gezgin doğrulaması onaylandı." : "Gezgin doğrulaması reddedildi.");
      setOpenedEvidenceIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      await refresh();
    } catch {
      onNotice("Doğrulama kararı kaydedilemedi.");
    } finally {
      setBusyId("");
    }
  };

  const statCards = useMemo(() => overview ? [
    ["Kullanıcı", overview.stats.profiles, "users"],
    ["Doğrulama", overview.stats.pendingVerifications, "shield"],
    ["Forum konusu", overview.stats.pendingTopics, "info"],
    ["Forum cevabı", overview.stats.pendingReplies, "users"],
    ["Açık rapor", overview.stats.openReports, "flag"],
    ["Vize takibi", overview.stats.activeVisaTracks, "passport"],
    ["Fiyat alarmı", overview.stats.activePriceAlerts, "bell"],
    ["Hukuki talep", overview.stats.pendingKvkk + overview.stats.pendingObjections, "lock"],
  ] as Array<[string, number, IconName]> : [], [overview]);

  if ((checking || loading) && !overview) {
    return <div className="screen admin-screen"><div className="skeleton-list"><div /><div /><div /></div></div>;
  }

  if (!overview) {
    return <div className="screen admin-screen"><div className="empty-state"><span><Icon name="lock" size={28} /></span><strong>Yönetici erişimi yok</strong><p>Bu alan yalnız sunucuda yönetici olarak doğrulanan hesaba açılır.</p></div></div>;
  }

  return <div className="screen admin-screen">
    <section className="admin-hero">
      <span><Icon name="shield" size={27} /></span>
      <div><small>GÜVENLİ YÖNETİM MERKEZİ</small><h1>Admin Paneli</h1><p>Site ve uygulamanın canlı yönetim kuyrukları.</p></div>
      <button type="button" disabled={loading} onClick={() => void refresh()} aria-label="Yönetim verilerini yenile"><Icon name="refresh" size={19} /></button>
    </section>

    {overview.unavailableCount > 0 && <div className="info-box error"><Icon name="alert" size={18} /><p>{overview.unavailableCount} yönetim modülü şu anda okunamadı. Diğer veriler güncel.</p></div>}

    <section className="admin-stat-grid" aria-label="Yönetim özeti">
      {statCards.map(([label, value, icon]) => <article key={label}><span><Icon name={icon} size={19} /></span><strong>{value}</strong><small>{label}</small></article>)}
    </section>

    <section className="admin-section">
      <div className="section-heading"><div><span>BELGELİ GEZGİN</span><h2>Bekleyen doğrulamalar</h2></div></div>
      <div className="admin-queue">
        {overview.pendingVerifications.map((item) => <article key={item.id}>
          <div><strong>{item.countryName || item.countryCode}</strong><small>{formatDate(item.createdAt)}</small></div>
          <div className="admin-actions">
            <button disabled={busyId === item.id} onClick={() => void openEvidence(item.id)}><Icon name="external" size={15} /> Belge</button>
            <button disabled={busyId === item.id || !openedEvidenceIds.has(item.id)} className="approve" onClick={() => void decideVerification(item.id, "approve")}><Icon name="check" size={15} /> Onayla</button>
            <button disabled={busyId === item.id || !openedEvidenceIds.has(item.id)} className="reject" onClick={() => void decideVerification(item.id, "reject")}><Icon name="close" size={15} /> Reddet</button>
          </div>
        </article>)}
        {!overview.pendingVerifications.length && <p className="admin-empty">Bekleyen doğrulama yok.</p>}
      </div>
    </section>

    <section className="admin-section">
      <div className="section-heading"><div><span>FORUM</span><h2>Bekleyen konular</h2></div></div>
      <div className="admin-queue">
        {overview.pendingTopics.map((item) => <article key={item.id}>
          <div><strong>{item.title}</strong><small>@{item.authorName || "gezgin"} · {formatDate(item.createdAt)}</small></div>
          <div className="admin-actions"><button disabled={busyId === item.id} className="approve" onClick={() => void updateForum("topics", item.id, "published")}><Icon name="check" size={15} /> Yayınla</button><button disabled={busyId === item.id} className="reject" onClick={() => void updateForum("topics", item.id, "rejected")}><Icon name="close" size={15} /> Reddet</button></div>
        </article>)}
        {!overview.pendingTopics.length && <p className="admin-empty">Bekleyen forum konusu yok.</p>}
      </div>
    </section>

    <section className="admin-section">
      <div className="section-heading"><div><span>CEVAPLAR</span><h2>Bekleyen cevaplar</h2></div></div>
      <div className="admin-queue">
        {overview.pendingReplies.map((item) => <article key={item.id}>
          <div><strong>{item.topicTitle || "Forum cevabı"}</strong><p>{item.body}</p><small>@{item.authorName || "gezgin"} · {formatDate(item.createdAt)}</small></div>
          <div className="admin-actions"><button disabled={busyId === item.id} className="approve" onClick={() => void updateForum("replies", item.id, "published")}><Icon name="check" size={15} /> Yayınla</button><button disabled={busyId === item.id} className="reject" onClick={() => void updateForum("replies", item.id, "rejected")}><Icon name="close" size={15} /> Reddet</button></div>
        </article>)}
        {!overview.pendingReplies.length && <p className="admin-empty">Bekleyen forum cevabı yok.</p>}
      </div>
    </section>

    <section className="admin-section">
      <div className="section-heading"><div><span>RAPORLAR</span><h2>Açık bildirimler</h2></div></div>
      <div className="admin-queue">
        {overview.openReports.map((item) => <article key={item.id}>
          <div><strong>{item.targetType === "reply" ? "Cevap raporu" : "Konu raporu"}</strong><p>{item.reason}</p><small>{formatDate(item.createdAt)}</small></div>
          <div className="admin-actions"><button disabled={busyId === item.id} className="approve" onClick={() => void updateReport(item.id, "resolved")}><Icon name="check" size={15} /> Çözüldü</button><button disabled={busyId === item.id} onClick={() => void updateReport(item.id, "dismissed")}>Geçersiz</button></div>
        </article>)}
        {!overview.openReports.length && <p className="admin-empty">Açık forum raporu yok.</p>}
      </div>
    </section>

    <p className="admin-sync-note"><Icon name="wifi" size={15} /> Son senkron: {formatDate(overview.generatedAt)} · Yetki: {overview.role}</p>
  </div>;
}
