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
  ay: string;
  havayolu: string;
  sure: string;
  bagaj: string;
  etiket: string;
  link: string;
  aktif: boolean;
  one_cikan: boolean;
  kategori?: string;
  aciklama?: string;
  ulke_emoji?: string;
  son_kontrol?: string;
  kampanya_bitis?: string;
  tiklanma?: number;
  kalkis_kodu?: string;
  varis_kodu?: string;
  aktarma?: string;
  saglayici?: string;
  arama_puani?: number;
  gidis_tarihi?: string | null;
  donus_tarihi?: string | null;
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

function biletDonustur(row: BiletRow) {
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
    kategori: row.kategori || "Genel",
    aciklama: row.aciklama || "",
    ulkeEmoji: row.ulke_emoji || "✈️",
    sonKontrol: row.son_kontrol || "Bugün",
    kampanyaBitis: row.kampanya_bitis || "",
    tiklanma: row.tiklanma || 0,
    kalkisKodu: row.kalkis_kodu || "",
    varisKodu: row.varis_kodu || "",
    aktarma: row.aktarma || "Farketmez",
    saglayici: row.saglayici || "Letsgo 2 Travel",
    aramaPuani: row.arama_puani || 80,
    gidisTarihi: row.gidis_tarihi,
    donusTarihi: row.donus_tarihi,
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
    .order("fiyat_sayi", { ascending: true })
    .limit(48);

  if (error) {
    return NextResponse.json(
      { message: "Fırsatlar alınamadı.", error: error.message },
      { status: 500 }
    );
  }

  const firsatlar = ((data || []) as BiletRow[]).map(biletDonustur);

  return NextResponse.json({
    toplam: firsatlar.length,
    firsatlar,
  });
}
