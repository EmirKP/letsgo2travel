import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type RateLimitResult = {
  ok: boolean;
  allowed: boolean;
  remaining: number;
  resetAt: string | null;
  error?: "missing_secret" | "database_error";
};

function requestAddress(request: Request) {
  const vercelAddress = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const forwardedAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (vercelAddress || forwardedAddress || "unknown").slice(0, 100);
}

export async function consumeFlightSearchRateLimit(params: {
  request: Request;
  supabase: SupabaseClient;
  userId?: string | null;
  scope?: string;
  identityKey?: string;
  limit?: number;
  windowSeconds?: number;
}): Promise<RateLimitResult> {
  const secret = process.env.FLIGHT_RATE_LIMIT_SECRET || "";
  if (secret.length < 32) {
    return { ok: false, allowed: false, remaining: 0, resetAt: null, error: "missing_secret" };
  }

  const identity = params.identityKey || (params.userId
    ? `user:${params.userId}`
    : `anonymous:${requestAddress(params.request)}`);
  const scope = String(params.scope || "search").trim().toLowerCase().slice(0, 40);
  const bucketKey = createHmac("sha256", secret).update(`${scope}:${identity}`).digest("hex");
  const limit = Math.min(100, Math.max(1, params.limit ?? 12));
  const windowSeconds = Math.min(3600, Math.max(10, params.windowSeconds ?? 60));

  const { data, error } = await params.supabase.rpc("consume_flight_search_quota", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { ok: false, allowed: false, remaining: 0, resetAt: null, error: "database_error" };
  }

  return {
    ok: true,
    allowed: row.allowed === true,
    remaining: Number(row.remaining) || 0,
    resetAt: typeof row.reset_at === "string" ? row.reset_at : null,
  };
}
