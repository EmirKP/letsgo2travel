import { NextResponse } from "next/server";
import { getFlightDeals } from "@/lib/data";

export async function GET() {
  const deals = await getFlightDeals();
  return NextResponse.json({ data: deals });
}
