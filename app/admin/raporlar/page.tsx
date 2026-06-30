import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ArrowLeft, AlertTriangle, CheckCircle2, EyeOff, Flag, MessageSquare, ShieldAlert, XCircle } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ForumReport = {
  id: string;
  target_id: string;
  target_type: "topic" | "reply" | string;
  user_id: string | null;
  reason: string;
  status: "open" | "resolved" | "dismissed" | string;
  created_at: string;
  targetContent?: {
    title?: string | null;
    content?: string | null;
    author_name?: string | null;
    topic_id?: string | null;
    status?: string | null;
  } | null;
};

type CommunityReport = {
  id: string;
  target_type: string;
  target_id: string;
  country_code: string | null;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
};

async function writeModerationLog(input: {
  targetType: string;
  targetId?: string | null;
  action: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from("moderation_logs").insert({
    target_type: input.targetType,
    target_id: input.targetId || null,
    action: input.action,
    reason: input.reason || null,
    metadata: input.metadata || {},
  });
}

async function setForumReportStatus(formData: FormData) {
  "use server";

  const reportId = String(formData.get("reportId") || "");
  const status = String(formData.get("status") || "");

  if (!reportId || !["open", "resolved", "dismissed"].includes(status)) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from("forum_reports").update({ status }).eq("id", reportId);
  await writeModerationLog({
    targetType: "forum_report",
    targetId: reportId,
    action: `report_${status}`,
    reason: "Admin raporlanan içerikler paneli",
    metadata: { reportId, status },
  });

  revalidatePath("/admin/raporlar");
}

async function hideForumTargetAndResolve(formData: FormData) {
  "use server";

  const reportId = String(formData.get("reportId") || "");
  const targetId = String(formData.get("targetId") || "");
  const targetType = String(formData.get("targetType") || "");
  const reason = String(formData.get("reason") || "Raporlanan içerik admin tarafından gizlendi.");

  if (!reportId || !targetId || !["topic", "reply"].includes(targetType)) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  if (targetType === "topic") {
    await supabase.from("forum_topics").update({ status: "hidden" }).eq("id", targetId);
  } else {
    await supabase.from("forum_replies").update({ status: "hidden" }).eq("id", targetId);
  }

  await supabase.from("forum_reports").update({ status: "resolved" }).eq("id", reportId);
  await writeModerationLog({
    targetType: `forum_${targetType}`,
    targetId,
    action: "hide_and_resolve_report",
    reason,
    metadata: { reportId, targetType, targetId },
  });

  revalidatePath("/admin/raporlar");
}

async function getReportData() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      forumReports: [] as ForumReport[],
      communityReports: [] as CommunityReport[],
      error: "Supabase service role env bulunamadı.",
    };
  }

  const [forumResult, communityResult] = await Promise.all([
    supabase
      .from("forum_reports")
      .select("id,target_id,target_type,user_id,reason,status,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("content_reports")
      .select("id,target_type,target_id,country_code,reason,note,status,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const forumReports = ((forumResult.data || []) as ForumReport[]).map((report) => ({ ...report, targetContent: null }));

  const enhancedForumReports = await Promise.all(
    forumReports.map(async (report) => {
      if (report.target_type === "topic") {
        const { data } = await supabase
          .from("forum_topics")
          .select("title,content,author_name,status")
          .eq("id", report.target_id)
          .maybeSingle();
        return { ...report, targetContent: data || null };
      }

      if (report.target_type === "reply") {
        const { data } = await supabase
          .from("forum_replies")
          .select("content,author_name,topic_id,status")
          .eq("id", report.target_id)
          .maybeSingle();
        return { ...report, targetContent: data || null };
      }

      return report;
    })
  );

  const error = forumResult.error?.message || communityResult.error?.message || null;

  return {
    forumReports: enhancedForumReports,
    communityReports: (communityResult.data || []) as CommunityReport[],
    error,
  };
}

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "rgba(245, 158, 11, 0.14)", color: "#FCD34D", label: "Açık" },
    resolved: { bg: "rgba(46, 204, 113, 0.14)", color: "#86EFAC", label: "Çözüldü" },
    dismissed: { bg: "rgba(148, 163, 184, 0.16)", color: "#CBD5E1", label: "Yok sayıldı" },
  };

  const selected = styles[status] || { bg: "rgba(148, 163, 184, 0.16)", color: "#CBD5E1", label: status };

  return (
    <span style={{ background: selected.bg, color: selected.color, border: "1px solid rgba(255,255,255,0.12)", borderRadius: "999px", padding: "6px 10px", fontSize: "0.78rem", fontWeight: 800 }}>
      {selected.label}
    </span>
  );
}

function targetTypeLabel(type: string) {
  if (type === "topic") return "Forum konusu";
  if (type === "reply") return "Forum cevabı";
  if (type === "question") return "Ülke sorusu";
  if (type === "answer") return "Ülke cevabı";
  if (type === "comment") return "Ülke yorumu";
  if (type === "warning") return "Uyarı";
  return type;
}

function dateLabel(date: string) {
  try {
    return new Date(date).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return date;
  }
}

export default async function AdminReportsPage() {
  const { forumReports, communityReports, error } = await getReportData();

  const openForumReports = forumReports.filter((report) => report.status === "open");
  const resolvedForumReports = forumReports.filter((report) => report.status === "resolved");
  const dismissedForumReports = forumReports.filter((report) => report.status === "dismissed");

  const cardStyle = {
    background: "linear-gradient(180deg, rgba(14, 42, 92, 0.96), rgba(6, 24, 58, 0.98))",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#FFFFFF",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.22)",
  } as const;

  const mutedStyle = { color: "rgba(255, 255, 255, 0.72)" } as const;
  const panelStyle = { ...cardStyle, borderRadius: "22px", padding: "22px" } as const;

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "48px 20px" }}>
      <Link href="/admin/dashboard" className="l2t-btn l2t-btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
        <ArrowLeft size={18} /> Dashboard'a Dön
      </Link>

      <div className="l2t-section-head" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="l2t-kicker">Moderasyon merkezi</p>
          <h1 style={{ color: "#FFFFFF", marginBottom: "8px" }}>Raporlanan İçerikler</h1>
          <p style={{ color: "rgba(255, 255, 255, 0.78)", maxWidth: "820px" }}>
            Forumda kullanıcıların raporladığı konuları ve cevapları buradan incele. Gerekirse içeriği gizleyip raporu çözüldü olarak kapatabilirsin.
          </p>
        </div>
      </div>

      {error ? (
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: "16px", borderRadius: "0 12px 12px 0", marginBottom: "24px", display: "flex", gap: "12px" }}>
          <AlertTriangle size={24} color="#D97706" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, color: "#92400E", fontSize: "0.95rem", lineHeight: "1.5" }}>
            <strong>Veri uyarısı:</strong> {error}. `forum_reports` tablosu ve forum migration dosyalarının Supabase SQL Editor'da çalıştığından emin ol.
          </p>
        </div>
      ) : null}

      <div className="l2t-card-grid l2t-card-grid-3" style={{ marginBottom: "28px" }}>
        <article className="l2t-card" style={cardStyle}>
          <div className="l2t-card-icon" style={{ background: "rgba(245, 158, 11, 0.14)", color: "#FCD34D" }}><Flag size={24} /></div>
          <h3 style={{ color: "#FFFFFF" }}>Açık rapor</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "#FFB400", margin: "8px 0" }}>{openForumReports.length}</p>
          <span style={mutedStyle}>İnceleme bekliyor</span>
        </article>

        <article className="l2t-card" style={cardStyle}>
          <div className="l2t-card-icon" style={{ background: "rgba(46, 204, 113, 0.14)", color: "#86EFAC" }}><CheckCircle2 size={24} /></div>
          <h3 style={{ color: "#FFFFFF" }}>Çözülen rapor</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "#FFB400", margin: "8px 0" }}>{resolvedForumReports.length}</p>
          <span style={mutedStyle}>Son 100 kayıt içinde</span>
        </article>

        <article className="l2t-card" style={cardStyle}>
          <div className="l2t-card-icon" style={{ background: "rgba(230, 57, 70, 0.14)", color: "#FDA4AF" }}><XCircle size={24} /></div>
          <h3 style={{ color: "#FFFFFF" }}>Yok sayılan rapor</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "#FFB400", margin: "8px 0" }}>{dismissedForumReports.length}</p>
          <span style={mutedStyle}>Geçersiz / işlem gerektirmeyen</span>
        </article>
      </div>

      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "18px" }}>
          <div>
            <h2 style={{ color: "#FFFFFF", margin: "0 0 6px", fontSize: "1.35rem" }}>Forum raporları</h2>
            <p style={{ ...mutedStyle, margin: 0 }}>Konu ve cevap raporları burada görünür.</p>
          </div>
          <Link href="/admin/forum" className="l2t-btn l2t-btn-outline" style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.22)" }}>
            Forum Yönetimi
          </Link>
        </div>

        {forumReports.length ? (
          <div style={{ display: "grid", gap: "14px" }}>
            {forumReports.map((report) => {
              const target = report.targetContent;
              const contentText = target?.content || "İçerik bulunamadı veya silinmiş olabilir.";
              const forumUrl = report.target_type === "topic" ? `/forum/${report.target_id}` : target?.topic_id ? `/forum/${target.topic_id}` : "/forum";

              return (
                <article key={report.id} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "18px", padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#BFDBFE", fontWeight: 800 }}>
                        <MessageSquare size={16} /> {targetTypeLabel(report.target_type)}
                      </span>
                      {statusBadge(report.status)}
                      {target?.status ? <span style={{ ...mutedStyle, fontSize: "0.85rem" }}>İçerik durumu: {target.status}</span> : null}
                    </div>
                    <span style={{ ...mutedStyle, fontSize: "0.85rem" }}>{dateLabel(report.created_at)}</span>
                  </div>

                  {target?.title ? <h3 style={{ color: "#FFFFFF", margin: "0 0 10px", fontSize: "1.12rem" }}>{target.title}</h3> : null}
                  <p style={{ color: "rgba(255,255,255,0.82)", margin: "0 0 12px", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {contentText.length > 520 ? `${contentText.slice(0, 520)}...` : contentText}
                  </p>

                  <div style={{ background: "rgba(230,57,70,0.12)", border: "1px solid rgba(230,57,70,0.26)", borderRadius: "14px", padding: "12px", marginBottom: "14px" }}>
                    <strong style={{ color: "#FDA4AF", display: "block", marginBottom: "4px" }}>Rapor nedeni</strong>
                    <span style={{ color: "#FFFFFF" }}>{report.reason}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <Link href={forumUrl} target="_blank" className="l2t-btn l2t-btn-outline" style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.22)" }}>
                        İçeriği Aç
                      </Link>

                      {report.status === "open" && ["topic", "reply"].includes(report.target_type) ? (
                        <form action={hideForumTargetAndResolve}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="targetId" value={report.target_id} />
                          <input type="hidden" name="targetType" value={report.target_type} />
                          <input type="hidden" name="reason" value={report.reason} />
                          <button type="submit" className="l2t-btn" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#E63946", color: "#FFFFFF", border: 0 }}>
                            <EyeOff size={16} /> İçeriği Gizle + Çöz
                          </button>
                        </form>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {report.status !== "resolved" ? (
                        <form action={setForumReportStatus}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="status" value="resolved" />
                          <button type="submit" className="l2t-btn" style={{ background: "#2ECC71", color: "#06183A", border: 0 }}>Çözüldü</button>
                        </form>
                      ) : null}

                      {report.status !== "dismissed" ? (
                        <form action={setForumReportStatus}>
                          <input type="hidden" name="reportId" value={report.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <button type="submit" className="l2t-btn l2t-btn-outline" style={{ color: "#FFFFFF", borderColor: "rgba(255,255,255,0.22)" }}>Yok Say</button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: "18px", padding: "28px", textAlign: "center" }}>
            <ShieldAlert size={34} color="#94A3B8" style={{ marginBottom: "10px" }} />
            <p style={{ ...mutedStyle, margin: 0 }}>Henüz forum raporu yok.</p>
          </div>
        )}
      </section>

      <section style={{ ...panelStyle, marginTop: "20px" }}>
        <h2 style={{ color: "#FFFFFF", margin: "0 0 6px", fontSize: "1.25rem" }}>Ülke topluluğu raporları</h2>
        <p style={{ ...mutedStyle, margin: "0 0 16px" }}>Ülke rehberi / soru-cevap alanından gelen açık raporlar.</p>

        {communityReports.length ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {communityReports.map((report) => (
              <div key={report.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "14px", padding: "14px" }}>
                <div>
                  <strong style={{ color: "#FFFFFF" }}>{targetTypeLabel(report.target_type)} · {report.country_code || "Ülke yok"}</strong>
                  <p style={{ ...mutedStyle, margin: "6px 0 0" }}>{report.reason}{report.note ? ` — ${report.note}` : ""}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {statusBadge(report.status)}
                  <span style={{ ...mutedStyle, fontSize: "0.82rem" }}>{dateLabel(report.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={mutedStyle}>Henüz ülke topluluğu raporu yok.</p>
        )}
      </section>

      <p style={{ ...mutedStyle, marginTop: "18px", fontSize: "0.9rem" }}>
        Affiliate tıklama analizleri ayrı tutulur: <Link href="/admin/affiliate-raporlari" style={{ color: "#FFB400", fontWeight: 800 }}>Affiliate raporlarına git</Link>.
      </p>
    </div>
  );
}
