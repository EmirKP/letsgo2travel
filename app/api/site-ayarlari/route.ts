import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    yanRenk1: row.yan_renk_1 || "#2563EB",
    yanRenk2: row.yan_renk_2 || "#FACC15",
    yanRenk3: row.yan_renk_3 || "#10B981",

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

export async function GET() {
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