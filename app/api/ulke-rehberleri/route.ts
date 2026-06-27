import { NextResponse } from "next/server";
import { getCountryGuides } from "@/lib/data";

export async function GET() {
  const countries = await getCountryGuides();
  return NextResponse.json({ data: countries });
}
