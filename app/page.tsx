import Link from "next/link";
import FlightSearchCard from "./components/FlightSearchCard";
import DealCard from "./components/DealCard";
import NewsletterForm from "./components/NewsletterForm";
import ScrollReveal from "./components/ScrollReveal";
import SurpriseButton from "./components/SurpriseButton";
import AISearchBox from "./components/AISearchBox";
import VerifiedTravelerSection from "@/components/home/VerifiedTravelerSection";
import { getBlogPosts, getCountryGuides, getFlightDeals } from "@/lib/data";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";
import { formatFromPrice } from "@/lib/prices";
import { Ticket, Flame, Plane, Hotel, Wifi, MapPin, Sparkles, CheckCircle2, Globe, Wallet, ChevronRight, Clock, BellRing, Users, MessageCircle, Trophy } from "lucide-react";

const routeHighlights = [
  { image: "/destinations/baku.jpg", city: "Bakü", tag: "Kimlikle", time: "2s 45dk", price: formatFromPrice("baku") },
  { image: "/destinations/tbilisi.jpg", city: "Tiflis", tag: "Kimlikle", time: "2s 15dk", price: formatFromPrice("tbilisi") },
  { image: "/destinations/sarajevo.jpg", city: "Saraybosna", tag: "Vizesiz", time: "2s", price: formatFromPrice("sarajevo") },
  { image: "/destinations/dubai.jpg", city: "Dubai", tag: "e-Vize", time: "4s", price: formatFromPrice("dubai") },
];

const whyItems = [
  { icon: <Flame size={24} color="var(--l2t-gold)" />, title: "Anlık fiyat karşılaştırma", text: "Yüzlerce havayolu ve partner fiyatını tek ekranda gör." },
  { icon: <CheckCircle2 size={24} color="var(--l2t-success)" />, title: "Vize rehberi dahil", text: "Her rota için vize durumu, gerekli belgeler ve ipuçları." },
  { icon: <Ticket size={24} color="var(--l2t-gold-deep)" />, title: "Fiyat alarmı", text: "Hedef fiyatını belirle, düştüğünde anında e-posta al." },
  { icon: <Sparkles size={24} color="var(--l2t-gold)" />, title: "AI rota asistanı", text: "Seçimlerini yap, seyahat planını saniyeler içinde al." },
];

const conversionItems = [
  {
    href: "/ucak-bileti-ara",
    icon: <Plane size={22} />,
    title: "Ucuz uçak bileti ara",
    text: "Türkiye çıkışlı rotaları karşılaştır, uygun uçuşu partner ekranında tamamla.",
    cta: "Bilet ara",
  },
  {
    href: "/fiyat-kontrolu",
    icon: <BellRing size={22} />,
    title: "Fiyat alarmı kur",
    text: "Hedef fiyatını belirle, rota ucuzladığında e-posta ile haber al.",
    cta: "Alarm kur",
  },
  {
    href: "/vizesiz-ulkeler",
    icon: <Globe size={22} />,
    title: "Vizesiz / kimlikle ülkeler",
    text: "Türk pasaportuna göre en kolay gidilen ülkeleri tek listede gör.",
    cta: "Ülkeleri gör",
  },
  {
    href: "/ulke-rehberi",
    icon: <MapPin size={22} />,
    title: "Ülke rehberlerini oku",
    text: "Vize, bütçe, ulaşım ve yerel ipuçlarını rota seçmeden önce incele.",
    cta: "Rehbere git",
  },
  {
    href: "/forum",
    icon: <MessageCircle size={22} />,
    title: "Gezgin sorularına bak",
    text: "Gerçek kullanıcıların ülke, vize ve seyahat deneyimlerinden faydalan.",
    cta: "Foruma gir",
  },
  {
    href: "/kasifler-ligi",
    icon: <Trophy size={22} />,
    title: "Kaşifler Ligi",
    text: "Gittiğin ülkeleri haritada işaretle, doğrulanmış gezgin profilini güçlendir.",
    cta: "Katıl",
  },
];

export default async function HomePage() {
  let [deals, countries, posts] = await Promise.all([
    getFlightDeals(),
    getCountryGuides(),
    getBlogPosts(),
  ]);
  
  // Sanitize deals (Supabase'den gelen yanlış vize veya fiyatları düzeltmek için)
  deals = deals.map(deal => {
    if (deal.destination === "Dubai" || deal.destination_code === "DXB") {
      deal.visa_type = "e-vize";
      deal.price = 2400;
    }
    return deal;
  });
  
  const popularCountries = countries.filter((c) => c.is_popular).slice(0, 4);

  return (
    <>
      {/* ═══ ATLAS PREMIUM HERO ═══════════════════════════════════════════ */}
      <section className="l2t-atlas-hero" aria-label="LetsGo2Travel ana karşılama alanı">
        <div className="l2t-wrap l2t-atlas-hero-grid">
          <div className="l2t-atlas-hero-copy">
            <ScrollReveal delay={0.06} yOffset={14}>
              <span className="l2t-atlas-eyebrow">
                <Sparkles size={15} /> Türk pasaportuna göre akıllı seyahat asistanı
              </span>
            </ScrollReveal>

            <ScrollReveal delay={0.12} yOffset={18}>
              <h1>Uçuşu bul, vizeyi gör, rotanı netleştir.</h1>
            </ScrollReveal>

            <ScrollReveal delay={0.18} yOffset={18}>
              <p>
                LetsGo2Travel; uçak bileti arama, fiyat alarmı, vizesiz rota rehberleri ve doğrulanmış gezgin deneyimlerini tek sade akışta toplar.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.24} yOffset={14}>
              <div className="l2t-atlas-actions">
                <Link href="/#bilet-ara" className="l2t-btn l2t-btn-primary">
                  <Plane size={18} /> Uçak bileti ara
                </Link>
                <Link href="/vizesiz-ulkeler" className="l2t-btn l2t-btn-secondary">
                  <Globe size={18} /> Vizesiz rota bul
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.3} yOffset={12}>
              <div className="l2t-atlas-trust-row" aria-label="LetsGo2Travel güven bilgileri">
                <span><BellRing size={15} /> Fiyat alarmı</span>
                <span><CheckCircle2 size={15} /> Vize kolaylığı</span>
                <span><Users size={15} /> Gezgin yorumları</span>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={0.16} yOffset={20}>
            <div className="l2t-atlas-visual">
              <div className="l2t-atlas-route-card">
                <div className="l2t-atlas-route-media">
                  <img src="/plane-hero.webp" alt="LetsGo2Travel rota keşfi" loading="eager" />
                  <div className="l2t-atlas-route-chip">Öne çıkan akış</div>
                </div>
                <div className="l2t-atlas-route-body">
                  <div>
                    <span>İstanbul çıkışlı</span>
                    <strong>Vize, bütçe ve uçuş bilgisini birlikte planla.</strong>
                  </div>
                  <div className="l2t-atlas-stats">
                    <div><b>18+</b><small>rehber sayfa</small></div>
                    <div><b>7/24</b><small>fiyat alarmı</small></div>
                    <div><b>AI</b><small>rota fikri</small></div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ ARAMA KARTI ═══════════════════════════════════════════════ */}
      <section className="l2t-wrap hp-search-wrap" style={{ marginTop: "-60px", position: "relative", zIndex: 50 }}>
        <ScrollReveal delay={0.1}>
          <div style={{ overflow: "visible", position: "relative", zIndex: 50 }}>
            <FlightSearchCard />
          </div>
        </ScrollReveal>
      </section>

      {/* ═══ ANA SAYFA DÖNÜŞÜM AKIŞI ═════════════════════════════════════ */}
      <section className="l2t-wrap l2t-conversion-panel" aria-label="LetsGo2Travel hızlı aksiyonlar">
        <div className="l2t-conversion-head">
          <span><Users size={16} /> Seyahate tek akıştan başla</span>
          <h2>Aradığın rota, vize bilgisi ve gerçek gezgin deneyimi aynı yerde.</h2>
          <p>Bilet arama, fiyat alarmı, vizesiz rota, ülke rehberi ve forum akışı tek ekranda birleşir.</p>
        </div>
        <div className="l2t-conversion-grid">
          {conversionItems.map((item) => (
            <Link key={item.href} href={item.href} className="l2t-conversion-card hover-tilt">
              <div className="l2t-conversion-icon">{item.icon}</div>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
              <small>{item.cta} →</small>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ BELGELİ GEZGİN ═══════════════════════════════════════════════ */}
      <div className="l2t-verified-band">
        <VerifiedTravelerSection />
      </div>

      {/* ═══ AI ROTA DANIŞMANI (Senaryo Kartları) ═════════════════════════ */}
      <section className="l2t-wrap" style={{ marginTop: "60px", scrollMarginTop: "100px" }} id="akilli-plan">
        <ScrollReveal delay={0.1}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(245,158,11,0.1)", color: "var(--l2t-gold)", padding: "6px 16px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
              <Sparkles size={16} /> Yapay Zeka Rota Asistanı
            </div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", color: "var(--l2t-navy)", margin: "0 0 16px", fontWeight: "800", letterSpacing: "-0.03em" }}>3 dakikada seyahat fikrini netleştir</h2>
            <p style={{ fontSize: "1.1rem", color: "var(--l2t-soft)", margin: "0 auto", maxWidth: "600px", lineHeight: "1.6" }}>Bütçene, vize tercihine ve tarzına uygun rotayı bulmak için aşağıdaki hazır senaryolardan birini seç veya kendi özel planını oluştur.</p>
          </div>
        </ScrollReveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "32px" }}>
          {/* Preset Card 1 */}
          <ScrollReveal delay={0.2}>
            <Link href="/akilli-plan?preset=ucuz-vizesiz" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "var(--l2t-gold-soft)", color: "var(--l2t-gold)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Wallet size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>10.000 TL altı vizesiz rota</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Avrupa'da veya çevremizde düşük bütçeyle gezilebilecek en iyi vizesiz alternatifler.</p>
              <div style={{ display: "flex", alignItems: "center", color: "var(--l2t-gold)", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>AI ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>

          {/* Preset Card 2 */}
          <ScrollReveal delay={0.3}>
            <Link href="/akilli-plan?preset=kimlikle-haftasonu" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#F0FFF4", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Clock size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>Kimlikle gidilen hafta sonu</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Pasaporta ihtiyaç duymadan sadece kimlikle gidip dönebileceğiniz pratik rotalar.</p>
              <div style={{ display: "flex", alignItems: "center", color: "var(--l2t-gold)", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>AI ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>

          {/* Preset Card 3 */}
          <ScrollReveal delay={0.4}>
            <Link href="/akilli-plan?preset=ilk-kez-yurtdisi" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "var(--l2t-gold-soft)", color: "var(--l2t-gold)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Plane size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>İlk kez yurt dışı için kolay rota</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Ulaşımı kolay, güvenli ve yabancılık çekmeyeceğiniz başlangıç seviyesi ülkeler.</p>
              <div style={{ display: "flex", alignItems: "center", color: "var(--l2t-gold)", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>AI ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.5}>
          <div style={{ textAlign: "center" }}>
            <Link href="/akilli-plan" className="l2t-btn" style={{ 
              background: "linear-gradient(135deg, var(--l2t-navy), var(--l2t-navy))", 
              color: "#fff", 
              border: "none", 
              padding: "16px 32px", 
              fontSize: "1.1rem", 
              display: "inline-flex", 
              alignItems: "center", 
              gap: "8px",
              boxShadow: "0 8px 20px rgba(6,20,51,0.2)"
            }}>
              <Sparkles size={18} color="var(--l2t-gold)" /> Kendi Özel Planını Oluştur
            </Link>
          </div>
        </ScrollReveal>
      </section>

      {/* ═══ NEDEN LETSGO2TRAVEL ═══════════════════════════════════════ */}
      <section className="l2t-wrap hp-why-grid" style={{ marginTop: "80px" }}>
        {whyItems.map((item, i) => (
          <ScrollReveal key={item.title} delay={0.1 * i}>
            <article className="hp-why-card hover-tilt" style={{ background: "#fff", border: "1px solid #f1f5f9" }}>
              <span className="hp-why-icon" style={{ background: "transparent", border: "1px solid rgba(0,0,0,0.05)" }}>{item.icon}</span>
              <h3 style={{ color: "var(--l2t-navy)" }}>{item.title}</h3>
              <p style={{ color: "var(--l2t-soft)" }}>{item.text}</p>
            </article>
          </ScrollReveal>
        ))}
      </section>

      {/* ═══ KAMPANYALAR ═══════════════════════════════════════════════ */}
      <ScrollReveal>
        <section className="l2t-section l2t-wrap">
          <div className="l2t-section-head">
            <div>
              <p className="l2t-kicker">Bugünün fırsatları</p>
              <h2 style={{ color: "var(--l2t-navy)" }}>En ucuz uçak bileti kampanyaları</h2>
            </div>
            <Link href="/kampanyalar" className="l2t-text-link">Tümünü gör →</Link>
          </div>
          <div className="l2t-card-grid l2t-card-grid-4">
            {deals.slice(0, 4).map((deal, i) => (
              <ScrollReveal key={deal.id} delay={i * 0.1}>
                <div className="hover-tilt">
                  <DealCard deal={deal} />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ═══ VİZESİZ ÜLKELER ═══════════════════════════════════════════ */}
      <ScrollReveal>
        <section className="l2t-section l2t-wrap">
          <div className="l2t-section-head">
            <div>
              <p className="l2t-kicker">Vize derdi olmadan</p>
              <h2 style={{ color: "var(--l2t-navy)" }}>Türkler için en kolay rotalar</h2>
              <p style={{ color: "var(--l2t-soft)" }}>Kimlikle ve vizesiz giriş yapılabilen ülkeler — uçuş süresi ve fiyatıyla birlikte.</p>
            </div>
            <Link href="/ulke-rehberi" className="l2t-text-link">Tüm rehberler →</Link>
          </div>
          <div className="l2t-country-grid">
            {popularCountries.map((country, i) => (
              <ScrollReveal key={country.id} delay={i * 0.1}>
                <Link
                  key={country.slug}
                  href={`/ulke-rehberi/${country.slug}`}
                  className="country-card hover-tilt"
                  style={{
                    backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 60%, transparent 100%), url(${country.hero_image_url || "/travel-images/discover.jpg"})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    minHeight: "320px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    padding: "24px",
                    borderRadius: "24px",
                    color: "#fff",
                    textDecoration: "none"
                  }}
                >
                  <h3 style={{ margin: "0 0 8px 0", fontSize: "1.5rem", color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>{country.country_name}</h3>
                  <p style={{ margin: "0 0 16px 0", fontSize: "0.95rem", opacity: 0.9 }}>Orta. {country.avg_flight_price.toLocaleString("tr-TR")} TL</p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span className={`visa-badge visa-${country.visa_status}`} style={{ backdropFilter: "blur(4px)", padding: "6px 12px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "700" }}>
                      {country.visa_status === "vizesiz"
                        ? "Vizesiz"
                        : country.visa_status === "kimlikle"
                          ? "Kimlikle"
                          : "E-Vize"}
                    </span>
                    <span style={{ background: "rgba(255,255,255,0.2)", backdropFilter: "blur(4px)", padding: "6px 12px", borderRadius: "12px", fontSize: "0.8rem", fontWeight: "600", color: "#fff" }}>
                      {country.flight_duration}
                    </span>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ═══ AI ARAMA ═══════════════════════════════════════════════════ */}
      <ScrollReveal>
        <section className="hp-ai-section glass-panel">
          <div className="l2t-wrap hp-ai-inner">
            <div className="hp-ai-copy">
              <span className="hp-ai-badge" style={{ display: "flex", alignItems: "center", gap: "6px" }}><Sparkles size={16} /> AI Asistan</span>
              <h2>"Vizesiz hafta sonu nereye gidebilirim?" gibi aramalara cevap ver</h2>
              <p>
                Doğal Türkçe yaz — sistem sana rota önerisi, bütçe analizi
                ve uçuş linkini anında hazırlar.
              </p>
            </div>
            <div className="hp-ai-box-wrap glow-card">
              <AISearchBox />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ═══ AFFILIATE KARTLAR ═════════════════════════════════════════ */}
      <ScrollReveal>
        <section className="l2t-section l2t-wrap">
          <div className="l2t-section-head">
            <div>
              <p className="l2t-kicker">Seyahatin her adımı</p>
              <h2>Uçuştan otele, eSIM&apos;e kadar</h2>
            </div>
          </div>
          <div className="l2t-card-grid l2t-card-grid-3">
            <ScrollReveal delay={0.1}>
              <a href={trackedAffiliateUrl({ provider: "aviasales", url: "https://www.aviasales.com/search?origin_iata=IST", sourcePage: "home_affiliate_card" })} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
                <div className="l2t-card-icon" style={{ background: "var(--l2t-gold-soft)", color: "var(--l2t-gold)" }}><Plane size={24} /></div>
                <h3>Uçak Bileti</h3>
                <p>Yüzlerce havayolu ve partner fiyatını anlık karşılaştır, en ucuz uçuşu bul.</p>
                <span className="l2t-btn l2t-btn-small">Bilet ara →</span>
              </a>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <a href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "home_mobile_shortcut" })} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
                <div className="l2t-card-icon" style={{ background: "var(--l2t-gold-soft)", color: "var(--l2t-gold)" }}><Hotel size={24} /></div>
                <h3>Otel Bul</h3>
                <p>Konum, puan ve iptal esnekliğine göre en iyi oteli karşılaştır.</p>
                <span className="l2t-btn l2t-btn-small">Otellere bak →</span>
              </a>
            </ScrollReveal>
            <ScrollReveal delay={0.3}>
              <a href={trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "home_mobile_shortcut" })} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
                <div className="l2t-card-icon" style={{ background: "#F0FFF4", color: "#10B981" }}><Wifi size={24} /></div>
                <h3>eSIM Al</h3>
                <p>Varıştan önce internet paketini hazırla, havalimanında hemen bağlan.</p>
                <span className="l2t-btn l2t-btn-small">eSIM al →</span>
              </a>
            </ScrollReveal>
          </div>
        </section>
      </ScrollReveal>

      {/* ═══ BÜLTEN ═════════════════════════════════════════════════════ */}
      <ScrollReveal>
        <section className="l2t-section l2t-wrap">
          <div className="l2t-cta-band glass-panel glow-card">
            <div>
              <p className="l2t-kicker">Bülten</p>
              <h2>Yeni fırsatları kaçırma</h2>
              <p>Ucuz bilet, vizesiz rota ve seyahat rehberi yayınlandığında e-posta al.</p>
            </div>
            <NewsletterForm />
          </div>
        </section>
      </ScrollReveal>
    </>
  );
}
