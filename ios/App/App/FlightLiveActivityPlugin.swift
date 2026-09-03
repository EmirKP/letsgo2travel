import Capacitor
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

// Uygulama hedefine eklenen küçük köprü: JS tarafı yaklaşan uçuş için
// Live Activity başlatır/bitirir. Cihaz desteklemiyorsa `available:false`
// döner ve JS yerel bildirime düşer. Kayıt: LIVE-ACTIVITY-KURULUM.md.
@objc(FlightLiveActivityPlugin)
public class FlightLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FlightLiveActivityPlugin"
    public let jsName = "FlightLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startFlightActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endFlightActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestPushToStartToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBufferedTokens", returnType: CAPPluginReturnPromise),
    ]

    // ------------------------------------------------------------------
    // Push-to-start altyapısı: token GÖZLEMİ artık AppDelegate'in
    // başlattığı LiveActivityTokenObserver'dadır (WebView'a bağımlı
    // değil; arka plan uyanışında da yakalayıp UserDefaults'a tamponlar).
    // Bu plugin köprüdür: JS hazır olunca tampondaki + yeni gelen
    // token'ları event olarak iletir; JS sunucuya kaydettikten sonra
    // ackToken ile girdiyi tampondan sildirir. Token loglanmaz.
    // Event'ler: "liveActivityToken" {tokenType, tripId, token}.
    // ------------------------------------------------------------------
    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onObserverToken(_:)),
            name: LiveActivityTokenObserver.tokenNotification,
            object: nil
        )
        // JS geç bağlanır: birikmiş token'lar retainUntilConsumed:true ile
        // iletilir — listener HENÜZ kurulmadıysa event KAYBOLMAZ, ilk
        // dinleyiciye teslim edilir. Ayrıca JS, listener kurulduktan sonra
        // getBufferedTokens ile tamponu kendisi de çeker (çifte güvence;
        // tekrarlar tokenType+tripId+token anahtarıyla idempotenttir).
        for entry in LiveActivityTokenObserver.bufferedEntries() {
            notifyListeners("liveActivityToken", data: entry, retainUntilConsumed: true)
        }
    }

    @objc private func onObserverToken(_ notification: Notification) {
        guard let entry = notification.userInfo?["entry"] as? [String: String] else { return }
        // retainUntilConsumed:true — canlı event de dinleyicisiz kaybolmaz.
        notifyListeners("liveActivityToken", data: entry, retainUntilConsumed: true)
    }

    /**
     * Tampondaki TÜM token girişlerini döner (pull/replay yolu): JS,
     * listener kurulduktan sonra bunları sync motoruna sıralar. Girişler
     * yalnız sunucu BAŞARILI cevap verdikten sonra ackToken ile silinir.
     */
    @objc func getBufferedTokens(_ call: CAPPluginCall) {
        call.resolve(["tokens": LiveActivityTokenObserver.bufferedEntries()])
    }

    /**
     * En son geçerli push-to-start tokenını döner (hesap değişiminde
     * replay: B login olunca token GÜNCEL kullanıcı adına yeniden
     * kaydedilir). Ack bu değeri SİLMEZ.
     */
    @objc func getLatestPushToStartToken(_ call: CAPPluginCall) {
        call.resolve(["token": LiveActivityTokenObserver.latestPushToStartToken()])
    }

    /** JS, sunucu kaydı BAŞARILI olunca çağırır; girdi tampondan silinir. */
    @objc func ackToken(_ call: CAPPluginCall) {
        LiveActivityTokenObserver.acknowledge(entry: [
            "tokenType": call.getString("tokenType") ?? "",
            "tripId": call.getString("tripId") ?? "",
            "token": call.getString("token") ?? "",
        ])
        call.resolve()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["available": false])
    }

    @objc func startFlightActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard let tripId = call.getString("tripId"),
                  let departureIso = call.getString("departureAt"),
                  let departureAt = ISO8601DateFormatter().date(from: departureIso),
                  let arrivalIso = call.getString("arrivalAt"),
                  let arrivalAt = ISO8601DateFormatter().date(from: arrivalIso),
                  arrivalAt > departureAt else {
                call.reject("Eksik uçuş bilgisi")
                return
            }
            // Aynı seyahat için ikinci aktivite açılmaz.
            if Activity<FlightActivityAttributes>.activities.contains(where: { $0.attributes.tripId == tripId }) {
                call.resolve()
                return
            }
            let attributes = FlightActivityAttributes(
                tripId: tripId,
                title: call.getString("title") ?? "Yaklaşan uçuş",
                originIata: call.getString("originIata") ?? "",
                destinationIata: call.getString("destinationIata") ?? "",
                deepLink: call.getString("deepLink") ?? "letsgo2travel://cockpit",
                language: call.getString("language") ?? "tr"
            )
            let state = FlightActivityAttributes.ContentState(departureAt: departureAt, arrivalAt: arrivalAt)
            let content = ActivityContent(state: state, staleDate: arrivalAt.addingTimeInterval(1200))
            do {
                // pushType .token: güncelleme/bitirme tokenı üretilir; cron
                // kalkış+1 saat sonrasında aktiviteyi uzaktan bitirebilir.
                let activity = try Activity.request(attributes: attributes, content: content, pushType: .token)
                LiveActivityTokenObserver.shared.observe(activity)
                call.resolve()
            } catch {
                // Push entitlement yoksa tokensız (yalnız uygulama içi) başlat.
                do {
                    _ = try Activity.request(attributes: attributes, content: content)
                    call.resolve()
                } catch {
                    call.reject("Live Activity başlatılamadı")
                }
            }
            return
        }
        #endif
        call.reject("Bu cihaz Live Activity desteklemiyor")
    }

    @objc func endFlightActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            let tripId = call.getString("tripId") ?? ""
            Task {
                for activity in Activity<FlightActivityAttributes>.activities where tripId.isEmpty || activity.attributes.tripId == tripId {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }
}
