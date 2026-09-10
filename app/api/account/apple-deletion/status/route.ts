import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { getAppleDeletionStatus } from "@/lib/apple-account-deletion";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getAppleDeletionStatus(auth.supabase, auth.user), { headers: { "Cache-Control": "no-store" } });
}
