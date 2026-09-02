import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isoCountryByAlpha2 } from "@/lib/countries/isoSource";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_NOTE_LENGTH = 1000;
const FILE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

async function hasExpectedSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

  if (file.type === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (file.type === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (file.type === "image/webp") {
    return startsWith(0x52, 0x49, 0x46, 0x46) && bytes.slice(8, 12).every((byte, index) => byte === [0x57, 0x45, 0x42, 0x50][index]);
  }
  if (file.type === "application/pdf") return startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  return false;
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB configuration missing" }, { status: 500 });

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
  } catch {
    return NextResponse.json({ error: "Server error", data: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB configuration missing" }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const countryCodeValue = formData.get("countryCode");
    const noteValue = formData.get("note");
    const fileValue = formData.get("file");
    const countryCode = typeof countryCodeValue === "string" ? countryCodeValue.trim().toUpperCase() : "";
    const note = typeof noteValue === "string" ? noteValue.trim() : "";
    const file = fileValue instanceof File ? fileValue : null;

    if (!countryCode || !file) {
      return NextResponse.json({ error: "Eksik bilgi." }, { status: 400 });
    }

    if (note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `Not en fazla ${MAX_NOTE_LENGTH} karakter olabilir.` }, { status: 400 });
    }

    // Tam ISO 3166 kaynağı: 240+ ülke/bölge başvuruya açık.
    const countryInfo = isoCountryByAlpha2(countryCode);
    if (!countryInfo) {
      return NextResponse.json({ error: "Geçersiz ülke." }, { status: 400 });
    }

    // Dosya kontrolü (Max 5MB)
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Dosya boyutu 5MB'dan küçük olmalıdır." }, { status: 400 });
    }

    const fileExtension = FILE_EXTENSIONS[file.type];
    if (!fileExtension) {
      return NextResponse.json({ error: "Geçersiz dosya tipi. (jpg, png, webp, pdf)" }, { status: 400 });
    }
    if (!(await hasExpectedSignature(file))) {
      return NextResponse.json({ error: "Dosya içeriği seçilen formatla eşleşmiyor." }, { status: 400 });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [approvedResult, pendingResult, recentResult] = await Promise.all([
      supabase
        .from("travel_verifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("country_code", countryCode)
        .eq("status", "approved")
        .limit(1),
      supabase
        .from("travel_verifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("country_code", countryCode)
        .eq("status", "pending")
        .limit(1),
      supabase
        .from("travel_verifications")
        .select("id")
        .eq("user_id", user.id)
        .gte("created_at", tenMinutesAgo)
        .limit(1),
    ]);

    if (approvedResult.error || pendingResult.error || recentResult.error) {
      return NextResponse.json({ error: "Doğrulama kayıtları kontrol edilemedi." }, { status: 500 });
    }

    if ((approvedResult.data?.length || 0) > 0) {
      return NextResponse.json({ error: "Bu ülke zaten onaylanmış." }, { status: 400 });
    }

    if ((pendingResult.data?.length || 0) > 0) {
      return NextResponse.json({ error: "Bu ülke için zaten bekleyen bir başvurunuz var." }, { status: 409 });
    }

    if ((recentResult.data?.length || 0) > 0) {
      return NextResponse.json({ error: "Yeni bir belge göndermeden önce 10 dakika bekleyin." }, { status: 429 });
    }

    // Upload to Storage
    const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExtension}`;
    const filePath = `${user.id}/${fileName}`;
    const evidenceExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: uploadError } = await supabase.storage
      .from("travel-evidence")
      .upload(filePath, file, { contentType: file.type, upsert: false });

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
        country_name: countryInfo.name,
        verification_type: 'document', // for backward compatibility with old code
        evidence_path: filePath,
        evidence_type: file.type,
        evidence_expires_at: evidenceExpiresAt,
        user_note: note,
        status: 'pending'
      }])
      .select();

    if (insertError) {
      console.error("travel_verifications insert error:", insertError);
      const { error: cleanupError } = await supabase.storage.from("travel-evidence").remove([filePath]);
      if (cleanupError) console.error("travel evidence cleanup error:", cleanupError);
      return NextResponse.json({ error: "Doğrulama başvurusu kaydedilemedi." }, { status: 500 });
    }

    return NextResponse.json({ data: data[0] });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
