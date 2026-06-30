import Link from "next/link";
import { ArrowLeft, MessageSquare, PenTool, MapPin, Users, BadgeCheck, ShieldCheck, Trophy, Compass, Clock, CheckCircle2, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { getCountryBySlug } from "@/lib/data";

export const dynamic = "force-dynamic";

type ForumTopicRow = {
  id: string | number;
  title: string;
  category: string | null;
  country_slug: string | null;
  author_name: string | null;
  created_at: string | null;
};

function countryNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateLabel(value?: string | null) {
  if (!value) return "Yeni";
  try {
    return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Yeni";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  const countryName = country?.country_name || countryNameFromSlug(slug);

  return {
    title: `${countryName} Forum & Doğrulanmış Gezgin Deneyimleri | LetsGo2Travel`,
    description: `${countryName} hakkında soru sor, doğrulanmış gezgin deneyimlerini oku ve seyahat planını toplulukla netleştir.`,
  };
}

export default async function CountryForumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  const countryName = country?.country_name || countryNameFromSlug(slug);
  const askHref = `/forum/yeni?country=${encodeURIComponent(slug)}&countryName=${encodeURIComponent(countryName)}&kategori=ulke-bazli-sorunlar&title=${encodeURIComponent(`${countryName} hakkında soru sormak istiyorum`)}`;
  const verifyHref = `/profil/dogrulama?country=${encodeURIComponent(slug)}`;

  const { data: topics } = await supabase
    .from("forum_topics")
    .select("id,title,category,country_slug,author_name,created_at")
    .eq("status", "published")
    .eq("country_slug", slug)
    .order("created_at", { ascending: false })
    .limit(30);

  const countryTopics = (topics || []) as ForumTopicRow[];

  const starterQuestions = [
    `${countryName} girişte dönüş bileti soruyor mu?`,
    `${countryName} için günlük harcama ortalama ne kadar?`,
    `${countryName} havalimanından merkeze en güvenli ulaşım nedir?`,
    `${countryName} ilk kez gidecekler nelere dikkat etmeli?`,
  ];

  return (
    <div className="l2t-page l2t-country-forum-page">
      <section className="l2t-country-forum-hero">
        <div className="l2t-wrap l2t-country-forum-hero-inner">
          <Link href="/forum" className="l2t-country-forum-back">
            <ArrowLeft size={16} /> Tüm foruma dön
          </Link>

          <div className="l2t-country-forum-eyebrow">
            <MapPin size={16} /> Ülke topluluğu
          </div>

          <h1>{country?.emoji ? `${country.emoji} ` : ""}{countryName} gezgin topluluğu</h1>
          <p>
            {countryName} için vize, giriş, ulaşım, internet, güvenlik ve bütçe sorularını gezginlere sor. Doğrulanmış kullanıcı cevapları daha güvenilir şekilde öne çıkar.
          </p>

          <div className="l2t-country-forum-actions">
            <Link href={askHref} className="l2t-country-forum-primary">
              <PenTool size={18} /> {countryName} hakkında soru sor
            </Link>
            <Link href={verifyHref} className="l2t-country-forum-secondary">
              <ShieldCheck size={18} /> Bu ülkeyi doğrula
            </Link>
            <Link href={`/ulke-rehberi/${slug}`} className="l2t-country-forum-secondary">
              <Compass size={18} /> Rehberi oku
            </Link>
          </div>
        </div>
      </section>

      <main className="l2t-wrap l2t-country-forum-layout">
        <aside className="l2t-country-forum-sidebar">
          {country && (
            <div className="l2t-country-forum-info-card">
              <span className="l2t-country-forum-info-icon"><CheckCircle2 size={20} /></span>
              <strong>Vize durumu</strong>
              <p>{country.visa_status}</p>
              <small>{country.visa_note}</small>
            </div>
          )}

          <div className="l2t-country-forum-info-card">
            <span className="l2t-country-forum-info-icon"><BadgeCheck size={20} /></span>
            <strong>Doğrulanmış gezgin</strong>
            <p>Gittiği ülkeyi belgeleyen kullanıcıların cevapları toplulukta daha güvenli kabul edilir.</p>
            <Link href={verifyHref}>Doğrulama başlat →</Link>
          </div>

          <div className="l2t-country-forum-info-card">
            <span className="l2t-country-forum-info-icon"><Trophy size={20} /></span>
            <strong>Kaşifler Ligi</strong>
            <p>Ülke doğrulayan kullanıcılar ligde puan kazanır ve profillerinde gezdiği ülkeleri gösterebilir.</p>
            <Link href="/kasifler-ligi">Ligi gör →</Link>
          </div>
        </aside>

        <section className="l2t-country-forum-content">
          <div className="l2t-country-forum-section-head">
            <div>
              <p className="l2t-kicker">Forum akışı</p>
              <h2>{countryName} hakkında son sorular</h2>
            </div>
            <Link href={askHref}>Yeni soru sor <PenTool size={16} /></Link>
          </div>

          {countryTopics.length > 0 ? (
            <div className="l2t-country-forum-topic-list">
              {countryTopics.map((topic) => (
                <Link key={topic.id} href={`/forum/${topic.id}`} className="l2t-country-forum-topic-card">
                  <div>
                    <span className="l2t-country-forum-topic-category">{topic.category || "Ülke Bazlı Sorunlar"}</span>
                    <h3>{topic.title}</h3>
                    <div className="l2t-country-forum-topic-meta">
                      <span><Users size={14} /> {topic.author_name || "Gezgin"}</span>
                      <span><Clock size={14} /> {dateLabel(topic.created_at)}</span>
                    </div>
                  </div>
                  <span className="l2t-country-forum-topic-action">İncele →</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="l2t-country-forum-empty">
              <MessageSquare size={42} />
              <h3>Bu ülke için henüz yayınlanmış soru yok.</h3>
              <p>İlk soruyu sen sor. Cevaplar geldikçe bu sayfa ülkeye özel deneyim arşivine dönüşür.</p>
              <Link href={askHref}>İlk soruyu sor</Link>
            </div>
          )}

          <div className="l2t-country-forum-starters">
            <div className="l2t-country-forum-section-head compact">
              <div>
                <p className="l2t-kicker">Hazır soru fikirleri</p>
                <h2>Tek tıkla konu başlat</h2>
              </div>
            </div>
            <div className="l2t-country-forum-starter-grid">
              {starterQuestions.map((title) => (
                <Link key={title} href={`/forum/yeni?country=${encodeURIComponent(slug)}&countryName=${encodeURIComponent(countryName)}&kategori=ulke-bazli-sorunlar&title=${encodeURIComponent(title)}`}>
                  <HelpCircle size={17} /> {title}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
