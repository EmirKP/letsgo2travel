import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    data: [],
    message: "Canlı uçuş modülü hazır. API sağlayıcı tokenı eklenince veri dönecek.",
  });
}
