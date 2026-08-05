import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
} from "@/lib/admin-session";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();

function sameSecret(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    return NextResponse.json(
      { error: "Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = String(body.password || "");
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD env değişkeni ayarlanmamış." }, { status: 500 });
  }

  if (!sameSecret(password, adminPassword)) {
    attempts.set(ip, {
      count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1,
      resetAt: attempt && attempt.resetAt > now ? attempt.resetAt : now + 15 * 60 * 1000,
    });
    return NextResponse.json({ error: "Hatalı şifre." }, { status: 401 });
  }

  attempts.delete(ip);
  const token = await createAdminSessionToken({ role: "super_admin", subject: "legacy-admin" });
  const response = NextResponse.json(
    { success: true, role: "super_admin" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  response.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());

  return response;
}
