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
};

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
    detaySlug: row.detay_slug || `${row.nereden}-${row.nereye}-${row.id}`,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const { data: bilet, error } = await supabaseAdmin
    .from("biletler")
    .select("*")
    .eq("detay_slug", slug)
    .eq("aktif", true)
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Bilet bulunamadı.", error: error.message },
      { status: 404 }
    );
  }

  const detay = biletDonustur(bilet as BiletRow);

  const { data: benzerler } = await supabaseAdmin
    .from("biletler")
    .select("*")
    .eq("aktif", true)
    .neq("id", detay.id)
    .or(`kategori.eq.${detay.kategori},ulke.eq.${detay.ulke},nereden.eq.${detay.nereden}`)
    .limit(4);

  return NextResponse.json({
    bilet: detay,
    benzerler: ((benzerler || []) as BiletRow[]).map(biletDonustur),
  });
}