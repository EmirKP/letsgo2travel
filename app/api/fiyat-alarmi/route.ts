import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const body = await request.json();

  const email = String(body.email || "").trim();
  const nereden = String(body.nereden || "").trim();
  const nereye = String(body.nereye || "").trim();
  const maksimumFiyat = Number(body.maksimumFiyat || 0);
  const gidisTarihi = String(body.gidisTarihi || "");
  const donusTarihi = String(body.donusTarihi || "");
  const yolcu = String(body.yolcu || "1");

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { message: "Geçerli bir e-posta adresi yaz." },
      { status: 400 }
    );
  }

  if (!nereden || !nereye) {
    return NextResponse.json(
      { message: "Nereden ve nereye alanları zorunlu." },
      { status: 400 }
    );
  }

  if (!maksimumFiyat || maksimumFiyat < 1) {
    return NextResponse.json(
      { message: "Maksimum fiyat yazmalısın." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("fiyat_alarmlari")
    .insert({
      email,
      nereden,
      nereye,
      maksimum_fiyat: maksimumFiyat,
      gidis_tarihi: gidisTarihi,
      donus_tarihi: donusTarihi,
      yolcu,
      durum: "Yeni",
      notlar: "",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Fiyat alarmı kaydedilemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Fiyat alarmı kaydedildi.",
    alarm: data,
  });
}