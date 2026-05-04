import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data: mevcutBilet, error: okumaHatasi } = await supabaseAdmin
    .from("biletler")
    .select("tiklanma")
    .eq("id", Number(id))
    .single();

  if (okumaHatasi) {
    return NextResponse.json(
      { message: "Bilet bulunamadı.", error: okumaHatasi.message },
      { status: 404 }
    );
  }

  const yeniTiklanma = Number(mevcutBilet?.tiklanma || 0) + 1;

  const { error: guncellemeHatasi } = await supabaseAdmin
    .from("biletler")
    .update({
      tiklanma: yeniTiklanma,
    })
    .eq("id", Number(id));

  if (guncellemeHatasi) {
    return NextResponse.json(
      {
        message: "Tıklanma kaydedilemedi.",
        error: guncellemeHatasi.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Tıklanma kaydedildi.",
    tiklanma: yeniTiklanma,
  });
}