import Foundation
import ImageIO
import UIKit

/// The server supplies actual Commons imageinfo URLs and the web detail retains
/// attribution/license. Native rendering accepts only their exact raster paths.
func journeyMapPhotoURL(_ raw: Any?) -> URL? {
    guard let raw = raw as? String, raw.utf16.count <= 2000, raw == raw.trimmingCharacters(in: .whitespacesAndNewlines),
          let parts = URLComponents(string: raw), parts.scheme == "https", ["upload.wikimedia.org", "thumb.wikimedia.org"].contains(parts.host ?? ""),
          parts.user == nil, parts.password == nil, parts.port == nil, parts.query == nil, parts.fragment == nil,
          let decoded = parts.percentEncodedPath.removingPercentEncoding else { return nil }
    let path = decoded.components(separatedBy: "/")
    guard path.count >= 6, path[0].isEmpty, path[1] == "wikipedia", path[2] == "commons" else { return nil }
    let thumb = path[3] == "thumb", offset = thumb ? 4 : 3
    guard (parts.host != "thumb.wikimedia.org" || thumb), path.count == (thumb ? 8 : 6), path[offset].range(of: "^[a-f0-9]$", options: .regularExpression) != nil,
          path[offset + 1].range(of: "^[a-f0-9]{2}$", options: .regularExpression) != nil,
          path[offset + 1].hasPrefix(path[offset]), let file = journeyRasterName(path[offset + 2]) else { return nil }
    if thumb {
        guard let separator = path[7].range(of: "px-") else { return nil }
        let widthText = String(path[7][..<separator.lowerBound])
        guard widthText.range(of: "^[1-9][0-9]{0,2}$", options: .regularExpression) != nil,
              let width = Int(widthText), (width <= 640 || width == 960), journeyRasterName(String(path[7][separator.upperBound...])) == file else { return nil }
    }
    return parts.url
}

private func journeyRasterName(_ name: String) -> String? {
    guard !name.isEmpty, name.utf16.count <= 240, name == name.trimmingCharacters(in: .whitespacesAndNewlines), !name.hasPrefix("."),
          !name.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
          name.rangeOfCharacter(from: CharacterSet(charactersIn: "\\/?#%|:\"<>")) == nil,
          ["jpg", "jpeg", "png", "webp"].contains((name as NSString).pathExtension.lowercased()) else { return nil }
    return name.replacingOccurrences(of: "_", with: " ")
}

/// One loader per map session; no disk cache, cookies, auth or arbitrary redirects.
/// Four streamed downloads and 96 waiting visible annotations bound all work.
final class JourneyMapPhotoLoader: NSObject, URLSessionDataDelegate {
    private struct Download {
        let key: String
        var bytes = Data()
        var accepted = false
    }
    private let cache = NSCache<NSString, UIImage>()
    private var pending: [(String, URL)] = []
    private var queued = Set<String>()
    private var tasks: [String: URLSessionDataTask] = [:]
    private var downloads: [Int: Download] = [:]
    private var failed: [String] = []
    private var stopped = false
    private let onImage: (String, UIImage) -> Void
    private let byteLimit = 2 * 1024 * 1024
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpMaximumConnectionsPerHost = 4
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 12
        return URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }()

    init(onImage: @escaping (String, UIImage) -> Void) {
        self.onImage = onImage
        super.init()
        cache.countLimit = 64
        cache.totalCostLimit = 8 * 1024 * 1024
    }

    func image(for url: URL?) -> UIImage? {
        guard let url = url else { return nil }
        return cache.object(forKey: url.absoluteString as NSString)
    }

    func request(_ url: URL) {
        let key = url.absoluteString
        guard !stopped, journeyMapPhotoURL(key) != nil, cache.object(forKey: key as NSString) == nil,
              tasks[key] == nil, !queued.contains(key), !failed.contains(key), pending.count < 96 else { return }
        queued.insert(key)
        pending.append((key, url))
        pump()
    }

    private func pump() {
        while !stopped && tasks.count < 4 && !pending.isEmpty {
            let (key, url) = pending.removeFirst()
            queued.remove(key)
            var request = URLRequest(url: url)
            request.setValue("image/jpeg,image/png,image/webp", forHTTPHeaderField: "Accept")
            request.setValue("LetsGo2Travel-map/1.0", forHTTPHeaderField: "User-Agent")
            let task = session.dataTask(with: request)
            tasks[key] = task
            downloads[task.taskIdentifier] = Download(key: key)
            task.resume()
        }
    }

    func cancelAll() {
        stopped = true
        pending.removeAll(); queued.removeAll()
        tasks.values.forEach { $0.cancel() }
        tasks.removeAll(); downloads.removeAll(); failed.removeAll(); cache.removeAllObjects()
        session.invalidateAndCancel()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        // URLs are final API thumbnails, so a redirect is neither needed nor trusted.
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard !stopped, var download = downloads[dataTask.taskIdentifier], let response = response as? HTTPURLResponse,
              response.statusCode == 200, let url = response.url, journeyMapPhotoURL(url.absoluteString) != nil,
              url.absoluteString == download.key, response.expectedContentLength <= Int64(byteLimit),
              ["image/jpeg", "image/png", "image/webp"].contains(response.mimeType?.lowercased() ?? "") else {
            completionHandler(.cancel)
            return
        }
        download.accepted = true
        downloads[dataTask.taskIdentifier] = download
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard !stopped, var download = downloads[dataTask.taskIdentifier], download.accepted,
              download.bytes.count + data.count <= byteLimit else { dataTask.cancel(); return }
        download.bytes.append(data)
        downloads[dataTask.taskIdentifier] = download
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard !stopped, let download = downloads.removeValue(forKey: task.taskIdentifier) else { return }
        guard error == nil, download.accepted, !download.bytes.isEmpty else { finish(download.key, image: nil); return }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let image = Self.thumbnail(download.bytes)
            DispatchQueue.main.async { self?.finish(download.key, image: image) }
        }
    }

    private func finish(_ key: String, image: UIImage?) {
        guard !stopped, tasks.removeValue(forKey: key) != nil else { return }
        if let image = image {
            cache.setObject(image, forKey: key as NSString, cost: Int(image.size.width * image.size.height) * 4)
            onImage(key, image)
        } else {
            failed.append(key)
            if failed.count > 128 { failed.removeFirst() }
        }
        pump()
    }

    private static func thumbnail(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber, let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              width.doubleValue > 0, height.doubleValue > 0, width.doubleValue * height.doubleValue <= 40000000 else { return nil }
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                      kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 160]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
