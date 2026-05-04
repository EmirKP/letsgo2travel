import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function yetkiliMi(request: Request) {
  return request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function alarmDonustur(row: any) {
  return {
    id: row.id,
    email: row.email,
    nereden: row.nereden,
    nereye: row.nereye,
    maksimumFiyat: row.maksimum_fiyat,
    gidisTarihi: row.gidis_tarihi,
    donusTarihi: row.donus_tarihi,
    yolcu: row.yolcu,
    durum: row.durum,
    notlar: row.notlar,
    createdAt: row.created_at,
  };
}

function aramaDonustur(row: any) {
  return {
    id: row.id,
    nereden: row.nereden,
    nereye: row.nereye,
    gidisTarihi: row.gidis_tarihi,
    donusTarihi: row.donus_tarihi,
    yolcu: row.yolcu,
    vize: row.vize,
    kategori: row.kategori,
    aktarma: row.aktarma,
    maksimumFiyat: row.maksimum_fiyat,
    sonucSayisi: row.sonuc_sayisi,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const { data: alarmlar, error: alarmHatasi } = await supabaseAdmin
    .from("fiyat_alarmlari")
    .select("*")
    .order("created_at", { ascending: false });

  if (alarmHatasi) {
    return NextResponse.json(
      {
        message: "Fiyat alarmları alınamadı.",
        error: alarmHatasi.message,
      },
      { status: 500 }
    );
  }

  const { data: aramalar, error: aramaHatasi } = await supabaseAdmin
    .from("arama_kayitlari")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(150);

  if (aramaHatasi) {
    return NextResponse.json(
      {
        message: "Arama kayıtları alınamadı.",
        error: aramaHatasi.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    alarmlar: (alarmlar || []).map(alarmDonustur),
    aramalar: (aramalar || []).map(aramaDonustur),
  });
}