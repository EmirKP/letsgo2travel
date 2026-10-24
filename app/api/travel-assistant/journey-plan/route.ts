import { aiRouteErrorReply, aiRouteOperation, aiRouteReply, readAiRouteQuota, requireAiRouteAccount } from '@/lib/ai-route-quota';
import { boundedJson } from '@/lib/travel-assistant/http';
import { createJourneyPlan, JourneyPlanError, journeyPlanModel, journeyPlanWait, parseJourneyPlanRequest } from '@/lib/travel-assistant/journey-plan';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
  try { return aiRouteReply(await readAiRouteQuota(await requireAiRouteAccount(request, signal), signal), 200, {}, request); }
  catch (error) { return aiRouteErrorReply(error, request); }
}

export async function POST(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  let operation: ReturnType<typeof aiRouteOperation> | undefined;
  let stage = 'authentication';
  try {
    const account = await requireAiRouteAccount(request, signal);
    stage = 'validation';
    let input;
    try { input = parseJourneyPlanRequest(await journeyPlanWait(boundedJson(request, 10_000), AbortSignal.any([signal, AbortSignal.timeout(3000)]))); }
    catch (error) { return aiRouteReply({ code: 'plan_invalid' }, error instanceof Error && error.message === 'too-large' ? 413 : 400); }
    if (!input) return aiRouteReply({ code: 'plan_invalid' }, 400);
    operation = aiRouteOperation(account, request, input, 'journey');
    stage = 'reservation';
    const admitted = await operation.begin(signal);
    if (admitted.state === 'succeeded') return aiRouteReply({ ...admitted.result, quota: admitted.quota }, 200, {}, request);
    if (!journeyPlanModel()) throw new JourneyPlanError('plan_unavailable');
    if (signal.aborted) throw new JourneyPlanError('plan_timeout');
    stage = 'generation';
    const result = await createJourneyPlan(input, signal, { reserveProviderAttempt: operation.reserveProviderAttempt });
    stage = 'completion';
    const quota = await operation.complete({ ...result });
    return aiRouteReply({ ...result, quota }, 200, {}, request);
  } catch (error) {
    console.warn('journey_plan_request_failed', { stage, code: error instanceof JourneyPlanError ? error.code : 'plan_unavailable' });
    return aiRouteErrorReply(error, request);
  } finally { await operation?.release(); }
}
