import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Hotel, Wifi, MapPin, Clock, Wallet, Globe, Info, AlertTriangle, Calendar, Users } from "lucide-react";
import { siteSettings, withUtm } from "@/lib/affiliate";
import { formatFromPrice, PRICE_NOTE } from "@/lib/prices";

export const metadata: Metadata = {
  title: "BAE (Dubai / Abu Dabi) Seyahat Rehberi 2024",
  description: "Türk vatandaşları için BAE, Dubai ve Abu Dabi seyahat rehberi. Vize durumu, gezi ipuçları, bütçe ve hâtikle bilgileri.",
};

export default function BAESayfasi() {
  return (
    <div className="l2t-page" style={{ paddingBottom: "80px" }}>
      {/* Hero */}
      <div style={{ position: "relative", height: "320px", overflow: "hidden", marginBottom: "32px" }}>
        <img
          src="/travel-images/route-dubai.jpg"
          alt="Dubai skyline"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(6,20,51,0.85), rgba(6,20,51,0.4))" }} />
        <div className="l2t-wrap" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "32px 20px" }}>
          <span style={{ fontSize: "2.5rem" }}>🇦🇪</span>
          <h1 style={{ color: "#fff", fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: "800", margin: "8px 0 4px" }}>Birleşik Arap Emirlikleri (BAE)</h1>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "1.1rem" }}>Dubai • Abu Dabi • Şarlö • Fuceyre</p>
        </div>
      </div>

      <div className="l2t-wrap" style={{ maxWidth: "900px" }}>

        {/* Vize Uyarı Banner */}
        <div style={{ background: "#FFF7ED", border: "2px solid #F97316", borderRadius: "16px", padding: "20px 24px", marginBottom: "32px", display: "flex", gap: "16px", alignItems: "flex-start" }}>
          <AlertTriangle size={24} color="#F97316" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <h2 style={{ fontSize: "1.1rem", color: "#9A3412", fontWeight: "800", margin: "0 0 8px" }}>Vize Bilgisi: Türkiye Pasaportu Sahipleri</h2>
            <p style={{ margin: "0 0 8px", color: "#7C2D12", fontSize: "0.95rem", lineHeight: 1.6 }}>
              <strong>Türk vatandaşları BAE'ye (Dubai dahil) vizesiz giremez.</strong> Bordo pasaport sahipleri için e-Vize (online vize) başvurusu gerekmektedir.
              Vize genellikle 30 günlüktür ve BAE Resmi Vize Portali üzerine başvurulabilir.
            </p>
            <p style={{ margin: 0, color: "#9A3412", fontSize: "0.85rem", fontWeight: "600" }}>
              ⚠️ Vize ve giriş kuralları değişebilir. Seyahatten önce resmi kaynaklardan kontrol edilmelidir.
            </p>
          </div>
        </div>

        {/* Hızlı Bilgi Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "32px" }}>
          {[
            { icon: <Globe size={20} />, label: "Başkent", value: "Abu Dabi" },
            { icon: <Wallet size={20} />, label: "Para Birimi", value: "AED (Dirhem)" },
            { icon: <Globe size={20} />, label: "Resmi Dil", value: "Arapça" },
            { icon: <Clock size={20} />, label: "Uçuş Süresi", value: "~4 saat" },
            { icon: <Calendar size={20} />, label: "En İyi Dönem", value: "Ekim – Nisan" },
            { icon: <Users size={20} />, label: "Vize Durumu", value: "e-Vize Gerekli" },
          ].map((item, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: "16px", padding: "16px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ color: "var(--l2t-blue)" }}>{item.icon}</div>
              <span style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: "600", textTransform: "uppercase" }}>{item.label}</span>
              <strong style={{ fontSize: "1rem", color: "var(--l2t-navy)" }}>{item.value}</strong>
            </div>
          ))}
        </div>

        {/* Bilet ve Fiyat */}
        <div style={{ background: "#EFF6FF", borderRadius: "16px", padding: "20px 24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.1rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 12px" }}>Tahmini Başlangıç Fiyatları</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div><span style={{ fontSize: "0.85rem", color: "#64748B" }}>Uçak Bileti</span><br /><strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)" }}>{formatFromPrice("dubai")}</strong></div>
            <div><span style={{ fontSize: "0.85rem", color: "#64748B" }}>Ortalama Otel (Gecelik)</span><br /><strong style={{ fontSize: "1.2rem", color: "var(--l2t-navy)" }}>4.000 TL+</strong></div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: "0.8rem", color: "#64748B" }}>{PRICE_NOTE}</p>
        </div>

        {/* Gezilecek Yerler */}
        <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", border: "1px solid #e2e8f0", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.3rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px" }}><MapPin size={20} color="var(--l2t-blue)" /> Gezilecek Yerler</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              "🗼 Burj Khalifa – Dünyanın en yüksek binaları arasında",
              "🏝️ Palm Jumeirah – Yapay ada ve lüks oteller",
              "🛍️ Dubai Mall – Dünyanın en büyük alışveriş merkezi",
              "🕌 Sheikh Zayed C.C. – Abu Dabi'de İslam mimarisinin şaheseri",
              "🏜️ Dubai Çölü – Safari turu ve kum tümı",
              "🚡 Dubai Frame – Kent ile devin katedralar arasında köprü",
              "🐬 Dubai Creek – Tarihî pazar (souk) ve abıa turu",
            ].map((place, i) => (
              <li key={i} style={{ fontSize: "0.95rem", color: "var(--l2t-soft)", paddingLeft: "8px", borderLeft: "3px solid var(--l2t-blue)", lineHeight: 1.5 }}>{place}</li>
            ))}
          </ul>
        </div>

        {/* Güvenlik ve Önemli Notlar */}
        <div style={{ background: "#FFFBEB", border: "1px solid #FEF08A", borderRadius: "16px", padding: "20px 24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.1rem", color: "#92400E", fontWeight: "800", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}><Info size={18} /> Önemli Notlar</h2>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <li style={{ fontSize: "0.9rem", color: "#92400E", lineHeight: 1.6 }}>BAE'de alkol tüketime dair kısıtlamalar mevcuttur; kamuya açık yerlerde alkol yasaktır.</li>
            <li style={{ fontSize: "0.9rem", color: "#92400E", lineHeight: 1.6 }}>Ramadan döneminde gündüzleri kamuya açık alanlarda yemek/içmek yasaktır.</li>
            <li style={{ fontSize: "0.9rem", color: "#92400E", lineHeight: 1.6 }}>Kamera için gizlilik kurallarına dikkat edin; özel mülkleri izinsiz fotoğraflamayın.</li>
            <li style={{ fontSize: "0.9rem", color: "#92400E", lineHeight: 1.6 }}>Güvenlik düzeyi genel olarak yüksektir; turistler için güvenli bir destinasyondur.</li>
            <li style={{ fontSize: "0.9rem", color: "#92400E", lineHeight: 1.6 }}>Para birimi olarak AED kullanılır; Türk Lirası dönüsümü için döviz bürolari ve ATM'ler mevcuttur.</li>
          </ul>
        </div>

        {/* Havalimanı Ulaşım */}
        <div style={{ background: "#fff", borderRadius: "16px", padding: "20px 24px", border: "1px solid #e2e8f0", marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.1rem", color: "var(--l2t-navy)", fontWeight: "800", margin: "0 0 12px" }}>Havalimanından Merkeze</h2>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <li style={{ fontSize: "0.9rem", color: "var(--l2t-soft)", lineHeight: 1.6 }}>Dubai Uluslararası Havalimanı (DXB) – Metro ile ~30 dak., taksi ile ~25 dak.</li>
            <li style={{ fontSize: "0.9rem", color: "var(--l2t-soft)", lineHeight: 1.6 }}>Abu Dabi Havalimanı (AUH) – Servis otobüsü ile ~1 saat, taksi ile ~40 dak.</li>
          </ul>
        </div>

        {/* CTA Butonlar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "32px" }}>
          <Link href={`/ucak-bileti-ara?to=Dubai`} className="l2t-btn" style={{ flex: "1 1 180px", justifyContent: "center", display: "flex", alignItems: "center", gap: "8px" }}>
            <Plane size={18} /> Uçak Bileti Ara
          </Link>
          <a href={withUtm(siteSettings.bookingAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-btn l2t-btn-outline" style={{ flex: "1 1 180px", justifyContent: "center", display: "flex", alignItems: "center", gap: "8px" }}>
            <Hotel size={18} /> Otel Bul
          </a>
          <a href={withUtm(siteSettings.airaloAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-btn l2t-btn-outline" style={{ flex: "1 1 180px", justifyContent: "center", display: "flex", alignItems: "center", gap: "8px" }}>
            <Wifi size={18} /> eSIM Al
          </a>
          <a href={withUtm(siteSettings.getYourGuideAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-btn l2t-btn-outline" style={{ flex: "1 1 180px", justifyContent: "center", display: "flex", alignItems: "center", gap: "8px" }}>
            <MapPin size={18} /> Tur & Aktivite
          </a>
        </div>

        <div style={{ background: "#F1F5F9", borderRadius: "12px", padding: "16px", fontSize: "0.85rem", color: "#64748B", lineHeight: 1.6 }}>
          ⚠️ Vize ve giriş kuralları değişebilir. Seyahatten önce resmi BAE makamlarından, konsolosluktan ve havayolunuzdan bilgi alınız.
        </div>
      </div>
    </div>
  );
}
