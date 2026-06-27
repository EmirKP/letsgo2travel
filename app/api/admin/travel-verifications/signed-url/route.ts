import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: "DB missing" }, { status: 500 });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'super_admin', 'moderator'].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
