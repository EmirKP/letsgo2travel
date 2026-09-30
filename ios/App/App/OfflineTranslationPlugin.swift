import Capacitor
import Foundation
import SwiftUI
#if canImport(Translation)
import Translation
#endif

@objc(OfflineTranslationPlugin)
public class OfflineTranslationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfflineTranslationPlugin"
    public let jsName = "OfflineTranslation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "translate", returnType: CAPPluginReturnPromise)
    ]
    private var busy = false
    private let languages: Set<String> = ["tr", "en", "de", "fr", "es", "it", "pt", "ar", "ja", "ko", "zh", "ru", "nl", "pl", "uk", "hi", "th", "vi", "id", "el"]
    private func pair(_ call: CAPPluginCall) -> (String, String)? {
        guard let source = call.getString("source"), let target = call.getString("target"),
              languages.contains(source), languages.contains(target), source != target else { return nil }
        return (source, target)
    }
    @objc func status(_ call: CAPPluginCall) {
        #if canImport(Translation)
        if #available(iOS 18.0, *), let (source, target) = pair(call) {
            Task {
                let status = await LanguageAvailability().status(from: Locale.Language(identifier: source), to: Locale.Language(identifier: target))
                switch status {
                case .installed: call.resolve(["status": "installed"])
                case .supported: call.resolve(["status": "supported"])
                default: call.resolve(["status": "unsupported"])
                }
            }
            return
        }
        #endif
        call.resolve(["status": "unsupported"])
    }
    @objc func prepare(_ call: CAPPluginCall) { perform(call, download: true) }
    @objc func translate(_ call: CAPPluginCall) { perform(call, download: false) }
    private func perform(_ call: CAPPluginCall, download: Bool) {
        #if canImport(Translation)
        if #available(iOS 18.0, *), let (source, target) = pair(call) {
            let text = call.getString("text")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard download || (!text.isEmpty && text.utf16.count <= 2000) else { call.reject("Invalid text"); return }
            Task { @MainActor in
                guard !self.busy, let presenter = self.bridge?.viewController, presenter.presentedViewController == nil else { call.reject("Translation busy"); return }
                self.busy = true
                let from = Locale.Language(identifier: source)
                let to = Locale.Language(identifier: target)
                let status = await LanguageAvailability().status(from: from, to: to)
                guard status == .installed || (download && status == .supported) else {
                    self.busy = false
                    call.reject("Prepare supported language packs first")
                    return
                }
                guard presenter.presentedViewController == nil, presenter.viewIfLoaded?.window != nil else {
                    self.busy = false
                    call.reject("Translation view unavailable")
                    return
                }
                var finished = false
                let controller = UIHostingController(rootView: OfflineTranslationView(source: from, target: to, text: text, download: download, locale: call.getString("locale") ?? "en") { result in
                    guard !finished else { return }
                    finished = true
                    presenter.dismiss(animated: true) {
                        self.busy = false
                        switch result {
                        case .success(let output): call.resolve(["text": output])
                        case .failure: call.reject("Translation cancelled or unavailable")
                        }
                    }
                })
                controller.isModalInPresentation = true
                presenter.present(controller, animated: true)
            }
            return
        }
        #endif
        call.reject("Offline translation unavailable")
    }
}

#if canImport(Translation)
@available(iOS 18.0, *)
private struct OfflineTranslationView: View {
    let source: Locale.Language
    let target: Locale.Language
    let text: String
    let download: Bool
    let locale: String
    let completion: (Result<String, Error>) -> Void
    @State private var configuration: TranslationSession.Configuration?
    @State private var completed = false
    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
            Text(locale == "tr" ? (download ? "Dil paketi hazırlanıyor…" : "Cihazda çevriliyor…") : locale == "sq" ? (download ? "Po përgatitet paketa e gjuhës…" : "Po përkthehet në pajisje…") : (download ? "Preparing language pack…" : "Translating on device…"))
            Button(locale == "tr" ? "İptal" : locale == "sq" ? "Anulo" : "Cancel") { finish(.failure(CancellationError())) }
        }
        .padding()
        .onAppear { configuration = .init(source: source, target: target) }
        .translationTask(configuration) { session in
            do {
                if download {
                    try await session.prepareTranslation()
                    finish(.success(""))
                } else {
                    // The bridge checked installed status before opening this view.
                    let response = try await session.translate(text)
                    finish(.success(response.targetText))
                }
            } catch { finish(.failure(error)) }
        }
    }
    private func finish(_ result: Result<String, Error>) {
        guard !completed else { return }
        completed = true
        configuration = nil
        completion(result)
    }
}
#endif
