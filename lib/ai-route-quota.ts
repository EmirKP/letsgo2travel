import { createHmac, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAuthenticatedUser } from './authenticated-user';
import { JourneyPlanError, journeyPlanWait } from './travel-assistant/journey-plan';

export type AiRouteQuota = { limit: 1 | 3; used: number; remaining: number; pending: boolean; resetAt: string; timeZone: 'UTC' };
type AiRouteAccount = { supabase: SupabaseClient; user: { id: string } };
type Admission = { state: string; quota: AiRouteQuota; result?: Record<string, unknown>; retryAfterSeconds?: number };
export class AiRouteQuotaError extends Error {
  constructor(readonly code: string, readonly status: number, readonly quota?: AiRouteQuota, readonly retryAfterSeconds?: number) { super(code); }
}
function clientQuota(quota: AiRouteQuota): AiRouteQuota {
  // Shipped native clients validate the original 0/1 shape strictly. Their
  // admission still uses the real database allowance; only the display adapts.
  const used = quota.used >= quota.limit ? 1 : 0;
  return { ...quota, limit: 1, used, remaining: quota.pending || used ? 0 : 1 };
}
export function aiRouteReply(body: unknown, status = 200, headers: Record<string, string> = {}, request?: Request) {
  let output = body;
  if (request && new URL(request.url).searchParams.get('quotaVersion') !== '2' && body && typeof body === 'object' && !Array.isArray(body)) {
    const value = body as Record<string, unknown>;
    if (value.limit === 1 || value.limit === 3) output = clientQuota(quotaValue(value));
    else if (value.quota) output = { ...value, quota: clientQuota(quotaValue(value.quota)) };
  }
  return Response.json(output, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
}
function quotaValue(value: unknown): AiRouteQuota {
  const q = value as Partial<AiRouteQuota> | null;
  if (!q || (q.limit !== 1 && q.limit !== 3) || typeof q.used !== 'number' || !Number.isInteger(q.used) || q.used < 0 || q.used > q.limit
    || q.remaining !== (q.pending ? 0 : q.limit - q.used) || typeof q.pending !== 'boolean'
    || q.timeZone !== 'UTC' || typeof q.resetAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00Z$/.test(q.resetAt) || !Number.isFinite(Date.parse(q.resetAt))) {
    throw new JourneyPlanError('plan_unavailable');
  }
  return q as AiRouteQuota;
}
export async function requireAiRouteAccount(request: Request, signal: AbortSignal): Promise<AiRouteAccount> {
  if (!request.headers.get('authorization')?.startsWith('Bearer ')) throw new AiRouteQuotaError('plan_sign_in', 401);
  const auth = await journeyPlanWait(requireAuthenticatedUser(request), AbortSignal.any([signal, AbortSignal.timeout(4000)]));
  if (!auth.ok) throw new AiRouteQuotaError(auth.response.status === 401 ? 'plan_sign_in' : 'plan_unavailable', auth.response.status);
  return auth;
}
export async function readAiRouteQuota(account: AiRouteAccount, signal: AbortSignal): Promise<AiRouteQuota> {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
  const result = await journeyPlanWait(account.supabase.rpc('get_ai_route_quota', { p_owner: account.user.id }).abortSignal(bounded), bounded);
  if (result.error) throw new JourneyPlanError('plan_unavailable');
  return quotaValue(result.data);
}

export function aiRouteOperation(account: AiRouteAccount, request: Request, input: unknown, kind: 'journey' | 'suggestions') {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new JourneyPlanError('plan_unavailable');
  // Preserve existing journey receipt hashes. Quota identity is the verified
  // UUID, so rotating this secret cannot restore an account allowance.
  const hash = createHmac('sha256', secret).update(JSON.stringify(input)).digest('hex');
  let operationId = request.headers.get('Idempotency-Key');
  if (operationId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId)) throw new AiRouteQuotaError('plan_invalid', 400);
  if (!operationId) {
    // Older clients without an explicit key can recover identical input today.
    const legacy = createHmac('sha256', secret).update(`${kind}:${hash}:${new Date().toISOString().slice(0, 10)}`).digest('hex');
    operationId = `${legacy.slice(0, 8)}-${legacy.slice(8, 12)}-4${legacy.slice(13, 16)}-8${legacy.slice(17, 20)}-${legacy.slice(20, 32)}`;
  }
  const attempt = randomUUID();
  const identity = { p_owner: account.user.id, p_operation: operationId, p_attempt: attempt };
  let canRelease = false;
  let committing = false;
  return {
    async begin(signal: AbortSignal): Promise<Admission> {
      // Set before sending: cancellation can overtake a delayed admission.
      canRelease = true;
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const response = await journeyPlanWait(account.supabase.rpc('begin_ai_route_operation', { ...identity, p_hash: hash, p_kind: kind }).abortSignal(bounded), bounded);
      if (response.error) throw new JourneyPlanError('plan_unavailable');
      const admission = response.data as Admission | null;
      if (!admission || typeof admission.state !== 'string') throw new JourneyPlanError('plan_unavailable');
      const quota = quotaValue(admission.quota);
      if (admission.state === 'acquired') return { ...admission, quota };
      canRelease = false;
      if (admission.state === 'succeeded' && admission.result && typeof admission.result === 'object' && !Array.isArray(admission.result)) return { ...admission, quota };
      if (admission.state === 'limit') throw new AiRouteQuotaError('plan_limit', 429, quota);
      if (admission.state === 'pending') throw new AiRouteQuotaError('plan_pending', 409, quota);
      if (admission.state === 'conflict' || admission.state === 'expired') throw new AiRouteQuotaError(`plan_${admission.state}`, 409, quota);
      if (admission.state === 'busy') throw new AiRouteQuotaError('plan_busy', 429, quota, admission.retryAfterSeconds);
      throw new JourneyPlanError('plan_unavailable');
    },
    async complete(result: Record<string, unknown>): Promise<AiRouteQuota> {
      // Never refund an uncertain success commit. The same operation replays it.
      committing = true;
      const bounded = AbortSignal.timeout(3000);
      const response = await journeyPlanWait(account.supabase.rpc('complete_ai_route_operation', { ...identity, p_result: result }).abortSignal(bounded), bounded);
      if (response.error || response.data?.ok !== true) throw new JourneyPlanError('plan_unavailable');
      canRelease = false;
      return quotaValue(response.data.quota);
    },
    async release() {
      if (!canRelease || committing) return;
      canRelease = false;
      const bounded = AbortSignal.timeout(3000);
      try { await journeyPlanWait(account.supabase.rpc('complete_ai_route_operation', { ...identity, p_result: null }).abortSignal(bounded), bounded); }
      catch { /* The bounded lease expires without charging a successful plan. */ }
    },
    async reserveProviderAttempt(tokens: number, signal: AbortSignal) {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const providerAttempt = randomUUID();
      const response = await journeyPlanWait(account.supabase.rpc('reserve_ai_route_provider_attempt', { p_request: providerAttempt, p_tokens: tokens }).abortSignal(bounded), bounded);
      if (response.error || !response.data || typeof response.data.allowed !== 'boolean') throw new JourneyPlanError('plan_unavailable');
      if (!response.data.allowed) {
        const daily = response.data.window === 'day';
        if (!daily && response.data.window !== 'minute') throw new JourneyPlanError('plan_unavailable');
        const retryAfterSeconds = response.data.retryAfterSeconds;
        throw new JourneyPlanError(daily ? 'plan_daily_capacity' : 'plan_busy', {
          limitWindow: daily ? 'day' : 'minute', retryAfterSeconds: Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : null,
        });
      }
      return { async settle(actualTokens: number) {
        if (!Number.isInteger(actualTokens) || actualTokens < 1 || actualTokens > tokens) return;
        const settleSignal = AbortSignal.timeout(3000);
        try { await journeyPlanWait(account.supabase.rpc('settle_ai_route_provider_attempt', { p_request: providerAttempt, p_tokens: actualTokens }).abortSignal(settleSignal), settleSignal); }
        catch { /* Uncertain usage keeps the original conservative reservation. */ }
      } };
    },
  };
}
export function aiRouteErrorReply(error: unknown, request?: Request) {
  if (error instanceof AiRouteQuotaError) return aiRouteReply({ code: error.code, ...(error.quota ? { quota: error.quota } : {}) }, error.status,
    error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}, request);
  const code = error instanceof JourneyPlanError ? error.code : 'plan_unavailable';
  const capacity = error instanceof JourneyPlanError ? error.providerCapacity : undefined;
  const retryAfter = capacity?.retryAfterSeconds ?? (capacity?.limitWindow === 'day' ? null : 60);
  return aiRouteReply({ code }, code === 'plan_timeout' ? 504 : code === 'plan_failed' ? 502 : code === 'plan_request_too_large' ? 413 : code === 'plan_invalid' ? 400 : 503,
    (code === 'plan_busy' || code === 'plan_daily_capacity') && retryAfter !== null ? { 'Retry-After': String(retryAfter) } : {}, request);
}
