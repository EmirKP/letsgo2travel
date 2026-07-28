import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function getUser(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { supabase: null, user: null };
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return { supabase, user: null };
  const { data } = await supabase.auth.getUser(header.slice(7));
  return { supabase, user: data.user || null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getUser(request);
  if (!auth.supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  if (!auth.user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as { action?: "pause" | "resume" };
  if (!body.action || !["pause", "resume"].includes(body.action)) return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });

  const { data: existing } = await auth.supabase
    .from("visa_appointment_tracks")
    .select("id,status,access_expires_at,provider_code")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });
  if (new Date(existing.access_expires_at) <= new Date()) return NextResponse.json({ error: "Takip süresi dolmuş." }, { status: 409 });

  const nextStatus = body.action === "pause" ? "paused" : existing.provider_code ? "active" : "pending_activation";
  const { error } = await auth.supabase
    .from("visa_appointment_tracks")
    .update({ status: nextStatus, next_check_at: body.action === "resume" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: "Takip güncellenemedi." }, { status: 500 });
  return NextResponse.json({ message: body.action === "pause" ? "Takip duraklatıldı." : "Takip yeniden başlatıldı." });
}
