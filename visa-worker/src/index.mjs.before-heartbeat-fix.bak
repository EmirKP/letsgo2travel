import { checkIdataJob } from "./providers/idata.mjs";
import { probeProviderTarget } from "./providers/probe.mjs";

const apiBaseUrl = String(process.env.API_BASE_URL || "").replace(/\/$/, "");
const workerSecret = process.env.VISA_WORKER_SECRET || "";
const workerName = process.env.WORKER_NAME || "visa-worker-01";
const workerVersion = process.env.WORKER_VERSION || "0.6.0";
const workerStartedAt = new Date().toISOString();
const pollInterval = Math.max(60_000, Number(process.env.POLL_INTERVAL_MS) || 60_000);

if (!apiBaseUrl || !workerSecret) {
  console.error("API_BASE_URL ve VISA_WORKER_SECRET zorunludur.");
  process.exit(1);
}

async function api(path, body, timeoutMs = 30_000) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function sendHeartbeat(status, lastError = "") {
  try {
    await api("/api/internal/visa-worker/heartbeat", {
      workerName,
      workerVersion,
      startedAt: workerStartedAt,
      pollIntervalMs: pollInterval,
      status,
      lastError,
    }, 10_000);
  } catch (error) {
    console.error(
      new Date().toISOString(),
      "worker-heartbeat",
      error instanceof Error ? error.message : error,
    );
  }
}

async function checkJob(job) {
  if (job.provider_code === "idata") return checkIdataJob(job);
  return {
    outcome: "provider_unavailable",
    message: `${job.provider_name || job.provider_code || "SaÄŸlayÄ±cÄ±"} takvim modÃ¼lÃ¼ henÃ¼z etkin deÄŸil.`,
    availableDates: [],
  };
}

async function runProviderAudits() {
  const claimed = await api("/api/internal/visa-providers/tests/claim", { workerName, limit: 2 });
  const targets = Array.isArray(claimed.data) ? claimed.data : [];

  for (const target of targets) {
    try {
      const result = await probeProviderTarget(target);
      await api("/api/internal/visa-providers/tests/report", {
        targetId: target.id,
        workerName,
        ...result,
      });
      console.log(new Date().toISOString(), "provider-audit", target.code, result.outcome, result.httpStatus || 0);
    } catch (error) {
      console.error(new Date().toISOString(), "provider-audit", target.code, error instanceof Error ? error.message : error);
      await api("/api/internal/visa-providers/tests/report", {
        targetId: target.id,
        workerName,
        outcome: "error",
        message: error instanceof Error ? error.message : "Bilinmeyen saÄŸlayÄ±cÄ± test hatasÄ±",
      }).catch(() => undefined);
    }
  }

  return targets.length;
}

async function runAppointmentJobs() {
  const claimed = await api("/api/internal/visa-appointments/jobs/claim", { workerName, limit: 2 });
  const jobs = Array.isArray(claimed.data) ? claimed.data : [];

  for (const job of jobs) {
    try {
      const result = await checkJob(job);
      await api("/api/internal/visa-appointments/jobs/report", { trackId: job.id, workerName, ...result });
      console.log(new Date().toISOString(), job.id, job.provider_code, result.outcome);
    } catch (error) {
      console.error(new Date().toISOString(), job.id, error instanceof Error ? error.message : error);
      await api("/api/internal/visa-appointments/jobs/report", {
        trackId: job.id,
        workerName,
        outcome: "error",
        message: error instanceof Error ? error.message : "Bilinmeyen worker hatasÄ±",
        availableDates: [],
      }).catch((reportError) => console.error("Hata raporu gÃ¶nderilemedi", reportError));
    }
  }

  return jobs.length;
}

async function sendHeartbeat() {
  await api("/api/internal/visa-appointments/heartbeat", {
    workerName,
    status: "online",
    pollIntervalMs: pollInterval,
    workerVersion,
    startedAt: workerStartedAt,
  });
}

async function runOnce() {
  await sendHeartbeat();
  const auditCount = await runProviderAudits();
  const jobCount = await runAppointmentJobs();
  if (auditCount === 0 && jobCount === 0) console.log(new Date().toISOString(), "Bekleyen gÃ¶rev yok.");
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  await sendHeartbeat("running");
  try {
    await runOnce();
    await sendHeartbeat("idle");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(new Date().toISOString(), message);
    await sendHeartbeat("error", message);
  } finally {
    running = false;
  }
}

console.log(`LetsGo2Travel visa worker baÅŸladÄ±: ${workerName}`);
await tick();
setInterval(tick, pollInterval);


