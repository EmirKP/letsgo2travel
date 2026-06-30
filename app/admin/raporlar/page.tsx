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

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "48px 20px" }}>
      <Link href="/admin/dashboard" className="l2t-btn l2t-btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
        <ArrowLeft size={18} /> Dashboard'a Dön
      </Link>

      <div className="l2t-section-head" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="l2t-kicker">Beta rapor merkezi</p>
          <h1 style={{ color: "var(--l2t-navy)", marginBottom: "8px" }}>Affiliate ve Moderasyon Raporları</h1>
          <p style={{ color: "var(--l2t-soft)", maxWidth: "760px" }}>
            Son 7 günde affiliate yönlendirmeleri, kaynak sayfalar ve moderasyon kayıtlarını takip et. Bu ekran SQL migration çalıştıysa otomatik veri göstermeye başlar.
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
        <article className="l2t-card" style={{ border: "1px solid #e2e8f0" }}>
          <div className="l2t-card-icon" style={{ background: "#EEF7FF", color: "#1476F2" }}><MousePointerClick size={24} /></div>
          <h3>Affiliate tıklamaları</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "var(--l2t-navy)", margin: "8px 0" }}>{clicks.length}</p>
          <span style={{ color: "var(--l2t-soft)" }}>Son 7 gün</span>
        </article>

        <article className="l2t-card" style={{ border: "1px solid #e2e8f0" }}>
          <div className="l2t-card-icon" style={{ background: "#F0FFF4", color: "#10B981" }}><BarChart3 size={24} /></div>
          <h3>En çok yönlenen partner</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "var(--l2t-navy)", margin: "8px 0", textTransform: "capitalize" }}>{providerStats[0]?.[0] || "Veri yok"}</p>
          <span style={{ color: "var(--l2t-soft)" }}>{providerStats[0]?.[1] || 0} tıklama</span>
        </article>

        <article className="l2t-card" style={{ border: "1px solid #e2e8f0" }}>
          <div className="l2t-card-icon" style={{ background: "#FFF5E6", color: "#F59E0B" }}><ShieldCheck size={24} /></div>
          <h3>Moderasyon işlemleri</h3>
          <p style={{ fontSize: "2rem", fontWeight: 900, color: "var(--l2t-navy)", margin: "8px 0" }}>{moderationLogs.length}</p>
          <span style={{ color: "var(--l2t-soft)" }}>Son 7 gün kayıtları</span>
        </article>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        <section className="l2t-card" style={{ border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Partner dağılımı</h2>
          {providerStats.length ? providerStats.map(([provider, count]) => (
            <div key={provider} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", padding: "10px 0", textTransform: "capitalize" }}>
              <span>{provider}</span><strong>{count}</strong>
            </div>
          )) : <p style={{ color: "var(--l2t-soft)" }}>Henüz tıklama yok.</p>}
        </section>

        <section className="l2t-card" style={{ border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Popüler destinasyonlar</h2>
          {topDestinations.length ? topDestinations.map(([destination, count]) => (
            <div key={destination} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
              <span>{destination}</span><strong>{count}</strong>
            </div>
          )) : <p style={{ color: "var(--l2t-soft)" }}>Veri geldikçe burada görünecek.</p>}
        </section>

        <section className="l2t-card" style={{ border: "1px solid #e2e8f0" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Kaynak sayfalar</h2>
          {sourceStats.length ? sourceStats.map(([source, count]) => (
            <div key={source} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
              <span style={{ overflowWrap: "anywhere" }}>{source}</span><strong>{count}</strong>
            </div>
          )) : <p style={{ color: "var(--l2t-soft)" }}>Tıklamalar başladığında kaynaklar listelenir.</p>}
        </section>
      </div>

      <section className="l2t-card" style={{ border: "1px solid #e2e8f0", marginTop: "20px" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "16px" }}>Son moderasyon kayıtları</h2>
        {moderationLogs.length ? moderationLogs.map((log, index) => (
          <div key={`${log.created_at}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", borderBottom: "1px solid #f1f5f9", padding: "12px 0" }}>
            <strong>{log.action}</strong>
            <span>{log.target_type}</span>
            <span style={{ color: "var(--l2t-soft)" }}>{new Date(log.created_at).toLocaleDateString("tr-TR")}</span>
          </div>
        )) : <p style={{ color: "var(--l2t-soft)" }}>Henüz moderasyon kaydı yok.</p>}
      </section>
    </div>
  );
}
