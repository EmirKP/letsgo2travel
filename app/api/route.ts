import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function biletDonustur(row: any) {
  return {
    id: row.id,
    nereden: row.nereden,
    nereye: row.nereye,
    ulke: row.ulke,
    fiyat: row.fiyat,
    fiyatSayi: row.fiyat_sayi,
    tarih: row.tarih,
    vize: row.vize,
    ay: row.ay,
    havayolu: row.havayolu,
    sure: row.sure,
    bagaj: row.bagaj,
    etiket: row.etiket,
    link: row.link,
    aktif: row.aktif,
    oneCikan: row.one_cikan,
  };
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("biletler")
    .select("*")
    .eq("aktif", true)
    .order("one_cikan", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: "Biletler alınamadı.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    biletler: data.map(biletDonustur),
  });
}