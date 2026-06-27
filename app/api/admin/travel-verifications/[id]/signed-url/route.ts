import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const resolvedParams = await params;
    const { id } = resolvedParams;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const { data: verification, error } = await supabase
      .from("travel_verifications")
      .select("evidence_path")
      .eq("id", id)
      .single();

    if (error || !verification || !verification.evidence_path) {
      return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
    }

    const { data, error: signedUrlError } = await supabase.storage
      .from("travel-evidence")
      .createSignedUrl(verification.evidence_path, 300); // 5 minutes

    if (signedUrlError || !data) {
      return NextResponse.json({ error: "Önizleme oluşturulamadı." }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
