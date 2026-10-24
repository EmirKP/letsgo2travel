import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const selector = require('../mobile/src/data/iso3166.json');
const core = require('../lib/travel-assistant/world-country-core.json');
const electricity = require('../lib/travel-assistant/world-country-electricity.json');
const communication = require('../lib/travel-assistant/world-country-connectivity.json');
const emergencyBase = require('../lib/travel-assistant/world-country-emergency.json');
const emergencyExtra = require('../lib/travel-assistant/world-country-emergency-extra.json');
const { countryPracticalInfo, countryTimeDifference } = require('../lib/travel-assistant/country-practical.ts');
const { EMERGENCY_CONTACTS, emergencyContacts, emergencyGuidance, dialUrl } = require('../lib/travel-assistant/emergency.ts');

const codes = selector.map(row => row.alpha2).sort();
const checkDate = Date.parse('2026-10-21T23:59:59Z');
const fixedNow = Date.parse('2026-10-21T12:00:00Z');
const sourceRecord = (source, label) => {
  assert.ok(source && typeof source.label === 'string' && source.label.trim(), label);
  assert.equal(new URL(source.url).protocol, 'https:', label);
  assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/, label);
  assert.ok(Number.isFinite(Date.parse(source.checkedAt)) && Date.parse(source.checkedAt) <= checkDate, `${label}: genuine non-future source date`);
};
const localizedNote = (note, label) => {
  for (const locale of ['tr', 'en', 'sq']) assert.ok(typeof note?.[locale] === 'string' && note[locale].trim(), `${label}:${locale}`);
};

test('World reference datasets have exactly one profile for every selector country or territory, including Kosovo', () => {
  assert.equal(codes.length, 250); assert.equal(new Set(codes).size, 250); assert.ok(codes.includes('XK'));
  assert.deepEqual(Object.keys(core.countries).sort(), codes);
  assert.deepEqual(Object.keys(electricity).sort(), codes);
  assert.deepEqual(Object.keys(communication).sort(), codes);
  for (const code of codes) {
    const info = countryPracticalInfo(code);
    assert.equal(info.countryCode, code);
    assert.ok(info.context, `${code} has an explicit coverage context, even when a fact is unavailable`);
  }
});

test('Every global fact references a dated source; country metadata cannot become a fabricated official review', () => {
  for (const [code, profile] of Object.entries(core.countries)) {
    for (const field of ['currency', 'driving', 'time']) {
      assert.ok(profile[field].sourceIds.length, `${code}/${field}`);
      for (const id of profile[field].sourceIds) sourceRecord(core.sources[id], `${code}/${field}/${id}`);
    }
    if (profile.currency.status !== 'known') localizedNote(profile.currency.note, `${code}:currency context`);
    if (profile.driving.status !== 'known') localizedNote(profile.driving.note, `${code}:driving context`);
    if (profile.time.status !== 'known') localizedNote(profile.time.note, `${code}:time context`);
    for (const evidence of electricity[code].sources) sourceRecord(evidence, `${code}/electricity`);
    for (const evidence of communication[code].sources) sourceRecord(evidence, `${code}/communication`);
    for (const evidence of communication[code].operatorSources) sourceRecord(evidence, `${code}/operator`);
  }
  assert.equal(core.sources.rest.nature, 'published-reference-dataset');
  assert.equal(core.sources.iana.nature, 'primary-timezone-register');
  assert.equal(core.sources.six.nature, 'primary-currency-register');
});

test('Electricity coverage contains actual source values and preserves unresolved remote-territory cases', () => {
  const known = Object.entries(electricity).filter(([, entry]) => entry.status === 'available');
  assert.ok(known.length >= 243, 'At least the reviewed 243 electrical profiles remain covered');
  for (const [code, entry] of Object.entries(electricity)) {
    if (entry.status === 'available') {
      assert.ok(entry.types.length && entry.voltage.length && entry.frequency.length, code);
      assert.ok(entry.types.every(type => /^[A-O]$/.test(type)), code);
      assert.ok(entry.voltage.every(value => Number.isFinite(value) && value >= 100 && value <= 250), code);
      assert.ok(entry.frequency.every(value => value === 50 || value === 60), code);
      assert.ok(entry.sources.length, code);
    } else {
      assert.deepEqual(entry.types, [], code); assert.deepEqual(entry.voltage, [], code); assert.deepEqual(entry.frequency, [], code);
      localizedNote(entry.note, `${code}: unresolved power standards`);
      assert.equal(countryPracticalInfo(code).plugs, null, `${code}: regional visitor guidance cannot turn unknown voltage into a usable electrical value`);
    }
  }
  assert.deepEqual(electricity.BR.voltage, [127, 220], 'Brazilian regional voltage differences must not collapse to one number');
});

test('Newly covered popular destinations expose country-specific useful facts and sources through the existing API', () => {
  const expected = {
    ES: { currency: 'EUR', types: ['C', 'F'], voltage: 230, frequency: 50, side: 'right', zone: 'Europe/Madrid', operator: 'Movistar' },
    CA: { currency: 'CAD', types: ['A', 'B'], voltage: 120, frequency: 60, side: 'right', zone: 'America/Toronto', operator: 'Rogers' },
    ID: { currency: 'IDR', types: ['C', 'F'], voltage: 230, frequency: 50, side: 'left', zone: 'Asia/Jakarta', operator: 'Telkomsel' },
  };
  for (const [code, reference] of Object.entries(expected)) {
    const info = countryPracticalInfo(code);
    assert.equal(info.currency.code, reference.currency, code);
    assert.ok(info.currency.codes.includes(reference.currency), code);
    assert.deepEqual(info.plugs.types, reference.types, code);
    assert.ok(info.plugs.voltages.includes(reference.voltage), code);
    assert.deepEqual(info.plugs.frequency, [reference.frequency], code);
    assert.equal(info.driving.side, reference.side, code);
    assert.equal(info.time.zone, reference.zone, code);
    assert.ok(info.currency.sources.length && info.plugs.sources.length && info.driving.sources.length, code);
    assert.equal(info.internet.kind, 'operator-options', code);
    assert.ok(info.internet.operators.some(operator => operator.name === reference.operator), code);
  }
});

test('Current currency identities and countries with several registered currencies survive integration', () => {
  for (const [country, currency] of Object.entries({ BG: 'EUR', CW: 'XCG', SX: 'XCG', ZW: 'ZWG' })) {
    const info = countryPracticalInfo(country);
    assert.equal(info.currency.code, currency, country);
    assert.ok(info.currency.codes.includes(currency), country);
  }
  for (const [country, currencies] of Object.entries({ BT: ['BTN', 'INR'], PA: ['PAB', 'USD'], LS: ['LSL', 'ZAR'] })) {
    const info = countryPracticalInfo(country);
    assert.deepEqual(new Set(info.currency.codes), new Set(currencies), `${country}: preserve each registered currency instead of silently discarding alternatives`);
  }
  assert.equal(countryPracticalInfo('AQ').currency, null, 'No universal Antarctic currency must be fabricated');
});

test('Representative clocks retain multi-zone information, DST/offset rules and honest unsupported-runtime behavior', () => {
  for (const code of codes) {
    const info = countryPracticalInfo(code);
    if (!info.time) { assert.equal(countryTimeDifference(info, 'UTC', fixedNow), null, code); continue; }
    assert.ok(info.time.referenceCity.en && info.time.zones.includes(info.time.zone), code);
    const clocks = new Set(info.time.zones);
    assert.equal(clocks.size, info.time.zones.length, code);
    let runtimeSupports = false;
    try { new Intl.DateTimeFormat('en-GB', { timeZone: info.time.zone }).format(fixedNow); runtimeSupports = true; } catch { /* Old runtimes may not know a new IANA identifier. */ }
    const difference = countryTimeDifference(info, 'UTC', fixedNow);
    if (runtimeSupports) assert.ok(difference && Number.isFinite(difference.minutes), code);
    else assert.equal(difference, null, `${code}: an unsupported time zone must not become fabricated UTC`);
  }
  for (const code of ['US', 'CA', 'ID', 'CN', 'ES']) {
    const time = countryPracticalInfo(code).time;
    assert.equal(time.multipleZones, true, code);
    assert.ok(time.zones.length > 1, code);
  }
  const winter = countryTimeDifference(countryPracticalInfo('ES'), 'Europe/Istanbul', Date.parse('2026-01-15T12:00:00Z'));
  const summer = countryTimeDifference(countryPracticalInfo('ES'), 'Europe/Istanbul', Date.parse('2026-07-15T12:00:00Z'));
  assert.equal(winter.minutes, -120); assert.equal(summer.minutes, -60);
  assert.equal(countryTimeDifference(countryPracticalInfo('US'), 'invalid/device-zone', fixedNow), null);
  assert.equal(countryPracticalInfo('AQ').time, null, 'One station clock is not a universal Antarctic time');
});

test('Worldwide communication records keep telephone plans separate from named mobile-provider examples', () => {
  for (const code of codes) {
    const item = communication[code];
    const integrated = countryPracticalInfo(code).communication;
    assert.ok(integrated, `${code}: communication details must remain reachable through the UI-facing API`);
    assert.deepEqual(integrated.callingCodes, item.callingCodes, code);
    assert.equal(integrated.status, item.status, code);
    assert.deepEqual(integrated.note, item.note, code);
    assert.ok(Array.isArray(item.callingCodes) && Array.isArray(item.operators), code);
    assert.ok(item.callingCodes.every(number => /^\+[1-9]\d*$/.test(number)), code);
    if (item.status !== 'numbering-plan') localizedNote(item.note, code);
    for (const operator of item.operators) {
      assert.ok(operator.name.trim(), code); assert.equal(new URL(operator.url).protocol, 'https:', code);
      assert.ok(item.operatorSources.length, code);
    }
    if (!item.operators.length && !['TR', 'GB', 'DE', 'FR', 'IT', 'AL', 'XK', 'GE', 'AZ', 'BA', 'RS', 'JP', 'US', 'AE', 'TH', 'GR'].includes(code)) {
      assert.notEqual(countryPracticalInfo(code).internet.kind, 'operator-options', `${code}: a telephone plan must not masquerade as a verified operator list`);
    }
  }
  assert.deepEqual(communication.US.callingCodes, ['+1']); assert.deepEqual(communication.CA.callingCodes, ['+1']);
  assert.deepEqual(communication.UM.callingCodes, [], 'Discard the legacy erroneous +268 code for US outlying islands');
  assert.equal(communication.AQ.status, 'site-specific'); assert.deepEqual(communication.AQ.operators, []);
  assert.ok(!communication.VA.callingCodes.includes('+379'), 'Do not present the reserved Vatican code as an active visitor calling code');
});

test('Existing reviewed operator sets remain intact while new destinations gain sourced choices', () => {
  const expected = {
    TR: ['Turkcell', 'Vodafone', 'Türk Telekom'], GB: ['EE', 'O2', 'Vodafone', 'Three'],
    DE: ['Telekom', 'Vodafone', 'O2'], FR: ['Orange', 'SFR', 'Bouygues Telecom'],
    GE: ['Magti', 'Silknet', 'Cellfie'], JP: ['NTT DOCOMO', 'au', 'SoftBank'],
  };
  for (const [country, operators] of Object.entries(expected)) {
    const internet = countryPracticalInfo(country).internet;
    assert.equal(internet.kind, 'operator-options'); assert.deepEqual(internet.operators.map(operator => operator.name), operators, country);
    assert.ok(internet.sources.every(source => source.checkedAt === '2026-10-20'), `${country}: do not invent a new review of preserved records`);
  }
  assert.ok(Object.values(communication).filter(profile => profile.operators.length).length >= 35);
});

test('Emergency guidance covers all selector destinations with real service numbers or an explicit local assistance arrangement', () => {
  const merged = { ...emergencyBase.countries, ...emergencyExtra };
  assert.deepEqual(Object.keys(merged).sort(), codes);
  let numeric = 0, local = 0;
  for (const code of codes) {
    const record = merged[code];
    const guidance = emergencyGuidance(` ${code.toLowerCase()} `);
    const info = countryPracticalInfo(code);
    assert.deepEqual(guidance, record, `${code}: the UI-facing guidance preserves the reviewed record`);
    assert.equal(info.context.emergency.status, record.status, code);
    assert.deepEqual(info.context.emergency.note, record.note, code);
    assert.deepEqual(info.context.emergency.sources, record.sources, code);
    assert.ok(record.sources.length, `${code}: even local assistance advice identifies its source`);
    record.sources.forEach(source => sourceRecord(source, `${code}/emergency`));
    assert.deepEqual(info.emergency, emergencyContacts(code), code);
    if (record.status === 'available') {
      numeric++;
      assert.ok(record.contacts.length && info.emergency.length, `${code}: numeric coverage is backed by a contact`);
      for (const contact of [...record.contacts, ...info.emergency]) {
        assert.equal(contact.country, code);
        assert.ok(['general', 'police', 'ambulance', 'fire', 'coastguard', 'tourist-police', 'gendarmerie'].includes(contact.category), `${code}: qualified service category`);
        assert.match(contact.number, /^\+?\d{2,15}$/, `${code}: only a usable telephone number is numeric coverage`);
        assert.equal(dialUrl(contact.number), `tel:${contact.number}`, code);
        assert.equal(new URL(contact.sourceUrl).protocol, 'https:', code);
        assert.ok(Date.parse(contact.verifiedAt) <= checkDate && Date.parse(contact.reviewAfter) > fixedNow, `${code}: source date and review window are preserved`);
        if (contact.note) assert.ok(contact.note.tr && contact.note.en, `${code}: restrictions stay attached to their number`);
      }
    } else {
      local++;
      assert.equal(record.status, 'local-assistance', code);
      assert.deepEqual(record.contacts, [], code); assert.deepEqual(info.emergency, [], `${code}: do not borrow a neighbouring or administering country's number`);
      localizedNote(record.note, `${code}: local emergency arrangements`);
    }
  }
  assert.equal(numeric, 236, '236 destinations have independently sourced service-number records');
  assert.equal(local, 14, '14 destinations require explicit local or expedition arrangements, not invented universal numbers');
});

test('Emergency expansion preserves curated overrides and country-specific limits instead of promoting every number to general emergency', () => {
  for (const code of new Set(EMERGENCY_CONTACTS.map(contact => contact.country))) {
    const curated = EMERGENCY_CONTACTS.filter(contact => contact.country === code);
    assert.deepEqual(emergencyContacts(code), curated, `${code}: the original reviewed source takes precedence over the new worldwide fallback`);
    assert.deepEqual(countryPracticalInfo(code).emergency, curated, code);
    assert.ok(curated.every(contact => contact.verifiedAt === '2026-09-26'), `${code}: untouched records are not falsely re-dated`);
  }
  const malaysia = emergencyContacts('MY');
  assert.equal(malaysia.find(contact => contact.category === 'fire').number, '999', 'The reviewed Malaysian government override still wins over the older FCDO 994 entry');
  assert.ok(malaysia.every(contact => new URL(contact.sourceUrl).hostname === 'www.malaysia.gov.my'));

  const greenland = countryPracticalInfo('GL');
  assert.deepEqual(greenland.emergency.map(contact => [contact.category, contact.number]), [['police', '+299701448']]);
  assert.match(greenland.context.emergency.note.en, /Greenland Police/);
  assert.match(greenland.context.emergency.note.en, /medical help.*local health centre/);
  assert.match(greenland.context.emergency.note.en, /do not assume Denmark.*112/);

  const caribbean = countryPracticalInfo('BQ');
  assert.deepEqual(caribbean.emergency.map(contact => [contact.category, contact.number]), [['police', '911']]);
  assert.match(caribbean.context.emergency.note.en, /Ambulance numbers can differ by island/);
  assert.equal(caribbean.emergency.some(contact => contact.category === 'general' || contact.category === 'ambulance'), false);

  const svalbard = countryPracticalInfo('SJ');
  assert.deepEqual(svalbard.emergency.map(contact => [contact.category, contact.number]), [['police', '112']]);
  localizedNote(svalbard.emergency[0].note, 'Svalbard / Jan Mayen service limits');
  assert.match(svalbard.emergency[0].note.en, /Governor of Svalbard/);
  assert.match(svalbard.emergency[0].note.en, /Jan Mayen.*radio\/satellite plan/);
  assert.deepEqual(svalbard.context.emergency.note, svalbard.emergency[0].note);
});

test('Emergency guidance, contact notes and UI context are independent copies; invalid inputs stay empty', () => {
  const guidance = emergencyGuidance('SJ');
  const baseline = structuredClone(guidance);
  guidance.contacts[0].number = '000'; guidance.contacts[0].note.en = 'Wrong station';
  guidance.note.sq = 'Wrong restriction'; guidance.sources[0].label = 'Unreviewed source';
  guidance.contacts.push({ country: 'SJ', category: 'general', number: '123' });
  assert.deepEqual(emergencyGuidance('SJ'), baseline);

  const contacts = emergencyContacts('SJ'); contacts[0].note.en = 'Wrong scope';
  assert.deepEqual(emergencyContacts('SJ'), baseline.contacts);
  const info = countryPracticalInfo('GL');
  const expected = structuredClone(info.context.emergency);
  info.context.emergency.note.en = 'Wrong country';
  info.context.emergency.sources[0].checkedAt = '2099-01-01';
  assert.deepEqual(countryPracticalInfo('GL').context.emergency, expected);
  for (const code of ['ZZ', '', '__proto__', 'constructor', 'GL<script>', null, undefined, 42]) {
    assert.equal(emergencyGuidance(code), null, String(code));
    assert.deepEqual(emergencyContacts(code), [], String(code));
  }
});

test('Profile access is isolated: mutations of returned arrays do not rewrite global country records', () => {
  const before = countryPracticalInfo('ES');
  const baseline = { currencies: [...before.currency.codes], types: [...before.plugs.types], voltages: [...before.plugs.voltages], zones: [...before.time.zones] };
  const prefixBaseline = [...before.communication.callingCodes];
  before.currency.codes.push('XXX'); before.plugs.types.push('Z'); before.plugs.voltages.push(999); before.time.zones.push('invalid/zone');
  before.communication.callingCodes.push('+999');
  const after = countryPracticalInfo('ES');
  assert.deepEqual(after.currency.codes, baseline.currencies); assert.deepEqual(after.plugs.types, baseline.types);
  assert.deepEqual(after.plugs.voltages, baseline.voltages); assert.deepEqual(after.time.zones, baseline.zones);
  assert.deepEqual(after.communication.callingCodes, prefixBaseline);
});

test('Invalid codes, inherited object properties and arbitrary inputs remain empty rather than falling back to another country', () => {
  for (const code of ['ZZ', '', '__proto__', 'constructor', 'toString', 'TR<script>', null, undefined, 42]) {
    const info = countryPracticalInfo(code);
    for (const field of ['currency', 'plugs', 'driving', 'time']) assert.equal(info[field], null, `${String(code)}:${field}`);
    assert.deepEqual(info.emergency, [], String(code));
    assert.notEqual(info.internet.kind, 'operator-options', String(code));
    assert.equal(countryTimeDifference(info, 'Europe/Istanbul', fixedNow), null, String(code));
  }
  const normalized = countryPracticalInfo(' es ');
  assert.equal(normalized.countryCode, 'ES'); assert.equal(normalized.currency.code, 'EUR');
});
