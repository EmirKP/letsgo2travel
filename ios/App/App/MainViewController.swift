import Capacitor
import UIKit

// Main.storyboard'daki köprü denetleyicisi. Capacitor 8'de UYGULAMA
// HEDEFİNE elle eklenen (pakete gelmeyen) eklentiler burada kaydedilir;
// kayıt olmadan JS tarafı FlightLiveActivity köprüsünü göremez.
class MainViewController: CAPBridgeViewController {
    private let journeyMap = AppleJourneyMapPlugin()

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FlightLiveActivityPlugin())
        bridge?.registerPluginInstance(OfflineTranslationPlugin())
        bridge?.registerPluginInstance(TicketImportPlugin())
        bridge?.registerPluginInstance(WebAuthenticationPlugin())
        bridge?.registerPluginInstance(journeyMap)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        journeyMap.setControllerSuspended(true)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        journeyMap.setControllerSuspended(false)
    }
}
