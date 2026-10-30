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
                  !tripId.isEmpty,
                  let departureAt = flightDate(call.getString("departureAt")) else {
                call.reject("Eksik uçuş bilgisi")
                return
            }
            let parsedArrival = flightDate(call.getString("arrivalAt"))
            let arrivalAt = parsedArrival.flatMap { $0 > departureAt ? $0 : nil }
            let safeZone: (String?) -> String? = { value in
                guard let value, TimeZone(identifier: value) != nil else { return nil }
                return value
            }
            let attributes = FlightActivityAttributes(
                tripId: tripId,
                title: call.getString("title") ?? "Yaklaşan uçuş",
                originIata: call.getString("originIata") ?? "",
                destinationIata: call.getString("destinationIata") ?? "",
                deepLink: call.getString("deepLink") ?? "letsgo2travel://cockpit",
                language: ["tr", "en", "sq"].contains(call.getString("language") ?? "") ? call.getString("language")! : "tr",
                originTimeZone: safeZone(call.getString("originTimeZone")),
                destinationTimeZone: safeZone(call.getString("destinationTimeZone")),
                flightNumber: call.getString("flightNumber").map { String($0.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(8)) }
            )
            let providerStatuses: Set<String> = ["Unknown", "Expected", "EnRoute", "CheckIn", "Boarding", "GateClosed", "Departed", "Delayed", "Approaching", "Arrived", "Canceled", "Diverted", "CanceledUncertain"]
            let rawStatus = call.getString("providerStatus")
            let providerStatus = rawStatus.flatMap { providerStatuses.contains($0) ? $0 : nil }
            let providerExpiry = flightDate(call.getString("providerExpiresAt"))
            // Apple caps visible activities at 8 hours active + 4 on the lock
            // screen. Require 13 hours of retention headroom even if the phone
            // goes offline immediately, including calls queued by an older UI.
            if rawStatus != nil && (providerStatus == nil || providerExpiry == nil || providerExpiry! < Date().addingTimeInterval(13 * 3600)) {
                Task {
                    for existing in Activity<FlightActivityAttributes>.activities where existing.attributes.tripId == tripId {
                        await existing.end(nil, dismissalPolicy: .immediate)
                    }
                    call.reject("Flight data needs refreshing")
                }
                return
            }
            let timeKind: (String?) -> String? = { value in
                guard let value, ["estimated", "actual", "unknown"].contains(value) else { return nil }
                return value
            }
            let freshUntil = providerStatus != nil ? flightDate(call.getString("providerFreshUntil")) : nil
            let state = FlightActivityAttributes.ContentState(
                departureAt: departureAt, arrivalAt: arrivalAt,
                providerStatus: providerStatus,
                providerUpdatedAt: providerStatus != nil ? flightDate(call.getString("providerUpdatedAt")) : nil,
                providerFreshUntil: freshUntil,
                providerExpiresAt: providerStatus != nil ? providerExpiry : nil,
                revisedDepartureAt: providerStatus != nil ? flightDate(call.getString("revisedDepartureAt")) : nil,
                revisedArrivalAt: providerStatus != nil ? flightDate(call.getString("revisedArrivalAt")) : nil,
                departureKind: providerStatus != nil ? timeKind(call.getString("departureKind")) : nil,
                arrivalKind: providerStatus != nil ? timeKind(call.getString("arrivalKind")) : nil
            )
            let scheduledStaleDate = arrivalAt?.addingTimeInterval(1200) ?? departureAt.addingTimeInterval(3600)
            let staleDate = providerStatus != nil ? min(freshUntil ?? Date(), providerExpiry ?? Date()) : scheduledStaleDate
            let content = ActivityContent(state: state, staleDate: staleDate)
            Task {
                // Refresh a changed schedule; changed immutable route metadata
                // needs a replacement so the Island cannot retain the old route.
                for existing in Activity<FlightActivityAttributes>.activities where existing.attributes.tripId == tripId {
                    let old = existing.attributes
                    if old.title == attributes.title && old.originIata == attributes.originIata &&
                        old.destinationIata == attributes.destinationIata && old.language == attributes.language &&
                        old.originTimeZone == attributes.originTimeZone && old.destinationTimeZone == attributes.destinationTimeZone &&
                        old.flightNumber == attributes.flightNumber && old.deepLink == attributes.deepLink {
                        await existing.update(content)
                        call.resolve()
                        return
                    }
                    await existing.end(nil, dismissalPolicy: .immediate)
                }
                do {
                    // pushType .token: cron can end the activity after its schedule.
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
            }
            return
        }
        #endif
        call.reject("Bu cihaz Live Activity desteklemiyor")
    }

    // Supabase and JS may provide fractional ISO seconds; Foundation's default
    // formatter accepts only the non-fractional shape.
    private func flightDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
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

// Kept in the existing compiled bridge source, with an independent plugin name,
// attributes type, session history and expiry tasks. Never touches flight activities.
@objc(JourneyLiveActivityPlugin)
public class JourneyLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "JourneyLiveActivityPlugin"
    public let jsName = "JourneyLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setJourneyOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncJourneyActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endJourneyActivity", returnType: CAPPluginReturnPromise),
    ]
    private let ownerKey = "l2t.journeyLive.owner.v1"
    private let sessionKey = "l2t.journeyLive.created.v1"
    private var expiryTasks: [String: Task<Void, Never>] = [:]

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["available": false])
    }

    private func journeyDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    @objc func setJourneyOwner(_ call: CAPPluginCall) {
        let ownerId = String((call.getString("ownerId") ?? "").prefix(80))
        Task { @MainActor in
            let previous = UserDefaults.standard.string(forKey: self.ownerKey)
            UserDefaults.standard.set(ownerId, forKey: self.ownerKey)
            if previous != ownerId { UserDefaults.standard.removeObject(forKey: self.sessionKey) }
            #if canImport(ActivityKit)
            if #available(iOS 16.2, *) {
                for activity in Activity<JourneyActivityAttributes>.activities
                    where ownerId.isEmpty || activity.attributes.ownerId != ownerId || activity.attributes.expiresAt <= Date() {
                    self.expiryTasks[activity.id]?.cancel()
                    self.expiryTasks.removeValue(forKey: activity.id)
                    await activity.end(ActivityContent(state: self.endedState(activity.content.state), staleDate: Date()), dismissalPolicy: .immediate)
                }
            }
            #endif
            call.resolve()
        }
    }

    @objc func syncJourneyActivity(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled,
                  let ownerId = call.getString("ownerId"), !ownerId.isEmpty, ownerId.count <= 80,
                  let journeyId = call.getString("journeyId"), !journeyId.isEmpty, journeyId.count <= 160,
                  let day = call.getInt("day"), (1...14).contains(day),
                  let startedAt = journeyDate(call.getString("startedAt")),
                  let expiresAt = journeyDate(call.getString("expiresAt")),
                  abs(expiresAt.timeIntervalSince(startedAt) - 8 * 3600) < 0.01,
                  startedAt <= Date().addingTimeInterval(5), expiresAt > Date(),
                  let completed = call.getInt("completed"), let total = call.getInt("total"),
                  (1...120).contains(total), completed >= 0, completed < total,
                  let deepLink = call.getString("deepLink"), let url = URL(string: deepLink),
                  url.scheme == "letsgo2travel", url.host == "journey", deepLink.count <= 700,
                  UserDefaults.standard.string(forKey: ownerKey) == ownerId else {
                call.reject("Invalid or expired itinerary guide")
                return
            }
            let language = ["tr", "en", "sq"].contains(call.getString("language") ?? "") ? call.getString("language")! : "tr"
            let scheduledTime = call.getString("nextScheduledTime") ?? ""
            let safeTime = scheduledTime.range(of: "^([01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil ? scheduledTime : ""
            let state = JourneyActivityAttributes.ContentState(title: String((call.getString("title") ?? "").prefix(100)),
                city: String((call.getString("city") ?? "").prefix(80)), nextStopName: String((call.getString("nextStopName") ?? "").prefix(100)),
                nextScheduledTime: safeTime, provisional: call.getBool("provisional") ?? true,
                completed: completed, total: total, language: language, ended: false)
            let attributes = JourneyActivityAttributes(ownerId: ownerId, journeyId: journeyId, day: day, startedAt: startedAt, expiresAt: expiresAt, deepLink: deepLink)
            let content = ActivityContent(state: state, staleDate: expiresAt)
            Task { @MainActor in
                guard UserDefaults.standard.string(forKey: self.ownerKey) == ownerId, expiresAt > Date() else { call.reject("Itinerary owner changed"); return }
                var replacing = false
                for activity in Activity<JourneyActivityAttributes>.activities {
                    if activity.attributes.ownerId == ownerId && activity.attributes.journeyId == journeyId && activity.attributes.day == day && activity.attributes.startedAt == startedAt && activity.attributes.deepLink == deepLink && activity.attributes.expiresAt == expiresAt {
                        guard activity.activityState == .active || activity.activityState == .stale else { continue }
                        await activity.update(content)
                        if UserDefaults.standard.string(forKey: self.ownerKey) != ownerId {
                            await activity.end(ActivityContent(state: self.endedState(state), staleDate: Date()), dismissalPolicy: .immediate)
                            call.reject("Itinerary owner changed"); return
                        }
                        self.scheduleExpiry(activity)
                        call.resolve(["active": true]); return
                    }
                    replacing = replacing || (activity.attributes.ownerId == ownerId && activity.attributes.journeyId == journeyId && activity.attributes.day == day && activity.attributes.startedAt == startedAt)
                    self.expiryTasks[activity.id]?.cancel()
                    self.expiryTasks.removeValue(forKey: activity.id)
                    await activity.end(ActivityContent(state: self.endedState(activity.content.state), staleDate: Date()), dismissalPolicy: .immediate)
                }
                guard UserDefaults.standard.string(forKey: self.ownerKey) == ownerId, expiresAt > Date() else { call.reject("Itinerary owner changed"); return }
                let identity = "\(ownerId):\(journeyId):\(day)"
                let session = String(startedAt.timeIntervalSince1970)
                let history = UserDefaults.standard.dictionary(forKey: self.sessionKey) as? [String: String] ?? [:]
                // Respect an OS/user dismissal. A foreground resume updates a
                // surviving activity, never silently starts the same session again.
                if history[identity] == session && !replacing { call.resolve(["active": false]); return }
                do {
                    let activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
                    UserDefaults.standard.set([identity: session], forKey: self.sessionKey)
                    self.scheduleExpiry(activity)
                    call.resolve(["active": true])
                } catch { call.reject("Itinerary Live Activity could not start") }
            }
            return
        }
        #endif
        call.resolve(["active": false])
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    private func endedState(_ state: JourneyActivityAttributes.ContentState) -> JourneyActivityAttributes.ContentState {
        var ended = state
        ended.title = ""; ended.city = ""; ended.nextStopName = ""; ended.nextScheduledTime = ""; ended.ended = true
        return ended
    }
    @available(iOS 16.2, *)
    @MainActor private func scheduleExpiry(_ activity: Activity<JourneyActivityAttributes>) {
        expiryTasks[activity.id]?.cancel()
        expiryTasks[activity.id] = Task { @MainActor [weak self] in
            let seconds = max(0, activity.attributes.expiresAt.timeIntervalSinceNow)
            do { try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) } catch { return }
            guard !Task.isCancelled, let self else { return }
            await activity.end(ActivityContent(state: self.endedState(activity.content.state), staleDate: Date()), dismissalPolicy: .immediate)
            self.expiryTasks.removeValue(forKey: activity.id)
        }
    }
    #endif

    @objc func endJourneyActivity(_ call: CAPPluginCall) {
        let ownerId = call.getString("ownerId") ?? ""
        let journeyId = call.getString("journeyId")
        let day = call.getInt("day")
        Task { @MainActor in
            #if canImport(ActivityKit)
            if #available(iOS 16.2, *) {
                for activity in Activity<JourneyActivityAttributes>.activities where activity.attributes.ownerId == ownerId &&
                    (journeyId == nil || activity.attributes.journeyId == journeyId) && (day == nil || activity.attributes.day == day) {
                    self.expiryTasks[activity.id]?.cancel()
                    self.expiryTasks.removeValue(forKey: activity.id)
                    await activity.end(ActivityContent(state: self.endedState(activity.content.state), staleDate: Date()), dismissalPolicy: .immediate)
                }
            }
            #endif
            call.resolve()
        }
    }
}
