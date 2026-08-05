import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  Compass,
  MapPin,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

import { getCountryBySlug } from "@/lib/data";
import { supabase } from "@/lib/supabase-client";

import CountryQuestionModal from "./CountryQuestionModal";
import styles from "./Forum.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

interface ForumTopicRow {
  id: string;
  title: string;
  content: string;
  category: string | null;
  country_slug: string | null;
  author_name: string | null;
  created_at: string;
  updated_at?: string | null;
  is_paywalled?: boolean | null;
}

interface ForumReplyRow {
  id: string;
  author_name: string | null;
  content: string;
  created_at: string;
}

interface PaywallStateRow {
  total_replies?: number | string | null;
  is_paywalled?: boolean | null;
}

function countryNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function dateLabel(value?: string | null) {
  if (!value) return "Yeni";

  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function asPaywallState(value: unknown): PaywallStateRow {
  if (Array.isArray(value)) return (value[0] ?? {}) as PaywallStateRow;
  return (value ?? {}) as PaywallStateRow;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  const countryName = country?.country_name || countryNameFromSlug(slug);

  return {
    title: `${countryName} Vize ve Giriş Deneyimleri`,
    description: `${countryName} için güncel vize, pasaport kontrolü, gümrük ve ülkeye giriş deneyimlerini gerçek gezginlerden oku.`,
    alternates: { canonical: `/forum/ulke/${slug}` },
    openGraph: {
      title: `${countryName} Gezgin Topluluğu`,
      description: `${countryName} için güncel vize ve giriş deneyimleri.`,
      type: "website",
      url: `/forum/ulke/${slug}`,
      siteName: "LetsGo2Travel",
    },
  };
}

export default async function CountryForumPage({ params }: PageProps) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  const countryName = country?.country_name || countryNameFromSlug(slug);
  const countryEmoji = country?.emoji || "🌍";
  const verifyHref = `/profil/dogrulamalar?country=${encodeURIComponent(slug)}`;

  const { data: topicData, error: topicsError } = await supabase
    .from("forum_topics")
    .select("id,title,content,category,country_slug,author_name,created_at,updated_at,is_paywalled")
    .eq("status", "published")
    .eq("country_slug", slug)
    .order("created_at", { ascending: false })
    .limit(30);

  if (topicsError) {
    console.error("Ülke forum konuları alınamadı:", topicsError.message);
  }

  const countryTopics = (topicData ?? []) as ForumTopicRow[];
  const featuredTopic = countryTopics[0] ?? null;

  let visibleReplies: ForumReplyRow[] = [];
  let totalReplies = 0;
  let hiddenReplyCount = 0;
  let isPaywalled = false;

  if (featuredTopic) {
    const [replyResult, stateResult] = await Promise.all([
      supabase
        .from("forum_replies")
        .select("id,author_name,content,created_at")
        .eq("topic_id", featuredTopic.id)
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase.rpc("get_forum_topic_paywall_state", {
        p_topic_id: featuredTopic.id,
      }),
    ]);

    if (replyResult.error) {
      console.error("Ülke forum cevapları alınamadı:", replyResult.error.message);
    }

    if (stateResult.error) {
      console.error("Paywall durumu alınamadı:", stateResult.error.message);
    }

    visibleReplies = ((replyResult.data ?? []) as ForumReplyRow[]).slice(0, 2);
    const state = asPaywallState(stateResult.data);
    totalReplies = Number(state.total_replies ?? visibleReplies.length);
    isPaywalled = Boolean(state.is_paywalled ?? featuredTopic.is_paywalled);
    hiddenReplyCount = isPaywalled
      ? Math.max(totalReplies - visibleReplies.length, 0)
      : 0;
  }

  const starterQuestions = [
    `${countryName} girişinde dönüş bileti soruldu mu?`,
    `${countryName} pasaport kontrolünde hangi belgeler istendi?`,
    `${countryName} vize başvurusu ne kadar sürede sonuçlandı?`,
    `${countryName} ilk kez gidecekler nelere dikkat etmeli?`,
  ];

  const jsonLd = featuredTopic
    ? {
        "@context": "https://schema.org",
        "@type": "QAPage",
        mainEntity: {
          "@type": "Question",
          name: featuredTopic.title,
          text: featuredTopic.content,
          dateCreated: featuredTopic.created_at,
          answerCount: totalReplies,
          author: {
            "@type": "Person",
            name: featuredTopic.author_name || "LetsGo2Travel gezgini",
          },
          suggestedAnswer: visibleReplies.map((reply) => ({
            "@type": "Answer",
            text: reply.content,
            dateCreated: reply.created_at,
            author: {
              "@type": "Person",
              name: reply.author_name || "LetsGo2Travel gezgini",
            },
          })),
        },
      }
    : null;

  return (
    <div className={styles.page}>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}

      <section className={styles.hero}>
        <div className={styles.container}>
          <div className={styles.heroPanel}>
            <Link href="/forum" className={styles.backLink}>
              <ArrowLeft size={16} aria-hidden="true" />
              Tüm foruma dön
            </Link>

            <p className={styles.eyebrow}>
              {countryEmoji} VİZE VE GİRİŞ DENEYİMLERİ
            </p>

            <h1 className={styles.heroTitle}>{countryName} gezgin topluluğu</h1>

            <p className={styles.heroDescription}>
              {countryName} için vize, pasaport kontrolü, gümrük, ulaşım ve
              güvenlik deneyimlerini gerçek gezginlerden oku. Kendi sorunu
              paylaşarak topluluğa katkıda bulun.
            </p>

            <div className={styles.heroActions}>
              <CountryQuestionModal
                countrySlug={slug}
                countryName={countryName}
                presets={starterQuestions}
                mode="hero"
              />

              <Link href={verifyHref} className={styles.secondaryButton}>
                <ShieldCheck size={18} aria-hidden="true" />
                Bu ülkeyi doğrula
              </Link>

              <button
                type="button"
                className={styles.tooltipButton}
                aria-disabled="true"
                data-tooltip="Pek yakında"
              >
                <Compass size={18} aria-hidden="true" />
                Rehberi oku
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className={`${styles.container} ${styles.layout}`}>
        {countryTopics.length === 0 ? (
          <section className={styles.quickInfo}>
            <div className={styles.quickInfoHeader}>
              <div>
                <h2>{countryEmoji} {countryName} hızlı bilgi</h2>
                <p>Henüz soru bulunmadığı için temel giriş bilgileri otomatik gösteriliyor.</p>
              </div>
              <span className={styles.quickBadge}>Hızlı özet</span>
            </div>

            <div className={styles.quickGrid}>
              <article className={styles.quickItem}>
                <span>Vize durumu</span>
                <strong>{country?.visa_status || "Güncel durum doğrulanıyor"}</strong>
              </article>
              <article className={styles.quickItem}>
                <span>Pasaport</span>
                <strong>Geçerlilik süresini ve boş sayfa şartını seyahat öncesinde kontrol et.</strong>
              </article>
              <article className={styles.quickItem}>
                <span>Girişte dikkat</span>
                <strong>{country?.visa_note || "Dönüş bileti ve konaklama belgesi sorulabilir."}</strong>
              </article>
            </div>

            <p className={styles.disclaimer}>
              Bu özet genel bilgilendirme amaçlıdır. Resmî makamların güncel
              açıklamalarını seyahat öncesinde mutlaka kontrol et.
            </p>
          </section>
        ) : null}

        {featuredTopic ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>ÖNE ÇIKAN SORU</p>
                <h2>Gezginlerin konuştuğu güncel konu</h2>
              </div>
              {isPaywalled && hiddenReplyCount > 0 ? (
                <span className={styles.previewBadge}>İlk 2 cevap açık</span>
              ) : null}
            </div>

            <article className={styles.featuredQuestion}>
              <div className={styles.questionMeta}>
                <span>{featuredTopic.category || "Vize & Konsolosluk"}</span>
                <span>{totalReplies} cevap</span>
                <span>{dateLabel(featuredTopic.created_at)}</span>
              </div>
              <h2>{featuredTopic.title}</h2>
              <p>{featuredTopic.content}</p>
            </article>

            {visibleReplies.length > 0 ? (
              <div className={styles.answers}>
                {visibleReplies.map((reply) => (
                  <article className={styles.answerCard} key={reply.id}>
                    <header className={styles.answerHeader}>
                      <strong>{reply.author_name || "Gezgin"}</strong>
                      <time dateTime={reply.created_at}>{dateLabel(reply.created_at)}</time>
                    </header>
                    <p>{reply.content}</p>
                  </article>
                ))}
              </div>
            ) : null}

            {hiddenReplyCount > 0 ? (
              <section className={styles.lockedSection} aria-label="Kilitli gezgin deneyimleri">
                <div className={styles.lockedContent} aria-hidden="true">
                  {Array.from({ length: Math.min(hiddenReplyCount, 3) }).map((_, index) => (
                    <div className={styles.placeholderCard} key={index}>
                      <span className={styles.placeholderHeader} />
                      <span className={styles.placeholderLine} />
                      <span className={styles.placeholderLine} />
                      <span className={`${styles.placeholderLine} ${styles.placeholderLineShort}`} />
                    </div>
                  ))}
                </div>
                <div className={styles.lockedVeil} aria-hidden="true" />
                <div className={styles.unlockCard}>
                  <h3>{hiddenReplyCount} güncel deneyim daha var</h3>
                  <p>
                    Tüm vize, gümrük ve giriş tecrübelerini okumak için konu
                    sayfasından ülkenin kilidini aç.
                  </p>
                  <Link href={`/forum/${featuredTopic.id}`}>Kilidi aç / Üye ol</Link>
                </div>
              </section>
            ) : null}
          </section>
        ) : (
          <section className={styles.section}>
            <div className={styles.emptyState}>
              Bu ülke için henüz yayınlanmış soru yok. İlk soruyu sen başlatabilirsin.
            </div>
          </section>
        )}

        {countryTopics.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.sectionKicker}>FORUM AKIŞI</p>
                <h2>{countryName} hakkında son sorular</h2>
              </div>
            </div>

            <div className={styles.topicList}>
              {countryTopics.map((topic) => (
                <Link key={topic.id} href={`/forum/${topic.id}`} className={styles.topicCard}>
                  <div>
                    <h3>{topic.title}</h3>
                    <p>
                      <Users size={14} aria-hidden="true" /> {topic.author_name || "Gezgin"}
                      {" · "}
                      <Clock size={14} aria-hidden="true" /> {dateLabel(topic.created_at)}
                    </p>
                  </div>
                  <span className={styles.topicAction}>İncele →</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionKicker}>HAZIR SORU FİKİRLERİ</p>
              <h2>Tek tıkla konu başlat</h2>
              <p>Bir karta bastığında modal, seçilen soru başlığıyla otomatik dolar.</p>
            </div>
          </div>

          <CountryQuestionModal
            countrySlug={slug}
            countryName={countryName}
            presets={starterQuestions}
            mode="presets"
          />
        </section>

        <section className={styles.section} aria-label="Topluluk özellikleri">
          <div className={styles.presetGrid}>
            <Link href={verifyHref} className={styles.presetCard}>
              <BadgeCheck size={20} />
              <span>Doğrulanmış gezgin ol ve cevaplarında güven rozeti kazan.</span>
            </Link>
            <Link href="/kasifler-ligi" className={styles.presetCard}>
              <Trophy size={20} />
              <span>Ülke doğrulamalarından puan kazanıp Kaşifler Ligi&apos;nde yüksel.</span>
            </Link>
            <Link href="/forum" className={styles.presetCard}>
              <MapPin size={20} />
              <span>Diğer ülkelerin topluluk sayfalarını ve güncel sorularını keşfet.</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
