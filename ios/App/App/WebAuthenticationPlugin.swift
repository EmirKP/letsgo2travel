import AuthenticationServices
import Capacitor
import UIKit

/// OAuth uses the system authentication session, not a Safari popover.
@objc(WebAuthenticationPlugin)
public class WebAuthenticationPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthenticationPlugin"
    public let jsName = "WebAuthentication"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?
    private var anchor: UIWindow?
    private let callbackScheme = "tr.com.letsgo2travel.app"

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.session == nil else {
                call.reject("Authentication already in progress", "auth_busy")
                return
            }
            guard let raw = call.getString("url"), let url = URL(string: raw),
                  url.scheme == "https", url.host == "mwlucroyjvtoxillvzga.supabase.co",
                  url.path == "/auth/v1/authorize", url.user == nil, url.password == nil,
                  url.port == nil, url.fragment == nil,
                  let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  parts.queryItems?.filter({ $0.name == "redirect_to" }).map({ $0.value }) == ["tr.com.letsgo2travel.app://auth/callback"] else {
                call.reject("Invalid authentication URL", "auth_invalid_url")
                return
            }
            guard let window = self.bridge?.viewController?.view.window else {
                call.reject("Authentication window unavailable", "auth_no_window")
                return
            }
            self.anchor = window
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: self.callbackScheme) { [weak self] callback, error in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.session = nil
                    self.anchor = nil
                    if let error = error {
                        let cancelled = (error as NSError).domain == ASWebAuthenticationSessionErrorDomain
                            && (error as NSError).code == ASWebAuthenticationSessionError.Code.canceledLogin.rawValue
                        call.reject(cancelled ? "Sign-in cancelled" : "Authentication could not complete",
                                    cancelled ? "auth_cancelled" : "auth_failed")
                        return
                    }
                    guard let callback = callback,
                          callback.scheme == self.callbackScheme, callback.host == "auth",
                          callback.path == "/callback", callback.user == nil,
                          callback.password == nil, callback.port == nil else {
                        call.reject("Invalid authentication callback", "auth_invalid_callback")
                        return
                    }
                    // No tokens or callback URLs are logged or persisted natively.
                    call.resolve(["callbackUrl": callback.absoluteString])
                }
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                self.session = nil
                self.anchor = nil
                call.reject("Authentication could not start", "auth_start_failed")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return anchor ?? ASPresentationAnchor()
    }
}
