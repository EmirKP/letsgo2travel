export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type BiletRow = {
  id: number;
  nereden: string;
  nereye: string;
  ulke: string;
  fiyat: string;
  fiyat_sayi: number;
  tarih: string;
  vize: string;
  kategori?: string;
  aciklama?: string;
  ulke_emoji?: string;
  kalkis_kodu?: string;
  varis_kodu?: string;
  one_cikan: boolean;
  aktif: boolean;
  detay_slug?: string;
  gorsel_url?: string | null;
};

function slugOlustur(nereden: string, nereye: string, id: number) {
  return `${nereden}-${nereye}-${id}`
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function donustur(row: BiletRow) {
  return {
    id: row.id,
    nereden: row.nereden,
    nereye: row.nereye,
    rota: `${row.nereden} → ${row.nereye}`,
    fiyat: row.fiyat,
    fiyatSayi: row.fiyat_sayi,
    etiket: row.kategori || row.vize || "Fırsat",
    aciklama: row.aciklama || `${row.ulke} rotası için güncel uçuş fırsatı.`,
    ikon: row.ulke_emoji || "✈️",
    kalkisKodu: row.kalkis_kodu || "",
    varisKodu: row.varis_kodu || "",
    oneCikan: row.one_cikan,
    detaySlug: row.detay_slug || slugOlustur(row.nereden, row.nereye, row.id),
    gorselUrl: row.gorsel_url || "",
  };
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("biletler")
    .select("*")
    .eq("aktif", true)
    .order("one_cikan", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    return NextResponse.json(
      { message: "Ana sayfa rotaları alınamadı.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ rotalar: (data as BiletRow[]).map(donustur) });
}
