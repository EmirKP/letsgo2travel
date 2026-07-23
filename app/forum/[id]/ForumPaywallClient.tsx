"use client";

import Link from "next/link";
import { LockKeyhole, ShieldCheck, Sparkles, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ForumReplyForm from "@/components/ForumReplyForm";
import ForumReportButton from "@/components/ForumReportModal";
import { supabase } from "@/lib/supabase-client";

import styles from "./Forum.module.css";
import type { ForumReplyView } from "./types";

type ViewerState = "checking" | "anonymous" | "member";
type AccessState = "locked" | "loading" | "unlocked" | "error";

interface ForumPaywallClientProps {
  topicId: string;
  topicTitle: string;
  countrySlug: string;
  countryName: string;
  totalReplies: number;
  hiddenReplyCount: number;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isLockedError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42501" ||
    error.message?.includes("FORUM_COUNTRY_LOCKED") === true ||
    error.message?.includes("authentication required") === true
  );
}

export default function ForumPaywallClient({
  topicId,
  topicTitle,
  countrySlug,
  countryName,
  totalReplies,
  hiddenReplyCount,
}: ForumPaywallClientProps) {
  const [viewerState, setViewerState] = useState<ViewerState>("checking");
  const [accessState, setAccessState] = useState<AccessState>("locked");
  const [hiddenReplies, setHiddenReplies] = useState<ForumReplyView[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const placeholderCount = useMemo(
    () => Math.min(Math.max(hiddenReplyCount, 2), 4),
    [hiddenReplyCount],
  );

  const loadUnlockedReplies = useCallback(async () => {
    setAccessState("loading");
    setErrorMessage("");

    const { data, error } = await supabase.rpc("get_unlocked_forum_replies", {
      p_topic_id: topicId,
    });

    if (error) {
      if (isLockedError(error)) {
        setAccessState("locked");
        return false;
      }

      console.error("Forum kilidi kontrol edilemedi", error);
      setErrorMessage("İçerik erişimi kontrol edilirken bir hata oluştu.");
      setAccessState("error");
      return false;
    }

    setHiddenReplies((data ?? []) as ForumReplyView[]);
    setAccessState("unlocked");
    return true;
  }, [topicId]);

  const checkViewer = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      setViewerState("anonymous");
      setAccessState("locked");
      return;
    }

    setViewerState("member");
    await loadUnlockedReplies();
  }, [loadUnlockedReplies]);

  useEffect(() => {
    void checkViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setViewerState("anonymous");
        setAccessState("locked");
        setHiddenReplies([]);
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        window.setTimeout(() => void checkViewer(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkViewer]);

  const unlockCountry = async () => {
    setAccessState("loading");
    setErrorMessage("");

    const { error } = await supabase.rpc("unlock_forum_country", {
      p_country_slug: countrySlug,
    });

    if (error) {
      console.error("Ülke forumu açılamadı", error);
      setErrorMessage(
        error.code === "42501"
          ? "Kilidi açmak için hesabına giriş yapmalısın."
          : "Ülke kilidi şu anda açılamadı. Lütfen tekrar dene.",
      );
      setAccessState("error");
      return;
    }

    await loadUnlockedReplies();
  };

  if (accessState === "unlocked") {
    return (
      <section className={styles.unlockedSection} aria-label="Kilidi açılan cevaplar">
        <div className={styles.unlockedBanner}>
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>{countryName} deneyimlerinin kilidi açık</strong>
            <span>Kaşifler Ligi üyeliğinle tüm güncel cevapları okuyabilirsin.</span>
          </div>
        </div>

        <div className={styles.replyList}>
          {hiddenReplies.map((reply) => (
            <article className={styles.replyCard} key={reply.id}>
              <header className={styles.replyHeader}>
                <div className={styles.replyIdentity}>
                  <span className={styles.replyAvatar} aria-hidden="true">
                    <User size={18} />
                  </span>
                  <div>
                    <strong>{reply.author_name || "Gizli Kullanıcı"}</strong>
                    <time dateTime={reply.created_at}>{dateLabel(reply.created_at)}</time>
                  </div>
                </div>
                <ForumReportButton targetId={reply.id} targetType="reply" />
              </header>
              <p className={styles.replyContent}>{reply.content}</p>
            </article>
          ))}
        </div>

        <ForumReplyForm topicId={topicId} topicTitle={topicTitle} />
      </section>
    );
  }

  return (
    <section className={styles.paywallSection} aria-label="Kilitli forum cevapları">
      <div className={styles.blurredReplies} aria-hidden="true">
        {Array.from({ length: placeholderCount }, (_, index) => (
          <article className={styles.blurredCard} key={index}>
            <div className={styles.blurredHeader}>
              <span />
              <div>
                <i />
                <i />
              </div>
            </div>
            <div className={styles.blurredLines}>
              <i />
              <i />
              <i />
            </div>
          </article>
        ))}
      </div>

      <div className={styles.paywallShade} aria-hidden="true" />

      <div className={styles.paywallCard}>
        <span className={styles.lockIcon} aria-hidden="true">
          <LockKeyhole size={28} />
        </span>
        <p className={styles.paywallEyebrow}>KAŞİFLER LİGİ ÖZEL</p>
        <h2>{countryName} deneyimlerinin tamamını aç</h2>
        <p className={styles.paywallText}>
          Bu ülkeye ait güncel <strong>{totalReplies}</strong> gümrük ve vize
          tecrübesinin tamamını okumak için ülkenin kilidini aç.
        </p>
        <div className={styles.paywallStats}>
          <span>
            <Sparkles size={16} aria-hidden="true" />
            {hiddenReplyCount} ek deneyim
          </span>
          <span>Ücretsiz üyelik</span>
        </div>

        {viewerState === "anonymous" ? (
          <div className={styles.paywallActions}>
            <Link
              href={`/auth/register?next=${encodeURIComponent(`/forum/${topicId}`)}`}
              className={styles.primaryCta}
            >
              Kaşifler Ligi&apos;ne Katıl
            </Link>
            <Link
              href={`/auth/login?next=${encodeURIComponent(`/forum/${topicId}`)}`}
              className={styles.secondaryCta}
            >
              Zaten üyeyim
            </Link>
          </div>
        ) : (
          <button
            className={styles.primaryCta}
            type="button"
            onClick={unlockCountry}
            disabled={viewerState === "checking" || accessState === "loading"}
          >
            {viewerState === "checking" || accessState === "loading"
              ? "Erişim kontrol ediliyor…"
              : `${countryName} Kilidini Aç`}
          </button>
        )}

        {errorMessage ? (
          <p className={styles.paywallError} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <small>
          Kilit açıldığında yalnızca hesabın için kaydedilir. Gizli cevap metinleri
          bu sayfanın anonim HTML çıktısında bulunmaz.
        </small>
      </div>
    </section>
  );
}
