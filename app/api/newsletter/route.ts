import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4_096) {
    return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (current && current.resetAt > now && current.count >= 5) {
    return NextResponse.json(
      { error: "Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": "600" } },
    );
  }
  attempts.set(ip, current && current.resetAt > now
    ? { ...current, count: current.count + 1 }
    : { count: 1, resetAt: now + 10 * 60 * 1000 });

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta gir." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Bülten kaydı şu anda kullanılamıyor." }, { status: 503 });
  }

  const { error } = await supabase.from("subscribers").insert({ email });
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: "Bülten kaydı tamamlanamadı." }, { status: 500 });
  }

  return NextResponse.json({ message: "Kaydın alındı. Fırsatlar e-posta ile gönderilecek." });
}
