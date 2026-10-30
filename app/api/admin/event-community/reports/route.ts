import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID } from '@/lib/community/safety';
import { readSocialJson } from '@/lib/community/social';

export async function GET(request: Request) {
  const denied = await requireAdmin(request, ['moderator', 'admin', 'super_admin']);
  if (denied) return denied;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servis kullanılamıyor.' }, { status: 503 });
  const page = Math.max(0, Math.min(1000, Number(new URL(request.url).searchParams.get('page')) || 0));
  const { data, error } = await db.from('event_community_reports').select('*,message:event_community_messages(id,event_key,body,user_id,status),meetup:event_community_meetups(id,event_key,public_place,starts_at,creator_id)').eq('status', 'open').order('created_at', { ascending: false }).range(page * 30, page * 30 + 29);
  return NextResponse.json(error ? { error: 'Şikâyetler alınamadı.' } : { data }, { status: error ? 503 : 200, headers: COMMUNITY_PRIVATE_HEADERS });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request, ['moderator', 'admin', 'super_admin']);
  if (denied) return denied;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servis kullanılamıyor.' }, { status: 503 });
  const input = await readSocialJson(request, 2000);
  if (!input || typeof input.id !== 'string' || !COMMUNITY_UUID.test(input.id) || !['resolved', 'dismissed'].includes(String(input.status)) || typeof input.hide !== 'boolean') return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
  const { data, error } = await db.rpc('event_community_moderate', { p_id: input.id, p_status: input.status, p_hide: input.hide });
  return NextResponse.json(error ? { error: 'Şikâyet güncellenemedi.' } : { success: data }, { status: error ? 503 : data ? 200 : 404, headers: COMMUNITY_PRIVATE_HEADERS });
}
