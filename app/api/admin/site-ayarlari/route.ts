import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function yetkiliMi(request: Request) {
  return request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function ayarDonustur(row: any) {
  return {
    id: row.id,
    siteBaslik: row.site_baslik,
    siteAltBaslik: row.site_alt_baslik,

    heroRozet: row.hero_rozet,
    heroBaslik: row.hero_baslik,
    heroAciklama: row.hero_aciklama,

    instagramTr: row.instagram_tr,
    instagramEn: row.instagram_en,
    whatsappLink: row.whatsapp_link,

    temaAdi: row.tema_adi,
    anaRenk: row.ana_renk,
    koyuRenk: row.koyu_renk,
    arkaPlan: row.arka_plan,
    kartRenk: row.kart_renk,
    yaziRenk: row.yazi_renk,
    butonYaziRenk: row.buton_yazi_renk,

    gununFirsatiGoster: row.gunun_firsati_goster,
    kategorilerGoster: row.kategoriler_goster,
    rehberlerGoster: row.rehberler_goster,
    fiyatAlarmGoster: row.fiyat_alarm_goster,
    sosyalMedyaGoster: row.sosyal_medya_goster,
    sssGoster: row.sss_goster,

    footerMetni: row.footer_metni,
  };
}

export async function GET(request: Request) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("site_ayarlari")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Site ayarları alınamadı.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ayarlar: ayarDonustur(data),
  });
}

export async function PUT(request: Request) {
  if (!yetkiliMi(request)) {
    return NextResponse.json({ message: "Yetkisiz işlem." }, { status: 401 });
  }

  const body = await request.json();

  const { data, error } = await supabaseAdmin
    .from("site_ayarlari")
    .upsert({
      id: 1,

      site_baslik: body.siteBaslik,
      site_alt_baslik: body.siteAltBaslik,

      hero_rozet: body.heroRozet,
      hero_baslik: body.heroBaslik,
      hero_aciklama: body.heroAciklama,

      instagram_tr: body.instagramTr,
      instagram_en: body.instagramEn,
      whatsapp_link: body.whatsappLink,

      tema_adi: body.temaAdi,
      ana_renk: body.anaRenk,
      koyu_renk: body.koyuRenk,
      arka_plan: body.arkaPlan,
      kart_renk: body.kartRenk,
      yazi_renk: body.yaziRenk,
      buton_yazi_renk: body.butonYaziRenk,

      gunun_firsati_goster: body.gununFirsatiGoster,
      kategoriler_goster: body.kategorilerGoster,
      rehberler_goster: body.rehberlerGoster,
      fiyat_alarm_goster: body.fiyatAlarmGoster,
      sosyal_medya_goster: body.sosyalMedyaGoster,
      sss_goster: body.sssGoster,

      footer_metni: body.footerMetni,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: "Site ayarları kaydedilemedi.", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ayarlar: ayarDonustur(data),
  });
}