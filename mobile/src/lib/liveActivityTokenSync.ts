// Live Activity token eşitleme MOTORU (saf; bağımlılıklar enjekte edilir
// — birim testli). Gerçek akış:
// - Native gözlemci token'ları tamponlar ve EN SON push-to-start tokenı
//   KALICI tutar (ack silmez).
// - queue(): yeni token event'i → sunucuya kayıt; BAŞARILI kayıt kuyruğu
//   temizler ve native tamponu ack'ler; 503 (migration bekliyor) dahil
//   başarısız kayıt ACK EDİLMEZ — bekler, sonra yeniden denenir.
// - onLogin(): HER accessToken boş → dolu geçişinde çağrılır; native'deki
//   en son push-to-start tokenını GÜNCEL kullanıcı adına yeniden kaydeder
//   (A logout → B login'de B, cihaz tokenını kendi hesabına bağlar) ve
//   bekleyenleri gönderir.
// - onLogout(): kuyruğu temizler (eski hesabın kayıtları taşınmaz);
//   "latest" native'de KORUNUR.
// - activity_update 403'ü (trip başka hesabın) kalıcı düşürülür + ack.

export type SyncTokenEntry = {
  tokenType: "push_to_start" | "activity_update";
  token: string;
  tripId?: string;
};

export type SyncSendResult = { ok: true } | { ok: false; status: number };

export type TokenSyncDeps = {
  getAccessToken: () => string;
  getInstallationId: () => string;
  send: (entry: SyncTokenEntry, accessToken: string, installationId: string) => Promise<SyncSendResult>;
  ack: (entry: SyncTokenEntry) => Promise<void>;
  getLatestPushToStartToken: () => Promise<string>;
};

export type TokenSyncEngine = {
  queue(entry: SyncTokenEntry): void;
  flush(): void;
  onLogin(): Promise<void>;
  onLogout(): void;
  pendingCount(): number;
};

function keyOf(entry: SyncTokenEntry) {
  return `${entry.tokenType}:${entry.tripId || "-"}:${entry.token}`;
}

export function createTokenSyncEngine(deps: TokenSyncDeps): TokenSyncEngine {
  const pending = new Map<string, SyncTokenEntry>();

  async function trySend(entry: SyncTokenEntry, key: string) {
    const accessToken = deps.getAccessToken();
    if (!accessToken) return; // Giriş sonrası onLogin/flush yeniden dener.
    const installationId = deps.getInstallationId();
    if (entry.tokenType === "push_to_start" && !installationId) return;
    let result: SyncSendResult;
    try {
      result = await deps.send(entry, accessToken, installationId);
    } catch {
      return; // Ağ hatası: bekler, ack edilmez.
    }
    if (result.ok) {
      pending.delete(key);
      await deps.ack(entry); // BAŞARILI kayıt: kuyruk + tampon temizlenir.
      return;
    }
    if (result.status === 403 && entry.tokenType === "activity_update") {
      // Trip başka hesabın: bu oturumda asla başarılı olamaz → düşür.
      pending.delete(key);
      await deps.ack(entry);
      return;
    }
    // 503 (RPC/tablo migration bekliyor) dahil: ACK EDİLMEZ, bekler.
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
      // Hesap değişiminde cihaz tokenı GÜNCEL kullanıcıya yeniden bağlanır.
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
      pending.clear();
    },
    pendingCount() {
      return pending.size;
    },
  };
}
