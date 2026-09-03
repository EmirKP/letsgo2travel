// =====================================================================
// Retry zamanlayıcısı (createRetryScheduler) FAKE-TIMER testleri — gerçek
// zaman BEKLENMEZ. v8 sözleşmesi:
// - Aynı anda EN FAZLA BİR bekleyen timer (ana veya post-flush kontrolü).
// - stop() sonrası sıfır timer; sıraya çoktan girmiş GEÇ callback yeni
//   timer KURAMAZ (lifecycle generation) — v8'in kapattığı sızıntı buydu:
//   post-flush 2 sn'lik timer saklanmıyordu, cleanup penceresinde yeniden
//   kurulabiliyordu.
// - Kuyruk boşalınca timer ve deneme sayacı sıfırlanır.
// - Geri çekilme 30 sn → 60 sn → ... → 10 dk tavanlıdır.
// =====================================================================

import assert from "node:assert";
import {
  RETRY_BASE_DELAY_MS,
  RETRY_POST_FLUSH_CHECK_MS,
  createRetryScheduler,
  retryBackoffDelayMs,
} from "./_mobile/liveActivityTokenSync";

// Deterministik sahte saat: setTimeout/clearTimeout enjekte edilir.
function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeoutFn: (fn: () => void, delayMs: number): unknown => {
      const id = nextId++;
      timers.set(id, { at: now + delayMs, fn });
      return id;
    },
    clearTimeoutFn: (handle: unknown) => { timers.delete(handle as number); },
    /** Zamanı ilerletir; pencereye düşen timer'ları SIRASIYLA tetikler
        (tetiklenen callback'in kurduğu yeni timer'lar da pencereye
        düşüyorsa çalışır). */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let dueId: number | null = null;
        let dueAt = Infinity;
        for (const [id, timer] of timers) {
          if (timer.at <= target && timer.at < dueAt) { dueId = id; dueAt = timer.at; }
        }
        if (dueId === null) break;
        const timer = timers.get(dueId)!;
        timers.delete(dueId);
        now = timer.at;
        timer.fn();
      }
      now = target;
    },
    count: () => timers.size,
    /** JS event-loop modeli: callback çoktan çalışma sırasına girmiş,
        clearTimeout artık yetişemez — fonksiyon referansı dışarı alınır. */
    pendingFns: () => [...timers.values()].map((timer) => timer.fn),
  };
}

export function registerLiveActivityRetryTests(test: (name: string, fn: () => Promise<void> | void) => void) {
  test("retry scheduler (v8): tekrarlı poke + post-flush penceresi dahil AYNI ANDA TEK timer; geri çekilme büyür", () => {
    const clock = createFakeTimers();
    let flushCalls = 0;
    const scheduler = createRetryScheduler({
      pendingCount: () => 2, // kuyruk hep dolu
      flush: () => { flushCalls += 1; },
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    scheduler.poke();
    scheduler.poke();
    scheduler.poke(); // ağ dönüşü + foreground + event: tekrarlı poke
    assert.equal(clock.count(), 1, "tekrarlı poke İKİNCİ timer açmaz");
    assert.equal(scheduler.timerCount(), 1);

    clock.advance(RETRY_BASE_DELAY_MS - 1);
    assert.equal(flushCalls, 0, "süresi dolmadan flush YOK (agresif istek yok)");
    clock.advance(1);
    assert.equal(flushCalls, 1, "ilk deneme 30 sn'de");
    assert.equal(clock.count(), 1, "post-flush kontrol timer'ı da AYNI tek slotta");
    assert.equal(scheduler.attemptCount(), 1);

    scheduler.poke(); // post-flush penceresinde poke gelirse de tek timer
    assert.equal(clock.count(), 1, "post-flush penceresinde poke ek timer AÇMAZ");

    clock.advance(RETRY_POST_FLUSH_CHECK_MS); // kontrol: kuyruk dolu → yeni ana timer
    assert.equal(clock.count(), 1);
    clock.advance(retryBackoffDelayMs(1) - 1);
    assert.equal(flushCalls, 1, "geri çekilme BÜYÜR: ikinci deneme 60 sn dolmadan gelmez");
    clock.advance(1);
    assert.equal(flushCalls, 2, "ikinci deneme 60 sn'de");
    assert.equal(scheduler.attemptCount(), 2);
  });

  test("retry scheduler (v8): stop() sonrası SIFIR timer; sıraya girmiş GEÇ callback (post-flush dahil) yeniden timer KURAMAZ", () => {
    const clock = createFakeTimers();
    let flushCalls = 0;
    const scheduler = createRetryScheduler({
      pendingCount: () => 1,
      flush: () => { flushCalls += 1; },
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    // 1) Ana timer penceresi: callback sıraya girdi, stop() yetişemedi.
    scheduler.poke();
    const lateMain = clock.pendingFns()[0];
    scheduler.stop();
    assert.equal(clock.count(), 0, "stop tüm timer'ları temizler");
    assert.equal(scheduler.timerCount(), 0);
    lateMain(); // geç kalan callback çalışır ama...
    assert.equal(flushCalls, 0, "geç callback flush ÇALIŞTIRMAZ (generation korur)");
    assert.equal(clock.count(), 0, "geç callback YENİ timer kuramaz");
    assert.equal(scheduler.timerCount(), 0);

    // 2) POST-FLUSH penceresi (v8'in kapattığı sızıntı): flush sonrası 2
    //    sn'lik kontrol timer'ı beklerken cleanup gelir.
    scheduler.poke();
    clock.advance(RETRY_BASE_DELAY_MS);
    assert.equal(flushCalls, 1);
    assert.equal(clock.count(), 1, "post-flush kontrol timer'ı bekliyor");
    const latePostFlush = clock.pendingFns()[0];
    scheduler.stop();
    assert.equal(clock.count(), 0, "cleanup POST-FLUSH PENCERESİNDE de sıfır timer bırakır");
    assert.equal(scheduler.attemptCount(), 0, "stop deneme sayacını sıfırlar");
    latePostFlush(); // sıraya çoktan girmiş kontrol callback'i
    assert.equal(clock.count(), 0, "geç post-flush callback yeni timer KURAMAZ (v8 düzeltmesi)");
    assert.equal(scheduler.timerCount(), 0);
  });

  test("retry scheduler (v8): kuyruk boşalınca timer VE deneme sayacı sıfırlanır; yeni token taze 30 sn'den başlar", () => {
    const clock = createFakeTimers();
    let pending = 1;
    let flushCalls = 0;
    const scheduler = createRetryScheduler({
      pendingCount: () => pending,
      flush: () => { flushCalls += 1; pending = 0; }, // flush kuyruğu boşaltır
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    scheduler.poke();
    clock.advance(RETRY_BASE_DELAY_MS);
    assert.equal(flushCalls, 1);
    assert.equal(scheduler.attemptCount(), 1, "deneme sayıldı");
    clock.advance(RETRY_POST_FLUSH_CHECK_MS); // kontrol: kuyruk boş → temizlik
    assert.equal(clock.count(), 0, "kuyruk boşalınca timer kalmaz");
    assert.equal(scheduler.timerCount(), 0);
    assert.equal(scheduler.attemptCount(), 0, "deneme sayacı sıfırlanır");
    clock.advance(60 * 60 * 1000);
    assert.equal(flushCalls, 1, "boş kuyrukta bir daha flush olmaz (sonsuz döngü yok)");

    // Yeni token gelir → geri çekilme TAZE 30 sn'den başlar (eski denemeler
    // sayılmaz).
    pending = 1;
    scheduler.poke();
    assert.equal(clock.count(), 1);
    clock.advance(RETRY_BASE_DELAY_MS - 1);
    assert.equal(flushCalls, 1);
    clock.advance(1);
    assert.equal(flushCalls, 2, "yeni tur 30 sn'de başlar");

    // Ana timer beklerken kuyruk dışarıdan boşalırsa poke temizler.
    pending = 1;
    clock.advance(RETRY_POST_FLUSH_CHECK_MS);
    assert.equal(clock.count(), 1, "kuyruk dolu: ana timer kuruldu");
    pending = 0;
    scheduler.poke();
    assert.equal(clock.count(), 0, "boş kuyrukta poke bekleyen timer'ı da temizler");
    assert.equal(scheduler.attemptCount(), 0);
  });
}
