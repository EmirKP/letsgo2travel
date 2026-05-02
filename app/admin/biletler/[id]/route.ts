import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

function yetkiliMi(request: Request) {
  return request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

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
    bilet: biletDonustur(data),
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