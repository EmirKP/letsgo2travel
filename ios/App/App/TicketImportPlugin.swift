import Capacitor
import Foundation
import ImageIO
import PDFKit
import PhotosUI
import UniformTypeIdentifiers
import UIKit
import Vision

/// Reads only a user-selected ticket on device. No upload, clipboard access,
/// analytics, raw-text logging, or persistent document copy.
@objc(TicketImportPlugin)
public class TicketImportPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, PHPickerViewControllerDelegate {
    public let identifier = "TicketImportPlugin"
    public let jsName = "TicketImport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickAndRead", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?
    private let maxFileBytes = 20 * 1024 * 1024
    private let maxCharacters = 24_000
    private let maxPages = 6

    @objc func pickAndRead(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pendingCall == nil, let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("ticket_busy", "ticket_busy")
                return
            }
            self.pendingCall = call
            if call.getString("source") == "photos" {
                // The system picker grants access to the selected photo only.
                var configuration = PHPickerConfiguration()
                configuration.filter = .images
                configuration.selectionLimit = 1
                let picker = PHPickerViewController(configuration: configuration)
                picker.delegate = self
                presenter.present(picker, animated: true)
            } else {
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf, .image], asCopy: false)
                picker.allowsMultipleSelection = false
                picker.delegate = self
                presenter.present(picker, animated: true)
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(text: "", cancelled: true)
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { finish(text: "", cancelled: true); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            self.read(url)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider else { finish(text: "", cancelled: true); return }
        guard let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) else {
            fail("ticket_unsupported"); return
        }
        provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
            guard let url else { self.fail("ticket_unreadable"); return }
            // This URL is valid only during this callback: finish the read here.
            self.read(url)
        }
    }

    private func read(_ url: URL) {
        do {
            let resources = try url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
            guard resources.isRegularFile == true,
                  let byteCount = resources.fileSize, byteCount > 0, byteCount <= maxFileBytes else {
                fail("ticket_too_large"); return
            }
            if resources.contentType?.conforms(to: .pdf) == true || url.pathExtension.lowercased() == "pdf" {
                guard let document = PDFDocument(url: url), !document.isLocked, document.pageCount > 0 else {
                    fail("ticket_unreadable"); return
                }
                var parts: [String] = []
                var clipped = document.pageCount > maxPages
                var count = 0
                for index in 0..<min(document.pageCount, maxPages) {
                    guard let page = document.page(at: index) else { continue }
                    let pageText: String = try autoreleasepool {
                        let embedded = page.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        if embedded.count >= 20 { return embedded }
                        // A scanned PDF has no text layer. OCR a bounded thumbnail.
                        guard let image = page.thumbnail(of: CGSize(width: 1800, height: 1800), for: .mediaBox).cgImage else { return "" }
                        return try recognize(image)
                    }
                    parts.append(String(pageText.prefix(maxCharacters - count)))
                    count += pageText.count
                    if count >= maxCharacters { clipped = true; break }
                }
                finish(text: String(parts.joined(separator: "\n").prefix(maxCharacters)), truncated: clipped)
            } else {
                guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                        kCGImageSourceCreateThumbnailFromImageAlways: true,
                        kCGImageSourceCreateThumbnailWithTransform: true,
                        kCGImageSourceThumbnailMaxPixelSize: 2400,
                        kCGImageSourceShouldCacheImmediately: true
                      ] as CFDictionary) else { fail("ticket_unsupported"); return }
                let text = try recognize(image)
                finish(text: String(text.prefix(maxCharacters)), truncated: text.count > maxCharacters)
            }
        } catch { fail("ticket_unreadable") }
    }

    private func recognize(_ image: CGImage) throws -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false // Avoid rewriting flight/airport codes.
        let supported = try request.supportedRecognitionLanguages()
        request.recognitionLanguages = ["en-US", "tr-TR", "de-DE", "fr-FR"].filter { supported.contains($0) }
        if #available(iOS 16.0, *) { request.automaticallyDetectsLanguage = true }
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }

    private func finish(text: String, cancelled: Bool = false, truncated: Bool = false) {
        DispatchQueue.main.async {
            let call = self.pendingCall
            self.pendingCall = nil
            call?.resolve(["text": text, "cancelled": cancelled, "truncated": truncated])
        }
    }

    private func fail(_ code: String) {
        DispatchQueue.main.async {
            let call = self.pendingCall
            self.pendingCall = nil
            call?.reject(code, code)
        }
    }
}
