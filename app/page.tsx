import Link from "next/link";
import FlightSearchCard from "./components/FlightSearchCard";
import DealCard from "./components/DealCard";
import NewsletterForm from "./components/NewsletterForm";
import ScrollReveal from "./components/ScrollReveal";
import SurpriseButton from "./components/SurpriseButton";
import AISearchBox from "./components/AISearchBox";
import VerifiedTravelerSection from "@/components/home/VerifiedTravelerSection";
import { getBlogPosts, getCountryGuides, getFlightDeals } from "@/lib/data";
import { siteSettings, withUtm } from "@/lib/affiliate";
import { formatFromPrice } from "@/lib/prices";
import { Ticket, Flame, Plane, Hotel, Wifi, MapPin, Sparkles, CheckCircle2, Globe, Wallet, ChevronRight, Clock } from "lucide-react";

const routeHighlights = [
  { image: "/destinations/baku.jpg", city: "Bakü", tag: "Kimlikle", time: "2s 45dk", price: formatFromPrice("baku") },
  { image: "/destinations/tbilisi.jpg", city: "Tiflis", tag: "Kimlikle", time: "2s 15dk", price: formatFromPrice("tbilisi") },
  { image: "/destinations/sarajevo.jpg", city: "Saraybosna", tag: "Vizesiz", time: "2s", price: formatFromPrice("sarajevo") },
  { image: "/destinations/dubai.jpg", city: "Dubai", tag: "e-Vize", time: "4s", price: formatFromPrice("dubai") },
];

const whyItems = [
  { icon: <Flame size={24} color="#F59E0B" />, title: "Anlık fiyat karşılaştırma", text: "Yüzlerce havayolu ve partner fiyatını tek ekranda gör." },
  { icon: <CheckCircle2 size={24} color="#10B981" />, title: "Vize rehberi dahil", text: "Her rota için vize durumu, gerekli belgeler ve ipuçları." },
  { icon: <Ticket size={24} color="#1476F2" />, title: "Fiyat alarmı", text: "Hedef fiyatını belirle, düştüğünde anında e-posta al." },
  { icon: <Sparkles size={24} color="#8B5CF6" />, title: "AI rota asistanı", text: "Seçimlerini yap, seyahat planını saniyeler içinde al." },
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
      {/* ═══ PREMIUM 3D HERO ═══════════════════════════════════════════ */}
      <section className="hp-hero" style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div className="hp-hero-bg" style={{ 
          zIndex: 0, 
          backgroundImage: 'linear-gradient(to right, rgba(6, 20, 51, 0.9) 0%, rgba(6, 20, 51, 0.6) 50%, rgba(6, 20, 51, 0.2) 100%), url("/plane-hero.webp")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }} />

        <div className="l2t-wrap hp-hero-inner" style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", alignItems: "center", textAlign: "left" }}>
          
          {/* Sol: Metinler */}
          <div className="hp-hero-copy">
            <ScrollReveal delay={0.1} yOffset={20}>
              <span className="hp-badge l2t-hide-mobile"><Plane size={14} style={{ marginRight: "6px" }} /> Türkiye çıkışlı en ucuz uçuşlar</span>
            </ScrollReveal>
            
            <ScrollReveal delay={0.2} yOffset={30}>
              <h1 style={{ textAlign: "left", fontSize: "clamp(2rem, 5vw, 4rem)", textShadow: "0 4px 24px rgba(0,0,0,0.4)", lineHeight: "1.1", color: "#fff", marginBottom: "20px" }}>
                Seçimlerini yap,<br />
                <em>rotaları görelim.</em>
              </h1>
            </ScrollReveal>
            
            <ScrollReveal delay={0.3} yOffset={20}>
              <p className="l2t-hide-mobile" style={{ margin: "0 0 32px", textAlign: "left", fontSize: "1.2rem", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                IST ve SAW çıkışlı yüzlerce fiyatı karşılaştır.
                Vize rehberi, fiyat alarmı ve AI asistanıyla tek platformda.
              </p>
            </ScrollReveal>
            
            <ScrollReveal delay={0.2} yOffset={20}>
              <div className="hp-hero-buttons l2t-hide-mobile" style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <Link href="/kampanyalar" className="l2t-btn" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Ticket size={18} /> Fırsatları Gör
                </Link>
                <Link href="/vizesiz-ulkeler" className="l2t-btn l2t-btn-outline" style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}>
                  <Globe size={18} /> Vizesiz ülkeler
                </Link>
                <SurpriseButton />
              </div>
            </ScrollReveal>

            {/* Mobile App Shortcuts Grid */}
            <div className="l2t-mobile-only l2t-app-shortcut-grid">
              <Link href="/#bilet-ara" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #1476f2, #0b5bce)", color: "#fff" }}><Plane size={24} /></div>
                <span>Uçak</span>
              </Link>
              <a href={withUtm(siteSettings.bookingAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#fff" }}><Hotel size={24} /></div>
                <span>Otel</span>
              </a>
              <a href={withUtm(siteSettings.airaloAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}><Wifi size={24} /></div>
                <span>eSIM</span>
              </a>
              <Link href="/vizesiz-ulkeler" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)", color: "#fff" }}><Globe size={24} /></div>
                <span>Vizesiz</span>
              </Link>
              <Link href="/kampanyalar" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #EF4444, #B91C1C)", color: "#fff" }}><Ticket size={24} /></div>
                <span>Fırsatlar</span>
              </Link>
              <a href={withUtm(siteSettings.getYourGuideAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-app-shortcut hover-tilt">
                <div className="shortcut-icon" style={{ background: "linear-gradient(135deg, #F43F5E, #BE123C)", color: "#fff" }}><MapPin size={24} /></div>
                <span>Turlar</span>
              </a>
            </div>

            {/* Rota hızlı kartlar (Desktop) */}
            <ScrollReveal delay={0.5}>
              <div className="hp-quick-routes l2t-scroll-x l2t-hide-mobile" style={{ justifyContent: "flex-start", marginTop: "30px" }}>
                {routeHighlights.map((r) => (
                  <Link href="/kampanyalar" key={r.city} className="hp-qr-card" style={{ padding: "8px", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.2)", minWidth: "160px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "var(--l2t-navy)", backgroundImage: `url(${r.image})`, backgroundSize: "cover", backgroundPosition: "center", marginRight: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}></div>
                    <span className="hp-qr-city" style={{ color: "#fff" }}>{r.city}</span>
                    <span className="hp-qr-tag" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>{r.tag}</span>
                    <span className="hp-qr-price" style={{ color: "#fff", fontWeight: "700" }}>{r.price}</span>
                  </Link>
                ))}
              </div>
              <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)", marginTop: "8px", marginLeft: "4px" }}>
                * Fiyatlar dönemsel olarak değişebilir. Güncel fiyat için arama yapın.
              </p>
            </ScrollReveal>

            {/* Mobile AI Hızlı Sor (Mobil) */}
            <ScrollReveal delay={0.4}>
              <div className="l2t-mobile-only" style={{ marginTop: "16px", marginBottom: "30px" }}>
                <Link href="/akilli-plan" style={{ display: "flex", width: "100%", background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(20,118,242,0.15))", backdropFilter: "blur(16px)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "20px", padding: "12px 16px", alignItems: "center", justifyContent: "space-between", boxShadow: "0 8px 32px rgba(0,0,0,0.1)", textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ background: "#F59E0B", borderRadius: "12px", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={20} color="var(--l2t-navy)" />
                    </div>
                    <div>
                      <div style={{ color: "#F59E0B", fontSize: "0.75rem", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>YENİ ÖZELLİK</div>
                      <div style={{ color: "#fff", fontSize: "1.05rem", fontWeight: "700" }}>Yapay Zeka ile Planla</div>
                    </div>
                  </div>
                  <div style={{ color: "#fff", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "100px", padding: "8px 16px", fontSize: "0.9rem", fontWeight: "600" }}>
                    Başla
                  </div>
                </Link>
              </div>
            </ScrollReveal>
          </div>

          {/* Sağ: Havada Süzülen Premium Biletler (Floating Tickets) */}
          <ScrollReveal delay={0.3} yOffset={0}>
            <div className="hp-floating-art l2t-hide-mobile" style={{ transform: "scale(1.1)" }}>
              <div className="floating-ticket t1" style={{ backdropFilter: "blur(16px)", background: "rgba(255,255,255,0.85)" }}>
                <div className="tic-head"><span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--l2t-navy)" }}><Plane size={14} /> Gidiş</span> <small style={{ color: "var(--l2t-soft)" }}>THY</small></div>
                <div className="tic-body">
                  <h2 style={{ color: "var(--l2t-navy)" }}>IST <span className="arrow" style={{ color: "var(--l2t-soft)" }}>→</span> DXB</h2>
                  <p style={{ color: "var(--l2t-soft)" }}>Dubai, BAE</p>
                </div>
              </div>
              <div className="floating-ticket t2" style={{ backdropFilter: "blur(16px)", background: "rgba(255,255,255,0.85)" }}>
                <div className="tic-head"><span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#F59E0B" }}><Flame size={14} /> Fırsat</span> <small style={{ color: "var(--l2t-soft)" }}>Pegasus</small></div>
                <div className="tic-body">
                  <h2 style={{ color: "var(--l2t-navy)" }}>SAW <span className="arrow" style={{ color: "var(--l2t-soft)" }}>→</span> FCO</h2>
                  <p style={{ color: "var(--l2t-soft)" }}>Roma, İtalya</p>
                </div>
              </div>
              <div className="floating-ticket t3" style={{ backdropFilter: "blur(16px)", background: "rgba(255,255,255,0.85)" }}>
                <div className="tic-head"><span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#10B981" }}><CheckCircle2 size={14} /> Vizesiz</span> <small style={{ color: "var(--l2t-soft)" }}>AJet</small></div>
                <div className="tic-body">
                  <h2 style={{ color: "var(--l2t-navy)" }}>IST <span className="arrow" style={{ color: "var(--l2t-soft)" }}>→</span> SJJ</h2>
                  <p style={{ color: "var(--l2t-soft)" }}>Saraybosna</p>
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

      {/* ═══ BELGELİ GEZGİN ═══════════════════════════════════════════════ */}
      <div style={{ background: "#040C1A", marginTop: "4rem", paddingTop: "2rem", paddingBottom: "2rem" }}>
        <VerifiedTravelerSection />
      </div>

      {/* ═══ AI ROTA DANIŞMANI (Senaryo Kartları) ═════════════════════════ */}
      <section className="l2t-wrap" style={{ marginTop: "60px", scrollMarginTop: "100px" }} id="akilli-plan">
        <ScrollReveal delay={0.1}>
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(245,158,11,0.1)", color: "#F59E0B", padding: "6px 16px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "16px" }}>
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
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#EEF7FF", color: "#1476F2", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Wallet size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>10.000 TL altı vizesiz rota</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Avrupa'da veya çevremizde düşük bütçeyle gezilebilecek en iyi vizesiz alternatifler.</p>
              <div style={{ display: "flex", alignItems: "center", color: "#F59E0B", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>AI ile Planla <ChevronRight size={16} /></div>
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
              <div style={{ display: "flex", alignItems: "center", color: "#F59E0B", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>AI ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>

          {/* Preset Card 3 */}
          <ScrollReveal delay={0.4}>
            <Link href="/akilli-plan?preset=ilk-kez-yurtdisi" className="glass-panel hover-tilt" style={{ display: "block", textDecoration: "none", padding: "24px", borderRadius: "20px", border: "1px solid rgba(0,0,0,0.05)", background: "#fff", height: "100%" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "#FFF5E6", color: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Plane size={24} />
              </div>
              <h3 style={{ fontSize: "1.2rem", color: "var(--l2t-navy)", margin: "0 0 8px", fontWeight: "700" }}>İlk kez yurt dışı için kolay rota</h3>
              <p style={{ color: "var(--l2t-soft)", fontSize: "0.95rem", margin: "0 0 16px", lineHeight: "1.5" }}>Ulaşımı kolay, güvenli ve yabancılık çekmeyeceğiniz başlangıç seviyesi ülkeler.</p>
              <div style={{ display: "flex", alignItems: "center", color: "#F59E0B", fontWeight: "600", fontSize: "0.9rem", gap: "6px" }}>AI ile Planla <ChevronRight size={16} /></div>
            </Link>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.5}>
          <div style={{ textAlign: "center" }}>
            <Link href="/akilli-plan" className="l2t-btn" style={{ 
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
              <Sparkles size={18} color="#F59E0B" /> Kendi Özel Planını Oluştur
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
              <a href={withUtm("https://www.aviasales.com/search?origin_iata=IST")} target="_blank" rel="noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
                <div className="l2t-card-icon" style={{ background: "#EEF7FF", color: "#1476F2" }}><Plane size={24} /></div>
                <h3>Uçak Bileti</h3>
                <p>Yüzlerce havayolu ve partner fiyatını anlık karşılaştır, en ucuz uçuşu bul.</p>
                <span className="l2t-btn l2t-btn-small">Bilet ara →</span>
              </a>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <a href={withUtm(siteSettings.bookingAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
                <div className="l2t-card-icon" style={{ background: "#FFF5E6", color: "#F59E0B" }}><Hotel size={24} /></div>
                <h3>Otel Bul</h3>
                <p>Konum, puan ve iptal esnekliğine göre en iyi oteli karşılaştır.</p>
                <span className="l2t-btn l2t-btn-small">Otellere bak →</span>
              </a>
            </ScrollReveal>
            <ScrollReveal delay={0.3}>
              <a href={withUtm(siteSettings.airaloAffiliateUrl)} target="_blank" rel="noreferrer" className="l2t-card l2t-affiliate-card hover-tilt">
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
