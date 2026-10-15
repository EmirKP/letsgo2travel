import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// These are source/integration contract checks. An Xcode build and device run
// are still required to validate UIKit layout and MapKit runtime behavior.
const native = readFileSync('ios/App/App/AppleJourneyMapPlugin.swift', 'utf8');
const photos = readFileSync('ios/App/App/JourneyMapPhotoLoader.swift', 'utf8');
const controller = readFileSync('ios/App/App/MainViewController.swift', 'utf8');
const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const packageFile = readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8');

test('Apple map bridge is registered on the actual Capacitor controller and included in the iOS app build', () => {
  assert.match(native, /import MapKit/);
  assert.match(native, /jsName = "AppleJourneyMap"/);
  for (const method of ['show', 'update', 'hide']) {
    assert.match(native, new RegExp(`CAPPluginMethod\\(name: "${method}", returnType: CAPPluginReturnPromise\\)`));
  }
  assert.match(controller, /private let journeyMap = AppleJourneyMapPlugin\(\)/);
  assert.match(controller, /registerPluginInstance\(journeyMap\)/);
  const buildRef = project.match(/([A-F\d]{24}) \/\* AppleJourneyMapPlugin\.swift in Sources \*\/ = \{isa = PBXBuildFile; fileRef = ([A-F\d]{24})/);
  assert.ok(buildRef, 'Plugin needs an app Sources build entry');
  assert.match(project.split('/* Begin PBXSourcesBuildPhase section */')[1].split('/* End PBXSourcesBuildPhase section */')[0], new RegExp(buildRef[1]));
  assert.match(project.split('/* Begin PBXGroup section */')[1].split('/* End PBXGroup section */')[0], new RegExp(buildRef[2]));
  assert.match(packageFile, /platforms: \[\.iOS\(\.v15\)\]/);
});

test('Native owner/session/revision fences cover stale updates and delayed old-session hides', () => {
  const update = native.split('@objc func update(')[1].split('@objc func hide(')[0];
  assert.match(update, /current\.sessionId == next\.sessionId, current\.ownerId == next\.ownerId/);
  assert.match(update, /next\.revision > current\.revision/);
  assert.match(update, /current\.generation == next\.generation/);
  assert.match(native, /!self\.retiredSessions\.contains\(next\.sessionId\), next\.generation >= self\.highestGeneration/);
  assert.match(update, /map_session_mismatch/);
  assert.ok(update.indexOf('next.revision > current.revision') < update.indexOf('self.apply(next)'));
  const hide = native.split('@objc func hide(')[1].split('private func createSurface(')[0];
  assert.match(hide, /state\?\.sessionId == session && self\.state\?\.ownerId == owner/);
  assert.match(hide, /if matches \{ self\.removeSurface\(\) \}/);
  for (const method of ['show', 'update', 'hide']) {
    assert.match(native.split(`@objc func ${method}(`)[1].slice(0, 100), /DispatchQueue\.main\.async/);
  }
});

test('Native map keeps HTML controls tappable and confines its drawing to the measured WebView rectangle', () => {
  assert.match(native, /requested\.intersection\(webView\.bounds\)/);
  assert.match(native, /webView\.convert\(visible, to: host\)/);
  assert.match(native, /mask\.fillRule = \.evenOdd/);
  assert.match(native, /override func point\(inside point: CGPoint, with event: UIEvent\?\)/);
  assert.match(native, /!holes\.contains \{ \$0\.contains\(point\) \}/);
  assert.match(native, /holeRows\.count <= 12/);
  assert.match(native, /height >= 205/);
});

test('Rendering uses only supplied provider geometry and never requests user location or records private payloads', () => {
  assert.match(native, /nativeMap\.mapType = \.mutedStandard/);
  assert.match(native, /nativeMap\.showsUserLocation = false/);
  assert.match(native, /for route in next\.visibleRoutes/);
  assert.match(native, /var coordinates = route\.coordinates/);
  assert.match(native, /MKPolyline\(coordinates: &coordinates, count: coordinates\.count\)/);
  assert.doesNotMatch(native, /CLLocationManager|requestWhenInUseAuthorization|requestAlwaysAuthorization|NSLog\(|print\(|Logger\(/);
  assert.match(native, /clusteringIdentifier = point\.point\.kind == "stop" \|\| selected \? nil : "journey-discovery"/);
  assert.match(native, /number\.text = String\(point\.order\)/);
  assert.match(native, /number\.isHidden = point\.kind != "stop"/);
});

test('Bridge rejects coerced and oversized data; callbacks retain the originating map session', () => {
  assert.match(native, /CFGetTypeID\(value\) != CFBooleanGetTypeID\(\)/);
  assert.match(native, /value\.doubleValue\.isFinite/);
  assert.match(native, /stopRows\.count <= 120/);
  assert.match(native, /discoveredRows\.count <= 750/);
  // A day contains separate confirmed walking legs, not one synthetic joined path.
  // Accept all 120-stop plans and the schema's 20k geometry budget for each of 14 days.
  assert.match(native, /routeRows\.count <= 120/);
  assert.match(native, /pairs\.count <= 20000/);
  assert.match(native, /coordinates\.count \}\) <= 280000/);
  for (const event of ['searchArea', 'placeSelected', 'mapError']) {
    assert.match(native, new RegExp(`notifyListeners\\("${event}", data: \\["sessionId": state.sessionId`));
  }
  assert.match(native, /notifyListeners\("viewportChanged", data: \[\s*"sessionId": state\.sessionId/);
});

test('Native photo circles only load bounded verified Commons rasters and preserve stop badges through image reuse', () => {
  assert.match(project, /JourneyMapPhotoLoader\.swift in Sources/);
  assert.match(photos, /\["upload\.wikimedia\.org", "thumb\.wikimedia\.org"\]\.contains\(parts\.host/);
  assert.match(photos, /parts\.host != "thumb\.wikimedia\.org" \|\| thumb/);
  assert.match(photos, /parts\.query == nil, parts\.fragment == nil/);
  assert.match(photos, /width <= 640/);
  assert.match(photos, /URLSessionConfiguration\.ephemeral/);
  assert.match(photos, /pending\.count < 96/);
  assert.match(photos, /tasks\.count < 4/);
  assert.match(photos, /cache\.countLimit = 64/);
  assert.match(photos, /download\.bytes\.count \+ data\.count <= byteLimit/);
  assert.match(photos, /kCGImageSourceThumbnailMaxPixelSize: 160/);
  assert.match(photos, /willPerformHTTPRedirection[\s\S]*completionHandler\(nil\)/);
  assert.match(native, /photos\?\.cancelAll\(\)/);
  assert.match(native, /guard boundURL == url else \{ return \}/);
  assert.match(native, /boundURL = nil; photo\.image = nil/);
  assert.match(native, /symbol\.isHidden = image != nil/);
});

test('Selection updates only affected native views and explicitly clears a removed selection', () => {
  const selection = native.split('} else if previous?.selectedPlaceId != next.selectedPlaceId {')[1].split('if previous?.routesKey')[0];
  assert.ok(selection);
  assert.match(selection, /annotation\.point\.id == previous\?\.selectedPlaceId \|\| annotation\.point\.id == next\.selectedPlaceId/);
  assert.match(selection, /configure\(view, for: annotation\)/);
  assert.doesNotMatch(selection, /removeAnnotations\(annotations\)|addAnnotations\(annotations\)|JourneyMapAnnotation\(/);
  assert.match(selection, /map\.removeAnnotation\(annotation\)[\s\S]*map\.addAnnotation\(annotation\)/);
  assert.match(native, /for selected in map\.selectedAnnotations \{ map\.deselectAnnotation\(selected, animated: false\) \}/);
});

test('Native lifecycle hides the map behind system screens and tears down delegates/content on navigation', () => {
  assert.match(controller, /viewWillDisappear[\s\S]*journeyMap\.setControllerSuspended\(true\)/);
  assert.match(controller, /viewDidAppear[\s\S]*journeyMap\.setControllerSuspended\(false\)/);
  assert.match(native, /willResignActiveNotification[\s\S]*surface\?\.isHidden = true/);
  assert.match(native, /shouldOverrideLoad[\s\S]*targetFrame\?\.isMainFrame == true[\s\S]*removeSurface\(\)/);
  const teardown = native.split('private func removeSurface()')[1].split('private func setCenter(')[0];
  for (const required of ['map?.delegate = nil', 'surface?.removeFromSuperview()', 'state = nil', 'annotations = []', 'overlayDays.removeAll()']) {
    assert.ok(teardown.includes(required), `Teardown missing ${required}`);
  }
});
