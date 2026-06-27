import Link from "next/link";
import { ArrowLeft, MessageSquare, PenTool, MapPin, Users } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return {
    title: `${resolvedParams.slug.replace(/-/g, ' ').toUpperCase()} | Forum & Kullanıcı Deneyimleri`,
    description: `${resolvedParams.slug} hakkında gezginlerin soruları ve deneyimleri.`,
  };
}

export default async function CountryForumPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;
  const countryName = slug.charAt(0).toUpperCase() + slug.slice(1);

  // Dummy topics for specific country
  const countryTopics = [
    { id: "102", title: `${countryName} sınır kapısında yaşadığım sorun ve çözümüm`, category: "Ülke Bazlı Sorunlar", replies: 4, author: "EmreT", date: "5 saat önce" },
    { id: "105", title: `${countryName} için en iyi ve uygun fiyatlı eSIM hangisi?`, category: "eSIM & İnternet", replies: 1, author: "GezginYolcu", date: "1 gün önce" },
  ];

  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px" }}>
      
      {/* Hero */}
      <div style={{ background: "var(--l2t-navy)", padding: "40px 20px", color: "#fff", textAlign: "center" }}>
        <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <Link href="/forum" style={{ color: "rgba(255,255,255,0.7)", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "16px", fontSize: "0.95rem" }}>
            <ArrowLeft size={16} /> Tüm Foruma Dön
          </Link>
          <h1 style={{ fontSize: "2rem", fontWeight: "800", margin: "0 0 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
            <MapPin size={28} color="#10B981" /> {countryName} Topluluğu
          </h1>
          <p style={{ fontSize: "1.05rem", color: "rgba(255,255,255,0.8)", margin: "0 auto 24px", maxWidth: "600px", lineHeight: "1.6" }}>
            {countryName} seyahatiniz için diğer kullanıcıların deneyimlerini okuyun veya kendi sorunuzu sorun.
          </p>
          <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            <Link href="/forum/yeni" className="l2t-btn" style={{ background: "#10B981", color: "#fff", padding: "12px 24px", fontSize: "1rem", borderRadius: "100px", display: "inline-flex", alignItems: "center", gap: "8px", border: "none", boxShadow: "0 10px 20px rgba(16,185,129,0.2)" }}>
              <PenTool size={18} /> {countryName} Hakkında Soru Sor
            </Link>
            <Link href={`/rehber-merkezi/ulke/${slug}`} className="l2t-btn l2t-btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: "100px", padding: "12px 24px" }}>
              Rehberlere Göz At
            </Link>
          </div>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "40px auto 0", padding: "0 20px" }}>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {countryTopics.map((topic) => (
            <Link key={topic.id} href={`/forum/${topic.id}`} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0", transition: "all 0.2s" }} className="hover-tilt">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                  <div>
                    <h3 style={{ margin: "0 0 8px", color: "var(--l2t-navy)", fontSize: "1.15rem", fontWeight: "700", lineHeight: "1.4" }}>
                      {topic.title}
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "0.85rem", color: "#64748B" }}>
                      <span style={{ background: "#F1F5F9", padding: "4px 10px", borderRadius: "100px", color: "#475569", fontWeight: "600" }}>{topic.category}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Users size={14} /> {topic.author}</span>
                      <span>{topic.date}</span>
                    </div>
                  </div>
                  <div style={{ background: "#EFF6FF", color: "var(--l2t-blue)", padding: "8px 16px", borderRadius: "12px", display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: "800" }}>{topic.replies}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: "600" }}>Cevap</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {countryTopics.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", background: "#fff", borderRadius: "16px", color: "#64748B" }}>
              Bu ülke için henüz konu açılmamış. İlk soran siz olun!
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
