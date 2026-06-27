import Link from "next/link";
import { BookOpen, ShieldCheck, MapPin, Tent, Fish, Crosshair, AlertTriangle, Phone, Search } from "lucide-react";

export const metadata = {
  title: "Rehber Merkezi | Letsgo2Travel",
  description: "Vize, güvenlik, kamp, balıkçılık, avcılık ve yurt dışı seyahat rehberi.",
};

const guideCategories = [
  { id: "konsolosluk-vize", name: "Konsolosluk & Vize Bilgileri", icon: <BookOpen size={24} />, desc: "Ülkelere göre vize süreçleri ve notlar.", color: "#3B82F6", bg: "#EFF6FF" },
  { id: "seyahat-sigortasi", name: "Seyahat Sigortası", icon: <ShieldCheck size={24} />, desc: "Sağlık ve kaza teminatları bilgilendirmesi.", color: "#10B981", bg: "#ECFDF5" },
  { id: "gezilecek-yerler", name: "Gezilecek Yerler", icon: <MapPin size={24} />, desc: "Popüler şehirler, ücretsiz yerler ve rotalar.", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "guvenli-bolgeler", name: "Güvenli Bölgeler", icon: <AlertTriangle size={24} />, desc: "Güvenlik uyarıları ve uzak durulması gerekenler.", color: "#EF4444", bg: "#FEF2F2" },
  { id: "kamp-doga", name: "Kamp & Doğa Rehberi", icon: <Tent size={24} />, desc: "Kamp kuralları, izinler ve ekipman listeleri.", color: "#059669", bg: "#ECFDF5" },
  { id: "balikcilar-icin-bilgiler", name: "Balıkçılar İçin Bilgiler", icon: <Fish size={24} />, desc: "Amatör balıkçılık kuralları ve limitleri.", color: "#0EA5E9", bg: "#F0F9FF" },
  { id: "avcilar-icin-yasal-bilgilendirme", name: "Avcılar İçin Yasal Bilgilendirme", icon: <Crosshair size={24} />, desc: "Yasal izin süreçleri ve koruma altındaki türler.", color: "#78350F", bg: "#FEF3C7" },
  { id: "acil-durum-faydali-numaralar", name: "Acil Durum & Faydalı Numaralar", icon: <Phone size={24} />, desc: "Pasaport kaybı ve konsolosluk iletişim bilgileri.", color: "#6366F1", bg: "#EEF2FF" },
  { id: "ulke-bazli-sorunlar", name: "Ülke Bazlı Sorunlar", icon: <MapPin size={24} />, desc: "Ülkeye giriş sorunları ve sınır kapısı deneyimleri.", color: "#8B5CF6", bg: "#F5F3FF" },
];

export default function GuideCenterPage() {
  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", padding: "60px 20px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Başlık Alanı */}
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <h1 style={{ fontSize: "2.5rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px" }}>Rehber Merkezi</h1>
          <p style={{ fontSize: "1.1rem", color: "var(--l2t-soft)", maxWidth: "600px", margin: "0 auto 32px", lineHeight: "1.6" }}>
            Vize, güvenlik, kamp, balıkçılık, avcılık ve daha fazlası. Seyahatinizi planlarken ihtiyacınız olan tüm temel bilgilendirmeler burada.
          </p>

          {/* Ülke Arama Kutusu */}
          <div style={{ position: "relative", maxWidth: "500px", margin: "0 auto" }}>
            <div style={{ position: "absolute", left: "20px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>
              <Search size={22} />
            </div>
            <input 
              type="text" 
              placeholder="Ülke veya şehir ara... (Örn: Almanya, Paris)"
              style={{
                width: "100%", padding: "18px 20px 18px 56px", fontSize: "1.05rem", borderRadius: "100px",
                border: "1px solid #e2e8f0", outline: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                transition: "all 0.2s", color: "var(--l2t-navy)"
              }}
            />
          </div>
        </div>

        {/* Kategori Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px", marginBottom: "64px" }}>
          {guideCategories.map((cat) => (
            <Link key={cat.id} href={`/rehber-merkezi/kategori/${cat.id}`} style={{ textDecoration: "none" }}>
              <div style={{ 
                background: "#fff", padding: "32px 24px", borderRadius: "24px", 
                boxShadow: "0 10px 30px rgba(0,0,0,0.04)", border: "1px solid #f1f5f9", 
                transition: "all 0.3s", cursor: "pointer", display: "flex", flexDirection: "column", gap: "16px"
              }} className="hover-tilt"
              >
                <div style={{ width: "60px", height: "60px", background: cat.bg, color: cat.color, borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {cat.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", fontWeight: "700", margin: "0 0 8px" }}>{cat.name}</h3>
                  <p style={{ margin: 0, color: "var(--l2t-soft)", fontSize: "0.95rem", lineHeight: "1.5" }}>{cat.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Alt Bölümler */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "32px", marginBottom: "64px" }}>
          
          {/* Popüler Rehberler */}
          <div style={{ background: "#fff", padding: "32px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.03)", border: "1px solid #f1f5f9" }}>
            <h2 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "20px" }}>Popüler Rehberler</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
              <li><Link href="/rehber-merkezi/kategori/seyahat-sigortasi" style={{ color: "var(--l2t-blue)", textDecoration: "none", fontWeight: "600" }}>Schengen için uygun seyahat sigortası seçimi &rarr;</Link></li>
              <li><Link href="/rehber-merkezi/kategori/konsolosluk-vize" style={{ color: "var(--l2t-blue)", textDecoration: "none", fontWeight: "600" }}>Vize başvurusunda dikkat edilecek en önemli 5 hata &rarr;</Link></li>
              <li><Link href="/rehber-merkezi/kategori/guvenli-bolgeler" style={{ color: "var(--l2t-blue)", textDecoration: "none", fontWeight: "600" }}>Avrupa'da dikkat edilmesi gereken güvenlik riskleri &rarr;</Link></li>
            </ul>
          </div>

          {/* İlk Kez Çıkacaklar İçin */}
          <div style={{ background: "linear-gradient(135deg, #10B981, #059669)", padding: "32px", borderRadius: "24px", color: "#fff", boxShadow: "0 10px 40px rgba(16,185,129,0.2)" }}>
            <h2 style={{ fontSize: "1.3rem", fontWeight: "800", marginBottom: "16px" }}>İlk Kez Yurt Dışına Mı Çıkacaksın?</h2>
            <p style={{ margin: "0 0 24px", lineHeight: "1.6", color: "rgba(255,255,255,0.9)" }}>Vize sürecinden uçak biletine, valiz hazırlığından havalimanı kurallarına kadar her şeyi adım adım anlattığımız başlangıç rehberi.</p>
            <Link href="/rehber-merkezi/kategori/konsolosluk-vize" className="l2t-btn" style={{ background: "#fff", color: "#059669", border: "none" }}>
              Hızlı Başlangıç Rehberi
            </Link>
          </div>

        </div>

        {/* Forum & Arama & CTAs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "32px", marginBottom: "64px" }}>
          
          <div style={{ background: "#F8FAFC", padding: "32px", borderRadius: "24px", border: "1px solid #e2e8f0" }}>
            <h2 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "16px" }}>Forumdan Son Deneyimler</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <li style={{ color: "#475569", fontSize: "0.95rem" }}>"Kosova sınır kapısında dönüş bileti sordular..."</li>
              <li style={{ color: "#475569", fontSize: "0.95rem" }}>"Almanya randevuları hakkında güncel bilgi!"</li>
              <li style={{ color: "#475569", fontSize: "0.95rem" }}>"Dubai'de uygun fiyatlı eSIM önerileri."</li>
            </ul>
            <Link href="/forum/yeni" className="l2t-btn l2t-btn-outline" style={{ display: "inline-block" }}>
              Soru Sor / Konu Aç
            </Link>
          </div>

          <div style={{ background: "linear-gradient(135deg, #1E293B, #0F172A)", padding: "32px", borderRadius: "24px", color: "#fff", boxShadow: "0 10px 40px rgba(15,23,42,0.3)" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "800", marginBottom: "16px" }}>En Çok Aranan Ülkeler</h2>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
              {["Almanya", "İtalya", "Sırbistan", "Karadağ", "Yunanistan", "Mısır"].map(c => (
                <span key={c} style={{ background: "rgba(255,255,255,0.1)", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem" }}>{c}</span>
              ))}
            </div>
            <Link href="/ucak-bileti-ara" className="l2t-btn" style={{ background: "var(--l2t-blue)", color: "#fff", border: "none" }}>
              Uçak Bileti Ara
            </Link>
          </div>

        </div>

        {/* AI CTA */}
        <div style={{ marginBottom: "64px", padding: "32px", background: "linear-gradient(135deg, #1476f2, #0b5bce)", borderRadius: "24px", color: "#fff", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "24px", boxShadow: "0 10px 30px rgba(20,118,242,0.2)" }}>
          <div style={{ flex: "1 1 300px" }}>
            <h2 style={{ fontSize: "1.5rem", color: "#fff", fontWeight: "800", marginBottom: "8px" }}>Nereye Gideceğini Hala Bilmiyor Musun?</h2>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "1.05rem", margin: 0 }}>Vize gereksinimlerini ve bütçeni seç, yapay zeka senin için saniyeler içinde mükemmel bir rota çıkarsın.</p>
          </div>
          <Link href="/akilli-plan" className="l2t-btn" style={{ background: "#F59E0B", color: "var(--l2t-navy)", border: "none", boxShadow: "0 4px 15px rgba(245,158,11,0.4)" }}>
            Yapay Zeka ile Planla
          </Link>
        </div>

        {/* Uyarı Alanı */}
        <div style={{ background: "#F1F5F9", borderRadius: "16px", padding: "24px", display: "flex", gap: "16px" }}>
          <ShieldCheck size={28} color="#64748B" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ margin: "0 0 8px", color: "#334155", fontWeight: "700", fontSize: "1.05rem" }}>Önemli Bilgilendirme</h4>
            <p style={{ margin: 0, color: "#475569", fontSize: "0.95rem", lineHeight: "1.6" }}>
              Bu merkezde sunulan içerikler yalnızca <strong>bilgilendirme amaçlıdır</strong>. Kurallar ülkeden ülkeye değişiklik gösterebilir. Lütfen seyahate çıkmadan önce veya faaliyet göstermeden önce ilgili resmi kurumların (konsolosluklar, doğa koruma müdürlükleri vb.) güncel kaynaklarını kontrol ediniz.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
