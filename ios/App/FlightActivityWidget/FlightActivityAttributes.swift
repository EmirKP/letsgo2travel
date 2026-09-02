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
    }

    var tripId: String
    var title: String        // Örn: "Roma, İtalya"
    var originIata: String   // Örn: "IST" (kayıtta yoksa boş gelir)
    var destinationIata: String
    var deepLink: String     // letsgo2travel://cockpit
}
