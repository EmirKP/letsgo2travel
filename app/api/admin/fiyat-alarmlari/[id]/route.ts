import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function yetkiliMi(request: Request) {
  return request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const { data, error } = await supabaseAdmin
    .from("fiyat_alarmlari")
    .update({
      durum: body.durum || "Yeni",
      notlar: body.notlar || "",
    })
    .eq("id", Number(id))
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Fiyat alarmı güncellenemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Fiyat alarmı güncellendi.",
    alarm: data,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const { id } = await context.params;

  const { error } = await supabaseAdmin
    .from("fiyat_alarmlari")
    .delete()
    .eq("id", Number(id));

  if (error) {
    return NextResponse.json(
      { message: "Fiyat alarmı silinemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Fiyat alarmı silindi.",
  });
}