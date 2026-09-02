import { NextResponse } from "next/server";
import { getLegalDocument } from "@/lib/legal/content";

// Yasal metinler (mobil uygulama İÇİNDE okunur; tarayıcıya yönlendirme yok).
// İçerik lib/legal/content.ts'teki TEK kaynaktan gelir; web sayfaları da
// aynı kaynağı kullanır.

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = getLegalDocument(String(slug || ""));
  if (!document) return NextResponse.json({ error: "Metin bulunamadı." }, { status: 404 });
  return NextResponse.json(
    { data: document },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
