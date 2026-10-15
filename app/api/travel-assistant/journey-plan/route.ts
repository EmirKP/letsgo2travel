import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { requireAuthenticatedUser } from '@/lib/authenticated-user';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { boundedJson } from '@/lib/travel-assistant/http';
import { createJourneyPlan, JourneyPlanError, journeyPlanModel, journeyPlanWait, parseJourneyPlanRequest } from '@/lib/travel-assistant/journey-plan';

export const runtime = 'nodejs';
export const maxDuration = 60;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
function guestNetwork(request: Request): string {
  // Vercel overwrites its own forwarded header. On a local or other host no
  // arbitrary request header is proof of the caller's network identity.
  const raw = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.trim() : '';
  if (!raw || raw.includes('%')) return 'unknown';
  const version = isIP(raw);
  if (version === 4) return raw;
  if (version !== 6) return 'unknown';
  const canonical = new URL(`http://[${raw}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const left = parseInt(mapped[1], 16), right = parseInt(mapped[2], 16);
  return [left >>> 8, left & 255, right >>> 8, right & 255].join('.');
}
export async function POST(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  let release: (() => Promise<unknown>) | undefined;
  let finalizingSuccess = false;
  let stage = 'validation';
  try {
    let auth;
    try { auth = request.headers.has('authorization') ? await journeyPlanWait(requireAuthenticatedUser(request), AbortSignal.any([signal, AbortSignal.timeout(4000)])) : null; }
    catch { return reply({ code: 'plan_unavailable' }, 503); }
    if (auth && !auth.ok) { auth.response.headers.set('Cache-Control', 'private, no-store'); return auth.response; }
    let input;
    try { input = parseJourneyPlanRequest(await journeyPlanWait(boundedJson(request, 10_000), AbortSignal.any([signal, AbortSignal.timeout(3000)]))); }
    catch (error) { return reply({ code: 'plan_invalid' }, error instanceof Error && error.message === 'too-large' ? 413 : 400); }
    if (!input) return reply({ code: 'plan_invalid' }, 400);
    const operationId = request.headers.get('Idempotency-Key');
    if (operationId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId)) return reply({ code: 'plan_invalid' }, 400);
    if (!journeyPlanModel()) return reply({ code: 'plan_unavailable' }, 503);
    const db = auth?.ok ? auth.supabase : getSupabaseAdmin();
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!db || !secret) return reply({ code: 'plan_unavailable' }, 503);
    // Trusted hosting headers only; raw network addresses and travel wishes are
    // never persisted. Unknown/local guests share one deliberately small bucket.
    const network = guestNetwork(request);
    const actor = createHmac('sha256', secret).update(`journey-plan:${auth?.ok ? `user:${auth.user.id}` : `guest:${network}`}`).digest('hex');
    const receipt = randomUUID();
    const finish = async (success: boolean, result?: unknown) => {
      // Cleanup must survive the request deadline/disconnect. The receipt makes
      // repeated completion safe and fences an uncertain, late reservation.
      const finishSignal = AbortSignal.timeout(3000);
      return journeyPlanWait((operationId
        ? db.rpc('complete_journey_plan_operation', { p_actor: actor, p_operation: operationId, p_attempt: receipt, p_result: success ? result : null })
        : db.rpc('finish_journey_plan_quota', { p_actor: actor, p_request: receipt, p_success: success })).abortSignal(finishSignal), finishSignal);
    };
    release = () => finish(false);
    const quotaSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
    stage = 'reservation';
    if (operationId) {
      const hash = createHmac('sha256', secret).update(JSON.stringify(input)).digest('hex');
      const admitted = await journeyPlanWait(db.rpc('begin_journey_plan_operation', {
        p_actor: actor, p_operation: operationId, p_hash: hash, p_owner: auth?.ok ? auth.user.id : null,
        p_guest: !auth?.ok, p_attempt: receipt,
      }).abortSignal(quotaSignal), quotaSignal);
      if (admitted.error) throw new JourneyPlanError('plan_unavailable');
      const state = admitted.data?.state;
      if (state !== 'acquired') {
        release = undefined;
        if (state === 'succeeded' && admitted.data.result) return reply(admitted.data.result);
        if (state === 'pending') return reply({ code: 'plan_pending' }, 409);
        if (state === 'conflict' || state === 'expired') return reply({ code: `plan_${state}` }, 409);
        if (state === 'limit') return reply({ code: 'plan_limit' }, 429);
        throw new JourneyPlanError('plan_unavailable');
      }
    } else {
      const quota = await journeyPlanWait(db.rpc('reserve_journey_plan_quota', { p_actor: actor, p_guest: !auth?.ok, p_request: receipt }).abortSignal(quotaSignal), quotaSignal);
      if (quota.error) throw new JourneyPlanError('plan_unavailable');
      if (quota.data !== true) { release = undefined; return reply({ code: 'plan_limit' }, 429); }
    }
    if (signal.aborted) throw new JourneyPlanError('plan_timeout');
    stage = 'generation';
    const result = await createJourneyPlan(input, signal);
    if (signal.aborted && !operationId) throw new JourneyPlanError('plan_timeout');
    finalizingSuccess = true;
    stage = 'completion';
    const finished = await finish(true, result);
    if (finished.error || finished.data !== true) throw new JourneyPlanError('plan_unavailable');
    release = undefined;
    return reply(result);
  } catch (error) {
    // Never undo an uncertain success commit. Uncommitted reservations expire;
    // a committed success remains charged even if its acknowledgement is lost.
    if (release && !finalizingSuccess) { try { await release(); } catch { /* Expires safely if cleanup is unavailable. */ } }
    const code = error instanceof JourneyPlanError ? error.code : 'plan_unavailable';
    console.warn('journey_plan_request_failed', { stage, code });
    return reply({ code }, code === 'plan_timeout' ? 504 : code === 'plan_failed' ? 502 : code === 'plan_invalid' ? 400 : 503);
  }
}
