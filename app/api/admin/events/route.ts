import { NextResponse } from "next/server";
import { adminPrincipalFromRequest } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const CATEGORIES = new Set(["concert", "festival", "sport", "culture", "food", "family", "other"]);
const STATUSES = new Set(["scheduled", "postponed", "cancelled", "completed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "private, no-store" };

async function authorize(request: Request) {
  return Boolean(await adminPrincipalFromRequest(request, ["super_admin"]));
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHttpsUrl(value: unknown) {
  const candidate = clean(value, 1200);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizedPayload(body: Record<string, unknown>) {
  const startsAt = clean(body.startsAt, 50);
  const endsAt = clean(body.endsAt, 50);
  const countryCode = clean(body.countryCode, 3).toUpperCase();
  const sourceUrl = safeHttpsUrl(body.sourceUrl);
  const imageUrl = safeHttpsUrl(body.imageUrl);
  const ticketUrl = safeHttpsUrl(body.ticketUrl);
  const startsAtMs = Date.parse(startsAt);
  const endsAtMs = Date.parse(endsAt);
  if (!clean(body.title, 240) || !clean(body.city, 120) || !(/^([A-Z]{2}|XK)$/.test(countryCode)) || !Number.isFinite(startsAtMs) || !sourceUrl) return null;
  if (endsAt && (!Number.isFinite(endsAtMs) || endsAtMs < startsAtMs)) return null;
  const category = clean(body.category, 30);
  const status = clean(body.status, 30);
  if (!CATEGORIES.has(category) || !STATUSES.has(status)) return null;
  // Geçmiş kayıtlar raporlama için korunabilir; yeni/ertelenmiş bir duyuru
  // geçmiş zamana planlanamaz. Bir dakikalık pay ağ/geçiş gecikmesini tolere eder.
  if ((status === "scheduled" || status === "postponed") && startsAtMs < Date.now() - 60_000) return null;
  return {
    provider: "curated",
    title: clean(body.title, 240),
    description: clean(body.description, 2000) || null,
    category,
    country_code: countryCode,
    city: clean(body.city, 120),
    venue: clean(body.venue, 180) || null,
    starts_at: new Date(startsAtMs).toISOString(),
    ends_at: Number.isFinite(endsAtMs) ? new Date(endsAtMs).toISOString() : null,
    status,
    image_url: imageUrl || null,
    ticket_url: ticketUrl || null,
    source_url: sourceUrl,
    featured: body.featured === true,
    published: body.published !== false,
    updated_at: new Date().toISOString(),
  };
}

function serialize(item: Record<string, unknown>) {
  return {
    id: clean(item.id, 80),
    title: clean(item.title, 240),
    description: clean(item.description, 2000),
    category: clean(item.category, 30),
    countryCode: clean(item.country_code, 3),
    city: clean(item.city, 120),
    venue: clean(item.venue, 180),
    startsAt: clean(item.starts_at, 50),
    endsAt: clean(item.ends_at, 50) || null,
    status: clean(item.status, 30),
    imageUrl: clean(item.image_url, 1200) || null,
    ticketUrl: clean(item.ticket_url, 1200) || null,
    sourceUrl: clean(item.source_url, 1200),
    featured: item.featured === true,
    published: item.published === true,
    updatedAt: clean(item.updated_at, 50),
  };
}

export async function GET(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403, headers: noStore });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yok." }, { status: 503, headers: noStore });
  const { data, error } = await supabase.from("travel_events").select("*").order("starts_at", { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: "Etkinlikler okunamadı." }, { status: 500, headers: noStore });
  return NextResponse.json({ data: (data || []).map((item) => serialize(item)) }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const payload = body && normalizedPayload(body);
  if (!payload) return NextResponse.json({ error: "Etkinlik bilgileri geçersiz." }, { status: 400, headers: noStore });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yok." }, { status: 503, headers: noStore });
  const { data, error } = await supabase.from("travel_events").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: "Etkinlik eklenemedi." }, { status: 500, headers: noStore });
  return NextResponse.json({ data: serialize(data) }, { status: 201, headers: noStore });
}

export async function PATCH(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = clean(body?.id, 80);
  const payload = body && normalizedPayload(body);
  if (!UUID_PATTERN.test(id) || !payload) return NextResponse.json({ error: "Etkinlik bilgileri geçersiz." }, { status: 400, headers: noStore });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı yok." }, { status: 503, headers: noStore });
  const { data, error } = await supabase.from("travel_events").update(payload).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: "Etkinlik güncellenemedi." }, { status: 500, headers: noStore });
  return NextResponse.json({ data: serialize(data) }, { headers: noStore });
}
