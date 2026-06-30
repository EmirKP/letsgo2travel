import Link from "next/link";
import { BadgeCheck, MessageCircleQuestion, ShieldCheck, Trophy, Users, ArrowRight, MapPinned } from "lucide-react";
import type { CountryGuide } from "@/lib/types";

const questionIdeas = [
  "Girişte hangi belge soruluyor?",
  "Havalimanından merkeze en mantıklı ulaşım ne?",
  "Günlük ortalama harcama ne kadar?",
  "İlk kez gidecekler neye dikkat etmeli?",
];

export default function CountryCommunityPanel({ country }: { country: CountryGuide }) {
  const forumHref = `/forum/ulke/${country.slug}`;
  const askHref = `/forum/yeni?country=${encodeURIComponent(country.slug)}&countryName=${encodeURIComponent(country.country_name)}&kategori=ulke-bazli-sorunlar&title=${encodeURIComponent(`${country.country_name} hakkında soru sormak istiyorum`)}`;
  const verifyHref = `/profil/dogrulama?country=${encodeURIComponent(country.slug)}`;

  return (
    <section className="l2t-wrap l2t-community-panel" aria-labelledby="country-community-title">
      <div className="l2t-community-hero">
        <p className="l2t-kicker">Doğrulanmış gezgin ağı</p>
        <h2 id="country-community-title">{country.country_name} hakkında gerçek gezginlerden bilgi al</h2>
        <p>
          LetsGo2Travel&apos;da amaç sadece rehber okumak değil; o ülkeye gerçekten gitmiş gezginlerin deneyimini görüp daha güvenli karar vermek.
        </p>
        <div className="l2t-community-hero-actions">
          <Link href={forumHref} className="l2t-community-primary-link">
            <MessageCircleQuestion size={18} /> Forum yorumlarını gör
          </Link>
          <Link href={askHref} className="l2t-community-secondary-link">
            Soru sor <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <div className="l2t-community-stack">
        <div className="l2t-community-card l2t-community-card-verified">
          <span className="l2t-community-icon"><BadgeCheck size={22} /></span>
          <div>
            <strong>Doğrulanmış cevaplar öne çıkar</strong>
            <p>{country.country_name} seyahatini belgeyle doğrulayan kullanıcıların cevapları daha güvenilir görünür.</p>
          </div>
        </div>

        <div className="l2t-community-card">
          <span className="l2t-community-icon"><ShieldCheck size={22} /></span>
          <div>
            <strong>Sen de deneyimini doğrula</strong>
            <p>Gittiğin ülkeyi doğrula, o ülke hakkında yorum ve cevap yazma hakkını güçlendir.</p>
            <Link href={verifyHref}>Ülkeyi doğrula →</Link>
          </div>
        </div>

        <div className="l2t-community-card">
          <span className="l2t-community-icon"><Trophy size={22} /></span>
          <div>
            <strong>Kaşifler Ligi puanı kazan</strong>
            <p>Doğrulanan ülkeler profilinde görünür ve Kaşifler Ligi sıralamana katkı sağlar.</p>
            <Link href="/kasifler-ligi">Kaşifler Ligi&apos;ni gör →</Link>
          </div>
        </div>
      </div>

      <div className="l2t-community-prompts">
        <div className="l2t-community-prompts-head">
          <Users size={20} />
          <strong>{country.country_name} için sorulabilecek konular</strong>
        </div>
        <div className="l2t-community-prompt-grid">
          {questionIdeas.map((idea) => (
            <Link
              key={idea}
              href={`/forum/yeni?country=${encodeURIComponent(country.slug)}&countryName=${encodeURIComponent(country.country_name)}&kategori=ulke-bazli-sorunlar&title=${encodeURIComponent(`${country.country_name}: ${idea}`)}`}
            >
              <MapPinned size={16} /> {idea}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
