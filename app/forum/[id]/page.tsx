import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  AlertCircle,
  ArrowLeft,
  MapPin,
  MessageSquare,
  User,
} from "lucide-react";

import ForumReplyForm from "@/components/ForumReplyForm";
import ForumReportButton from "@/components/ForumReportModal";
import { forumTopicIsPaywalled } from "@/lib/community/forum-sync";
import { supabase } from "@/lib/supabase-client";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

import styles from "./Forum.module.css";
import ForumPaywallClient from "./ForumPaywallClient";
import type { ForumPaywallStateRow, ForumReplyView } from "./types";

export const dynamic = "force-dynamic";

interface ForumTopicRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string | null;
  country_slug: string | null;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_paywalled?: boolean | null;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function countryNameFromSlug(value: string | null) {
  if (!value) return "Genel";

  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function asNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function descriptionFromContent(content: string) {
  const cleaned = content.replace(/\s+/g, " ").trim();
  return cleaned.length > 155 ? `${cleaned.slice(0, 152)}…` : cleaned;
}

const getTopic = cache(async function getTopic(id: string) {
  const { data } = await supabase
    .from("forum_topics")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  return (data as ForumTopicRow | null) ?? null;
});

async function getPaywallState(topicId: string) {
  const { data, error } = await supabase.rpc("get_forum_topic_paywall_state", {
    p_topic_id: topicId,
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    return data[0] as ForumPaywallStateRow;
  }

  return null;
}

async function getReplyCountFallback(topicId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { count, error } = await admin
    .from("forum_replies")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId)
    .eq("status", "published");

  if (error) return null;
  return count ?? 0;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const topic = await getTopic(id);

  if (!topic) {
    return {
      title: "Forum konusu bulunamadı",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${topic.title} · Forum`,
    description: descriptionFromContent(topic.content),
    alternates: { canonical: `/forum/${topic.id}` },
    openGraph: {
      title: topic.title,
      description: descriptionFromContent(topic.content),
      type: "article",
      url: `/forum/${topic.id}`,
      siteName: "LetsGo2Travel",
    },
  };
}

export default async function ForumTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const topic = await getTopic(id);

  if (!topic) notFound();

  const codeMarksTopicAsPaywalled = forumTopicIsPaywalled(
    topic.country_slug,
    topic.category,
    topic.is_paywalled,
  );

  const [replyResult, paywallState] = await Promise.all([
    supabase
      .from("forum_replies")
      .select("id,topic_id,author_name,content,created_at")
      .eq("topic_id", topic.id)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    getPaywallState(topic.id),
  ]);

  const fetchedReplies = (replyResult.data ?? []) as ForumReplyView[];
  const fallbackCount = paywallState
    ? null
    : await getReplyCountFallback(topic.id);
  const isPaywalled =
    paywallState?.is_paywalled ?? codeMarksTopicAsPaywalled;
  const totalReplies = asNumber(
    paywallState?.total_replies,
    fallbackCount ?? fetchedReplies.length,
  );
  const visibleReplies = isPaywalled
    ? fetchedReplies.slice(0, 2)
    : fetchedReplies;
  const hiddenReplyCount = isPaywalled
    ? Math.max(totalReplies - visibleReplies.length, 0)
    : 0;
  const countryName = countryNameFromSlug(topic.country_slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: topic.title,
      text: topic.content,
      dateCreated: topic.created_at,
      answerCount: totalReplies,
      author: {
        "@type": "Person",
        name: topic.author_name || "LetsGo2Travel kullanıcısı",
      },
      suggestedAnswer: visibleReplies.map((reply) => ({
        "@type": "Answer",
        text: reply.content,
        dateCreated: reply.created_at,
        author: {
          "@type": "Person",
          name: reply.author_name || "LetsGo2Travel kullanıcısı",
        },
      })),
    },
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <section className={styles.hero}>
        <div className={styles.container}>
          <Link href="/forum" className={styles.backLink}>
            <ArrowLeft size={17} aria-hidden="true" />
            Foruma dön
          </Link>

          <div className={styles.topicMeta}>
            <span>{topic.category}</span>
            {topic.country_slug ? (
              <Link href={`/forum/ulke/${topic.country_slug}`}>
                <MapPin size={14} aria-hidden="true" />
                {countryName}
              </Link>
            ) : null}
          </div>

          <h1>{topic.title}</h1>
          <p className={styles.heroDescription}>
            Gerçek gezgin deneyimleri, güncel giriş süreçleri ve topluluk
            cevapları tek başlıkta.
          </p>
        </div>
      </section>

      <div className={styles.containerNarrow}>
        <aside className={styles.notice}>
          <AlertCircle size={21} aria-hidden="true" />
          <p>
            Bu sayfadaki mesajlar kullanıcı deneyimidir. Vize, pasaport ve giriş
            kuralları değişebilir; işlem öncesinde ilgili konsolosluğun ve resmi
            kurumların güncel duyurularını doğrula.
          </p>
        </aside>

        <article className={styles.topicCard}>
          <header className={styles.topicAuthorRow}>
            <div className={styles.authorIdentity}>
              <span className={styles.authorAvatar} aria-hidden="true">
                <User size={24} />
              </span>
              <div>
                <strong>{topic.author_name || "Gizli Kullanıcı"}</strong>
                <time dateTime={topic.created_at}>{dateLabel(topic.created_at)}</time>
              </div>
            </div>
            <ForumReportButton targetId={topic.id} targetType="topic" />
          </header>
          <div className={styles.topicContent}>{topic.content}</div>
        </article>

        <section className={styles.repliesSection}>
          <div className={styles.repliesHeading}>
            <div>
              <p>TOPLULUK DENEYİMLERİ</p>
              <h2>
                <MessageSquare size={22} aria-hidden="true" />
                {totalReplies} cevap
              </h2>
            </div>
            {isPaywalled && hiddenReplyCount > 0 ? (
              <span className={styles.previewBadge}>İlk 2 cevap açık</span>
            ) : null}
          </div>

          {visibleReplies.length > 0 ? (
            <div className={styles.replyList}>
              {visibleReplies.map((reply) => (
                <article className={styles.replyCard} key={reply.id}>
                  <header className={styles.replyHeader}>
                    <div className={styles.replyIdentity}>
                      <span className={styles.replyAvatar} aria-hidden="true">
                        <User size={18} />
                      </span>
                      <div>
                        <strong>{reply.author_name || "Gizli Kullanıcı"}</strong>
                        <time dateTime={reply.created_at}>
                          {dateLabel(reply.created_at)}
                        </time>
                      </div>
                    </div>
                    <ForumReportButton targetId={reply.id} targetType="reply" />
                  </header>
                  <p className={styles.replyContent}>{reply.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyReplies}>
              <MessageSquare size={28} aria-hidden="true" />
              <h2>Henüz cevap yok</h2>
              <p>Bu başlıktaki ilk deneyimi sen paylaşabilirsin.</p>
            </div>
          )}

          {isPaywalled && hiddenReplyCount > 0 && topic.country_slug ? (
            <ForumPaywallClient
              topicId={topic.id}
              topicTitle={topic.title}
              countrySlug={topic.country_slug}
              countryName={countryName}
              totalReplies={totalReplies}
              hiddenReplyCount={hiddenReplyCount}
            />
          ) : (
            <div className={styles.replyFormWrap}>
              <ForumReplyForm topicId={topic.id} topicTitle={topic.title} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
