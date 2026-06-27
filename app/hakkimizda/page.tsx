import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Sparkles, Globe, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Hakkımızda",
  description: "LetsGo2Travel, Türk gezginlere yönelik modern bir seyahat asistanı. Vizesiz rotalar, ucuz uçak bileti ve seyahat rehberi tek platformda.",
};

export default function HakkimizdaPage() {
  return (
    <div className="l2t-page" style={{ paddingBottom: "80px" }}>
      <div style={{ background: "linear-gradient(135deg, #06183A, #0A2A5C)", padding: "60px 0", marginBottom: "40px" }}>
        <div className="l2t-wrap" style={{ maxWidth: "780px", textAlign: "center" }}>
          <span style={{ fontSize: "3rem" }}>✈️</span>
          <h1 style={{ color: "#fff", fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: "800", margin: "16px 0 12px" }}>Hakkımızda</h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "1.15rem", lineHeight: 1.7 }}>LetsGo2Travel — Istanbul to ✈️ World</p>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "780px" }}>
        <div style={{ background: "#fff", borderRadius: "20px", padding: "36px", border: "1px solid #e2e8f0", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)", fontWeight: "800", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}><Globe size={24} color="var(--l2t-blue)" /> Biz Kimiz?</h2>
          <p style={{ color: "var(--l2t-soft)", lineHeight: 1.8, fontSize: "1.05rem" }}>
            LetsGo2Travel, Türk vatandaşlarının yurt dışı seyahat planlamalarını kolaylaştırmak amacıyla geliştirilmiş modern bir seyahat bilgi platformudur.
            Ucuz uçak bileti aramadan vizesiz ülke kılavuzlarına, otel önerilerinden yapay zeka destekli rota planlamasına kadar geniş bir içerik yelpazesi sunuyoruz.
          </p>
          <p style={{ color: "var(--l2t-soft)", lineHeight: 1.8, fontSize: "1.05rem", marginTop: "16px" }}>
            Amacımız, seyahat yapmak isteyen herkese güvenilir, güncel ve kullanışkolay bilgi sağlamak. Vize süreçlerinden bütçe planlamaya, destinasyon keşfetmekten uygun uçuş bulmaya kadar her aşamada yanınızdayız.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "32px" }}>
          {[
            { icon: <Plane size={24} color="var(--l2t-blue)" />, title: "Uçak Bileti", text: "Yüzlerce havayolu ve partner fiyatını karşılaştır, en uygun fırsatı bul." },
            { icon: <Globe size={24} color="#10B981" />, title: "Vizesiz Rotalar", text: "Türk pasaportuyla kolayca gidilebilen destinasyonlar." },
            { icon: <Sparkles size={24} color="#F59E0B" />, title: "AI Asistan", text: "Bütçene uygun rotayı saniyeler içinde planla." },
            { icon: <Shield size={24} color="#8B5CF6" />, title: "Güvenilir Bilgi", text: "Vize ve giriş bilgileri düzenli güncellenir." },
          ].map((item, i) => (
            <div key={i} style={{ background: "#f8fafc", borderRadius: "16px", padding: "24px", border: "1px solid #e2e8f0" }}>
              <div style={{ marginBottom: "12px" }}>{item.icon}</div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: "700", color: "var(--l2t-navy)", marginBottom: "8px" }}>{item.title}</h3>
              <p style={{ fontSize: "0.9rem", color: "var(--l2t-soft)", lineHeight: 1.6, margin: 0 }}>{item.text}</p>
            </div>
          ))}
        </div>

        <div style={{ background: "#FFF7ED", borderRadius: "16px", padding: "24px", border: "1px solid #FED7AA", marginBottom: "32px" }}>
          <h3 style={{ color: "#92400E", fontWeight: "700", marginBottom: "12px" }}>🔗 Affiliate Bilgisi</h3>
          <p style={{ color: "#92400E", fontSize: "0.9rem", lineHeight: 1.7, margin: 0 }}>
            LetsGo2Travel, bazı bağlantılardan (uçak bileti, otel, eSIM, tur vb.) ortak satış komisyonu kazanabilir.
            Bu durum, kullanıcıya herhangi bir ek maliyet oluşturmaz. Platformdaki içerikler tarafsız ve bilgilendirme amaçlıdır.
            Sunulan fiyat ve vize bilgileri dönemsel değişebilir; her zaman resmi kaynaklardan doğrulama yapılması önerilir.
          </p>
        </div>

        <div style={{ textAlign: "center" }}>
          <Link href="/" className="l2t-btn" style={{ marginRight: "12px", display: "inline-flex" }}>Ana Sayfaya Dön</Link>
          <Link href="/vizesiz-ulkeler" className="l2t-btn l2t-btn-outline" style={{ display: "inline-flex" }}>Vizesiz Ülkeleri Gör</Link>
        </div>
      </div>
    </div>
  );
}
