import Capacitor
import UIKit

// Main.storyboard'daki köprü denetleyicisi. Capacitor 8'de UYGULAMA
// HEDEFİNE elle eklenen (pakete gelmeyen) eklentiler burada kaydedilir;
// kayıt olmadan JS tarafı FlightLiveActivity köprüsünü göremez.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FlightLiveActivityPlugin())
    }
}
