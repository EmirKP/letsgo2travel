import { NextResponse } from "next/server";
import { beginLiveActivitySession } from "@/lib/live-activity-tokens";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

async function requireUser(request: Request, supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

/** Her mobil login'de token replay'den önce kalıcı session generation açar. */
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });
  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const result = await beginLiveActivitySession(supabase, user.id, body || {});
  return NextResponse.json(result.body, { status: result.status });
}
