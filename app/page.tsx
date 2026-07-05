import Link from "next/link";
import FlightSearchCard from "./components/FlightSearchCard";
import DealCard from "./components/DealCard";
import NewsletterForm from "./components/NewsletterForm";
import ScrollReveal from "./components/ScrollReveal";
import SurpriseButton from "./components/SurpriseButton";
import HomeHeroCopy from "./components/HomeHeroCopy";
import HomeDealsTicker from "./components/HomeDealsTicker";
import AISearchBox from "./components/AISearchBox";
import VerifiedTravelerSection from "@/components/home/VerifiedTravelerSection";
import { getBlogPosts, getCountryGuides, getFlightDeals } from "@/lib/data";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";
import { formatFromPrice } from "@/lib/prices";
import { Ticket, Flame, Plane, Hotel, Wifi, MapPin, Sparkles, CheckCircle2, Globe, Wallet, ChevronRight, Clock, ShieldCheck } from "lucide-react";

const routeHighlights = [
  { image: "/destinations/baku.jpg", city: "Bakü", tag: "Kimlikle", time: "2s 45dk", price: formatFromPrice("baku") },
  { image: "/destinations/tbilisi.jpg", city: "Tiflis", tag: "Kimlikle", time: "2s 15dk", price: formatFromPrice("tbilisi") },
  { image: "/destinations/sarajevo.jpg", city: "Saraybosna", tag: "Vizesiz", time: "2s", price: formatFromPrice("sarajevo") },
  { image: "/destinations/dubai.jpg", city: "Dubai", tag: "e-Vize", time: "4s", price: formatFromPrice("dubai") },
];

const whyItems = [
  { icon: <Flame size={24} color="var(--l2t-gold)" />, title: "Anlık fiyat karşılaştırma", text: "Yüzlerce havayolu ve partner fiyatını tek ekranda gör." },
  { icon: <CheckCircle2 size={24} color="#10B981" />, title: "Vize rehberi dahil", text: "Her rota için vize durumu, gerekli belgeler ve ipuçları." },
  { icon: <Ticket size={24} color="#1476F2" />, title: "Fiyat alarmı", text: "Hedef fiyatını belirle, düştüğünde anında e-posta al." },
  { icon: <Sparkles size={24} color="#8B5CF6" />, title: "Rota Asistanı", text: "Seçimlerini yap, seyahat planını saniyeler içinde al." },
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
      {/* ═══ PREMIUM ANIMATED HERO ═════════════════════════════════════ */}
      <section className="hp-hero l2t-hero-animated">
        <div className="hp-hero-bg l2t-hero-glow" />
        <div className="l2t-hero-orbit" aria-hidden="true" />

        <div className="l2t-wrap hp-hero-inner l2t-hero-discovery-grid">
          <div>
            <HomeHeroCopy />

            <div className="l2t-mobile-only l2t-app-shortcut-grid">
              <Link href="/#bilet-ara" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #1476f2, #0b5bce)", color: "#fff" }}><Plane size={24} /></div>
                <span>Uçak</span>
              </Link>
              <a href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "home_mobile_shortcut" })} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, var(--l2t-gold), var(--l2t-gold-soft))", color: "#0B1D35" }}><Hotel size={24} /></div>
                <span>Otel</span>
              </a>
              <a href={trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "home_mobile_shortcut" })} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}><Wifi size={24} /></div>
                <span>eSIM</span>
              </a>
              <Link href="/pasaport-gucu" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #6DBBFF, #2F80ED)", color: "#fff" }}><ShieldCheck size={24} /></div>
                <span>Pasaport</span>
              </Link>
            </div>
          </div>

          <ScrollReveal delay={0.28} yOffset={0}>
            <aside className="l2t-live-discovery-panel l2t-hide-mobile" aria-label="Canlı keşif paneli">
              <div className="l2t-live-panel-top">
                <span>Canlı Keşif Paneli</span>
                <small>Global rota ilhamı</small>
              </div>
              <div className="l2t-live-panel-grid">
                <Link href="/pasaport-gucu" className="l2t-live-panel-card">
                  <ShieldCheck size={20} />
                  <strong>Pasaport Gücü</strong>
                  <small>Seçili pasaporta göre kolay rotalar</small>
                </Link>
                <Link href="/kampanyalar" className="l2t-live-panel-card">
                  <Flame size={20} />
                  <strong>Bugünün Fırsatları</strong>
                  <small>Yakın tarihli fiyat sinyalleri</small>
                </Link>
                <Link href="/profil/dogrulama" className="l2t-live-panel-card">
                  <CheckCircle2 size={20} />
                  <strong>Belgeli Gezgin</strong>
                  <small>Gerçek deneyimlerle karar ver</small>
                </Link>
                <Link href="/rota-asistani" className="l2t-live-panel-card">
                  <Sparkles size={20} />
                  <strong>Rota Asistanı</strong>
                  <small>Bütçe ve tarza göre rota üret</small>
                </Link>
              </div>
              <SurpriseButton />
            </aside>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ ARAMA KARTI ═══════════════════════════════════════════════ */}
      <section id="bilet-ara" className="l2t-wrap hp-search-wrap" style={{ marginTop: "-60px", position: "relative", zIndex: 50 }}>
        <ScrollReveal delay={0.1}>
          <div style={{ overflow: "visible", position: "relative", zIndex: 50 }}>
            <FlightSearchCard />
          </div>
        </ScrollReveal>
      </section>

      <HomeDealsTicker deals={deals} />

      {/* ═══ BELGELİ GEZGİN ═══════════════════════════════════════════════ */}
      <div style={{ background: "#040C1A", marginTop: "4rem", paddingTop: "2rem", paddingBottom: "2rem" }}>
        <VerifiedTravelerSection />
      </div>

      {/* ═══ AI ROTA DANIŞMANI (Senaryo Kartları) ═════════════════════════ */}
      <section className="l2t-wrap" style={{ marginTop: "60px", scrollMarginTop: "100px" }} id="akilli-plan">
        <ScrollReveal delay={0.1}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(245,158,11,0.1)", color: "var(--l2t-gold)", padding: "6px 16px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
              <Sparkles size={16} /> Rota Asistanı
            </div>
            <h2 style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", color: "var(--l2t-navy)", margin: "0 0 16px", fontWeight: "800", letterSpacing: "-0.03em" }}>3 dakikada seyahat fikrini netleştir</h2>
            <p style={{ fontSize: "1.1rem", color: "var(--l2t-soft)", margin: "0 auto", maxWidth: "600px", lineHeight: "1.6" }}>Bütçene, vize tercihine ve tarzına uygun rotayı bulmak için aşağıdaki hazır senaryolardan birini seç veya kendi özel planını oluştur.</p>
          </div>
        </ScrollReveal>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "32px" }}>
          {/* Preset Card 1 */}
          <ScrollReveal delay={0.2}>
            <Link href="/rota-asistani?preset=ucuz-vizesiz" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#EEF7FF", color: "#1476F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Wallet size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>10.000 TL altı vizesiz rota</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Avrupa'da veya çevremizde düşük bütçeyle gezilebilecek en iyi vizesiz alternatifler.</p>
              <div style={{ display: "flex", alignItems: "center", color: "var(--l2t-gold)", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>Rota Asistanı ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>

          {/* Preset Card 2 */}
          <ScrollReveal delay={0.3}>
            <Link href="/rota-asistani?preset=kimlikle-haftasonu" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#F0FFF4", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Clock size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>Kimlikle gidilen hafta sonu</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Pasaporta ihtiyaç duymadan sadece kimlikle gidip dönebileceğiniz pratik rotalar.</p>
              <div style={{ display: "flex", alignItems: "center", color: "var(--l2t-gold)", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>Rota Asistanı ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>

          {/* Preset Card 3 */}
          <ScrollReveal delay={0.4}>
            <Link href="/rota-asistani?preset=ilk-kez-yurtdisi" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#FFF5E6", color: "var(--l2t-gold)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Plane size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>İlk kez yurt dışı için kolay rota</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Ulaşımı kolay, güvenli ve yabancılık çekmeyeceğiniz başlangıç seviyesi ülkeler.</p>
              <div style={{ display: "flex", alignItems: "center", color: "var(--l2t-gold)", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>Rota Asistanı ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.5}>
          <div style={{ textAlign: "center" }}>
            <Link href="/rota-asistani" className="l2t-btn" style={{ 
              background: "linear-gradient(135deg, var(--l2t-navy), #061433)", 
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
              <h2 style={{ color: "var(--l2t-navy)" }}>Popüler uçuş fırsatları</h2>
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
              <p className="l2t-kicker">Kolay giriş rotaları</p>
              <h2 style={{ color: "var(--l2t-navy)" }}>Pasaportuna göre kolay rotalar</h2>
              <p style={{ color: "var(--l2t-soft)" }}>Kimlikle, vizesiz veya kolay vize seçenekleriyle keşfedilebilen rotalar.</p>
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
              <span className="hp-ai-badge" style={{ display: "flex", alignItems: "center", gap: "6px" }}><Sparkles size={16} /> Rota Asistanı</span>
              <h2>Seyahat fikrini rotaya dönüştür</h2>
              <p>
                Kısa bir seyahat fikri yaz; Rota Asistanı bütçe, vize durumu ve uçuş yönlendirmesiyle planı netleştirir.
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
                <div className="l2t-card-icon" style={{ background: "#EEF7FF", color: "#1476F2" }}><Plane size={24} /></div>
                <h3>Uçak Bileti</h3>
                <p>Yüzlerce havayolu ve partner fiyatını karşılaştır, uygun uçuş seçeneklerini gör.</p>
                <span className="l2t-btn l2t-btn-small">Bilet ara →</span>
              </a>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <a href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "home_mobile_shortcut" })} target="_blank" rel="nofollow sponsored noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
                <div className="l2t-card-icon" style={{ background: "#FFF5E6", color: "var(--l2t-gold)" }}><Hotel size={24} /></div>
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
              <h2>Yeni rota ve fırsatları kaçırma</h2>
              <p>Uçuş fırsatları, pasaport gücü güncellemeleri ve yeni ülke rehberleri yayınlandığında e-posta al.</p>
            </div>
            <NewsletterForm />
          </div>
        </section>
      </ScrollReveal>
    </>
  );
}
