import { NextResponse } from "next/server";
import { getDealBySlug } from "@/lib/data";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const deal = await getDealBySlug(slug);
  if (!deal) return NextResponse.json({ error: "Fırsat bulunamadı" }, { status: 404 });
  return NextResponse.json({ data: deal });
}
