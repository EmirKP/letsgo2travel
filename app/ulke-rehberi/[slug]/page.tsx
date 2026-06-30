import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plane, Hotel, Wifi, Calendar, Clock, Wallet, CheckCircle2, Info } from "lucide-react";
import { aviasalesUrl, siteSettings, withUtm } from "@/lib/affiliate";
import { getCountryBySlug, getCountryGuides } from "@/lib/data";
import ScrollReveal from "@/app/components/ScrollReveal";
import CountryFavicon from "@/app/components/CountryFavicon";
import CountryHero from "@/app/components/CountryHero";
import JsonLd from "@/app/components/JsonLd";
import { countryGuideSchema } from "@/lib/structured-data";

export async function generateStaticParams() {
  const countries = await getCountryGuides();
  return countries.map((country) => ({ slug: country.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  return {
    title: country ? `${country.country_name} Seyahat Rehberi — Vize, Uçuş, Bütçe` : "Ülke Rehberi",
    description: country?.visa_note || "Letsgo2Travel ülke rehberi.",
  };
}

export default async function CountryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  if (!country) notFound();

  const flightUrl = aviasalesUrl({ destination: country.airport_code });

  return (
    <section className="bento-page-wrap">
      <JsonLd data={countryGuideSchema(country)} />
      <CountryFavicon emoji={country.emoji} />
      
      {/* ══ BENTO HERO ══ */}
      <ScrollReveal delay={0}>
        <CountryHero country={country as any} />
      </ScrollReveal>

      {/* ══ BENTO GRID ══ */}
      <div className="bento-main-grid l2t-wrap">
        
        {/* Info Box 1: Vize & Seyahat */}
        <ScrollReveal delay={0.1}>
          <div className="bento-box glass-panel hover-tilt">
            <div className="bento-icon-wrap"><CheckCircle2 size={24} /></div>
            <div className="bento-content">
              <span className="bento-label">Vize Durumu</span>
              <strong className="bento-val">{country.visa_status}</strong>
            </div>
          </div>
        </ScrollReveal>

        {/* Info Box 2: Süre */}
        <ScrollReveal delay={0.2}>
          <div className="bento-box glass-panel hover-tilt">
            <div className="bento-icon-wrap"><Clock size={24} /></div>
            <div className="bento-content">
              <span className="bento-label">Uçuş Süresi</span>
              <strong className="bento-val">{country.flight_duration}</strong>
            </div>
          </div>
        </ScrollReveal>

        {/* Info Box 3: Sezon */}
        <ScrollReveal delay={0.3}>
          <div className="bento-box glass-panel hover-tilt">
            <div className="bento-icon-wrap"><Calendar size={24} /></div>
            <div className="bento-content">
              <span className="bento-label">En İyi Dönem</span>
              <strong className="bento-val">{country.best_months}</strong>
            </div>
          </div>
        </ScrollReveal>

        {/* Info Box 4: Fiyat (Büyük Kutu iptal edildi, üst satıra taşındı) */}
        <ScrollReveal delay={0.4}>
          <div className="bento-box glass-panel hover-tilt" style={{ borderColor: "rgba(20, 118, 242, 0.3)" }}>
            <div className="bento-icon-wrap" style={{ background: "rgba(245, 158, 11, 0.15)" }}><Wallet size={24} color="var(--l2t-gold)" /></div>
            <div className="bento-content">
              <span className="bento-label">Tahmini Uçuş Fiyatı</span>
              <strong className="bento-val" style={{ color: "var(--l2t-gold)", fontSize: "1.2rem" }}>{country.avg_flight_price.toLocaleString("tr-TR")} TL+</strong>
            </div>
          </div>
        </ScrollReveal>

        {/* İçerik Kutusu (Makale) */}
        {country.content_markdown && (
          <ScrollReveal delay={0.5} yOffset={20} className="bento-span-4">
            <div className="bento-article glass-panel">
              <h2>{country.emoji} Yolculuk Notları</h2>
              <div className="bento-text">
                <div 
                  className="rich-text-content" 
                  dangerouslySetInnerHTML={{ __html: country.content_markdown }} 
                  style={{ lineHeight: "1.7", fontSize: "1.05rem" }}
                />
                <div className="bento-disclaimer" style={{ marginTop: "20px" }}>
                  <Info size={16} /> Vize kuralları değişebilir. Seyahatten önce resmi kaynakları kontrol etmelisin.
                </div>
              </div>
            </div>
          </ScrollReveal>
        )}

      </div>

      {/* ══ AFFILIATE CTA GRID ══ */}
      <div className="l2t-wrap" style={{ marginTop: "40px", marginBottom: "80px" }}>
        <h2 style={{ color: "#081533", marginBottom: "20px", fontSize: "1.8rem" }}>Seyahat Planını Tamamla</h2>
        <div className="l2t-card-grid l2t-card-grid-3">
          <ScrollReveal delay={0.1}>
            <a className="l2t-card l2t-affiliate-card hover-tilt" href={flightUrl} target="_blank" rel="noreferrer">
              <div className="l2t-card-icon" style={{ background: "#EEF7FF", color: "#1476F2" }}><Plane size={24} /></div>
              <h3>Uçak Bileti</h3>
              <p>{country.country_name} için en ucuz uçuşları anında karşılaştır.</p>
              <span className="l2t-btn l2t-btn-small">Bilet Ara →</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <a className="l2t-card l2t-affiliate-card hover-tilt" href={withUtm(siteSettings.bookingAffiliateUrl)} target="_blank" rel="noreferrer">
              <div className="l2t-card-icon" style={{ background: "#FFF5E6", color: "#F59E0B" }}><Hotel size={24} /></div>
              <h3>Otel Bul</h3>
              <p>Konum, yorum ve iptal esnekliğine göre otelleri karşılaştır.</p>
              <span className="l2t-btn l2t-btn-small">Otellere Bak →</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <a className="l2t-card l2t-affiliate-card hover-tilt" href={withUtm(siteSettings.airaloAffiliateUrl)} target="_blank" rel="noreferrer">
              <div className="l2t-card-icon" style={{ background: "#F0FFF4", color: "#10B981" }}><Wifi size={24} /></div>
              <h3>eSIM Al</h3>
              <p>{country.country_name} için internet paketini seyahatten önce hazırla.</p>
              <span className="l2t-btn l2t-btn-small">eSIM Al →</span>
            </a>
          </ScrollReveal>
        </div>

        <div style={{ marginTop: "32px", textAlign: "center" }}>
          <Link href="/ulke-rehberi" className="l2t-text-link" style={{ fontSize: "1.1rem" }}>
            ← Tüm Rehberlere Dön
          </Link>
        </div>
      </div>

      {/* ══ TOPLULUK VE YEREL ARAÇLAR ══ */}
      <div className="l2t-wrap" style={{ marginTop: "40px", marginBottom: "80px", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "32px", alignItems: "start" }}>
        
        {/* Sol Panel: Taksi Radarı ve Döviz Flaşı */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div className="glass-panel" style={{ padding: "24px", borderRadius: "24px", background: "#fff", borderLeft: "4px solid #F59E0B" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--l2t-navy)", marginBottom: "12px", fontSize: "1.2rem" }}>
              🚕 Taksi Kazığı Önleyici
            </h3>
            <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", marginBottom: "16px" }}>
              Havalimanından şehir merkezine taksi ortalama <strong>35 Euro</strong> tutmalıdır. Taksicilere dikkat et, her zaman taksimetre açtır!
            </p>
            <div style={{ padding: "12px", background: "rgba(245, 158, 11, 0.1)", borderRadius: "12px", fontSize: "0.9rem", color: "#d97706", fontWeight: "600" }}>
              💡 Alternatif: Ülkede Uber veya Bolt uygulamasını kullanabilirsin.
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "24px", borderRadius: "24px", background: "linear-gradient(135deg, #EF4444, #B91C1C)", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -20, opacity: 0.1, fontSize: "8rem" }}>💸</div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", fontSize: "1.2rem" }}>
              🚨 Döviz Flaş Uyarısı
            </h3>
            <p style={{ fontSize: "0.95rem", marginBottom: "8px" }}>
              Şu an {country.country_name} para birimi TL karşısında son 3 ayın <strong>en düşük</strong> seviyesinde!
            </p>
            <strong style={{ fontSize: "1.2rem" }}>Tam Gitme Zamanı! 🔥</strong>
          </div>

        </div>

        {/* Sağ Panel: Gezgin Yorum Ağı (Reddit Tarzı) */}
        <div className="glass-panel" style={{ padding: "32px", borderRadius: "24px", background: "#fff" }}>
          <h2 style={{ fontSize: "1.5rem", color: "var(--l2t-navy)", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
            💬 Gezgin Yorumları (Soru & Cevap)
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Yorum 1 */}
            <div style={{ paddingBottom: "20px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong style={{ color: "var(--l2t-navy)" }}>Burak Yılmaz</strong>
                <span style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>2 Gün Önce</span>
              </div>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem" }}>
                Geçen hafta gittim, vize kapıda çok rahat alınıyor ancak yanınızda mutlaka otel rezervasyon çıktısı bulunsun. Telefondan göstermeyi kabul etmediler!
              </p>
              <div style={{ marginTop: "12px", display: "flex", gap: "16px", color: "var(--l2t-soft)", fontSize: "0.85rem", fontWeight: "600" }}>
                <span style={{ cursor: "pointer", color: "#10B981" }}>▲ 128 Katılıyorum</span>
                <span style={{ cursor: "pointer" }}>▼ 2 Katılmıyorum</span>
              </div>
            </div>

            {/* Yorum 2 */}
            <div style={{ paddingBottom: "20px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <strong style={{ color: "var(--l2t-navy)" }}>Selin K.</strong>
                <span style={{ fontSize: "0.85rem", color: "var(--l2t-soft)" }}>1 Hafta Önce</span>
              </div>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem" }}>
                Havalimanındaki döviz büroları çok komisyon alıyor. Şehre inene kadar yetecek kadar bozdurup gerisini merkezde halledin.
              </p>
              <div style={{ marginTop: "12px", display: "flex", gap: "16px", color: "var(--l2t-soft)", fontSize: "0.85rem", fontWeight: "600" }}>
                <span style={{ cursor: "pointer", color: "#10B981" }}>▲ 84 Katılıyorum</span>
                <span style={{ cursor: "pointer" }}>▼ 0 Katılmıyorum</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "24px" }}>
            <textarea placeholder="Senin bir sorun veya tavsiyen var mı?" style={{ width: "100%", padding: "16px", borderRadius: "16px", border: "1px solid #e2e8f0", background: "#f8fafc", resize: "none", height: "100px", outline: "none", marginBottom: "12px", fontFamily: "inherit" }}></textarea>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="l2t-btn l2t-btn-small" style={{ borderRadius: "12px", background: "var(--l2t-blue)", color: "#fff", border: "none" }}>Gönder</button>
            </div>
          </div>
        </div>

      </div>
      
    </section>
  );
}
