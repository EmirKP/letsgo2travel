import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

// ---------------------------------------------------------------------
// Live Activity token gözlemcisi — UYGULAMA AÇILIŞINDA (AppDelegate)
// başlar; WebView/JS'e bağımlı DEĞİLDİR.
//
// Neden: Apple, push-to-start bildirimi geldiğinde uygulamayı ARKA
// PLANDA uyandırır ve kısa çalışma süresi verir; aktivitenin güncelleme
// (update/end) tokenı bu uyanışta üretilir. O anda WebView çalışmıyor
// olabileceği için token'lar burada yakalanıp UserDefaults tamponuna
// yazılır; JS hazır olduğunda plugin tampondan okuyup sunucuya kaydeder
// ve başarıyla kaydedilen girdiyi ack ile tampondan SİLER. Tampon yalnız
// Live Activity tokenlarını tutar (APNs cihaz push tokenı DEĞİL), 40
// girişle sınırlıdır ve loglanmaz.
//
// NOT (dürüstlük): arka plan uyanışında bu gözlemcinin token'ı fiilen
// yakaladığı fiziksel cihazda DOĞRULANMADI (NOT VERIFIED). Yakalanamazsa
// sonuç veri kaybı değildir: end teslim satırı token kaydolana kadar
// açılmaz; token bir sonraki uygulama açılışında yakalanıp gönderilir.
// ---------------------------------------------------------------------
final class LiveActivityTokenObserver {
    static let shared = LiveActivityTokenObserver()
    static let bufferKey = "l2t.liveActivity.tokenBuffer"
    // EN SON geçerli push-to-start tokenı AYRICA ve KALICI tutulur: ack
    // tamponu temizlese bile hesap değişiminde (A logout → B login) yeni
    // oturum bu değeri okuyup token'ı GÜNCEL kullanıcı adına yeniden
    // kaydedebilir. Cihaz-genel bir tokendır, hesaba özel veri içermez.
    static let latestPushToStartKey = "l2t.liveActivity.latestPushToStartToken"
    static let tokenNotification = Notification.Name("l2tLiveActivityToken")
    private var started = false
    private var observedActivityIds = Set<String>()

    func start() {
        guard !started else { return }
        started = true
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            for activity in Activity<FlightActivityAttributes>.activities {
                observe(activity)
            }
            Task {
                for await activity in Activity<FlightActivityAttributes>.activityUpdates {
                    self.observe(activity)
                }
            }
        }
        if #available(iOS 17.2, *) {
            Task {
                for await tokenData in Activity<FlightActivityAttributes>.pushToStartTokenUpdates {
                    let hex = Self.hexToken(tokenData)
                    UserDefaults.standard.set(hex, forKey: Self.latestPushToStartKey)
                    Self.buffer(entry: [
                        "tokenType": "push_to_start",
                        "tripId": "",
                        "token": hex,
                    ])
                }
            }
        }
        #endif
    }

    #if canImport(ActivityKit)
    @available(iOS 16.2, *)
    func observe(_ activity: Activity<FlightActivityAttributes>) {
        guard !observedActivityIds.contains(activity.id) else { return }
        observedActivityIds.insert(activity.id)
        Task {
            for await tokenData in activity.pushTokenUpdates {
                Self.buffer(entry: [
                    "tokenType": "activity_update",
                    "tripId": activity.attributes.tripId,
                    "token": Self.hexToken(tokenData),
                ])
            }
        }
    }
    #endif

    static func hexToken(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    private static func entryKey(_ entry: [String: String]) -> String {
        "\(entry["tokenType"] ?? ""):\(entry["tripId"] ?? ""):\(entry["token"] ?? "")"
    }

    static func buffer(entry: [String: String]) {
        var list = bufferedEntries()
        if !list.contains(where: { entryKey($0) == entryKey(entry) }) {
            list.append(entry)
            if list.count > 40 { list.removeFirst(list.count - 40) }
            UserDefaults.standard.set(list, forKey: bufferKey)
        }
        // JS çalışıyorsa anında iletilir; çalışmıyorsa tamponda bekler.
        NotificationCenter.default.post(name: tokenNotification, object: nil, userInfo: ["entry": entry])
    }

    static func bufferedEntries() -> [[String: String]] {
        (UserDefaults.standard.array(forKey: bufferKey) as? [[String: String]]) ?? []
    }

    /** Sunucuya başarıyla kaydedilen giriş tampondan silinir (JS ack'i).
        NOT: latestPushToStartKey SİLİNMEZ — hesap değişiminde replay için
        her zaman erişilebilir kalır. */
    static func acknowledge(entry: [String: String]) {
        let list = bufferedEntries().filter { entryKey($0) != entryKey(entry) }
        UserDefaults.standard.set(list, forKey: bufferKey)
    }

    /** En son geçerli push-to-start tokenı (yoksa boş dize). */
    static func latestPushToStartToken() -> String {
        UserDefaults.standard.string(forKey: latestPushToStartKey) ?? ""
    }
}
