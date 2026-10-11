import { createHook, sleep, RetryableError } from "workflow";
import { start } from "workflow/api";

/** Each batch is recorded before the next is dispatched; runtime timeouts do
 * not strand the daily scan at its first 80 alerts. No secrets enter the log. */
export async function priceAlertScan(cutoff: string, batchSize = 80, segment = 0): Promise<{status:string;runId?:string;processed?:number;segment?:number;nextRunId?:string}> {
  "use workflow";
  using ownership = createHook({ token: `price-alert-scan:${cutoff.slice(0,10)}:${segment}` });
  const conflict = await ownership.getConflict();
  if (conflict) return { status: "already-running", runId: conflict.runId };
  console.log("Price alert scan segment started", {cutoff,segment});
  let processed = 0;
  for (let batch = 0; batch < 100; batch += 1) {
    const result = await checkPriceAlertBatch(cutoff,batchSize);
    processed += result.processed;
    if (result.remaining === 0) return {status:"complete",processed,segment};
    // Yield between bounded steps so a large scan never holds one invocation.
    await sleep("1s");
  }
  // Keep replay history bounded for very large datasets. Spawning from a
  // workflow is itself durable, so a replay cannot enqueue extra children.
  const next = await start(priceAlertScan,[cutoff,batchSize,segment+1]);
  return {status:"continued",processed,segment,nextRunId:next.runId};
}

export async function checkPriceAlertBatch(cutoff: string, batchSize: number) {
  "use step";
  const {runPriceAlertCheck} = await import("../lib/price-alert-cron");
  const {getSupabaseAdmin} = await import("../lib/supabaseAdmin");
  const {remainingPriceAlertScanRows} = await import("../lib/price-alert-scan");
  const {todayIsoInTimeZone} = await import("../lib/date-utils");
  const db = getSupabaseAdmin();
  if (!db) throw new RetryableError("Price alert storage unavailable",{retryAfter:"1m"});
  const departureFloor = todayIsoInTimeZone("Etc/GMT+12");
  const before = await remainingPriceAlertScanRows(db,cutoff,departureFloor);
  const result = await runPriceAlertCheck({checkedBefore:cutoff,limit:Math.max(1,Math.min(batchSize,200))});
  const remaining = await remainingPriceAlertScanRows(db,cutoff,departureFloor);
  console.log("Price alert scan batch finished", {cutoff,remaining,processed:result.processedAlerts,retryProcessed:result.retryProcessed,deadlineReached:result.deadlineReached});
  // Retry delivery runs first and can use the whole time budget. Its persisted
  // work must advance the workflow even when no new price row was reached.
  if (remaining > 0 && remaining >= before && !(result.retryProcessed > 0)) throw new RetryableError("Price alert scan made no persisted progress",{retryAfter:"1m"});
  return {remaining,processed:result.processedAlerts};
}
checkPriceAlertBatch.maxRetries = 8;
