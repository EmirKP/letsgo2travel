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
      title: "Otomatik kontrol hizmeti bağlı",
      detail: "Kontrol hizmetinin bağlantısı güncel. Randevu uygunluğunu her takibin son kontrol sonucundan görebilirsin.",
    };
  }
  if (status.state === "degraded") {
    return {
      title: "Otomatik kontrol geçici olarak kullanılamıyor",
      detail: "Hizmette geçici hata var. Yeni takip başlatma ve sürdürme kapalı.",
    };
  }
  if (status.state === "offline") {
    return {
      title: "Otomatik takip geçici olarak kapalı",
      detail: "Kontrol hizmetine ulaşılamıyor. Yeni takip başlatma ve sürdürme kapalı; resmî randevu sayfasından kontrol edebilirsin.",
    };
  }
  if (status.state === "unknown") {
    return {
      title: "Otomatik takip durumu doğrulanamadı",
      detail: "Canlı bağlantı bilgisi şu anda alınamıyor. Takip durumu kesin olarak aktif gösterilmiyor.",
    };
  }
  return {
    title: "Otomatik takip kontrol ediliyor",
    detail: "Kontrol hizmetinin bağlantısı sorgulanıyor.",
  };
}
