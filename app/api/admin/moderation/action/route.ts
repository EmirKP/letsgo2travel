import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { adminPrincipalFromRequest } from "@/lib/admin-auth";
import {
  MODERATION_ROLES,
  MODERATION_STATUS_BY_ACTION,
  MODERATION_TARGET_TABLES,
  parseModerationActionInput,
} from "@/lib/admin-security";

export async function POST(request: Request) {
  try {
    const principal = await adminPrincipalFromRequest(request, MODERATION_ROLES);
    if (!principal) {
      return NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const parsed = parseModerationActionInput(await request.json().catch(() => null));
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { reportId, targetType, targetId, action, reason } = parsed.value;

    if (action !== "close") {
      const { error } = await supabase
        .from(MODERATION_TARGET_TABLES[targetType])
        .update({ status: MODERATION_STATUS_BY_ACTION[action] })
        .eq("id", targetId);
      if (error) {
        return NextResponse.json({ error: "İçerik durumu güncellenemedi." }, { status: 500 });
      }
    }

    if (reportId) {
      const { error } = await supabase.from("content_reports").update({ status: "closed" }).eq("id", reportId);
      if (error) {
        return NextResponse.json({ error: "Rapor kapatılamadı." }, { status: 500 });
      }
    }

    const { error: auditError } = await supabase.from("content_moderation_actions").insert({
      admin_user_id: principal.subject,
      target_type: targetType,
      target_id: targetId,
      action,
      reason,
    });
    if (auditError) {
      return NextResponse.json({ error: "Moderasyon kaydı oluşturulamadı." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
