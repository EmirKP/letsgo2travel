import Capacitor
import CoreFoundation
import MapKit
import UIKit
import WebKit

/// A bounded native map surface, positioned over its WebView placeholder. The web
/// application owns the itinerary, routing requests, account boundary and sheets.
@objc(AppleJourneyMapPlugin)
public final class AppleJourneyMapPlugin: CAPPlugin, CAPBridgedPlugin, MKMapViewDelegate {
    public let identifier = "AppleJourneyMapPlugin"
    public let jsName = "AppleJourneyMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]

    private var state: JourneyMapState?
    private var surface: JourneyMapSurface?
    private var map: MKMapView?
    private var searchButton: UIButton?
    private var zoomInButton: UIButton?
    private var zoomOutButton: UIButton?
    private var annotations: [JourneyMapAnnotation] = []
    private var overlayDays: [ObjectIdentifier: Int] = [:]
    private var observers: [NSObjectProtocol] = []
    private var suspended = false
    private var applyingState = false
    private var lastViewport = ""
    private var lastMapError = false
    private var highestGeneration = -1
    private var retiredSessions: [String] = []
    private var photos: JourneyMapPhotoLoader?

    public override func load() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.observers.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
                self?.surface?.isHidden = true
            })
            self.observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                self?.layoutSurface()
            })
        }
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    /// MainViewController calls this when a native sheet covers the WebView.
    func setControllerSuspended(_ value: Bool) {
        suspended = value
        layoutSurface()
    }

    public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        if navigationAction.targetFrame?.isMainFrame == true {
            DispatchQueue.main.async { [weak self] in self?.removeSurface() }
        }
        return nil
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let next = JourneyMapState(call.jsObjectRepresentation) else {
                call.reject("Invalid map state", "map_invalid_state")
                return
            }
            guard self.webView?.superview != nil else {
                call.reject("Map surface unavailable", "map_unavailable")
                return
            }
            guard !self.retiredSessions.contains(next.sessionId), next.generation >= self.highestGeneration,
                  next.generation > self.highestGeneration || self.state?.sessionId == next.sessionId else {
                call.reject("Map session ended", "map_session_mismatch")
                return
            }
            if let current = self.state, current.sessionId == next.sessionId {
                guard current.ownerId == next.ownerId else {
                    call.reject("Map owner changed", "map_session_mismatch")
                    return
                }
                guard next.revision > current.revision else {
                    call.resolve(["applied": false])
                    return
                }
            } else {
                self.removeSurface()
            }
            self.highestGeneration = next.generation
            self.apply(next)
            call.resolve(["applied": true])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let next = JourneyMapState(call.jsObjectRepresentation) else {
                call.reject("Invalid map state", "map_invalid_state")
                return
            }
            guard let current = self.state, current.sessionId == next.sessionId, current.ownerId == next.ownerId,
                  current.generation == next.generation else {
                call.reject("Map session ended", "map_session_mismatch")
                return
            }
            guard next.revision > current.revision else {
                call.resolve(["applied": false])
                return
            }
            self.apply(next)
            call.resolve(["applied": true])
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let session = call.getString("sessionId"), let owner = call.getString("ownerId") else {
                call.reject("Invalid map session", "map_invalid_state")
                return
            }
            // An unmount from an old account must never remove its successor.
            let matches = self.state?.sessionId == session && self.state?.ownerId == owner
            // A timeout may send hide before a delayed show reaches the main queue.
            // Remember its retirement even when it is not the currently visible map.
            if !self.retiredSessions.contains(session) {
                self.retiredSessions.append(session)
                if self.retiredSessions.count > 256 { self.retiredSessions.removeFirst() }
            }
            if matches { self.removeSurface() }
            call.resolve(["applied": matches])
        }
    }

    private func createSurface() {
        guard surface == nil, let webView = webView, let host = webView.superview else { return }
        let wrapper = JourneyMapSurface(frame: .zero)
        wrapper.clipsToBounds = true
        wrapper.backgroundColor = .systemBackground
        let nativeMap = MKMapView(frame: .zero)
        nativeMap.delegate = self
        nativeMap.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        nativeMap.mapType = .mutedStandard
        nativeMap.showsUserLocation = false
        nativeMap.showsTraffic = false
        nativeMap.showsCompass = true
        nativeMap.showsScale = true
        nativeMap.isPitchEnabled = false
        nativeMap.pointOfInterestFilter = .excludingAll
        nativeMap.register(JourneyPhotoAnnotationView.self, forAnnotationViewWithReuseIdentifier: "journey-place")
        nativeMap.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier)
        wrapper.addSubview(nativeMap)
        let search = control(symbol: "magnifyingglass", action: #selector(searchAreaTapped))
        let zoomIn = control(symbol: "plus", action: #selector(zoomInTapped))
        let zoomOut = control(symbol: "minus", action: #selector(zoomOutTapped))
        wrapper.addSubview(search)
        wrapper.addSubview(zoomIn)
        wrapper.addSubview(zoomOut)
        // Inserting above only the WebView leaves native presentation controllers on top.
        host.insertSubview(wrapper, aboveSubview: webView)
        surface = wrapper
        map = nativeMap
        searchButton = search
        zoomInButton = zoomIn
        zoomOutButton = zoomOut
        photos = JourneyMapPhotoLoader { [weak self] key, image in
            guard let self = self, let map = self.map else { return }
            for annotation in self.annotations where annotation.point.imageUrl?.absoluteString == key {
                (map.view(for: annotation) as? JourneyPhotoAnnotationView)?.applyImage(image, url: key)
            }
        }
    }

    private func control(symbol: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        var configuration = UIButton.Configuration.filled()
        configuration.baseBackgroundColor = .secondarySystemBackground
        configuration.baseForegroundColor = .label
        configuration.cornerStyle = .capsule
        configuration.image = UIImage(systemName: symbol)
        configuration.imagePadding = 8
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14)
        button.configuration = configuration
        button.layer.shadowColor = UIColor.black.cgColor
        button.layer.shadowOpacity = 0.12
        button.layer.shadowRadius = 8
        button.layer.shadowOffset = CGSize(width: 0, height: 2)
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func apply(_ next: JourneyMapState) {
        let previous = state
        state = next
        createSurface()
        guard let map = map else { return }
        applyingState = true
        surface?.overrideUserInterfaceStyle = next.dark ? .dark : .light
        map.accessibilityLabel = next.labels["map"]
        searchButton?.configuration?.title = next.labels["searchArea"]
        searchButton?.accessibilityLabel = next.labels["searchArea"]
        searchButton?.isEnabled = next.searchEnabled
        searchButton?.isHidden = !next.showSearchArea
        zoomInButton?.accessibilityLabel = next.labels["zoomIn"]
        zoomOutButton?.accessibilityLabel = next.labels["zoomOut"]
        layoutSurface()

        // Frame, label and theme updates preserve the camera and MapKit selection.
        if previous?.pointsKey != next.pointsKey {
            map.removeAnnotations(annotations)
            annotations = next.visiblePoints.map { JourneyMapAnnotation($0) }
            map.addAnnotations(annotations)
        } else if previous?.selectedPlaceId != next.selectedPlaceId {
            for annotation in annotations where annotation.point.id == previous?.selectedPlaceId || annotation.point.id == next.selectedPlaceId {
                if let view = map.view(for: annotation) as? JourneyPhotoAnnotationView {
                    configure(view, for: annotation)
                } else if annotation.point.id == next.selectedPlaceId {
                    // A clustered member may have no view yet. Refresh just that
                    // member so its selected, non-clustering view can be created.
                    map.removeAnnotation(annotation)
                    map.addAnnotation(annotation)
                }
            }
        }
        if previous?.routesKey != next.routesKey {
            map.removeOverlays(map.overlays)
            overlayDays.removeAll()
            for route in next.visibleRoutes {
                // These are complete provider paths. Never synthesize stop-to-stop lines.
                var coordinates = route.coordinates
                let line = MKPolyline(coordinates: &coordinates, count: coordinates.count)
                overlayDays[ObjectIdentifier(line)] = route.day
                map.addOverlay(line, level: .aboveRoads)
            }
        }

        let centerChanged = previous?.center.latitude != next.center.latitude || previous?.center.longitude != next.center.longitude
        let stopsChanged = previous?.fitKey != next.fitKey
        if previous != nil && centerChanged && !stopsChanged {
            setCenter(next.center, span: 0.04)
        } else if previous == nil || stopsChanged {
            let stops = annotations.filter { $0.point.kind == "stop" }
            if stops.count > 1 { fit(stops.map { $0.coordinate }) }
            else { setCenter(stops.first?.coordinate ?? next.center, span: stops.isEmpty ? 0.06 : 0.025) }
        }
        if let selected = annotations.first(where: { $0.point.id == next.selectedPlaceId }) {
            map.selectAnnotation(selected, animated: false)
            if previous?.selectedPlaceId != next.selectedPlaceId { map.setCenter(selected.coordinate, animated: false) }
        } else {
            for selected in map.selectedAnnotations { map.deselectAnnotation(selected, animated: false) }
        }
        applyingState = false
        reportViewport()
    }

    private func layoutSurface() {
        guard let state = state, let webView = webView, let wrapper = surface, let host = wrapper.superview else { return }
        let scale = webView.bounds.width / CGFloat(state.frame.viewportWidth)
        let css = state.frame
        let requested = CGRect(x: CGFloat(css.x) * scale, y: CGFloat(css.y) * scale,
                               width: CGFloat(css.width) * scale, height: CGFloat(css.height) * scale)
        let visible = requested.intersection(webView.bounds)
        // A tiny/clipped surface cannot retain both interaction and Apple's attribution.
        guard !visible.isNull, visible.width >= 80, visible.height >= 100 else {
            wrapper.isHidden = true
            return
        }
        wrapper.frame = webView.convert(visible, to: host)
        map?.frame = wrapper.bounds
        wrapper.setOcclusions(state.occlusions.map { hole in
            let rect = CGRect(x: CGFloat(hole.x) * scale - visible.minX, y: CGFloat(hole.y) * scale - visible.minY,
                              width: CGFloat(hole.width) * scale, height: CGFloat(hole.height) * scale)
            return UIBezierPath(roundedRect: rect, cornerRadius: CGFloat(hole.radius) * scale)
        })
        map?.layoutMargins = boundedInsets(state.insets.scaled(scale), size: wrapper.bounds.size)
        wrapper.isHidden = suspended || UIApplication.shared.applicationState != .active || webView.window == nil
        let width = wrapper.bounds.width
        let height = wrapper.bounds.height
        let insets = map?.layoutMargins ?? .zero
        searchButton?.frame = CGRect(x: 12 + insets.left, y: 12 + insets.top,
                                     width: min(250, max(44, width - insets.left - insets.right - 80)), height: 44)
        // Keep the built-in Apple Maps attribution and legal controls unobstructed.
        zoomInButton?.frame = CGRect(x: width - 56, y: max(64, height - 148), width: 44, height: 44)
        zoomOutButton?.frame = CGRect(x: width - 56, y: max(112, height - 100), width: 44, height: 44)
        let enoughRoom = height >= 205
        zoomInButton?.isHidden = !enoughRoom
        zoomOutButton?.isHidden = !enoughRoom
    }

    private func removeSurface() {
        photos?.cancelAll()
        photos = nil
        map?.delegate = nil
        map?.removeAnnotations(annotations)
        if let map = map { map.removeOverlays(map.overlays) }
        surface?.removeFromSuperview()
        surface = nil
        map = nil
        searchButton = nil
        zoomInButton = nil
        zoomOutButton = nil
        annotations = []
        overlayDays.removeAll()
        state = nil
        lastViewport = ""
        lastMapError = false
    }

    private func setCenter(_ coordinate: CLLocationCoordinate2D, span: Double) {
        map?.setRegion(MKCoordinateRegion(center: coordinate, span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)), animated: false)
    }

    private func fit(_ coordinates: [CLLocationCoordinate2D]) {
        guard let map = map, let first = coordinates.first else { return }
        let start = MKMapPoint(first)
        var rect = MKMapRect(x: start.x, y: start.y, width: 1, height: 1)
        for coordinate in coordinates.dropFirst() {
            var point = MKMapPoint(coordinate)
            // Keep groups crossing the date line together rather than framing the world.
            let world = MKMapRect.world.size.width
            if point.x - start.x > world / 2 { point.x -= world }
            if start.x - point.x > world / 2 { point.x += world }
            rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 1, height: 1))
        }
        if rect.size.width < 1000 && rect.size.height < 1000 { setCenter(first, span: 0.015) }
        else {
            let insets = map.layoutMargins
            let desired = UIEdgeInsets(top: max(76, insets.top + 24), left: max(44, insets.left + 24),
                                       bottom: max(56, insets.bottom + 24), right: max(64, insets.right + 24))
            map.setVisibleMapRect(rect, edgePadding: boundedInsets(desired, size: map.bounds.size), animated: false)
        }
    }

    @objc private func searchAreaTapped() {
        guard let state = state, state.searchEnabled, surface?.isHidden == false else { return }
        reportViewport()
        notifyListeners("searchArea", data: ["sessionId": state.sessionId])
    }

    @objc private func zoomInTapped() { zoom(by: 0.5) }
    @objc private func zoomOutTapped() { zoom(by: 2) }
    private func zoom(by factor: Double) {
        guard let map = map else { return }
        var region = map.region
        region.span.latitudeDelta = min(170, max(0.0005, region.span.latitudeDelta * factor))
        region.span.longitudeDelta = min(360, max(0.0005, region.span.longitudeDelta * factor))
        map.setRegion(region, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    public func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        if mapView === map && !applyingState { reportViewport() }
    }

    private func reportViewport() {
        guard let map = map, let state = state, surface?.isHidden == false else { return }
        let rect = map.visibleMapRect
        let northWest = MKMapPoint(x: rect.minX, y: rect.minY).coordinate
        let southEast = MKMapPoint(x: rect.maxX, y: rect.maxY).coordinate
        let center = map.centerCoordinate
        guard CLLocationCoordinate2DIsValid(center), rect.size.width > 0, map.bounds.width > 0 else { return }
        let zoom = max(0, min(22, log2(MKMapRect.world.size.width * Double(map.bounds.width) / (rect.size.width * 256))))
        let fullWorld = rect.size.width >= MKMapRect.world.size.width
        let values = [center.latitude, center.longitude, northWest.latitude, southEast.latitude, northWest.longitude, southEast.longitude, zoom]
        let key = values.map { String(format: "%.6f", $0) }.joined(separator: ":")
        guard key != lastViewport else { return }
        lastViewport = key
        notifyListeners("viewportChanged", data: [
            "sessionId": state.sessionId,
            "center": ["latitude": center.latitude, "longitude": normalizedLongitude(center.longitude)],
            "bounds": ["north": min(90, northWest.latitude), "south": max(-90, southEast.latitude),
                       "west": fullWorld ? -180 : normalizedLongitude(northWest.longitude),
                       "east": fullWorld ? 180 : normalizedLongitude(southEast.longitude)],
            "zoom": zoom
        ])
    }

    public func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard mapView === map else { return nil }
        if let cluster = annotation as? MKClusterAnnotation {
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: MKMapViewDefaultClusterAnnotationViewReuseIdentifier, for: cluster) as! MKMarkerAnnotationView
            view.markerTintColor = .systemBlue
            view.glyphText = String(cluster.memberAnnotations.count)
            view.glyphTintColor = .white
            view.canShowCallout = false
            view.accessibilityLabel = (state?.labels["cluster"] ?? "{count}").replacingOccurrences(of: "{count}", with: String(cluster.memberAnnotations.count))
            view.accessibilityTraits = .button
            return view
        }
        guard let point = annotation as? JourneyMapAnnotation else { return nil }
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: "journey-place", for: point) as! JourneyPhotoAnnotationView
        configure(view, for: point)
        if let url = point.point.imageUrl { photos?.request(url) }
        return view
    }

    private func configure(_ view: JourneyPhotoAnnotationView, for point: JourneyMapAnnotation) {
        let selected = point.point.id == state?.selectedPlaceId
        view.configure(point.point, selected: selected, image: photos?.image(for: point.point.imageUrl))
        view.clusteringIdentifier = point.point.kind == "stop" || selected ? nil : "journey-discovery"
        view.displayPriority = point.point.kind == "stop" || selected ? .required : .defaultHigh
        view.canShowCallout = false
        view.accessibilityLabel = point.point.label
        view.accessibilityTraits = selected ? [.button, .selected] : .button
    }

    public func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        guard mapView === map, !applyingState, surface?.isHidden == false, let state = state else { return }
        if let cluster = view.annotation as? MKClusterAnnotation {
            mapView.deselectAnnotation(cluster, animated: false)
            fit(cluster.memberAnnotations.map { $0.coordinate })
            return
        }
        guard let annotation = view.annotation as? JourneyMapAnnotation else { return }
        notifyListeners("placeSelected", data: ["sessionId": state.sessionId, "id": annotation.point.id, "kind": annotation.point.kind])
    }

    public func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let line = overlay as? MKPolyline, let day = overlayDays[ObjectIdentifier(line)] else { return MKOverlayRenderer(overlay: overlay) }
        let renderer = MKPolylineRenderer(polyline: line)
        renderer.strokeColor = dayColor(day)
        renderer.lineWidth = 5
        renderer.lineCap = .round
        renderer.lineJoin = .round
        return renderer
    }

    public func mapViewDidFailLoadingMap(_ mapView: MKMapView, withError error: Error) {
        guard mapView === map, let state = state, !lastMapError else { return }
        lastMapError = true
        notifyListeners("mapError", data: ["sessionId": state.sessionId, "code": "map_loading_failed"])
        // Reveal the web retry immediately, even if a JS bridge call is stalled.
        removeSurface()
    }

    public func mapViewDidFinishLoadingMap(_ mapView: MKMapView) {
        if mapView === map { lastMapError = false }
    }
}

private final class JourneyPhotoAnnotationView: MKAnnotationView {
    private let photo = UIImageView()
    private let symbol = UIImageView(image: UIImage(systemName: "mappin"))
    private let number = UILabel()
    private var boundURL: String?
    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        setup()
    }
    required init?(coder: NSCoder) { super.init(coder: coder); setup() }
    private func setup() {
        frame = CGRect(x: 0, y: 0, width: 56, height: 60)
        photo.frame = CGRect(x: 4, y: 4, width: 48, height: 48)
        photo.layer.cornerRadius = 24
        photo.layer.borderWidth = 3
        photo.clipsToBounds = true
        photo.contentMode = .scaleAspectFill
        symbol.frame = CGRect(x: 18, y: 16, width: 20, height: 24)
        symbol.contentMode = .scaleAspectFit
        symbol.tintColor = .white
        number.frame = CGRect(x: 33, y: 36, width: 22, height: 22)
        number.layer.cornerRadius = 11
        number.layer.borderColor = UIColor.white.cgColor
        number.layer.borderWidth = 2
        number.clipsToBounds = true
        number.font = .systemFont(ofSize: 11, weight: .bold)
        number.textColor = .white
        number.textAlignment = .center
        addSubview(photo); addSubview(symbol); addSubview(number)
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.22
        layer.shadowRadius = 4
        layer.shadowOffset = CGSize(width: 0, height: 2)
        layer.shadowPath = UIBezierPath(ovalIn: photo.frame).cgPath
    }
    func configure(_ point: JourneyMapPoint, selected: Bool, image: UIImage?) {
        boundURL = point.imageUrl?.absoluteString
        photo.image = image
        photo.backgroundColor = point.kind == "stop" ? dayColor(point.day) : .systemIndigo
        photo.layer.borderColor = (selected ? UIColor.systemYellow : UIColor.white).cgColor
        symbol.isHidden = image != nil
        number.text = String(point.order)
        number.backgroundColor = dayColor(point.day)
        number.isHidden = point.kind != "stop"
    }
    func applyImage(_ image: UIImage, url: String) {
        guard boundURL == url else { return }
        photo.image = image
        symbol.isHidden = true
    }
    override func prepareForReuse() {
        super.prepareForReuse()
        boundURL = nil; photo.image = nil; symbol.isHidden = false; number.isHidden = true
    }
}

/// HTML controls remain both visible and tappable through these explicit holes.
/// The mask is applied to the entire native subtree, not only the map background.
private final class JourneyMapSurface: UIView {
    private var holes: [UIBezierPath] = []
    func setOcclusions(_ paths: [UIBezierPath]) {
        holes = paths
        let overlap = paths.indices.contains { index in
            paths.indices.contains { other in other > index && paths[index].bounds.intersects(paths[other].bounds) }
        }
        if overlap && !bounds.isEmpty {
            // An even-odd path alone would re-paint intersections of two holes.
            // Clear their union when floating controls overlap during animation.
            let image = UIGraphicsImageRenderer(size: bounds.size).image { context in
                UIColor.white.setFill()
                context.fill(bounds)
                context.cgContext.setBlendMode(.clear)
                paths.forEach { $0.fill() }
            }
            let mask = CALayer()
            mask.frame = bounds
            mask.contents = image.cgImage
            layer.mask = mask
            return
        }
        let path = UIBezierPath(rect: bounds)
        paths.forEach { path.append($0) }
        let mask = CAShapeLayer()
        mask.frame = bounds
        mask.path = path.cgPath
        mask.fillRule = .evenOdd
        layer.mask = mask
    }
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        return super.point(inside: point, with: event) && !holes.contains { $0.contains(point) }
    }
}

private func boundedInsets(_ insets: UIEdgeInsets, size: CGSize) -> UIEdgeInsets {
    let horizontal = min(1, max(0, size.width - 40) / max(1, insets.left + insets.right))
    let vertical = min(1, max(0, size.height - 40) / max(1, insets.top + insets.bottom))
    return UIEdgeInsets(top: insets.top * vertical, left: insets.left * horizontal,
                        bottom: insets.bottom * vertical, right: insets.right * horizontal)
}

private func dayColor(_ day: Int) -> UIColor {
    let colors: [UInt32] = [0x175fe6, 0xb6419b, 0x008271, 0xb86100, 0x744ac2, 0xb73d42, 0x1276a1]
    let rgb = colors[(max(1, day) - 1) % colors.count]
    return UIColor(red: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
}

private func normalizedLongitude(_ value: Double) -> Double {
    let wrapped = (value + 180).truncatingRemainder(dividingBy: 360)
    return (wrapped < 0 ? wrapped + 360 : wrapped) - 180
}

private final class JourneyMapAnnotation: NSObject, MKAnnotation {
    let point: JourneyMapPoint
    @objc dynamic var coordinate: CLLocationCoordinate2D
    var title: String? { point.name }
    init(_ point: JourneyMapPoint) { self.point = point; coordinate = point.coordinate; super.init() }
}

// Strict, bounded bridge parsing. JSON booleans/strings cannot become coordinates.
private func mapNumber(_ value: Any?) -> Double? {
    guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue.isFinite else { return nil }
    return value.doubleValue
}
private func mapInteger(_ value: Any?, minimum: Int, maximum: Int) -> Int? {
    guard let value = mapNumber(value), value.rounded() == value, value >= Double(minimum), value <= Double(maximum) else { return nil }
    return Int(value)
}
private func mapText(_ value: Any?, limit: Int, empty: Bool = false) -> String? {
    guard let value = value as? String, value.utf16.count <= limit, empty || !value.isEmpty,
          !value.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }) else { return nil }
    return value
}
private func mapCoordinate(_ object: [String: Any]?) -> CLLocationCoordinate2D? {
    guard let object = object, let latitude = mapNumber(object["latitude"]), let longitude = mapNumber(object["longitude"]),
          abs(latitude) <= 85.051129, abs(longitude) <= 180 else { return nil }
    return CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
}
private struct JourneyMapFrame {
    let x: Double, y: Double, width: Double, height: Double, viewportWidth: Double
    init?(_ object: [String: Any]?) {
        guard let object = object, let x = mapNumber(object["x"]), let y = mapNumber(object["y"]),
              let width = mapNumber(object["width"]), let height = mapNumber(object["height"]), let viewport = mapNumber(object["viewportWidth"]),
              abs(x) <= 20000, abs(y) <= 20000, width >= 0, width <= 20000, height >= 0, height <= 20000,
              viewport >= 80, viewport <= 10000 else { return nil }
        self.x = x; self.y = y; self.width = width; self.height = height; viewportWidth = viewport
    }
}
private struct JourneyMapOcclusion {
    let x: Double, y: Double, width: Double, height: Double, radius: Double
    init?(_ object: [String: Any]) {
        guard let x = mapNumber(object["x"]), let y = mapNumber(object["y"]), let width = mapNumber(object["width"]),
              let height = mapNumber(object["height"]), abs(x) <= 20000, abs(y) <= 20000,
              width >= 0, width <= 20000, height >= 0, height <= 20000 else { return nil }
        let radius = object["radius"] == nil ? 0 : mapNumber(object["radius"])
        guard let radius = radius, radius >= 0, radius <= 300 else { return nil }
        self.x = x; self.y = y; self.width = width; self.height = height; self.radius = radius
    }
}
private struct JourneyMapInsets {
    let top: Double, right: Double, bottom: Double, left: Double
    init?(_ object: [String: Any]) {
        guard let top = mapNumber(object["top"]), let right = mapNumber(object["right"]), let bottom = mapNumber(object["bottom"]),
              let left = mapNumber(object["left"]), [top, right, bottom, left].allSatisfy({ $0 >= 0 && $0 <= 1000 }) else { return nil }
        self.top = top; self.right = right; self.bottom = bottom; self.left = left
    }
    func scaled(_ scale: CGFloat) -> UIEdgeInsets {
        UIEdgeInsets(top: CGFloat(top) * scale, left: CGFloat(left) * scale, bottom: CGFloat(bottom) * scale, right: CGFloat(right) * scale)
    }
}
private struct JourneyMapPoint {
    let id: String, name: String, label: String, kind: String
    let coordinate: CLLocationCoordinate2D
    let day: Int, order: Int
    let imageUrl: URL?
    init?(_ object: [String: Any], kind: String) {
        guard let id = mapText(object["id"], limit: 200), let name = mapText(object["name"], limit: 300, empty: true),
              let coordinate = mapCoordinate(object) else { return nil }
        let day = kind == "stop" ? mapInteger(object["day"], minimum: 1, maximum: 14) : 1
        let order = kind == "stop" ? mapInteger(object["order"], minimum: 1, maximum: 120) : 1
        guard let day = day, let order = order else { return nil }
        let label = object["label"] == nil ? name : mapText(object["label"], limit: 500, empty: true)
        guard let label = label else { return nil }
        self.id = id; self.name = name; self.label = label; self.kind = kind
        self.coordinate = coordinate; self.day = day; self.order = order
        imageUrl = journeyMapPhotoURL(object["imageUrl"])
    }
    var cameraKey: String { "\(id)|\(day)|\(coordinate.latitude)|\(coordinate.longitude)" }
    var key: String { "\(cameraKey)|\(order)|\(name)|\(label)|\(kind)|\(imageUrl?.absoluteString ?? "")" }
}
private struct JourneyMapRoute {
    let id: String, day: Int, coordinates: [CLLocationCoordinate2D]
    init?(_ object: [String: Any]) {
        guard let id = mapText(object["id"], limit: 200), let day = mapInteger(object["day"], minimum: 1, maximum: 14),
              let pairs = object["coordinates"] as? [[Any]], pairs.count >= 2, pairs.count <= 20000 else { return nil }
        var result: [CLLocationCoordinate2D] = []
        for pair in pairs {
            guard pair.count == 2, let coordinate = mapCoordinate(["latitude": pair[0], "longitude": pair[1]]) else { return nil }
            result.append(coordinate)
        }
        self.id = id; self.day = day; coordinates = result
    }
    var key: String { "\(id)|\(day)|" + coordinates.map { "\($0.latitude),\($0.longitude)" }.joined(separator: ";") }
}
private struct JourneyMapState {
    let sessionId: String, ownerId: String, revision: Int, generation: Int
    let frame: JourneyMapFrame, center: CLLocationCoordinate2D
    let stops: [JourneyMapPoint], discovered: [JourneyMapPoint], routes: [JourneyMapRoute]
    let activeDay: Int?, selectedPlaceId: String?, dark: Bool, labels: [String: String], searchEnabled: Bool, showSearchArea: Bool
    let occlusions: [JourneyMapOcclusion], insets: JourneyMapInsets
    init?(_ object: [String: Any]) {
        guard let session = mapText(object["sessionId"], limit: 200), let owner = mapText(object["ownerId"], limit: 200),
              let revision = mapInteger(object["revision"], minimum: 0, maximum: 9007199254740991),
              let generation = mapInteger(object["generation"], minimum: 0, maximum: 9007199254740991),
              let frame = JourneyMapFrame(object["frame"] as? [String: Any]), let center = mapCoordinate(object["center"] as? [String: Any]),
              let stopRows = object["stops"] as? [[String: Any]], stopRows.count <= 120,
              let discoveredRows = object["discoveredPlaces"] as? [[String: Any]], discoveredRows.count <= 750,
              let routeRows = object["routes"] as? [[String: Any]], routeRows.count <= 120,
              let theme = object["theme"] as? String, ["light", "dark"].contains(theme),
              let labelRows = object["labels"] as? [String: Any] else { return nil }
        let holeRows = object["occlusions"] == nil ? [] : object["occlusions"] as? [[String: Any]]
        guard let holeRows = holeRows, holeRows.count <= 12 else { return nil }
        let holes = holeRows.compactMap { JourneyMapOcclusion($0) }
        guard holes.count == holeRows.count else { return nil }
        let insetRows = object["contentInsets"] == nil ? ["top": 0, "left": 0, "bottom": 0, "right": 0] : object["contentInsets"] as? [String: Any]
        guard let insetRows = insetRows, let insets = JourneyMapInsets(insetRows) else { return nil }
        let stops = stopRows.compactMap { JourneyMapPoint($0, kind: "stop") }
        let discovered = discoveredRows.compactMap { JourneyMapPoint($0, kind: "discovered") }
        let routes = routeRows.compactMap { JourneyMapRoute($0) }
        guard stops.count == stopRows.count, discovered.count == discoveredRows.count, routes.count == routeRows.count,
              Set(stops.map { $0.id }).count == stops.count, Set(discovered.map { $0.id }).count == discovered.count,
              Set(routes.map { $0.id }).count == routes.count, routes.reduce(0, { $0 + $1.coordinates.count }) <= 280000 else { return nil }
        var labels: [String: String] = [:]
        for key in ["map", "searchArea", "zoomIn", "zoomOut", "cluster"] {
            guard let value = mapText(labelRows[key], limit: 200) else { return nil }
            labels[key] = value
        }
        var day: Int?
        if let value = object["activeDay"], !(value is NSNull) {
            guard let number = mapInteger(value, minimum: 1, maximum: 14) else { return nil }
            day = number
        }
        var selected: String?
        if let value = object["selectedPlaceId"], !(value is NSNull) {
            guard let id = mapText(value, limit: 200) else { return nil }
            selected = id
        }
        sessionId = session; ownerId = owner; self.revision = revision; self.generation = generation; self.frame = frame; self.center = center
        self.stops = stops; self.discovered = discovered; self.routes = routes; activeDay = day; selectedPlaceId = selected
        dark = theme == "dark"; self.labels = labels; searchEnabled = object["searchEnabled"] as? Bool ?? true
        showSearchArea = object["showSearchArea"] as? Bool ?? true; occlusions = holes; self.insets = insets
    }
    var visiblePoints: [JourneyMapPoint] {
        let stopIds = Set(stops.map { $0.id })
        return stops.filter { activeDay == nil || $0.day == activeDay } + discovered.filter { !stopIds.contains($0.id) }
    }
    var visibleRoutes: [JourneyMapRoute] { routes.filter { activeDay == nil || $0.day == activeDay } }
    var pointsKey: String { visiblePoints.map { $0.key }.joined(separator: "\n") }
    var routesKey: String { visibleRoutes.map { $0.key }.joined(separator: "\n") }
    var fitKey: String { "\(activeDay ?? 0)|" + stops.filter { activeDay == nil || $0.day == activeDay }.map { $0.cameraKey }.joined(separator: "\n") }
}
