import { NextResponse } from "next/server";
import { siteSettings } from "@/lib/affiliate";

export async function GET() {
  return NextResponse.json({ data: siteSettings });
}
