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
  const { error } = await auth.supabase
    .from("visa_appointment_notifications")
    .update({ read_at: new Date().toISOString(), status: "opened" })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: "Bildirim güncellenemedi. Aşama 2 SQL dosyasını çalıştırın." }, { status: 500 });
  return NextResponse.json({ success: true });
}
