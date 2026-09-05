import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export const dynamic = "force-dynamic";

const MOBILE_ADMIN_ROLES = new Set(["super_admin"]);

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "private, no-store");
    return auth.response;
  }

  const { supabase, user } = auth;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: "Yönetici yetkisi doğrulanamadı." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (!MOBILE_ADMIN_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json(
      { error: "Yönetici yetkiniz bulunmuyor." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const [
    profilesResult,
    verificationsResult,
    topicsResult,
    repliesResult,
    reportsResult,
    visaTracksResult,
    alertsResult,
    kvkkResult,
    objectionsResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("travel_verifications")
      .select("id,country_code,country_name,created_at,status,evidence_path,evidence_type", { count: "exact" })
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("forum_topics")
      .select("id,title,author_name,created_at,status", { count: "exact" })
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("forum_replies")
      .select("id,content,author_name,created_at,status,topic:forum_topics(title)", { count: "exact" })
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("forum_reports")
      .select("id,target_type,reason,created_at,status", { count: "exact" })
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("visa_appointment_tracks")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "pending_activation", "match_found", "verification_required"]),
    supabase
      .from("flight_price_alerts")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("kvkk_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "reviewing"]),
    supabase
      .from("business_objections")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "reviewing"]),
  ]);

  const results = [
    profilesResult,
    verificationsResult,
    topicsResult,
    repliesResult,
    reportsResult,
    visaTracksResult,
    alertsResult,
    kvkkResult,
    objectionsResult,
  ];
  const unavailableCount = results.filter((result) => Boolean(result.error)).length;
  if (unavailableCount) {
    console.error("mobile_admin_overview_partial", {
      codes: results.flatMap((result) => result.error?.code ? [result.error.code] : []),
    });
  }

  const text = (value: unknown, maxLength: number) => typeof value === "string" ? value.slice(0, maxLength) : "";
  const relationTitle = (value: unknown) => {
    const relation = Array.isArray(value) ? value[0] : value;
    return relation && typeof relation === "object"
      ? text((relation as { title?: unknown }).title, 300)
      : "";
  };

  return NextResponse.json({
    data: {
      role: profile?.role,
      generatedAt: new Date().toISOString(),
      unavailableCount,
      stats: {
        profiles: profilesResult.count || 0,
        pendingVerifications: verificationsResult.count || 0,
        pendingTopics: topicsResult.count || 0,
        pendingReplies: repliesResult.count || 0,
        openReports: reportsResult.count || 0,
        activeVisaTracks: visaTracksResult.count || 0,
        activePriceAlerts: alertsResult.count || 0,
        pendingKvkk: kvkkResult.count || 0,
        pendingObjections: objectionsResult.count || 0,
      },
      pendingVerifications: (verificationsResult.data || []).map((item) => ({
        id: item.id,
        countryCode: text(item.country_code, 8),
        countryName: text(item.country_name, 100),
        createdAt: item.created_at,
        hasEvidence: Boolean(text(item.evidence_path, 500)),
        evidenceType: text(item.evidence_type, 120) || null,
      })),
      pendingTopics: (topicsResult.data || []).map((item) => ({
        id: item.id,
        title: text(item.title, 300),
        authorName: text(item.author_name, 80),
        createdAt: item.created_at,
      })),
      pendingReplies: (repliesResult.data || []).map((item) => ({
        id: item.id,
        body: text(item.content, 600),
        authorName: text(item.author_name, 80),
        topicTitle: relationTitle(item.topic),
        createdAt: item.created_at,
      })),
      openReports: (reportsResult.data || []).map((item) => ({
        id: item.id,
        targetType: text(item.target_type, 30),
        reason: text(item.reason, 600),
        createdAt: item.created_at,
      })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
