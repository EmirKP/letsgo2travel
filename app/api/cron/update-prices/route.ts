import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization")?.replace("Bearer ", "");
  if (secret && auth !== secret) {
    return NextResponse.json({ error: "Yetkisiz cron isteği" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    message: "Cron endpoint hazır. Travelpayouts fiyat API anahtarı eklenince Supabase bilet fiyatları burada güncellenebilir.",
  });
}
