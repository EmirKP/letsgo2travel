import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminSessionFromRequest } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIRMATION = "HESABI KALICI SIL";
const ACCOUNT_DELETION_TYPE = "Hesabımı kapatmak istiyorum";

function isMissingOptionalTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function actorId(request: Request, supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const signed = await adminSessionFromRequest(request);
  if (signed?.subject && UUID_PATTERN.test(signed.subject)) return signed.subject;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const { data } = await supabase.auth.getUser(header.slice(7).trim());
  return data.user?.id || null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const permissionError = await requireAdmin(request, ["admin", "super_admin"]);
  if (permissionError) return permissionError;

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Geçersiz talep kimliği." }, { status: 400 });
  }

  const payload = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  if (String(payload?.confirmation || "").trim() !== CONFIRMATION) {
    return NextResponse.json({ error: "Kalıcı silme onayı eşleşmiyor." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 503 });
  }

  const { data: deletionRequest, error: requestError } = await supabase
    .from("kvkk_requests")
    .select("id,user_id,request_type,status")
    .eq("id", id)
    .maybeSingle();

  if (requestError) return NextResponse.json({ error: "Talep okunamadı." }, { status: 500 });
  if (!deletionRequest?.user_id) return NextResponse.json({ error: "Talep daha önce işlenmiş." }, { status: 409 });
  if (deletionRequest.request_type !== ACCOUNT_DELETION_TYPE) {
    return NextResponse.json({ error: "Bu işlem yalnızca hesap kapatma taleplerinde kullanılabilir." }, { status: 400 });
  }
  if (deletionRequest.status !== "reviewing") {
    return NextResponse.json({ error: "Kalıcı silmeden önce talebi İnceleniyor durumuna alın." }, { status: 409 });
  }

  const targetUserId = deletionRequest.user_id as string;
  const actingAdminId = await actorId(request, supabase);
  if (actingAdminId === targetUserId) {
    return NextResponse.json({ error: "Yönetici kendi hesabını bu ekrandan silemez." }, { status: 403 });
  }

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .maybeSingle();
  if (["moderator", "editor", "admin", "super_admin"].includes(String(targetProfile?.role || ""))) {
    return NextResponse.json({ error: "Yönetici rolleri bu toplu hesap silme akışından silinemez." }, { status: 403 });
  }

  const { data: targetAuthResult, error: targetAuthError } = await supabase.auth.admin.getUserById(targetUserId);
  if (targetAuthError || !targetAuthResult?.user) {
    return NextResponse.json({ error: "Silinecek kullanıcı hesabı doğrulanamadı." }, { status: 500 });
  }
  const targetEmail = String(targetAuthResult.user.email || "").trim().toLowerCase();

  const { data: evidenceRows, error: evidenceLookupError } = await supabase
    .from("travel_verifications")
    .select("evidence_path")
    .eq("user_id", targetUserId)
    .not("evidence_path", "is", null);
  if (evidenceLookupError) {
    return NextResponse.json({ error: "Özel belgeler kontrol edilemedi; hesap silinmedi." }, { status: 500 });
  }

  const evidencePaths = (evidenceRows || [])
    .map((row) => typeof row.evidence_path === "string" ? row.evidence_path : "")
    .filter(Boolean);
  if (evidencePaths.length) {
    const { error: removeError } = await supabase.storage.from("travel-evidence").remove(evidencePaths);
    if (removeError) {
      return NextResponse.json({ error: "Özel belgeler silinemedi; hesap güvenli biçimde beklemede bırakıldı." }, { status: 500 });
    }
  }

  // KVKK GEÇİŞ NOTU: Uçuş fiyat alarmı ürünü kalıcı olarak kaldırıldı; ancak
  // production'daki `flight_price_alerts` tabloları ayrı onaylı migration ile
  // silinene kadar kişisel verinin KVKK silme akışında temizlenmeye devam etmesi
  // zorunludur. Tablolar drop edildiğinde bu blok kendiliğinden no-op olur
  // (isMissingOptionalTable) ve bir sonraki temizlik commit'inde kaldırılabilir.
  const alertIds = new Set<string>();
  const userAlerts = await supabase.from("flight_price_alerts").select("id").eq("user_id", targetUserId);
  if (userAlerts.error && !isMissingOptionalTable(userAlerts.error)) {
    return NextResponse.json({ error: "Hesaba bağlı fiyat alarmları temizlenemedi; hesap silinmedi." }, { status: 500 });
  }
  for (const row of userAlerts.data || []) alertIds.add(String(row.id));

  if (targetEmail) {
    const emailAlerts = await supabase.from("flight_price_alerts").select("id").eq("email", targetEmail);
    if (emailAlerts.error && !isMissingOptionalTable(emailAlerts.error)) {
      return NextResponse.json({ error: "E-postaya bağlı fiyat alarmları temizlenemedi; hesap silinmedi." }, { status: 500 });
    }
    for (const row of emailAlerts.data || []) alertIds.add(String(row.id));
  }

  if (alertIds.size) {
    const ids = [...alertIds];
    const logsDelete = await supabase.from("flight_price_alert_logs").delete().in("alert_id", ids);
    if (logsDelete.error && !isMissingOptionalTable(logsDelete.error)) {
      return NextResponse.json({ error: "Fiyat alarmı geçmişi temizlenemedi; hesap silinmedi." }, { status: 500 });
    }
    const alertsDelete = await supabase.from("flight_price_alerts").delete().in("id", ids);
    if (alertsDelete.error && !isMissingOptionalTable(alertsDelete.error)) {
      return NextResponse.json({ error: "Fiyat alarmları temizlenemedi; hesap silinmedi." }, { status: 500 });
    }
  }

  if (targetEmail) {
    const mailLogsDelete = await supabase.from("mail_delivery_logs").delete().eq("recipient_email", targetEmail);
    if (mailLogsDelete.error && !isMissingOptionalTable(mailLogsDelete.error)) {
      return NextResponse.json({ error: "E-posta teslim kayıtları temizlenemedi; hesap silinmedi." }, { status: 500 });
    }
    const subscriberDelete = await supabase.from("subscribers").delete().eq("email", targetEmail);
    if (subscriberDelete.error && !isMissingOptionalTable(subscriberDelete.error)) {
      return NextResponse.json({ error: "Bülten kaydı temizlenemedi; hesap silinmedi." }, { status: 500 });
    }
  }

  const removedText = "Bu içerik hesap silme talebi üzerine anonimleştirildi.";
  const anonymizationSteps = [
    supabase.from("forum_topics").update({ author_id: null, author_name: "Silinmiş kullanıcı", title: "Anonimleştirilmiş konu", content: removedText }).eq("author_id", targetUserId),
    supabase.from("forum_replies").update({ user_id: null, author_name: "Silinmiş kullanıcı", content: removedText }).eq("user_id", targetUserId),
    supabase.from("country_questions").update({ user_id: null, title: "Anonimleştirilmiş soru", body: removedText }).eq("user_id", targetUserId),
    supabase.from("country_answers").update({ user_id: null, body: removedText }).eq("user_id", targetUserId),
    supabase.from("country_experience_comments").update({ user_id: null, body: removedText }).eq("user_id", targetUserId),
    supabase.from("country_warnings").update({ user_id: null, body: removedText }).eq("user_id", targetUserId),
  ];

  for (const step of anonymizationSteps) {
    const { error } = await step;
    if (error) {
      return NextResponse.json(
        { error: "Hesap silme veritabanı güncellemesi uygulanmamış veya içerik anonimleştirilemedi; hesap silinmedi." },
        { status: 409 },
      );
    }
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId, false);
  if (deleteError) {
    return NextResponse.json({ error: "Hesap sağlayıcıdan silinemedi. İşlem güvenli biçimde yeniden denenebilir." }, { status: 500 });
  }

  const processedAt = new Date().toISOString();
  const { error: completionError } = await supabase
    .from("kvkk_requests")
    .update({
      user_id: null,
      status: "processed",
      processed_at: processedAt,
      notes: "Hesap silme ve kullanıcı içeriklerini anonimleştirme işlemi tamamlandı.",
    })
    .eq("id", id);
  if (completionError) console.error("Hesap silme talebi sonuç kaydı güncellenemedi:", completionError.code || "unknown");

  const audit = await supabase.from("admin_audit_logs").insert({
    admin_user_id: actingAdminId,
    action: "execute_account_deletion",
    target_type: "kvkk_requests",
    target_id: id,
    note: "Hesap silme talebi tamamlandı; kullanıcı içerikleri anonimleştirildi.",
  });
  if (audit.error) console.error("Hesap silme denetim kaydı oluşturulamadı:", audit.error.code || "unknown");

  return NextResponse.json({ success: true, message: "Hesap silindi ve kullanıcı içerikleri anonimleştirildi." });
}
