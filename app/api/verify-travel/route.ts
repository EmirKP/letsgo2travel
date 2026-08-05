import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Bu eski doğrulama akışı kapatıldı. Güncel belge doğrulama sayfasını kullanın.",
      redirect: "/profil/dogrulamalar",
    },
    { status: 410 },
  );
}
