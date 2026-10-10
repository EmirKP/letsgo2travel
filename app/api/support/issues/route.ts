import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { boundedJson } from "@/lib/travel-assistant/http";
import { normalizeSupportScreenshot, parseSupportIssue, supportActorKey, supportPayloadHash, SUPPORT_BODY_LIMIT, SUPPORT_PRIVATE_HEADERS } from "@/lib/support-issues";

export const runtime = "nodejs";
const reply = (data: unknown, status: number) => NextResponse.json(data, { status, headers: SUPPORT_PRIVATE_HEADERS });

export async function POST(request: Request) {
  let raw: unknown;
  try { raw = await boundedJson(request, SUPPORT_BODY_LIMIT); }
  catch (error) { return reply({ code: error instanceof Error && error.message === "too-large" ? "too-large" : "invalid" }, error instanceof Error && error.message === "too-large" ? 413 : 400); }
  const issue = parseSupportIssue(raw);
  if (!issue) return reply({ code: "invalid" }, 400);
  const supabase = getSupabaseAdmin();
  if (!supabase) return reply({ code: "unavailable" }, 503);
  let userId: string | null = null;
  if (request.headers.has("Authorization")) {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return reply({ code: "session-expired" }, 401);
    userId = auth.user.id;
  }
  let screenshot: string | null;
  try { screenshot = await normalizeSupportScreenshot(issue.screenshot); }
  catch { return reply({ code: "invalid-image" }, 400); }
  try {
    const { data, error } = await supabase.rpc("submit_support_issue", {
      p_request_id: issue.requestId, p_actor_key: supportActorKey(request, userId), p_payload_hash: supportPayloadHash(issue),
      p_user_id: userId, p_description: issue.description, p_email: issue.email || null,
      p_screen: issue.screen, p_locale: issue.locale, p_version: issue.version, p_build: issue.build, p_screenshot: screenshot,
    });
    if (error) {
      if (error.message?.includes("support-rate-limited")) return reply({ code: "rate-limited" }, 429);
      if (error.message?.includes("support-id-conflict")) return reply({ code: "id-conflict" }, 409);
      return reply({ code: "unavailable" }, 503);
    }
    if (typeof data !== "string") return reply({ code: "unavailable" }, 503);
    return reply({ id: data }, 201);
  } catch { return reply({ code: "unavailable" }, 503); }
}
