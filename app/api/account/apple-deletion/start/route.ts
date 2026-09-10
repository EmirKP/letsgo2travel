import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { startAppleDeletionAuthorization } from "@/lib/apple-account-deletion";
import { verifiedSessionId } from "@/lib/apple-account-deletion-crypto";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  if (Number(request.headers.get("content-length")) > 1024) return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (body?.confirmed !== true) return NextResponse.json({ error: "Hesap silme için Apple doğrulamasını onaylayın." }, { status: 400 });
  const sessionId = verifiedSessionId(request.headers.get("Authorization")!.slice(7).trim());
  if (!sessionId) return NextResponse.json({ error: "Devam etmek için yeniden giriş yapın." }, { status: 401 });
  const result = await startAppleDeletionAuthorization(auth.supabase, auth.user, sessionId);
  return NextResponse.json(result.ok ? result : { error: result.message, code: result.code }, { status: result.ok ? 200 : result.status, headers: { "Cache-Control": "no-store" } });
}
