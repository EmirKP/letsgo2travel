"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, FileText, Flag, Scale, ShieldCheck, Trash2 } from "lucide-react";

type Tab = "verifications" | "reports" | "disputes" | "kvkk";

type Verification = {
  id: string;
  country_name?: string | null;
  country_code: string;
  status: string;
  created_at: string;
  profiles?: { username?: string | null } | null;
};

type ForumReport = {
  id: string;
  target_type: string;
  reason: string;
  status: string;
  created_at: string;
  targetContent?: { title?: string; content?: string; author_name?: string } | null;
};

type Objection = {
  id: string;
  business_name: string;
  authorized_person: string;
  email: string;
  objection_type: string;
  content_url?: string | null;
  description: string;
  status: string;
  created_at: string;
};

type KvkkRequest = {
  id: string;
  user_id?: string | null;
  request_type: string;
  status: string;
  notes?: string | null;
  created_at: string;
  processed_at?: string | null;
};

const tabItems: Array<{ id: Tab; label: string; icon: typeof ShieldCheck }> = [
  { id: "verifications", label: "Doğrulamalar", icon: ShieldCheck },
  { id: "reports", label: "Forum Raporları", icon: Flag },
  { id: "disputes", label: "İşletme İtirazları", icon: Scale },
  { id: "kvkk", label: "KVKK Talepleri", icon: FileText },
];

const panelStyle = { padding: "28px" } as const;
const itemStyle = { padding: "16px", border: "1px solid var(--l2t-border)", borderRadius: "12px", background: "rgba(10,25,48,0.45)", marginBottom: "14px" } as const;
const selectStyle = { padding: "8px", borderRadius: "7px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid var(--l2t-border)" } as const;

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "İşlem tamamlanamadı.");
  return payload;
}

export default function ModerationPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("verifications");
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [reports, setReports] = useState<ForumReport[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [kvkkRequests, setKvkkRequests] = useState<KvkkRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (tab: Tab) => {
    setLoading(true);
    setMessage("");
    try {
      if (tab === "verifications") {
        const payload = await jsonRequest<{ data?: Verification[] }>("/api/admin/travel-verifications");
        setVerifications(payload.data || []);
      } else if (tab === "reports") {
        const payload = await jsonRequest<{ data?: ForumReport[] }>("/api/admin/forum/reports?status=open&limit=50");
        setReports(payload.data || []);
      } else if (tab === "disputes") {
        const payload = await jsonRequest<{ data?: Objection[] }>("/api/admin/business-objections");
        setObjections(payload.data || []);
      } else {
        const payload = await jsonRequest<{ data?: KvkkRequest[] }>("/api/admin/kvkk-requests");
        setKvkkRequests(payload.data || []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Veriler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(activeTab); }, [activeTab, load]);

  async function updateObjection(id: string, status: string) {
    setBusyId(id);
    try {
      await jsonRequest("/api/admin/business-objections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await load("disputes");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "İtiraz güncellenemedi.");
    } finally {
      setBusyId("");
    }
  }

  async function updateKvkk(id: string, status: string) {
    setBusyId(id);
    try {
      await jsonRequest("/api/admin/kvkk-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await load("kvkk");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Talep güncellenemedi.");
    } finally {
      setBusyId("");
    }
  }

  async function executeDeletion(request: KvkkRequest) {
    const confirmation = window.prompt(
      "Bu işlem hesabı kalıcı siler ve kullanıcı içeriklerini anonimleştirir. Devam etmek için HESABI KALICI SIL yazın.",
    );
    if (confirmation === null) return;
    setBusyId(request.id);
    try {
      const payload = await jsonRequest<{ message?: string }>(`/api/admin/kvkk-requests/${request.id}/execute-account-deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      setMessage(payload.message || "Hesap silme işlemi tamamlandı.");
      await load("kvkk");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hesap silinemedi.");
    } finally {
      setBusyId("");
    }
  }

  async function closeReport(id: string, status: "resolved" | "dismissed") {
    setBusyId(id);
    try {
      await jsonRequest("/api/admin/forum/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await load("reports");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rapor güncellenemedi.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="l2t-page">
      <div className="l2t-wrap" style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: "28px" }}>
        <aside className="l2t-card" style={{ padding: "20px", height: "max-content" }}>
          <h1 style={{ fontSize: "1.2rem", margin: "0 0 18px", color: "var(--l2t-ink)" }}>Moderasyon ve Hukuk</h1>
          <div style={{ display: "grid", gap: "7px" }}>
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px", border: 0, borderRadius: "8px", cursor: "pointer", textAlign: "left", background: activeTab === tab.id ? "rgba(245,184,27,0.12)" : "transparent", color: activeTab === tab.id ? "var(--l2t-gold)" : "var(--l2t-soft)", fontWeight: activeTab === tab.id ? 700 : 500 }}><Icon size={18} /> {tab.label}</button>;
            })}
          </div>
        </aside>

        <main>
          {message && <div className="l2t-card" role="status" style={{ padding: "14px 18px", marginBottom: "16px", color: "var(--l2t-soft)" }}>{message}</div>}
          {loading ? <div className="l2t-card" style={panelStyle}>Yükleniyor...</div> : null}

          {!loading && activeTab === "verifications" && <section className="l2t-card" style={panelStyle}>
            <h2 style={{ color: "var(--l2t-ink)", marginTop: 0 }}><ShieldCheck size={21} /> Gerçek Doğrulama Talepleri</h2>
            <p style={{ color: "var(--l2t-soft)" }}>Bekleyen belgeler yalnızca özel inceleme ekranından açılır; bu panel örnek veri göstermez.</p>
            {verifications.filter((item) => item.status === "pending").slice(0, 8).map((item) => <article key={item.id} style={itemStyle}>
              <strong style={{ color: "var(--l2t-ink)" }}>{item.country_name || item.country_code}</strong>
              <p style={{ color: "var(--l2t-soft)", margin: "7px 0 0" }}>@{item.profiles?.username || "kullanıcı"} · {new Date(item.created_at).toLocaleString("tr-TR")}</p>
            </article>)}
            {!verifications.some((item) => item.status === "pending") && <p style={{ color: "var(--l2t-soft)" }}>Bekleyen doğrulama bulunmuyor.</p>}
            <Link href="/admin/dogrulamalar" className="l2t-btn">Güvenli inceleme ekranını aç</Link>
          </section>}

          {!loading && activeTab === "reports" && <section className="l2t-card" style={panelStyle}>
            <h2 style={{ color: "var(--l2t-ink)", marginTop: 0 }}><Flag size={21} /> Açık Forum Raporları</h2>
            {reports.map((report) => <article key={report.id} style={itemStyle}>
              <strong style={{ color: "var(--l2t-ink)" }}>{report.targetContent?.title || report.target_type}</strong>
              <p style={{ color: "var(--l2t-soft)" }}>{report.reason}</p>
              {report.targetContent?.content && <p style={{ color: "var(--l2t-muted)", whiteSpace: "pre-wrap" }}>{report.targetContent.content.slice(0, 500)}</p>}
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="l2t-btn l2t-btn-small" disabled={busyId === report.id} onClick={() => void closeReport(report.id, "resolved")}><CheckCircle size={15} /> Çözüldü</button>
                <button className="l2t-btn l2t-btn-small l2t-btn-ghost" disabled={busyId === report.id} onClick={() => void closeReport(report.id, "dismissed")}>Reddet</button>
              </div>
            </article>)}
            {!reports.length && <p style={{ color: "var(--l2t-soft)" }}>Açık forum raporu bulunmuyor.</p>}
          </section>}

          {!loading && activeTab === "disputes" && <section className="l2t-card" style={panelStyle}>
            <h2 style={{ color: "var(--l2t-ink)", marginTop: 0 }}><Scale size={21} /> İşletme / Kurum İtirazları</h2>
            <p style={{ color: "var(--l2t-soft)" }}>Bu liste yalnızca gerçek itiraz formu kayıtlarını gösterir.</p>
            {objections.map((item) => <article key={item.id} style={itemStyle}>
              <strong style={{ color: "var(--l2t-ink)" }}>{item.business_name}</strong>
              <p style={{ color: "var(--l2t-soft)", whiteSpace: "pre-wrap" }}>{item.authorized_person} · {item.email}<br />{item.objection_type}<br />{item.description}</p>
              {item.content_url && <a href={item.content_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--l2t-gold)" }}>İtiraz edilen bağlantıyı aç</a>}
              <div style={{ marginTop: "12px" }}><select value={item.status} disabled={busyId === item.id} onChange={(event) => void updateObjection(item.id, event.target.value)} style={selectStyle}><option value="pending">Bekliyor</option><option value="reviewing">İnceleniyor</option><option value="resolved">Çözüldü</option><option value="rejected">Reddedildi</option></select></div>
            </article>)}
            {!objections.length && <p style={{ color: "var(--l2t-soft)" }}>Henüz işletme itirazı bulunmuyor.</p>}
          </section>}

          {!loading && activeTab === "kvkk" && <section className="l2t-card" style={panelStyle}>
            <h2 style={{ color: "var(--l2t-ink)", marginTop: 0 }}><FileText size={21} /> Veri Silme ve Hak Talepleri</h2>
            {kvkkRequests.map((item) => {
              const accountDeletion = item.request_type === "Hesabımı kapatmak istiyorum";
              const finished = ["processed", "resolved", "rejected"].includes(item.status);
              return <article key={item.id} style={itemStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}><strong style={{ color: "var(--l2t-ink)" }}>{item.request_type}</strong><span style={{ color: "var(--l2t-gold)" }}>{item.status}</span></div>
                <p style={{ color: "var(--l2t-soft)", whiteSpace: "pre-wrap" }}>{item.notes || "Açıklama yok"}</p>
                <small style={{ color: "var(--l2t-muted)" }}>{new Date(item.created_at).toLocaleString("tr-TR")}</small>
                {!finished && <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginTop: "13px" }}>
                  <select value={item.status} disabled={busyId === item.id} onChange={(event) => void updateKvkk(item.id, event.target.value)} style={selectStyle}>
                    <option value="pending">Bekliyor</option><option value="reviewing">İnceleniyor</option>{!accountDeletion && <option value="resolved">Çözüldü</option>}<option value="rejected">Reddedildi</option>
                  </select>
                  {accountDeletion && item.status === "reviewing" && <button className="l2t-btn l2t-btn-small" style={{ background: "#dc2626", color: "#fff" }} disabled={busyId === item.id} onClick={() => void executeDeletion(item)}><Trash2 size={15} /> Hesabı kalıcı sil</button>}
                </div>}
              </article>;
            })}
            {!kvkkRequests.length && <p style={{ color: "var(--l2t-soft)" }}>Henüz KVKK talebi bulunmuyor.</p>}
          </section>}
        </main>
      </div>
    </div>
  );
}
