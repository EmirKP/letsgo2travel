import Link from "next/link";
import { MessageSquare, MapPin, Search, ChevronRight, PenTool, Flame, Users, AlertCircle, CheckSquare, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Forum & Topluluk | Letsgo2Travel",
  description: "Gezginlerle soru-cevap, ülke sorunları, vize deneyimleri.",
};

const forumCategories = [
  { name: "Genel Seyahat Soruları", slug: "genel-seyahat-sorulari" },
  { name: "Ülke Bazlı Sorunlar", slug: "ulke-bazli-sorunlar" },
  { name: "Vize & Konsolosluk", slug: "vize-konsolosluk" },
  { name: "Uçak Bileti & Havalimanı", slug: "ucak-bileti-havalimani" },
  { name: "Otel & Konaklama", slug: "otel-konaklama" },
  { name: "eSIM & İnternet", slug: "esim-internet" },
  { name: "İlk Kez Yurt Dışına Çıkacaklar", slug: "ilk-kez-yurt-disina-cikacaklar" },
  { name: "Kamp & Doğa", slug: "kamp-doga" },
  { name: "Balıkçılık", slug: "balikcilik" },
  { name: "Avcılık", slug: "avcilik" }
];

import { supabase } from "@/lib/supabase-client";

export const dynamic = "force-dynamic";

export default async function ForumPage(props: { searchParams: Promise<{ kategori?: string }> }) {
  const searchParams = await props.searchParams;
  const currentCategorySlug = searchParams?.kategori || "";

  const currentCategoryName = forumCategories.find(c => c.slug === currentCategorySlug)?.name;

  // Fetch from Supabase
  let query = supabase
    .from("forum_topics")
    .select("id, title, category, country_slug, author_name, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  if (currentCategoryName) {
    query = query.eq("category", currentCategoryName);
  }

  const { data: dbTopics, error } = await query;
  const filteredTopics = dbTopics || [];

  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px" }}>
      
      {/* Hero */}
      <div style={{ background: "var(--l2t-navy)", padding: "60px 20px 40px", color: "#fff", textAlign: "center" }}>
        <div className="l2t-wrap" style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: "800", margin: "0 0 16px" }}>Gezgin Topluluğu</h1>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.8)", margin: "0 auto 32px", maxWidth: "600px", lineHeight: "1.6" }}>
            Deneyimlerinizi paylaşın, sorular sorun ve diğer gezginlerin gerçek sorun çözümlerini inceleyin.
          </p>

          <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/forum/yeni" className="l2t-btn" style={{ background: "#10B981", color: "#fff", padding: "16px 32px", fontSize: "1.05rem", borderRadius: "100px", display: "inline-flex", alignItems: "center", gap: "12px", border: "none", boxShadow: "0 10px 20px rgba(16,185,129,0.3)" }}>
              <PenTool size={20} /> Konu Aç / Soru Sor
            </Link>
          </div>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "1200px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10, display: "grid", gridTemplateColumns: "1fr 300px", gap: "32px", alignItems: "start" }}>
        
        {/* Sol Kolon - Konular */}
        <div style={{ width: "100%" }}>
          {/* Ülke Arama */}
          <div style={{ background: "#fff", padding: "20px", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.05)", marginBottom: "32px", display: "flex", gap: "16px", alignItems: "center" }}>
            <Search size={22} color="#94a3b8" />
            <input type="text" placeholder="Ülke ara: Almanya, Dubai, Kosova..." style={{ width: "100%", border: "none", outline: "none", fontSize: "1.05rem", color: "var(--l2t-navy)" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "1.4rem", color: "var(--l2t-navy)", fontWeight: "700", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              {currentCategorySlug ? (
                <>
                  <MessageSquare size={20} color="var(--l2t-blue)" /> {currentCategoryName}
                </>
              ) : (
                <>
                  <Flame size={20} color="#F59E0B" /> Son Konular
                </>
              )}
            </h2>
            {currentCategorySlug && (
              <Link href="/forum" style={{ fontSize: "0.9rem", color: "var(--l2t-blue)", fontWeight: "600", textDecoration: "none" }}>
                Tümünü Gör
              </Link>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {filteredTopics.length > 0 ? (
              filteredTopics.map((topic) => (
                <Link key={topic.id} href={`/forum/${topic.id}`} style={{ textDecoration: "none", display: "block", position: "relative", zIndex: 20 }}>
                  <div style={{ background: "#fff", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0", transition: "all 0.2s" }} className="hover-tilt">
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                      <div>
                        <h3 style={{ margin: "0 0 8px", color: "var(--l2t-navy)", fontSize: "1.15rem", fontWeight: "700", lineHeight: "1.4" }}>
                          {topic.title}
                        </h3>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "0.85rem", color: "#64748B" }}>
                          <span style={{ background: "#F1F5F9", padding: "4px 10px", borderRadius: "100px", color: "#475569", fontWeight: "600" }}>{topic.category}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={14} /> {topic.country_slug || "Genel"}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Users size={14} /> {topic.author_name || "Gizli Kullanıcı"}</span>
                          <span>{new Date(topic.created_at).toLocaleDateString("tr-TR", { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                      <div className="l2t-hide-mobile" style={{ background: "#EFF6FF", color: "var(--l2t-blue)", padding: "12px 16px", borderRadius: "12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <MessageSquare size={20} style={{ marginBottom: "4px" }} />
                        <span style={{ fontSize: "0.75rem", fontWeight: "600" }}>İncele</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <>
                {!currentCategorySlug && (
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                      <Flame size={20} color="#F59E0B" />
                      <h3 style={{ fontSize: "1.15rem", color: "var(--l2t-navy)", margin: 0, fontWeight: "700" }}>Soru Başlatıcı Şablonlar</h3>
                    </div>
                    <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", marginBottom: "16px" }}>Aşağıdaki şablonlardan birine tıklayarak hemen sorunuzu sorabilirsiniz:</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "12px" }}>
                      {[
                        { title: "Kosova'ya girişte dönüş bileti soruyorlar mı?", cat: "Vize & Konsolosluk", catSlug: "vize-konsolosluk" },
                        { title: "Dubai'de eSIM mi roaming mi mantıklı?", cat: "eSIM & İnternet", catSlug: "esim-internet" },
                        { title: "İlk kez yurt dışına çıkarken pasaport kontrolünde ne sorulur?", cat: "İlk Kez Yurt Dışına Çıkacaklar", catSlug: "ilk-kez-yurt-disina-cikacaklar" },
                        { title: "Sırbistan mı Bosna mı daha uygun fiyatlı?", cat: "Ülke Bazlı Sorunlar", catSlug: "ulke-bazli-sorunlar" }
                      ].map((mock, i) => (
                        <Link 
                          key={i} 
                          href={`/forum/yeni?title=${encodeURIComponent(mock.title)}&kategori=${mock.catSlug}`}
                          style={{ background: "#fff", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", textDecoration: "none", transition: "all 0.2s", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", zIndex: 20 }}
                          className="hover-tilt"
                        >
                          <h4 style={{ margin: "0 0 12px", color: "var(--l2t-blue)", fontSize: "1rem", fontWeight: "600", lineHeight: "1.4" }}>{mock.title}</h4>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "#64748B", fontWeight: "600" }}>
                            <span style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px" }}>{mock.cat}</span>
                            <ArrowRight size={14} style={{ marginLeft: "auto" }} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ background: "#fff", padding: "60px 20px", borderRadius: "16px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                  <CheckSquare size={48} color="#cbd5e1" style={{ margin: "0 auto 16px" }} />
                  <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", marginBottom: "8px" }}>Bu kategoride henüz konu yok.</h3>
                  <p style={{ color: "var(--l2t-soft)", marginBottom: "24px" }}>İlk soruyu soran veya deneyimini paylaşan sen ol!</p>
                  <Link href={`/forum/yeni?kategori=${currentCategorySlug}`} className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", padding: "12px 24px", borderRadius: "100px", textDecoration: "none", display: "inline-flex", fontWeight: "600", position: "relative", zIndex: 20 }}>
                    Bu Kategoride Konu Aç
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sağ Kolon - Kategoriler & Kurallar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div style={{ background: "#fff", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ fontSize: "1.1rem", color: "var(--l2t-navy)", fontWeight: "700", margin: "0 0 16px" }}>Kategoriler</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {forumCategories.map((cat) => {
                const isActive = currentCategorySlug === cat.slug;
                return (
                  <Link 
                    key={cat.slug} 
                    href={`/forum?kategori=${cat.slug}`}
                    style={{ 
                      padding: "12px 16px", 
                      borderRadius: "8px", 
                      color: isActive ? "var(--l2t-blue)" : "#475569", 
                      fontSize: "0.95rem", 
                      fontWeight: isActive ? "700" : "500",
                      background: isActive ? "#EFF6FF" : "transparent",
                      textDecoration: "none", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between",
                      position: "relative",
                      zIndex: 2
                    }} 
                    className="hover-bg-slate"
                  >
                    {cat.name}
                    <ChevronRight size={16} color={isActive ? "var(--l2t-blue)" : "#cbd5e1"} />
                  </Link>
                );
              })}
            </div>
          </div>

          <div style={{ background: "#FFFBEB", border: "1px solid #FEF08A", padding: "24px", borderRadius: "16px" }}>
            <h3 style={{ fontSize: "1.1rem", color: "#92400E", fontWeight: "700", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={20} /> Kurallar
            </h3>
            <p style={{ margin: "0 0 16px", color: "#B45309", fontSize: "0.9rem", lineHeight: "1.6" }}>
              Forumda paylaşılan içerikler kullanıcı deneyimidir. Resmi işlemler için ilgili kurumların güncel duyurularını kontrol edin.
            </p>
            <Link href="/topluluk-kurallari" style={{ color: "#92400E", fontWeight: "700", fontSize: "0.9rem", textDecoration: "none", position: "relative", zIndex: 2 }}>
              Tüm kuralları oku &rarr;
            </Link>
          </div>

        </div>

      </div>

      {/* Global Style overrides for hover states specific to this page if needed, otherwise rely on existing l2t- CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        .hover-bg-slate:hover { background: #F1F5F9 !important; color: var(--l2t-navy) !important; }
        .hover-tilt:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
      `}} />
    </div>
  );
}
