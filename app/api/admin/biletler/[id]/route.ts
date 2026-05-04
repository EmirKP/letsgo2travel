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

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

function yetkiliMi(request: Request) {
  return request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function slugOlustur(nereden: string, nereye: string, id?: number | string) {
  const ham = `${nereden}-${nereye}${id ? `-${id}` : ""}`;

  return ham
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

function tarihVeyaNull(deger: unknown) {
  if (!deger || typeof deger !== "string") return null;
  return deger.trim() ? deger : null;
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
  };
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
  const fiyatSayi = Number(body.fiyatSayi);

  const detaySlug =
    body.detaySlug || slugOlustur(body.nereden || "", body.nereye || "", id);

  const { data, error } = await supabaseAdmin
    .from("biletler")
    .update({
      nereden: body.nereden,
      nereye: body.nereye,
      ulke: body.ulke,
      fiyat: fiyatYaz(fiyatSayi),
      fiyat_sayi: fiyatSayi,
      tarih: body.tarih,
      vize: body.vize,
      ay: body.ay,
      havayolu: body.havayolu || "Belirtilmedi",
      sure: body.sure || "Belirtilmedi",
      bagaj: body.bagaj || "Kabin bagajı dahil",
      etiket: body.etiket || "Yeni Fırsat",
      link: body.link || "https://www.skyscanner.com.tr/",
      aktif: body.aktif ?? true,
      one_cikan: body.oneCikan ?? false,

      kategori: body.kategori || "Genel",
      aciklama: body.aciklama || "",
      ulke_emoji: body.ulkeEmoji || "✈️",
      son_kontrol: body.sonKontrol || "Bugün",
      kampanya_bitis: body.kampanyaBitis || "",

      kalkis_kodu: body.kalkisKodu || "",
      varis_kodu: body.varisKodu || "",
      aktarma: body.aktarma || "Farketmez",
      saglayici: body.saglayici || "Letsgo 2 Travel",
      arama_puani: Number(body.aramaPuani || 80),
      gidis_tarihi: tarihVeyaNull(body.gidisTarihi),
      donus_tarihi: tarihVeyaNull(body.donusTarihi),
      detay_slug: detaySlug,
    })
    .eq("id", Number(id))
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Bilet güncellenemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bilet: biletDonustur(data as BiletRow),
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
    .from("biletler")
    .delete()
    .eq("id", Number(id));

  if (error) {
    return NextResponse.json(
      { message: "Bilet silinemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Bilet silindi.",
  });
}