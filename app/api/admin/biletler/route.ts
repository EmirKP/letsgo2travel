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
};

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

function yetkiliMi(request: Request) {
  return request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
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
  };
}

export async function GET(request: Request) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("biletler")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: "Biletler alınamadı.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    biletler: (data as BiletRow[]).map(biletDonustur),
  });
}

export async function POST(request: Request) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const body = await request.json();
  const fiyatSayi = Number(body.fiyatSayi);

  const { data, error } = await supabaseAdmin
    .from("biletler")
    .insert({
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
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Bilet eklenemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bilet: biletDonustur(data as BiletRow),
  });
}