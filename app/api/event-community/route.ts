import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/authenticated-user';
import { canonicalEventKey, parseEventCommunityAction, resolveCommunityEvent, serializeEventCommunity } from '@/lib/event-community';
import { COMMUNITY_PRIVATE_HEADERS, COMMUNITY_UUID } from '@/lib/community/safety';
import { readSocialJson } from '@/lib/community/social';
import { moderateUserText } from '@/lib/community/moderation';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: COMMUNITY_PRIVATE_HEADERS });
const unavailable = () => reply({ error: 'Etkinlik sohbeti henüz kullanılamıyor. Lütfen daha sonra tekrar dene.', code: 'event_community_unavailable' }, 503);

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  if (!url.searchParams.has('eventId')) {
    const { data, error } = await auth.supabase.rpc('event_community_list', { p_user: auth.user.id });
    return error ? unavailable() : reply({ data: Array.isArray(data) ? data : [] });
  }
  const key = canonicalEventKey(url.searchParams.get('eventId'));
  if (!key) return reply({ error: 'Geçersiz etkinlik.' }, 400);
  const before = url.searchParams.get('before'), beforeId = url.searchParams.get('beforeId');
  if ((before || beforeId) && (!before || !Number.isFinite(Date.parse(before)) || !beforeId || !COMMUNITY_UUID.test(beforeId))) return reply({ error: 'Geçersiz sayfa.' }, 400);
  try {
    const { data: existing, error: existingError } = await auth.supabase.from('event_community_events').select('checked_at').eq('event_key', key).maybeSingle();
    if (existingError) return unavailable();
    let verification = 'current';
    if (!existing || Date.now() - Date.parse(existing.checked_at) > 15 * 60_000) {
      try {
        const snapshot = await resolveCommunityEvent(auth.supabase, key);
        if (!snapshot && !existing) return reply({ error: 'Etkinlik kaynağında bulunamadı.' }, 404);
        if (snapshot) { const { error } = await auth.supabase.rpc('event_community_sync', { p_key: key, p_snapshot: snapshot }); if (error) return unavailable(); }
        else verification = 'unavailable';
      } catch { if (!existing) return unavailable(); verification = 'unavailable'; }
    }
    const { data, error } = await auth.supabase.rpc('event_community_read', { p_user: auth.user.id, p_key: key, p_before: before, p_before_id: beforeId });
    if (error) return unavailable();
    return data ? reply({ data: await serializeEventCommunity(auth.supabase, data), verification }) : reply({ error: 'Etkinlik bulunamadı.' }, 404);
  } catch { return unavailable(); }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const payload = await readSocialJson(request, 10_000);
  const key = canonicalEventKey(payload?.eventId);
  const parsed = payload && parseEventCommunityAction(payload);
  if (!key || !parsed) return reply({ error: 'İşlem bilgileri geçersiz.' }, 400);
  if ((parsed.action === 'message' || parsed.action === 'meetup') && moderateUserText(String(parsed.input.body || parsed.input.publicPlace)).isIllegalOrProfane) return reply({ error: 'Lütfen topluluk kurallarına uygun bir metin yaz.' }, 400);
  try {
    // RSVP always rechecks the authoritative source. Other actions remain usable
    // during a provider outage for existing members; never fabricate an update.
    if (parsed.action === 'join') {
      const snapshot = await resolveCommunityEvent(auth.supabase, key);
      if (!snapshot) return reply({ error: 'Etkinlik kaynağında bulunamadı.' }, 404);
      const { error } = await auth.supabase.rpc('event_community_sync', { p_key: key, p_snapshot: snapshot });
      if (error) return unavailable();
    }
    const { data, error } = await auth.supabase.rpc('event_community_action', { p_user: auth.user.id, p_key: key, p_action: parsed.action, p_input: parsed.input });
    if (error) {
      if (error.code === '54000') return reply({ error: 'Çok hızlı işlem yapıyorsun. Biraz bekleyip tekrar dene.', code: 'rate_limited' }, 429);
      if (error.code === '42501') return reply({ error: 'Bu işlem için etkinlik grubuna katılmalı veya yetkili olmalısın.' }, 403);
      if (error.code === '23505') return reply({ error: 'Mesaj isteği başka bir içerikle kullanılmış. Metni kontrol edip tekrar dene.' }, 409);
      if (error.code === 'P0002') return reply({ error: 'Etkinlik veya buluşma artık kullanılamıyor.' }, 404);
      if (error.code === '22023') return reply({ error: 'İşlem tamamlanamadı. Profil adını, etkinlik durumunu ve buluşma saatini kontrol et.' }, 400);
      return unavailable();
    }
    return reply(data);
  } catch { return unavailable(); }
}
