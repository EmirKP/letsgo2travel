import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const checks = {
    app: true,
    supabase: Boolean(supabase),
    ai: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY),
    travelpayoutsMarker: Boolean(process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER || process.env.TRAVELPAYOUTS_MARKER),
    resend: Boolean(process.env.RESEND_API_KEY),
  };

  let database = "not_configured";
  if (supabase) {
    const { error } = await supabase.from("ai_plan_cache").select("id", { count: "exact", head: true });
    database = error ? "needs_sql_or_policy_check" : "ok";
  }

  return NextResponse.json({
    ok: checks.app && checks.supabase,
    checks,
    database,
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
