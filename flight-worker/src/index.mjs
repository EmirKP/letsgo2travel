import { randomUUID } from "node:crypto";
import { getConnector } from "./connectors/registry.mjs";

const apiBaseUrl = String(process.env.API_BASE_URL || "").replace(/\/$/, "");
const workerSecret = String(process.env.FLIGHT_WORKER_SECRET || "");
const workerName = String(process.env.WORKER_NAME || "flight-worker-01").slice(0, 80);
const workerVersion = "0.2.0";
const workerStartedAt = new Date().toISOString();
const busyPollMs = Math.max(1_000, Number(process.env.BUSY_POLL_INTERVAL_MS) || 3_000);
const idlePollMs = Math.max(busyPollMs, Number(process.env.IDLE_POLL_INTERVAL_MS) || 15_000);
const claimLimit = Math.min(10, Math.max(1, Number(process.env.CLAIM_LIMIT) || 2));
const connectorTimeoutMs = Math.min(35_000, Math.max(5_000, Number(process.env.CONNECTOR_TIMEOUT_MS) || 30_000));
const shutdownGraceMs = Math.min(60_000, Math.max(5_000, Number(process.env.SHUTDOWN_GRACE_MS) || 25_000));

if (!/^https:\/\//i.test(apiBaseUrl) || workerSecret.length < 32 || !/^[A-Za-z0-9._-]{1,80}$/.test(workerName)) {
  console.error("HTTPS API_BASE_URL, en az 32 karakter FLIGHT_WORKER_SECRET ve geçerli WORKER_NAME zorunludur.");
  process.exit(1);
}

let stopping = false;
let timer = null;
let activeRun = null;

class ConnectorTimeoutError extends Error {
  constructor() {
    super("Connector zaman aşımına uğradı.");
    this.name = "ConnectorTimeoutError";
  }
}

async function runConnector(connector, requestPayload, searchId) {
  const controller = new AbortController();
  let timerId;
  try {
    return await Promise.race([
      connector.search(requestPayload, {
        searchId,
        requestedAt: new Date().toISOString(),
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        timerId = setTimeout(() => {
          controller.abort();
          reject(new ConnectorTimeoutError());
        }, connectorTimeoutMs);
      }),
    ]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

function boundedOffers(value) {
  const source = Array.isArray(value) ? value : [];
  const accepted = [];
  let bytes = 2;
  for (const offer of source.slice(0, 200)) {
    const serialized = JSON.stringify(offer);
    const nextBytes = Buffer.byteLength(serialized, "utf8") + (accepted.length ? 1 : 0);
    if (bytes + nextBytes > 750_000) break;
    accepted.push(offer);
    bytes += nextBytes;
  }
  return { offers: accepted, truncated: accepted.length < source.length };
}

async function api(path, body, timeoutMs = 30_000) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-flight-worker-secret": workerSecret,
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
  return payload;
}

async function heartbeat(status, lastError = "") {
  try {
    await api("/api/internal/flights/heartbeat", {
      workerName,
      workerVersion,
      startedAt: workerStartedAt,
      pollIntervalMs: stopping ? idlePollMs : busyPollMs,
      status,
      lastError: String(lastError).slice(0, 500),
    }, 10_000);
  } catch (error) {
    console.error(new Date().toISOString(), "heartbeat", error instanceof Error ? error.message : error);
  }
}

async function reportWithRetry(payload) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await api("/api/internal/flights/jobs/report", payload, 15_000);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError || new Error("Görev raporu gönderilemedi.");
}

async function runJob(job) {
  const started = Date.now();
  const reportId = randomUUID();
  const connector = getConnector(String(job.source_id || ""));
  let result;
  if (!connector) {
    result = {
      outcome: "integration_required",
      offers: [],
      message: "Bu kaynak için worker connector kodu bulunamadı.",
      errorCode: "integration_required",
    };
  } else {
    try {
      result = await runConnector(connector, job.request_payload, job.search_id);
    } catch (error) {
      const timedOut = error instanceof ConnectorTimeoutError;
      result = {
        outcome: "failed",
        offers: [],
        message: timedOut ? "Connector belirlenen süre içinde yanıt vermedi." : "Connector araması güvenli biçimde tamamlanamadı.",
        errorCode: timedOut ? "timeout" : "unknown",
      };
    }
  }

  const bounded = boundedOffers(result.offers);
  await reportWithRetry({
    jobId: job.job_id,
    reportId,
    workerName,
    leaseToken: job.lease_token,
    outcome: result.outcome,
    offers: bounded.offers,
    message: bounded.truncated ? "Kaynak teklif limiti güvenli rapor sınırına indirildi." : result.message,
    errorCode: bounded.truncated ? "format_changed" : result.errorCode,
    durationMs: Date.now() - started,
  });
  console.log(new Date().toISOString(), job.job_id, job.source_id, result.outcome);
}

async function runOnce() {
  await heartbeat("running");
  const heartbeatTimer = setInterval(() => { void heartbeat(stopping ? "stopping" : "running"); }, 30_000);
  try {
    const claimed = await api("/api/internal/flights/jobs/claim", { workerName, limit: claimLimit }, 20_000);
    const jobs = Array.isArray(claimed.data) ? claimed.data : [];
    const runnable = stopping ? [] : jobs;
    const settled = await Promise.allSettled(runnable.map((job) => runJob(job)));
    for (const result of settled) {
      if (result.status === "rejected") {
        console.error(new Date().toISOString(), "job", result.reason instanceof Error ? result.reason.message : result.reason);
      }
    }
    await heartbeat("idle");
    return jobs.length;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function tick() {
  if (stopping) return;
  let delay = idlePollMs;
  try {
    activeRun = runOnce();
    const count = await activeRun;
    delay = count > 0 ? busyPollMs : idlePollMs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(new Date().toISOString(), message);
    await heartbeat("error", message);
  } finally {
    activeRun = null;
  }
  if (!stopping) timer = setTimeout(tick, delay);
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  console.log(new Date().toISOString(), `${signal} alındı; worker durduruluyor.`);
  await heartbeat("stopping");
  if (activeRun) {
    await Promise.race([
      activeRun.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, shutdownGraceMs)),
    ]);
  }
  process.exit(0);
}

process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });

console.log(`LetsGo2Travel flight worker başladı: ${workerName}`);
void tick();
