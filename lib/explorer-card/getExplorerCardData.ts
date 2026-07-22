import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ExplorerAchievement,
  ExplorerCardData,
  ExplorerLevelKey,
} from "@/app/components/explorer-card/types";

interface ExplorerCardSummaryRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  profile_slug: string;
  level_key: ExplorerLevelKey;
  level_label: string;
  level_number: number;
  verified_countries: number;
  visa_free_discoveries: number;
  continents: number;
  explorer_points: number;
  league_percentile: number;
  documented_traveler: boolean;
  verified_country_names: string[] | null;
}

interface ExplorerCardPreferenceRow {
  show_name: boolean;
  show_ranking: boolean;
  show_country_list: boolean;
}

interface AchievementRow {
  id: string;
  title: string;
  detail: string;
  progress: number | null;
  target: number | null;
}

export interface ExplorerCardFallbackIdentity {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

function fallbackCard(
  userId: string,
  siteUrl: string,
  identity: ExplorerCardFallbackIdentity,
  preferences: ExplorerCardPreferenceRow | null,
  achievements: AchievementRow[],
): ExplorerCardData {
  const username = identity.username || `kasif_${userId.replaceAll("-", "").slice(0, 12)}`;

  return {
    userId,
    username,
    displayName: identity.displayName || "Yeni Kaşif",
    avatarUrl: identity.avatarUrl,
    profileUrl: `${siteUrl.replace(/\/$/, "")}/kasif/${username}`,
    level: {
      key: "new",
      label: "Yeni Kaşif",
      number: 1,
    },
    stats: {
      verifiedCountries: 0,
      visaFreeDiscoveries: 0,
      continents: 0,
      explorerPoints: 0,
      leaguePercentile: 100,
    },
    documentedTraveler: false,
    verifiedCountryNames: [],
    achievements:
      achievements.length > 0
        ? achievements.map(
            (achievement): ExplorerAchievement => ({
              id: achievement.id,
              title: achievement.title,
              detail: achievement.detail,
              progress: achievement.progress ?? undefined,
              target: achievement.target ?? undefined,
            }),
          )
        : [
            {
              id: "first-verification",
              title: "İlk keşfini doğrula",
              detail: "Belgeli Gezgin yolculuğuna başla",
              progress: 0,
              target: 1,
            },
            {
              id: "first-level",
              title: "Yeni Kaşif",
              detail: "İlk puanlarını toplamaya başla",
              progress: 0,
              target: 100,
            },
          ],
    privacy: {
      showName: preferences?.show_name ?? true,
      showRanking: preferences?.show_ranking ?? true,
      showCountryList: preferences?.show_country_list ?? true,
    },
  };
}

export async function getExplorerCardData(
  supabase: SupabaseClient,
  userId: string,
  siteUrl = "https://letsgo2travel.com.tr",
  fallbackIdentity?: ExplorerCardFallbackIdentity,
): Promise<ExplorerCardData> {
  const [summaryResult, achievementsResult, preferencesResult] =
    await Promise.all([
      supabase
        .from("explorer_card_summary")
        .select(
          [
            "user_id",
            "username",
            "display_name",
            "avatar_url",
            "profile_slug",
            "level_key",
            "level_label",
            "level_number",
            "verified_countries",
            "visa_free_discoveries",
            "continents",
            "explorer_points",
            "league_percentile",
            "documented_traveler",
            "verified_country_names",
          ].join(","),
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("explorer_card_achievements")
        .select("id,title,detail,progress,target")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(2),
      supabase
        .from("explorer_card_preferences")
        .select("show_name,show_ranking,show_country_list")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  if (summaryResult.error) {
    throw new Error(
      `Kaşif kartı özeti alınamadı: ${summaryResult.error.message}`,
    );
  }

  if (achievementsResult.error) {
    throw new Error(
      `Kaşif başarımları alınamadı: ${achievementsResult.error.message}`,
    );
  }

  if (preferencesResult.error) {
    throw new Error(
      `Kaşif kartı tercihleri alınamadı: ${preferencesResult.error.message}`,
    );
  }

  const preferences =
    preferencesResult.data as unknown as ExplorerCardPreferenceRow | null;
  const achievements = (achievementsResult.data ?? []) as unknown as AchievementRow[];
  const summary =
    summaryResult.data as unknown as ExplorerCardSummaryRow | null;

  if (!summary) {
    if (!fallbackIdentity) {
      throw new Error(
        "Bu kullanıcı için Kaşif Kartı kaydı bulunamadı. Supabase kullanıcı kartı kurulumunu çalıştır.",
      );
    }

    return fallbackCard(
      userId,
      siteUrl,
      fallbackIdentity,
      preferences,
      achievements,
    );
  }

  return {
    userId: summary.user_id,
    username: summary.username,
    displayName: summary.display_name,
    avatarUrl: summary.avatar_url,
    profileUrl: `${siteUrl.replace(/\/$/, "")}/kasif/${summary.profile_slug}`,
    level: {
      key: summary.level_key,
      label: summary.level_label,
      number: summary.level_number,
    },
    stats: {
      verifiedCountries: summary.verified_countries,
      visaFreeDiscoveries: summary.visa_free_discoveries,
      continents: summary.continents,
      explorerPoints: summary.explorer_points,
      leaguePercentile: summary.league_percentile,
    },
    documentedTraveler: summary.documented_traveler,
    verifiedCountryNames: summary.verified_country_names ?? [],
    achievements: achievements.map(
      (achievement): ExplorerAchievement => ({
        id: achievement.id,
        title: achievement.title,
        detail: achievement.detail,
        progress: achievement.progress ?? undefined,
        target: achievement.target ?? undefined,
      }),
    ),
    privacy: {
      showName: preferences?.show_name ?? true,
      showRanking: preferences?.show_ranking ?? true,
      showCountryList: preferences?.show_country_list ?? true,
    },
  };
}
