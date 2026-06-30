import Link from "next/link";
import { ArrowLeft, AlertTriangle, BarChart3, MousePointerClick, ShieldCheck } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AffiliateClick = {
  provider: string;
  destination: string | null;
  source_page: string | null;
  created_at: string;
};

type ModerationLog = {
  target_type: string;
  action: string;
  reason: string | null;
  created_at: string;
};

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = item || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function getReportData() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { clicks: [], moderationLogs: [], error: "Supabase service role env bulunamadı." };
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [clickResult, moderationResult] = await Promise.all([
    supabase
      .from("affiliate_clicks")
      .select("provider,destination,source_page,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("moderation_logs")
      .select("target_type,action,reason,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const error = clickResult.error?.message || moderationResult.error?.message || null;

  return {
    clicks: (clickResult.data || []) as AffiliateClick[],
    moderationLogs: (moderationResult.data || []) as ModerationLog[],
    error,
  };
}

export default async function AdminReportsPage() {
  const { clicks, moderationLogs, error } = await getReportData();
  const providerStats = Object.entries(countBy(clicks.map((click) => click.provider))).sort((a, b) => b[1] - a[1]);
  const topDestinations = Object.entries(countBy(clicks.map((click) => click.destination || "Belirtilmedi"))).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sourceStats = Object.entries(countBy(clicks.map((click) => click.source_page || "Belirtilmedi"))).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const reportCardStyle = {
    background: "linear-gradient(180deg, rgba(14, 42, 92, 0.96), rgba(6, 24, 58, 0.98))",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    color: "#FFFFFF",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.22)",
  } as const;

  const mutedStyle = { color: "rgba(255, 255, 255, 0.72)" } as const;
  const dividerStyle = { borderBottom: "1px solid rgba(255, 255, 255, 0.1)" } as const;

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "48px 20px" }}>
      <Link href="/admin/dashboard" className="l2t-btn l2t-btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
        <ArrowLeft size={18} /> Dashboard'a Dön
      </Link>

      <div className="l2t-section-head" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="l2t-kicker">Affiliate analiz merkezi</p>
          <h1 style={{ color: "#FFFFFF", marginBottom: "8px" }}>Affiliate Tıklama Raporları</h1>
          <p style={{ color: "rgba(255, 255, 255, 0.78)", maxWidth: "760px" }}>
            Son 7 günde affiliate yönlendirmelerini, kaynak sayfaları ve partner dağılımını takip et. Raporlanan forum içerikleri için /admin/raporlar sayfasını kullan.
          </p>
        </div>
      </div>

      {error ? (
        <div style={{ background: "#FFFBEB", borderLeft: "4px solid #F59E0B", padding: "16px", borderRadius: "0 12px 12px 0", marginBottom: "24px", display: "flex", gap: "12px" }}>
          <AlertTriangle size={24} color="#D97706" style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, color: "#92400E", fontSize: "0.95rem", lineHeight: "1.5" }}>
            <strong>Veri uyarısı:</strong> {error}. `supabase_ai_cache_moderation_affiliate.sql` dosyasının Supabase SQL Editor'da çalıştığından emin ol.
          </p>
        </div>
      ) : null}

      <div className="l2t-card-grid l2t-card-grid-3" style={{ marginBottom: "28px" }}>
        <article className="l2t-card" style={reportCardStyle}>
          <div className="l2t-card-icon" style={{ background: "#EEF7FF", color: "#1476F2" }}><MousePointerClick size={24} /></div>
          <h3 style={{ color: "#FFFFFF" }}>Affiliate tıklamaları</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "#FFB400", margin: "8px 0" }}>{clicks.length}</p>
          <span style={mutedStyle}>Son 7 gün</span>
        </article>

        <article className="l2t-card" style={reportCardStyle}>
          <div className="l2t-card-icon" style={{ background: "#F0FFF4", color: "#10B981" }}><BarChart3 size={24} /></div>
          <h3 style={{ color: "#FFFFFF" }}>En çok yönlenen partner</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "#FFB400", margin: "8px 0", textTransform: "capitalize" }}>{providerStats[0]?.[0] || "Veri yok"}</p>
          <span style={mutedStyle}>{providerStats[0]?.[1] || 0} tıklama</span>
        </article>

        <article className="l2t-card" style={reportCardStyle}>
          <div className="l2t-card-icon" style={{ background: "#FFF5E6", color: "#F59E0B" }}><ShieldCheck size={24} /></div>
          <h3 style={{ color: "#FFFFFF" }}>Moderasyon logları</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "#FFB400", margin: "8px 0" }}>{moderationLogs.length}</p>
          <span style={mutedStyle}>Son 7 gün kayıtları</span>
        </article>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        <section className="l2t-card" style={reportCardStyle}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "#FFFFFF" }}>Partner dağılımı</h2>
          {providerStats.length ? providerStats.map(([provider, count]) => (
            <div key={provider} style={{ display: "flex", justifyContent: "space-between", ...dividerStyle, padding: "10px 0", textTransform: "capitalize" }}>
              <span>{provider}</span><strong>{count}</strong>
            </div>
          )) : <p style={mutedStyle}>Henüz tıklama yok.</p>}
        </section>

        <section className="l2t-card" style={reportCardStyle}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "#FFFFFF" }}>Popüler destinasyonlar</h2>
          {topDestinations.length ? topDestinations.map(([destination, count]) => (
            <div key={destination} style={{ display: "flex", justifyContent: "space-between", ...dividerStyle, padding: "10px 0" }}>
              <span>{destination}</span><strong>{count}</strong>
            </div>
          )) : <p style={mutedStyle}>Veri geldikçe burada görünecek.</p>}
        </section>

        <section className="l2t-card" style={reportCardStyle}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "#FFFFFF" }}>Kaynak sayfalar</h2>
          {sourceStats.length ? sourceStats.map(([source, count]) => (
            <div key={source} style={{ display: "flex", justifyContent: "space-between", ...dividerStyle, padding: "10px 0" }}>
              <span style={{ overflowWrap: "anywhere" }}>{source}</span><strong>{count}</strong>
            </div>
          )) : <p style={mutedStyle}>Tıklamalar başladığında kaynaklar listelenir.</p>}
        </section>
      </div>

      <section className="l2t-card" style={{ ...reportCardStyle, marginTop: "20px" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "16px", color: "#FFFFFF" }}>Son sistem/moderasyon logları</h2>
        {moderationLogs.length ? moderationLogs.map((log, index) => (
          <div key={`${log.created_at}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", ...dividerStyle, padding: "12px 0" }}>
            <strong>{log.action}</strong>
            <span>{log.target_type}</span>
            <span style={mutedStyle}>{new Date(log.created_at).toLocaleDateString("tr-TR")}</span>
          </div>
        )) : <p style={mutedStyle}>Henüz moderasyon kaydı yok.</p>}
      </section>
    </div>
  );
}
