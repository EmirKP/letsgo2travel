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
    ]

    // ------------------------------------------------------------------
    // Push-to-start altyapısı: token'lar JS katmanına event ile verilir;
    // JS bunları Bearer oturumla sunucuya kaydeder (token loglanmaz).
    // - pushToStartToken  : iOS 17.2+ genel başlatma tokenı (uygulama
    //   kapalıyken cron APNs "liveactivity" push'u ile aktivite başlatır)
    // - activityUpdateToken: başlamış aktivitenin güncelleme/bitirme tokenı
    // ------------------------------------------------------------------
    override public func load() {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            for activity in Activity<FlightActivityAttributes>.activities {
                observeActivityTokens(activity)
            }
            Task { [weak self] in
                for await activity in Activity<FlightActivityAttributes>.activityUpdates {
                    self?.observeActivityTokens(activity)
                }
            }
        }
        if #available(iOS 17.2, *) {
            Task { [weak self] in
                for await tokenData in Activity<FlightActivityAttributes>.pushToStartTokenUpdates {
                    self?.notifyListeners("pushToStartToken", data: ["token": Self.hexToken(tokenData)])
                }
            }
        }
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func observeActivityTokens(_ activity: Activity<FlightActivityAttributes>) {
        Task { [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                self?.notifyListeners("activityUpdateToken", data: [
                    "tripId": activity.attributes.tripId,
                    "token": Self.hexToken(tokenData),
                ])
            }
        }
    }
    #endif

    private static func hexToken(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
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
                  let departureAt = ISO8601DateFormatter().date(from: departureIso) else {
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
                deepLink: call.getString("deepLink") ?? "letsgo2travel://cockpit"
            )
            let state = FlightActivityAttributes.ContentState(departureAt: departureAt)
            let content = ActivityContent(state: state, staleDate: departureAt.addingTimeInterval(3600))
            do {
                // pushType .token: güncelleme/bitirme tokenı üretilir; cron
                // kalkış+1 saat sonrasında aktiviteyi uzaktan bitirebilir.
                let activity = try Activity.request(attributes: attributes, content: content, pushType: .token)
                observeActivityTokens(activity)
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
