import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCountryByCode } from "@/lib/countries/countryData";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB configuration missing" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("travel_verifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === '42P01') {
         return NextResponse.json({ data: [] });
      }
      return NextResponse.json({ error: "Failed to fetch verifications" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: "Server error", data: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB configuration missing" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const countryCode = formData.get("countryCode") as string;
    const note = formData.get("note") as string;
    const file = formData.get("file") as File;

    if (!countryCode || !file) {
      return NextResponse.json({ error: "Eksik bilgi." }, { status: 400 });
    }

    const countryInfo = getCountryByCode(countryCode);
    if (!countryInfo) {
      return NextResponse.json({ error: "Geçersiz ülke." }, { status: 400 });
    }

    // Dosya kontrolü (Max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Dosya boyutu 5MB'dan küçük olmalıdır." }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Geçersiz dosya tipi. (jpg, png, webp, pdf)" }, { status: 400 });
    }

    // Daha önce onaylanmış mı?
    const { data: existing } = await supabase
      .from("travel_verifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("country_code", countryCode)
      .eq("status", "approved");

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Bu ülke zaten onaylanmış." }, { status: 400 });
    }

    // Upload to Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("travel-evidence")
      .upload(filePath, file, { contentType: file.type });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Dosya yüklenemedi." }, { status: 500 });
    }

    // Insert into DB
    const { data, error: insertError } = await supabase
      .from("travel_verifications")
      .insert([{
        user_id: user.id,
        country_code: countryCode,
        country_name: countryInfo.nameTR,
        verification_type: 'document', // for backward compatibility with old code
        evidence_path: filePath,
        evidence_type: file.type,
        user_note: note,
        status: 'pending'
      }])
      .select();

    if (insertError) {
      console.error("travel_verifications insert error:", insertError);
      return NextResponse.json({ error: "Doğrulama başvurusu kaydedilemedi." }, { status: 500 });
    }

    return NextResponse.json({ data: data[0] });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
