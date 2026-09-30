import ActivityKit
import Foundation

// Kokpit uçuşu Live Activity veri modeli. YALNIZ kullanıcının kaydettiği
// bilgiler taşınır; boarding/gate/gecikme gibi canlı durum verisi YOKTUR
// (doğrulanmış uçuş durumu sağlayıcısı bağlanmadan uydurulmaz).
// NOT: Bu dosya HEM uygulama HEM widget hedefinde derlenir; uygulamanın
// dağıtım hedefi iOS 15 olduğundan availability açıkça işaretlenir.
@available(iOS 16.2, *)
struct FlightActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Kalkış zamanı (geri sayım bundan hesaplanır).
        var departureAt: Date
        // Kullanıcının girdiği planlanan varış. Eski aktivitelerle geriye
        // uyumluluk için optional tutulur.
        var arrivalAt: Date?
        // All optional: activities started by older builds still decode.
        // A status is current only until providerFreshUntil; clocks alone
        // must never turn a scheduled flight into a confirmed airborne one.
        var providerStatus: String?
        var providerUpdatedAt: Date?
        var providerFreshUntil: Date?
        var providerExpiresAt: Date?
        var revisedDepartureAt: Date?
        var revisedArrivalAt: Date?
        var departureKind: String?
        var arrivalKind: String?
    }

    var tripId: String
    var title: String        // Örn: "Roma, İtalya"
    var originIata: String   // Örn: "IST" (kayıtta yoksa boş gelir)
    var destinationIata: String
    var deepLink: String     // letsgo2travel://cockpit
    var language: String?    // "tr" / "en" / "sq"; eski aktivitelerde nil olabilir
    // Optional alanlar eski push-to-start içerikleriyle uyumluluğu korur.
    var originTimeZone: String?
    var destinationTimeZone: String?
    var flightNumber: String?
}
