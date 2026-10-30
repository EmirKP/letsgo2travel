import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('Journey ActivityKit has distinct compiled attributes, plugin and widget without changing the flight activity lifecycle',()=>{
  const attributes=read('ios/App/FlightActivityWidget/FlightActivityAttributes.swift'),bridge=read('ios/App/App/FlightLiveActivityPlugin.swift'),controller=read('ios/App/App/MainViewController.swift'),widget=read('ios/App/FlightActivityWidget/FlightActivityWidget.swift'),project=read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(attributes,/struct FlightActivityAttributes: ActivityAttributes/);assert.match(attributes,/struct JourneyActivityAttributes: ActivityAttributes/);
  const journey=bridge.slice(bridge.indexOf('@objc(JourneyLiveActivityPlugin)'));
  assert.match(journey,/jsName = "JourneyLiveActivity"/);assert.doesNotMatch(journey,/Activity<FlightActivityAttributes>|endFlightActivity|providerStatus|pushType: \.token/);
  assert.match(journey,/Activity<JourneyActivityAttributes>\.activities/);assert.match(journey,/Activity\.request\(attributes: attributes, content: content, pushType: nil\)/);
  assert.match(journey,/staleDate: expiresAt/);assert.match(journey,/8 \* 3600/);assert.match(journey,/expiresAt > Date\(\)/);assert.match(journey,/dismissalPolicy: \.immediate/);assert.match(journey,/Task\.sleep/);
  assert.match(journey,/UserDefaults\.standard\.string\(forKey: self\.ownerKey\) == ownerId/);assert.match(journey,/history\[identity\] == session && !replacing/);
  assert.match(controller,/registerPluginInstance\(FlightLiveActivityPlugin\(\)\)/);assert.match(controller,/registerPluginInstance\(JourneyLiveActivityPlugin\(\)\)/);
  assert.match(widget,/FlightActivityWidget\(\); JourneyActivityWidget\(\)/);assert.match(widget,/ActivityConfiguration\(for: JourneyActivityAttributes\.self\)/);
  const journeyWidget=widget.slice(widget.indexOf('struct JourneyActivityWidget: Widget'));
  for(const surface of ['compactLeading','compactTrailing','minimal','DynamicIslandExpandedRegion'])assert.ok(journeyWidget.includes(surface),surface);
  assert.match(journeyWidget,/widgetURL\(URL\(string: context\.attributes\.deepLink\)\)/);assert.match(widget,/context\.isStale \|\| context\.state\.ended \|\| now >= context\.attributes\.expiresAt/);
  assert.equal((project.match(/FlightActivityAttributes.swift in Sources \*\/ =/g)||[]).length,2,'Existing attributes source remains compiled by app and extension');
  assert.doesNotMatch(journey,/latitude|longitude|CLLocationManager/);
});
test('The app guide is explicit, uses manual completion and presents an honest unsupported-platform state',()=>{
  const guide=read('mobile/src/components/JourneyLiveGuide.tsx'),today=read('mobile/src/components/TodayTripProgram.tsx');
  assert.match(guide,/Bugünkü geziyi başlat/);assert.match(guide,/completeJourneyStop\(ownerId,journey,day,stop.id/);assert.match(guide,/Gezi rehberini bitir/);
  assert.match(guide,/compatible iPhone with Live Activities enabled/);assert.match(guide,/your location is not tracked/);assert.doesNotMatch(guide,/geolocation|watchPosition|fake-island|setInterval/);
  assert.match(today,/JourneyLiveGuide journey=\{route.mapJourney\} day=\{routeDay\} ownerId=\{trip.userId\} tripId=\{trip.id\}/);
});
