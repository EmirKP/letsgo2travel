import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabaseAdmin";

type AuthenticatedUserResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse };

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUserResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) {
    return { ok: false, response: NextResponse.json({ error: "Geçersiz oturum." }, { status: 401 }) };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 503 }) };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: "Geçersiz oturum." }, { status: 401 }) };
  }

  return { ok: true, supabase, user: data.user };
}
