export type WorkerConnectionState = "checking" | "online" | "degraded" | "offline" | "unknown";

export type WorkerSystemStatus = {
  state: WorkerConnectionState;
  checkedAt: string;
  lastSeenAt: string | null;
  pollIntervalMs: number | null;
};

export const initialWorkerSystemStatus: WorkerSystemStatus = {
  state: "checking",
  checkedAt: "",
  lastSeenAt: null,
  pollIntervalMs: null,
};

export function workerStatusCopy(status: WorkerSystemStatus) {
  if (status.state === "online") {
    return {
      title: "Worker bağlantısı aktif",
      detail: "VDS son kontrol döngüsünde sisteme başarıyla sinyal gönderdi.",
    };
  }
  if (status.state === "degraded") {
    return {
      title: "Worker çalışıyor, son turda hata var",
      detail: "VDS bağlantısı mevcut; son kontrol döngüsü teknik hatayla tamamlandı.",
    };
  }
  if (status.state === "offline") {
    return {
      title: "Worker bağlantısı kesik",
      detail: "VDS'den beklenen süre içinde sinyal alınamadı. Yeni kontroller gecikebilir.",
    };
  }
  if (status.state === "unknown") {
    return {
      title: "Worker durumu doğrulanamadı",
      detail: "Canlı bağlantı bilgisi şu anda alınamıyor. Takip durumu kesin olarak aktif gösterilmiyor.",
    };
  }
  return {
    title: "Worker bağlantısı kontrol ediliyor",
    detail: "VDS'nin son canlılık sinyali sorgulanıyor.",
  };
}
