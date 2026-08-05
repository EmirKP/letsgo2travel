import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authError = await requireAdmin(request, ["moderator", "admin", "super_admin"]);
    if (authError) return authError;

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB missing" }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return NextResponse.json({ error: "Path parameter is missing" }, { status: 400 });
    }


    // Verify path exists in travel_verifications
    const { data: record, error: recordError } = await supabaseAdmin
      .from("travel_verifications")
      .select("id")
      .eq("proof_file_path", path)
      .single();

    if (recordError || !record) {
      return NextResponse.json({ error: "Geçersiz dosya yolu veya başvuru bulunamadı." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("travel-proofs")
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      console.error("Signed URL error", error);
      return NextResponse.json({ error: "Dosya bağlantısı oluşturulamadı." }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
