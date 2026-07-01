import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, Wallet, CheckCircle2, Info } from "lucide-react";
import { getCountryBySlug, getCountryGuides } from "@/lib/data";
import ScrollReveal from "@/app/components/ScrollReveal";
import CountryFavicon from "@/app/components/CountryFavicon";
import CountryHero from "@/app/components/CountryHero";
import JsonLd from "@/app/components/JsonLd";
import CountryGuideCtas from "@/app/components/CountryGuideCtas";
import CountryCommunityPanel from "@/app/components/CountryCommunityPanel";
import CountrySeoContent from "@/app/components/CountrySeoContent";
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

      <CountrySeoContent country={country} />
      <CountryGuideCtas country={country} />
      <CountryCommunityPanel country={country} />
      
    </section>
  );
}
