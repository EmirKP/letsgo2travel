import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Geçersiz bildirim kimliği." }, { status: 400 });
  }
  const { error } = await auth.supabase
    .from("visa_appointment_notifications")
    .update({ read_at: new Date().toISOString(), status: "opened" })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: "Bildirim güncellenemedi. Aşama 2 SQL dosyasını çalıştırın." }, { status: 500 });
  return NextResponse.json({ success: true });
}
