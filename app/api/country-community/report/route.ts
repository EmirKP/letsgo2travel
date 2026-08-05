import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 12_000) {
      return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
    }
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const payload = await request.json();
    const targetType = String(payload.targetType || "").trim();
    const targetId = String(payload.targetId || "").trim();
    const reason = String(payload.reason || "").replace(/\s+/g, " ").trim();
    const note = String(payload.note || "").trim();
    const countryCode = String(payload.countryCode || "").trim().toUpperCase();
    if (!new Set(["question", "answer", "comment", "warning"]).has(targetType)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)
      || reason.length < 3 || reason.length > 120 || note.length > 1000
      || (countryCode && !/^[A-Z]{2}$/.test(countryCode))) {
      return NextResponse.json({ error: "Rapor bilgileri geçersiz." }, { status: 400 });
    }

    const { data: existingReport } = await supabase
      .from("content_reports")
      .select("id")
      .eq("reporter_user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .eq("status", "open")
      .limit(1);
    if (existingReport?.length) {
      return NextResponse.json({ error: "Bu içeriği daha önce raporladınız." }, { status: 409 });
    }

    const { error } = await supabase.from('content_reports').insert({
      reporter_user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      note: note || null,
      country_code: countryCode || null,
      status: 'open'
    });

    if (error) {
      return NextResponse.json({ error: "Rapor kaydedilemedi" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
