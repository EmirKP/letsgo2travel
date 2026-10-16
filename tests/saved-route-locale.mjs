import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, moduleTypes: { '**': 'cjs' }, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { createMapJourney, addJourneyStop, mapJourneyToSavedRoute } = require('../mobile/src/lib/mapJourney.ts');
const { savedRouteDisplay } = require('../mobile/src/lib/savedRouteDisplay.ts');
const { localizeQuotedJourneyInterests, journeyInterestLabel } = require('../lib/travel-assistant/journey-plan-labels.ts');

test('saved map itinerary rebuilds day labels, duration and edited description for every locale without rewriting original data', () => {
  let journey = createMapJourney({ city: 'Kadıköy', center: { latitude: 40.99, longitude: 29.02 }, dayCount: 2, startDate: null });
  journey = addJourneyStop(journey, { id: 'node/1', name: 'Moda Sahili', category: 'attraction', latitude: 40.98, longitude: 29.02,
    hours: null, address: null, website: null, free: null, accessible: null, description: null, representedCountry: null,
    sourceUrl: 'https://www.openstreetmap.org/node/1', fetchedAt: journey.createdAt }, 1, { fixedTime: '14:00', note: 'Kişisel notum' });
  const saved = mapJourneyToSavedRoute(journey, 'tr');
  const original = JSON.stringify(saved);
  const en = savedRouteDisplay(saved.plan.routes[0], 'en');
  assert.equal(en.idealDuration, '2 days');
  assert.equal(en.why, 'Your editable daily map itinerary.');
  assert.equal(en.dailyPlan[0], 'Day 1: 14:00 Moda Sahili');
  assert.equal(en.dailyPlan[1], 'Day 2: Free time');
  assert.equal(en.name, 'Kadıköy');
  assert.equal(en.mapJourney, saved.plan.routes[0].mapJourney, 'Map reopen must retain original IDs, notes and geometry');
  const sq = savedRouteDisplay(saved.plan.routes[0], 'sq');
  assert.equal(sq.idealDuration, '2 ditë');
  assert.equal(sq.dailyPlan[1], 'Dita 2: Kohë e lirë');
  const tr = savedRouteDisplay(saved.plan.routes[0], 'tr');
  assert.equal(tr.idealDuration, '2 gün');
  assert.equal(tr.dailyPlan[0], '1. Gün: 14:00 Moda Sahili');
  assert.equal(JSON.stringify(saved), original);
});

test('legacy and invalid map records remain unchanged instead of fabricating replacement route facts', () => {
  const legacy = { name: 'Paris', why: 'Kültür gezisi', idealDuration: '3 gün', dailyPlan: ['Müze'], mapJourney: undefined };
  assert.equal(savedRouteDisplay(legacy, 'en'), legacy);
  const invalid = { ...legacy, mapJourney: { version: 99, dayCount: 200 } };
  assert.equal(savedRouteDisplay(invalid, 'en'), invalid);
});

test('old AI quoted interest keys become readable without altering unquoted words, names, schedule or saved text', () => {
  const original = "Valeria Coffee Dessert'te mola. Bu durak 'food' ve 'city' deneyiminizi zenginleştirecek. 12:48 · 60 dk";
  assert.equal(localizeQuotedJourneyInterests(original, 'tr'), "Valeria Coffee Dessert'te mola. Bu durak yeme içme ve şehir keşfi deneyiminizi zenginleştirecek. 12:48 · 60 dk");
  assert.equal(localizeQuotedJourneyInterests('Visit Food City and Sea World; city food nature. “Culture Club” at 14:00.', 'tr'), 'Visit Food City and Sea World; city food nature. “Culture Club” at 14:00.');
  assert.equal(localizeQuotedJourneyInterests('For "sea" and `adventure`.', 'en'), 'For seaside and adventure.');
  assert.equal(localizeQuotedJourneyInterests("Për 'food' dhe 'city'.", 'sq'), 'Për ushqimi dhe pijet dhe eksplorimi i qytetit.');
  assert.equal(journeyInterestLabel('shopping', 'tr'), 'alışveriş');
  assert.ok(original.includes("'food'"), 'Display cleanup must not overwrite user-owned saved prose');
});
