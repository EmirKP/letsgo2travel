const apiBaseUrl = String(process.env.API_BASE_URL || "").replace(/\/$/, "");
const workerSecret = process.env.VISA_WORKER_SECRET || "";
const workerName = process.env.WORKER_NAME || "visa-worker-01";
const pollInterval = Math.max(60_000, Number(process.env.POLL_INTERVAL_MS) || 60_000);
const demoMatchMode = process.env.DEMO_MATCH_MODE || "none";

if (!apiBaseUrl || !workerSecret) {
  console.error("API_BASE_URL ve VISA_WORKER_SECRET zorunludur.");
  process.exit(1);
}

async function api(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function checkJob(job) {
  if (job.provider_code !== "demo") {
    return {
      outcome: "provider_unavailable",
      message: `${job.provider_name || job.provider_code || "Sağlayıcı"} modülü henüz etkin değil.`,
      availableDates: [],
    };
  }

  if (demoMatchMode === "always") {
    return {
      outcome: "slot_found",
      message: "Demo worker uygun tarih üretti.",
      availableDates: [job.earliest_date],
    };
  }

  return {
    outcome: "no_slots",
    message: "Demo kontrol tamamlandı; uygun tarih bulunamadı.",
    availableDates: [],
  };
}

async function runOnce() {
  const claimed = await api("/api/internal/visa-appointments/jobs/claim", { workerName, limit: 3 });
  const jobs = Array.isArray(claimed.data) ? claimed.data : [];
  if (jobs.length === 0) {
    console.log(new Date().toISOString(), "Bekleyen görev yok.");
    return;
  }

  for (const job of jobs) {
    try {
      const result = await checkJob(job);
      await api("/api/internal/visa-appointments/jobs/report", {
        trackId: job.id,
        workerName,
        ...result,
      });
      console.log(new Date().toISOString(), job.id, result.outcome);
    } catch (error) {
      console.error(new Date().toISOString(), job.id, error instanceof Error ? error.message : error);
      await api("/api/internal/visa-appointments/jobs/report", {
        trackId: job.id,
        workerName,
        outcome: "error",
        message: error instanceof Error ? error.message : "Bilinmeyen worker hatası",
        availableDates: [],
      }).catch((reportError) => console.error("Hata raporu gönderilemedi", reportError));
    }
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try { await runOnce(); }
  catch (error) { console.error(new Date().toISOString(), error instanceof Error ? error.message : error); }
  finally { running = false; }
}

console.log(`LetsGo2Travel visa worker başladı: ${workerName}`);
await tick();
setInterval(tick, pollInterval);
