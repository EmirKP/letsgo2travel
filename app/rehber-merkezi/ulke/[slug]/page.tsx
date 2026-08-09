import Link from "next/link";
import { ArrowLeft, BookOpen, ShieldCheck, MapPin, Plane } from "lucide-react";
import { getCountryBySlug } from "@/lib/countries/countryData";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const countryName = getCountryBySlug(resolvedParams.slug)?.nameTR || resolvedParams.slug.charAt(0).toLocaleUpperCase("tr-TR") + resolvedParams.slug.slice(1);
  return {
    title: `${countryName} Rehberi | Letsgo2Travel`,
    description: `${countryName} seyahati için vize, güvenlik, gezilecek yerler ve pratik bilgiler.`,
  };
}

export default async function CountryGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;
  const countryName = getCountryBySlug(slug)?.nameTR || slug.charAt(0).toLocaleUpperCase("tr-TR") + slug.slice(1);

  const guideTemplates = [
    { id: 1, title: `${countryName} vize ve giriş koşullarını doğrulama rehberi`, category: "Vize ve giriş kontrolü", icon: <BookOpen size={20} color="#3B82F6" />, bg: "#EFF6FF" },
    { id: 2, title: `${countryName} seyahati için güvenlik kontrol listesi`, category: "Güvenli seyahat", icon: <ShieldCheck size={20} color="#EF4444" />, bg: "#FEF2F2" },
    { id: 3, title: `${countryName} gezi planı hazırlama rehberi`, category: "Rota planlama", icon: <MapPin size={20} color="#F59E0B" />, bg: "#FFFBEB" }
  ];

  return (
    <div className="l2t-page" style={{ minHeight: "80vh", background: "#f8fafc", paddingBottom: "80px" }}>
      {/* Hero Alanı */}
      <div style={{ background: "var(--l2t-navy)", padding: "60px 20px 40px", color: "#fff", textAlign: "center" }}>
        <div className="l2t-wrap" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <Link href="/rehber-merkezi" style={{ color: "rgba(255,255,255,0.7)", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "24px" }}>
            <ArrowLeft size={18} /> Rehber Merkezi'ne Dön
          </Link>
          <h1 style={{ fontSize: "2.5rem", fontWeight: "800", margin: "0 0 16px" }}>{countryName} Seyahat Rehberi</h1>
          <p style={{ fontSize: "1.1rem", color: "rgba(255,255,255,0.8)", margin: "0 0 32px", lineHeight: "1.6" }}>
            Vize kontrolü, güvenlik hazırlığı ve rota planlamasıyla {countryName} seyahatinizi daha bilinçli hazırlayın.
          </p>
          
          <Link href={`/ucak-bileti-ara?to=${encodeURIComponent(countryName)}`} className="l2t-btn" style={{ background: "#10B981", color: "#fff", padding: "16px 32px", fontSize: "1.1rem", borderRadius: "100px", display: "inline-flex", alignItems: "center", gap: "12px", border: "none", boxShadow: "0 10px 20px rgba(16,185,129,0.3)" }}>
            <Plane size={22} /> {countryName} İçin Uçak Bileti Ara
          </Link>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "1000px", margin: "-30px auto 0", padding: "0 20px", position: "relative", zIndex: 10 }}>
        
        <div style={{ background: "#fff", padding: "20px 24px", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.05)", marginBottom: "40px", color: "#475569", lineHeight: 1.6 }}>
          Aşağıdaki içerikler genel kontrol listeleridir. Ülkeye giriş, güvenlik ve rezervasyon koşullarını seyahat tarihine yakın resmî kaynaklardan yeniden doğrulayın.
        </div>

        {/* Rehber İçerikleri */}
        <h2 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)", fontWeight: "700", marginBottom: "24px" }}>Popüler Rehberler</h2>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "48px" }}>
          {guideTemplates.map((guide) => (
            <Link key={guide.id} href={`/rehber-merkezi/${slug}-rehber-${guide.id}`} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", padding: "24px", borderRadius: "16px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "20px", transition: "all 0.2s" }} className="hover-tilt">
                <div style={{ width: "50px", height: "50px", background: guide.bg, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {guide.icon}
                </div>
                <div>
                  <span style={{ fontSize: "0.85rem", color: "#64748B", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>{guide.category}</span>
                  <h3 style={{ margin: "4px 0 0", color: "var(--l2t-navy)", fontSize: "1.1rem", fontWeight: "700" }}>{guide.title}</h3>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* İlgili Forum Konuları */}
        <div style={{ background: "rgba(20, 118, 242, 0.05)", padding: "32px", borderRadius: "24px", border: "1px solid rgba(20, 118, 242, 0.1)" }}>
          <h2 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", fontWeight: "700", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", background: "var(--l2t-blue)", borderRadius: "50%" }}></span>
            Kullanıcı Deneyimleri ve Forum
          </h2>
          <p style={{ color: "var(--l2t-soft)", marginBottom: "24px", lineHeight: "1.6" }}>
            {countryName} hakkında diğer gezginlerin sorduğu soruları, vize ve sınır kapısı deneyimlerini forumda inceleyin.
          </p>
          <Link href={`/forum/ulke/${slug}`} className="l2t-btn l2t-btn-outline" style={{ display: "inline-block" }}>
            {countryName} Forumuna Git
          </Link>
        </div>

      </div>
    </div>
  );
}
