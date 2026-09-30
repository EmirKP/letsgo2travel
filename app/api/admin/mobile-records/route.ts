import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const collections = {
  users: { table: "profiles", search: ["username", "full_name"], status: "role", fields: ["username", "full_name", "role", "created_at"], statuses: ["user", "moderator", "admin", "super_admin"] },
  verifications: { table: "travel_verifications", search: ["country_code"], status: "status", fields: ["country_code", "country_name", "status", "verification_status", "user_note", "admin_note", "created_at", "reviewed_at"], statuses: ["pending", "approved", "rejected", "expired"] },
  topics: { table: "forum_topics", search: ["title", "author_name"], status: "status", fields: ["title", "content", "author_name", "country_slug", "category", "status", "created_at"], statuses: ["pending", "published", "rejected", "hidden", "closed"] },
  replies: { table: "forum_replies", search: ["content", "author_name"], status: "status", fields: ["content", "author_name", "status", "created_at", "topic_id"], statuses: ["pending", "published", "rejected", "hidden"] },
  reports: { table: "forum_reports", search: ["reason"], status: "status", fields: ["target_type", "target_id", "reason", "status", "created_at"], statuses: ["open", "resolved", "dismissed"] },
  visa: { table: "visa_appointment_tracks", search: ["country_name", "application_city"], status: "status", fields: ["country_name", "country_code", "application_city", "provider_name", "status", "applicants_count", "earliest_date", "latest_date", "last_checked_at", "next_check_at", "created_at"], statuses: ["active", "paused", "pending_activation", "match_found", "verification_required", "error", "expired"] },
  alerts: { table: "flight_price_alerts", search: ["origin_code", "destination_code", "origin_label", "destination_label"], status: "status", fields: ["origin_code", "destination_code", "origin_label", "destination_label", "status", "is_active", "target_price", "currency", "last_checked_price", "last_checked_at", "created_at"], statuses: ["active", "paused", "cancelled", "error", "triggered"] },
} as const;
export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) { for (const [name, value] of Object.entries(headers)) auth.response.headers.set(name, value); return auth.response; }
  const { supabase, user } = auth;
  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile.error) return NextResponse.json({ error: "Yönetici erişimi doğrulanamadı." }, { status: 503, headers });
  if (profile.data?.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const collection = params.get("collection") || "";
  if (!Object.hasOwn(collections, collection)) return NextResponse.json({ error: "Geçersiz bölüm." }, { status: 400, headers });
  const config = collections[collection as keyof typeof collections];
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const status = params.get("status") || "";
  if (status && !(config.statuses as readonly string[]).includes(status)) return NextResponse.json({ error: "Geçersiz durum." }, { status: 400, headers });
  // Only plain searchable characters can enter PostgREST's OR expression.
  const search = (params.get("search") || "").slice(0, 80).replace(/[^\p{L}\p{N}\s@_-]/gu, "").trim();
  const read = (statusColumn: string, searchFields: readonly string[] = config.search) => {
    let query = supabase.from(config.table).select("*", { count: "exact" });
    if (status) query = query.eq(statusColumn, status);
    if (search) query = query.or(searchFields.map(field => `${field}.ilike.%${search}%`).join(","));
    return query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 25, page * 25 - 1);
  };
  let result = await read(config.status);
  let legacy = false;
  // full_name is optional in older profile installations. Keep username
  // search available there without masking table or permission failures.
  if (collection === "users" && search && result.error?.code === "42703" && result.error.message.includes("full_name")) {
    result = await read(config.status, ["username"]);
  }
  if (collection === "verifications" && result.error?.code === "42703" && result.error.message.includes("status")) {
    result = await read("verification_status"); legacy = !result.error;
  }
  if (result.error) {
    console.error("mobile_admin_records_failed", { collection, code: result.error.code });
    return NextResponse.json({ error: "Bu bölümün kayıtları yüklenemedi." }, { status: 503, headers });
  }
  return NextResponse.json({ data: (result.data || []).map(row => ({
    id: String(row.id),
    fields: Object.fromEntries(config.fields.flatMap(key => {
      const value = row[key];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? [[key, String(value).slice(0, 10000)]] : [];
    })),
  })), count: result.count ?? 0, page, pageSize: 25, legacy, generatedAt: new Date().toISOString() }, { headers });
}
