// Live Activity token eşitleme MOTORU (saf; bağımlılıklar enjekte edilir
// — birim testli). Gerçek akış:
// - Native gözlemci token'ları tamponlar ve EN SON push-to-start tokenı
//   KALICI tutar (ack silmez).
// - queue(): yeni token event'i → sunucuya kayıt; BAŞARILI kayıt kuyruğu
//   temizler ve native tamponu ack'ler; 503 (migration bekliyor) dahil
//   başarısız kayıt ACK EDİLMEZ — bekler, sonra yeniden denenir.
// - onLogin(): HER accessToken boş → dolu geçişinde çağrılır; YENİ oturum
//   kuşağı (epoch) açar ve native'deki en son push-to-start tokenını
//   GÜNCEL kullanıcı adına yeniden kaydeder.
// - onLogout(): kuyruğu temizler ve EPOCH'U İLERLETİR.
//
// ESKİ HESABIN GECİKMİŞ İSTEĞİ (v8): her gönderim, başladığı andaki yerel
// epoch numarasını taşır. Gönderim beklerken logout/login olursa sonuç
// DÖNDÜĞÜNDE epoch eşleşmez ve sonuç TAMAMEN ATILIR: yeni kullanıcının
// pending kaydı silinmez, native tampon ACK edilmez, retry engellenmez.
// Ayrıca aynı anahtar için eşzamanlı gönderimler in-flight dedup ile
// TEKİLLENİR (retained event + getBufferedTokens aynı kaydı iki paralel
// POST'a çeviremez). Yalnız istemci yeterli olmadığından sunucu tarafında
// da oturum-kuşağı fencing'i vardır: her login'e istemcinin ürettiği bir
// sessionEpochId (uuid) eşlik eder, logout bu kuşağı sunucuda BARLAR ve
// bar'lı kuşakla gelen kayıt isteği sunucuda 409 ile reddedilir — istek
// geliş SIRASINDAN bağımsız.

export type SyncTokenEntry = {
  tokenType: "push_to_start" | "activity_update";
  token: string;
  tripId?: string;
};

export type SyncSendResult = { ok: true } | { ok: false; status: number };

export type TokenSyncDeps = {
  getAccessToken: () => string;
  getInstallationId: () => string;
  /** Login başına istemci tarafında üretilen oturum-kuşağı kimliği (uuid). */
  makeEpochId: () => string;
  send: (entry: SyncTokenEntry, accessToken: string, installationId: string, sessionEpochId: string) => Promise<SyncSendResult>;
  ack: (entry: SyncTokenEntry) => Promise<void>;
  getLatestPushToStartToken: () => Promise<string>;
};

export type TokenSyncEngine = {
  queue(entry: SyncTokenEntry): void;
  flush(): void;
  onLogin(): Promise<void>;
  onLogout(): void;
  pendingCount(): number;
  /** Mevcut oturum-kuşağı kimliği (logout DELETE isteğine eklenir). */
  sessionEpochId(): string;
};

function keyOf(entry: SyncTokenEntry) {
  return `${entry.tokenType}:${entry.tripId || "-"}:${entry.token}`;
}

export function createTokenSyncEngine(deps: TokenSyncDeps): TokenSyncEngine {
  const pending = new Map<string, SyncTokenEntry>();
  const inFlight = new Set<string>();
  // Yerel kuşak sayacı: gecikmiş sonuçların fencing'i.
  let epochNumber = 0;
  // Sunucu fencing'i için login başına üretilen kuşak kimliği.
  let currentEpochId = "";

  async function trySend(entry: SyncTokenEntry, key: string) {
    const accessToken = deps.getAccessToken();
    if (!accessToken) return; // Giriş sonrası onLogin/flush yeniden dener.
    const installationId = deps.getInstallationId();
    if (!installationId) return;
    // IN-FLIGHT DEDUP: aynı anahtar için ikinci paralel POST açılmaz.
    if (inFlight.has(key)) return;
    inFlight.add(key);
    // Gönderim, BAŞLADIĞI andaki kuşağa bağlanır.
    const sendEpochNumber = epochNumber;
    const sendEpochId = currentEpochId;
    let result: SyncSendResult;
    try {
      result = await deps.send(entry, accessToken, installationId, sendEpochId);
    } catch {
      inFlight.delete(key);
      return; // Ağ hatası: bekler, ack edilmez.
    }
    inFlight.delete(key);

    // ESKİ KUŞAĞIN GECİKMİŞ SONUCU TAMAMEN ATILIR: yeni pending silinmez,
    // native tampon ACK edilmez, yeni kullanıcının retry'ı engellenmez.
    if (sendEpochNumber !== epochNumber) return;

    if (result.ok) {
      pending.delete(key);
      await deps.ack(entry); // BAŞARILI kayıt: kuyruk + tampon temizlenir.
      return;
    }
    if (result.status === 403 && entry.tokenType === "activity_update") {
      // Trip başka hesabın: bu oturumda asla başarılı olamaz → düşür + ack
      // (tampon artığı kendini temizler).
      pending.delete(key);
      await deps.ack(entry);
      return;
    }
    if (result.status === 409) {
      // Sunucu fencing'i: bu kuşak barlanmış (eski oturum). Kuyruktan
      // düşürülür ama ACK EDİLMEZ — token native tamponda kalır ve bir
      // SONRAKİ login'in yeni kuşağıyla yeniden kaydedilir.
      pending.delete(key);
      return;
    }
    // 503 (migration bekliyor) / diğerleri: ACK EDİLMEZ, bekler.
  }

  return {
    queue(entry) {
      if (!entry.token || entry.token.length < 16 || entry.token.length > 512) return;
      if (entry.tokenType === "activity_update" && !entry.tripId) return;
      const key = keyOf(entry);
      pending.set(key, entry);
      void trySend(entry, key);
    },
    flush() {
      for (const [key, entry] of pending) void trySend(entry, key);
    },
    async onLogin() {
      // YENİ oturum kuşağı: yerel sayaç ilerler, sunucu kuşak kimliği
      // yenilenir — önceki oturumun uçuştaki sonuçları artık ATILIR.
      epochNumber += 1;
      currentEpochId = deps.makeEpochId();
      try {
        const latest = await deps.getLatestPushToStartToken();
        if (latest && latest.length >= 16 && latest.length <= 512) {
          const entry: SyncTokenEntry = { tokenType: "push_to_start", token: latest };
          pending.set(keyOf(entry), entry);
        }
      } catch {
        // Native yüzey yoksa yalnız bekleyenler gönderilir.
      }
      for (const [key, entry] of pending) await trySend(entry, key);
    },
    onLogout() {
      // Epoch İLERLETİLİR: uçuştaki eski isteklerin sonuçları atılır.
      epochNumber += 1;
      currentEpochId = "";
      pending.clear();
    },
    pendingCount() {
      return pending.size;
    },
    sessionEpochId() {
      return currentEpochId;
    },
  };
}

// ---------------------------------------------------------------------
// Bekleyen kayıtlar için SINIRLI geri çekilme (saf; birim testli).
// 30 sn'den başlar, her denemede ikiye katlanır, 10 dakikada TAVANLANIR —
// sonsuz döngü/agresif istek yok; kuyruk boşalınca sayaç sıfırlanır.
// ---------------------------------------------------------------------
export const RETRY_BASE_DELAY_MS = 30 * 1000;
export const RETRY_MAX_DELAY_MS = 10 * 60 * 1000;
export const RETRY_POST_FLUSH_CHECK_MS = 2 * 1000;

export function retryBackoffDelayMs(attempt: number): number {
  const bounded = Math.max(0, Math.min(attempt, 30));
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** bounded, RETRY_MAX_DELAY_MS);
}

// ---------------------------------------------------------------------
// Retry ZAMANLAYICISI (saf; timer fonksiyonları enjekte edilir — fake
// timer'la testlenir). Sözleşme:
// - Aynı anda EN FAZLA BİR bekleyen timer (ana veya post-flush).
// - stop() sonrası hiçbir callback yeni timer KURAMAZ (lifecycle
//   generation); timerCount() 0'a iner.
// - Kuyruk boşalınca timer'lar temizlenir ve deneme sayacı sıfırlanır.
// ---------------------------------------------------------------------
type TimerHandle = unknown;

export type RetrySchedulerDeps = {
  pendingCount: () => number;
  flush: () => void;
  setTimeoutFn?: (fn: () => void, delayMs: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
};

export type RetryScheduler = {
  /** Kuyruk değişmiş olabilir: gerekiyorsa retry kur, boşsa temizle. */
  poke(): void;
  /** Yaşam döngüsü kapanışı: tüm timer'lar iptal, geç callback'ler etkisiz. */
  stop(): void;
  /** Test görünürlüğü: bekleyen timer sayısı (0 veya 1). */
  timerCount(): number;
  /** Test görünürlüğü: mevcut deneme sayacı. */
  attemptCount(): number;
};

export function createRetryScheduler(deps: RetrySchedulerDeps): RetryScheduler {
  const setTimeoutFn = deps.setTimeoutFn ?? ((fn, delay) => setTimeout(fn, delay));
  const clearTimeoutFn = deps.clearTimeoutFn ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let generation = 0;
  let timer: TimerHandle | null = null;
  let attempt = 0;

  function clearTimer() {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function schedule() {
    if (deps.pendingCount() === 0) {
      attempt = 0;
      clearTimer();
      return;
    }
    if (timer !== null) return; // tek timer — agresif istek yok
    const myGeneration = generation;
    timer = setTimeoutFn(() => {
      if (myGeneration !== generation) return; // stop() sonrası etkisiz
      timer = null;
      attempt += 1;
      deps.flush();
      // flush async'tir: kısa bir kontrol timer'ı ile kuyruk yeniden
      // değerlendirilir. Bu timer da AYNI handle'da tutulur — cleanup
      // penceresinde sızmaz.
      timer = setTimeoutFn(() => {
        if (myGeneration !== generation) return;
        timer = null;
        schedule();
      }, RETRY_POST_FLUSH_CHECK_MS);
    }, retryBackoffDelayMs(attempt));
  }

  return {
    poke() {
      schedule();
    },
    stop() {
      generation += 1;
      attempt = 0;
      clearTimer();
    },
    timerCount() {
      return timer === null ? 0 : 1;
    },
    attemptCount() {
      return attempt;
    },
  };
}
