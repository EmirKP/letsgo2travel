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

function temizle(metin: string) {
  return metin
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
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
    detaySlug: row.detay_slug || `${row.nereden}-${row.nereye}-${row.id}`,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const nereden = temizle(searchParams.get("nereden") || "");
  const nereye = temizle(searchParams.get("nereye") || "");
  const vize = searchParams.get("vize") || "Tümü";
  const kategori = searchParams.get("kategori") || "Tümü";
  const aktarma = searchParams.get("aktarma") || "Tümü";
  const maksimumFiyat = Number(searchParams.get("maksimumFiyat") || 999999);
  const siralama = searchParams.get("siralama") || "en-iyi";

  const { data, error } = await supabaseAdmin
    .from("biletler")
    .select("*")
    .eq("aktif", true)
    .order("one_cikan", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: "Arama sonuçları alınamadı.", error: error.message },
      { status: 500 }
    );
  }

  let biletler = (data as BiletRow[]).map(biletDonustur);

  biletler = biletler.filter((bilet) => {
    const kalkisMetni = temizle(
      `${bilet.nereden} ${bilet.kalkisKodu}`
    );

    const varisMetni = temizle(
      `${bilet.nereye} ${bilet.ulke} ${bilet.varisKodu}`
    );

    const neredenUyuyor = !nereden || kalkisMetni.includes(nereden);
    const nereyeUyuyor = !nereye || varisMetni.includes(nereye);

    const vizeUyuyor = vize === "Tümü" || bilet.vize === vize;
    const kategoriUyuyor = kategori === "Tümü" || bilet.kategori === kategori;
    const aktarmaUyuyor = aktarma === "Tümü" || bilet.aktarma === aktarma;
    const fiyatUyuyor = bilet.fiyatSayi <= maksimumFiyat;

    return (
      neredenUyuyor &&
      nereyeUyuyor &&
      vizeUyuyor &&
      kategoriUyuyor &&
      aktarmaUyuyor &&
      fiyatUyuyor
    );
  });

  if (siralama === "en-ucuz") {
    biletler = [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi);
  }

  if (siralama === "en-hizli") {
    biletler = [...biletler].sort((a, b) => a.sure.localeCompare(b.sure));
  }

  if (siralama === "populer") {
    biletler = [...biletler].sort((a, b) => b.tiklanma - a.tiklanma);
  }

  if (siralama === "en-iyi") {
    biletler = [...biletler].sort((a, b) => {
      if (b.oneCikan !== a.oneCikan) return Number(b.oneCikan) - Number(a.oneCikan);
      if (b.aramaPuani !== a.aramaPuani) return b.aramaPuani - a.aramaPuani;
      return a.fiyatSayi - b.fiyatSayi;
    });
  }

  return NextResponse.json({
    toplam: biletler.length,
    biletler,
  });
}