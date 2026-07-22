"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ExplorerCard from "@/app/components/explorer-card/ExplorerCard";
import type {
  ExplorerCardData,
  ExplorerCardSaveResult,
  ExplorerPrivacy,
} from "@/app/components/explorer-card/types";
import { getExplorerCardData } from "@/lib/explorer-card/getExplorerCardData";
import { supabase } from "@/lib/supabase-client";

import styles from "./ExplorerCardPage.module.css";

type PageState = "loading" | "ready" | "signed-out" | "error";

interface ProfileIdentity {
  username: string | null;
  full_name: string | null;
}

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFallbackIdentity(user: User, profile: ProfileIdentity | null) {
  const metadata = user.user_metadata ?? {};
  const emailName = user.email?.split("@")[0] ?? null;
  const generatedUsername = `kasif_${user.id.replaceAll("-", "").slice(0, 12)}`;

  return {
    username:
      cleanText(profile?.username) ??
      cleanText(metadata.username) ??
      cleanText(emailName) ??
      generatedUsername,
    displayName:
      cleanText(profile?.full_name) ??
      cleanText(metadata.full_name) ??
      cleanText(metadata.name) ??
      cleanText(emailName) ??
      "Yeni Kaşif",
    avatarUrl:
      cleanText(metadata.avatar_url) ?? cleanText(metadata.picture) ?? null,
  };
}

export default function ExplorerCardPageClient() {
  const [state, setState] = useState<PageState>("loading");
  const [cardData, setCardData] = useState<ExplorerCardData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadCard = useCallback(async () => {
    setState("loading");
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(`Oturum kontrol edilemedi: ${authError.message}`);
      }

      if (!user) {
        setCardData(null);
        setState("signed-out");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username,full_name")
        .eq("id", user.id)
        .maybeSingle();

      const identity = getFallbackIdentity(
        user,
        (profile as ProfileIdentity | null) ?? null,
      );

      const data = await getExplorerCardData(
        supabase,
        user.id,
        window.location.origin,
        identity,
      );

      setCardData(data);
      setState("ready");
    } catch (error) {
      console.error("Kaşif Kartı yüklenemedi", error);
      setCardData(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Kaşif Kartı yüklenirken bilinmeyen bir hata oluştu.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadCard();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setCardData(null);
        setState("signed-out");
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        window.setTimeout(() => void loadCard(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadCard]);

  const handleShowOnProfile = useCallback(
    async (privacy: ExplorerPrivacy): Promise<ExplorerCardSaveResult> => {
      if (!cardData) {
        return {
          ok: false,
          message: "Kart verisi henüz hazır değil.",
        };
      }

      const { error } = await supabase
        .from("explorer_card_preferences")
        .upsert(
          {
            user_id: cardData.userId,
            show_name: privacy.showName,
            show_ranking: privacy.showRanking,
            show_country_list: privacy.showCountryList,
            show_on_profile: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (error) {
        return {
          ok: false,
          message: `Profil tercihi kaydedilemedi: ${error.message}`,
        };
      }

      setCardData((current) =>
        current ? { ...current, privacy: { ...privacy } } : current,
      );

      return {
        ok: true,
        message: "Kaşif Kartı profilinde gösterilecek.",
      };
    },
    [cardData],
  );

  if (state === "loading") {
    return (
      <main className={styles.feedbackPage}>
        <div className={styles.feedbackCard} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <h1>Kaşif Kartın hazırlanıyor</h1>
          <p>Profilin ve doğrulanmış seyahatlerin yükleniyor.</p>
        </div>
      </main>
    );
  }

  if (state === "signed-out") {
    return (
      <main className={styles.feedbackPage}>
        <div className={styles.feedbackCard}>
          <span className={styles.icon} aria-hidden="true">
            ✈
          </span>
          <h1>Kendi Kaşif Kartını oluştur</h1>
          <p>
            Kartın her kullanıcıya özeldir. Seviyeni ve doğrulanmış keşiflerini
            görmek için hesabına giriş yap.
          </p>
          <div className={styles.actions}>
            <Link href="/auth/login?next=/kasif-karti" className={styles.primaryLink}>
              Giriş yap
            </Link>
            <Link href="/auth/register" className={styles.secondaryLink}>
              Hesap oluştur
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (state === "error" || !cardData) {
    return (
      <main className={styles.feedbackPage}>
        <div className={styles.feedbackCard}>
          <span className={styles.errorIcon} aria-hidden="true">
            !
          </span>
          <h1>Kaşif Kartı yüklenemedi</h1>
          <p>{errorMessage || "Kart verisi bulunamadı."}</p>
          <button className={styles.retryButton} type="button" onClick={loadCard}>
            Tekrar dene
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <ExplorerCard data={cardData} onShowOnProfile={handleShowOnProfile} />
    </main>
  );
}
