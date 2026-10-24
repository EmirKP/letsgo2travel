import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
const { countryPracticalInfo, countryTimeDifference } = require('../lib/travel-assistant/country-practical.ts');
const { emergencyContacts } = require('../lib/travel-assistant/emergency.ts');
const { GUIDE_CARDS, GUIDE_VERSION } = require('../lib/travel-assistant/guides.ts');
const time = (country, device, instant) => countryTimeDifference(countryPracticalInfo(country), device, Date.parse(instant));

test('Unknown and unsupported practical facts stay unknown instead of borrowing a popular country profile', () => {
  for (const country of ['ZZ', '', '__proto__', 'constructor', 'TR<script>']) {
    const info = countryPracticalInfo(country);
    for (const field of ['currency', 'plugs', 'driving', 'time']) assert.equal(info[field], null, `${country}:${field}`);
    assert.deepEqual(info.emergency, []);
    assert.deepEqual(info.internet, { kind: 'device-operator-check' }, 'Internet remains a neutral preparation task');
    assert.equal(countryTimeDifference(info, 'Europe/Istanbul'), null);
  }
  const outsideCuratedSet = countryPracticalInfo('CA');
  assert.equal(outsideCuratedSet.currency.code, 'CAD', 'Existing country currency entries remain useful outside the 16 detailed profiles');
  assert.equal(outsideCuratedSet.currency.name.en, 'Canadian Dollar');
  assert.ok(outsideCuratedSet.currency.sources.some(source => new URL(source.url).hostname === 'www.six-group.com' && source.checkedAt === '2026-10-21'), 'Expanded currency identities cite the actual ISO currency register check');
  assert.deepEqual([outsideCuratedSet.plugs.types, outsideCuratedSet.plugs.voltage, outsideCuratedSet.plugs.frequency], [['A', 'B'], 120, [60]]);
  assert.equal(outsideCuratedSet.driving.side, 'right');
  assert.equal(outsideCuratedSet.time.zone, 'America/Toronto');
  assert.deepEqual(outsideCuratedSet.emergency, emergencyContacts('CA'), 'Expanded practical data does not rewrite the reviewed emergency catalogue');
  const bulgaria = countryPracticalInfo('BG').currency;
  assert.equal(bulgaria.code, 'EUR', 'The 2026 euro adoption replaces any absent/stale Bulgarian currency entry');
  assert.ok(bulgaria.sources.some(source => source.url.includes('ecb.pr260101') && source.checkedAt === '2026-10-20'));
});

test('Curated electrical profiles distinguish low-voltage, regional-frequency and European socket systems with per-fact sources', () => {
  const expected = {
    TR: ['TRY', ['C', 'F'], 230, [50]], GB: ['GBP', ['G'], 230, [50]], DE: ['EUR', ['C', 'F'], 230, [50]],
    FR: ['EUR', ['C', 'E'], 230, [50]], IT: ['EUR', ['C', 'F', 'L'], 230, [50]], AL: ['ALL', ['C', 'F'], 230, [50]],
    XK: ['EUR', ['C', 'F'], 230, [50]], GE: ['GEL', ['C', 'F'], 220, [50]], AZ: ['AZN', ['C', 'F'], 220, [50]],
    BA: ['BAM', ['C', 'F'], 230, [50]], RS: ['RSD', ['C', 'F'], 230, [50]], JP: ['JPY', ['A'], 100, [50, 60]],
    US: ['USD', ['A', 'B'], 120, [60]], AE: ['AED', ['G'], 230, [50]], TH: ['THB', ['A', 'B', 'C', 'O'], 230, [50]], GR: ['EUR', ['C', 'F'], 230, [50]],
  };
  for (const [country, [currency, types, voltage, frequency]] of Object.entries(expected)) {
    const info = countryPracticalInfo(` ${country.toLowerCase()} `);
    assert.equal(info.countryCode, country);
    assert.equal(info.currency.code, currency);
    assert.deepEqual([info.plugs.types, info.plugs.voltage, info.plugs.frequency], [types, voltage, frequency]);
    assert.ok(info.plugs.sources.length > 0);
    for (const source of info.plugs.sources) {
      assert.ok(source.label); assert.equal(source.checkedAt, '2026-10-20');
      assert.ok(['www.electricalsafetyfirst.org.uk', 'www.japan.travel'].includes(new URL(source.url).hostname));
    }
  }
});

test('Reviewed currency profiles include usable names in three languages, symbols or abbreviations and monetary-authority sources', () => {
  const expected = {
    TR: ['TRY', '₺', 'Turkish lira', 'tcmb.gov.tr'], GB: ['GBP', '£', 'Pound sterling', 'www.bankofengland.co.uk'],
    DE: ['EUR', '€', 'Euro', 'www.ecb.europa.eu'], AL: ['ALL', 'Lek', 'Albanian lek', 'www.bankofalbania.org'],
    GE: ['GEL', '₾', 'Georgian lari', 'nbg.gov.ge'], AZ: ['AZN', '₼', 'Azerbaijani manat', 'www.cbar.az'],
    BA: ['BAM', 'KM', 'Convertible mark', 'www.cbbh.ba'], RS: ['RSD', 'RSD', 'Serbian dinar', 'nbs.rs'],
    JP: ['JPY', '¥', 'Japanese yen', 'www.boj.or.jp'], US: ['USD', '$', 'US dollar', 'www.uscurrency.gov'],
    AE: ['AED', 'AED', 'UAE dirham', 'centralbank.ae'], TH: ['THB', '฿', 'Thai baht', 'www.bot.or.th'],
  };
  for (const [country, [code, symbol, englishName, authority]] of Object.entries(expected)) {
    const money = countryPracticalInfo(country).currency;
    assert.equal(money.code, code); assert.equal(money.symbol, symbol); assert.equal(money.name.en, englishName);
    for (const language of ['tr', 'en', 'sq']) {
      assert.ok(money.name[language].trim()); assert.notEqual(money.name[language], code, `${country}/${language} has a name, not a repeated ISO code`);
    }
    assert.ok(money.sources.some(source => new URL(source.url).hostname === authority && source.checkedAt === '2026-10-20'));
    assert.equal(Object.hasOwn(money, 'rate'), false, 'A static currency identity is not a live exchange-rate claim');
  }
  assert.equal(countryPracticalInfo('XK').currency.code, 'EUR');
  for (const [country, currency] of Object.entries({ CA: 'CAD', AU: 'AUD', NZ: 'NZD', PL: 'PLN', CH: 'CHF' })) {
    const money = countryPracticalInfo(country).currency;
    assert.equal(money.code, currency); assert.ok(money.name.tr); assert.ok(money.symbol);
    assert.ok(money.sources.some(source => new URL(source.url).hostname === 'www.six-group.com' && source.checkedAt === '2026-10-21'), `${country} identifies the dated ISO register source rather than inventing a monetary-authority review`);
  }
});

test('Every researched destination offers real local mobile-brand examples and official links, without inventing plan or compatibility guarantees', () => {
  const expected = {
    TR: ['Turkcell', 'Vodafone', 'Türk Telekom'], GB: ['EE', 'O2', 'Vodafone', 'Three'], DE: ['Telekom', 'Vodafone', 'O2'],
    FR: ['Orange', 'SFR', 'Bouygues Telecom'], IT: ['TIM', 'WINDTRE', 'iliad'], AL: ['Vodafone Albania', 'One Albania'],
    XK: ['IPKO', 'Vala'], GE: ['Magti', 'Silknet', 'Cellfie'], AZ: ['Azercell', 'Bakcell', 'Nar'],
    BA: ['BH Telecom', 'HT ERONET', 'm:tel'], RS: ['mts', 'Yettel', 'A1'], JP: ['NTT DOCOMO', 'au', 'SoftBank'],
    US: ['AT&T', 'T-Mobile', 'Verizon'], AE: ['e& UAE', 'du'], TH: ['AIS', 'True-dtac'], GR: ['Telekom', 'Vodafone', 'Nova'],
  };
  for (const [country, brands] of Object.entries(expected)) {
    const internet = countryPracticalInfo(country).internet;
    assert.equal(internet.kind, 'operator-options');
    assert.deepEqual(internet.operators.map(operator => operator.name), brands);
    assert.equal(new Set(internet.operators.map(operator => operator.url)).size, brands.length);
    for (const operator of internet.operators) {
      assert.equal(new URL(operator.url).protocol, 'https:');
      assert.deepEqual(Object.keys(operator).sort(), ['name', 'url'], 'A linked example does not assert cost, coverage, eSIM or visitor eligibility');
      const evidence = internet.sources.find(source => source.label === operator.name);
      assert.ok(evidence); assert.equal(evidence.checkedAt, '2026-10-20'); assert.equal(new URL(evidence.url).protocol, 'https:');
    }
  }
  assert.equal(new URL(countryPracticalInfo('AE').internet.operators[0].url).hostname, 'www.eand.ae');
  assert.equal(new URL(countryPracticalInfo('GR').internet.operators[0].url).hostname, 'www.telekom.gr');
  assert.equal(countryPracticalInfo('TH').internet.operators.filter(operator => /true|dtac/i.test(operator.name)).length, 1, 'The merged Thai brand is not presented as two independent network choices');
  const canada = countryPracticalInfo('CA').internet;
  assert.equal(canada.kind, 'operator-options');
  assert.deepEqual(canada.operators.map(operator => operator.name), ['Rogers', 'Bell', 'TELUS']);
  assert.ok(canada.sources.every(source => source.checkedAt === '2026-10-21' && new URL(source.url).protocol === 'https:'));
  for (const country of ['BG', 'ZZ']) assert.deepEqual(countryPracticalInfo(country).internet, { kind: 'device-operator-check' }, 'Destinations without reviewed operator examples retain a neutral compatibility check, not borrowed operators');
  assert.deepEqual(countryPracticalInfo('BG').communication.callingCodes, ['+359']);
  assert.equal(countryPracticalInfo('BG').internet.operators, undefined, 'ITU calling plans are not mislabelled as carrier recommendations');
});

test('Core currency names and abbreviations remain useful on devices lacking optional Intl currency formatting', () => {
  const displayNames = Intl.DisplayNames, numberFormat = Intl.NumberFormat;
  const expectedCanada = countryPracticalInfo('CA').currency;
  try {
    Intl.DisplayNames = undefined;
    Intl.NumberFormat = class { constructor() { throw new Error('Currency formatting unavailable'); } };
    assert.equal(countryPracticalInfo('TR').currency.name.tr, 'Türk lirası');
    assert.equal(countryPracticalInfo('AL').currency.name.sq, 'Leku shqiptar');
    assert.equal(countryPracticalInfo('GE').currency.symbol, '₾');
    const canada = countryPracticalInfo('CA').currency;
    assert.equal(canada.code, 'CAD'); assert.deepEqual(canada, expectedCanada, 'Bundled currency names, symbols and source dates do not degrade when optional runtime locale APIs are missing');
    assert.equal(countryPracticalInfo('ZZ').currency, null);
  } finally { Intl.DisplayNames = displayNames; Intl.NumberFormat = numberFormat; }
});

test('Emergency numbers retain their original category, source and review dates without a newly invented verification', () => {
  for (const country of ['TR', 'DE', 'FR', 'IT', 'AL', 'XK', 'GE', 'AZ', 'BA', 'RS', 'JP', 'US', 'AE', 'TH', 'GR', 'GB']) {
    const contacts = countryPracticalInfo(country).emergency;
    assert.deepEqual(contacts, emergencyContacts(country));
    assert.ok(contacts.length > 0);
    assert.ok(contacts.every(contact => contact.verifiedAt === '2026-09-26' && contact.reviewAfter === '2026-12-25'));
  }
  const germany = countryPracticalInfo('DE').emergency;
  assert.equal(germany.find(contact => contact.category === 'police').number, '110');
  assert.equal(germany.find(contact => contact.category === 'ambulance').number, '112');
  assert.equal(germany.some(contact => contact.category === 'general'), false, 'A general single number is not manufactured from differing services');
  assert.equal(countryPracticalInfo('TH').emergency.find(contact => contact.category === 'ambulance').number, '1669');
});

test('New UK water/tipping and Türkiye practical highlights have individual review dates, three languages and appropriately limited source claims', () => {
  const expected = [
    ['GB', 'water', 'www.visitbritain.com'], ['GB', 'culture', 'www.visitbritain.com'],
    ['TR', 'tax-free', 'www.gumrukrehberi.gov.tr'], ['TR', 'water', 'istanbulseninhaber.ibb.istanbul'], ['TR', 'culture', 'goturkiye.com'],
  ];
  for (const [country, category, authority] of expected) {
    const records = GUIDE_CARDS.filter(card => card.country === country && card.category === category);
    assert.equal(records.length, 1, `${country}/${category} has one unambiguous record`);
    const record = records[0];
    assert.equal(new URL(record.sourceUrl).hostname, authority);
    assert.equal(record.verifiedAt, '2026-10-20'); assert.equal(record.reviewAfter, '2027-01-18');
    for (const language of ['tr', 'en', 'sq']) assert.ok(record.title[language]?.trim() && record.text[language]?.trim(), `${country}/${category}/${language}`);
  }
  const gbWater = GUIDE_CARDS.find(card => card.country === 'GB' && card.category === 'water');
  assert.equal(gbWater.status, 'drinkable'); assert.match(gbWater.text.en, /local water notices/); assert.match(gbWater.text.en, /marked drinking-water taps/);
  const gbTip = GUIDE_CARDS.find(card => card.country === 'GB' && card.category === 'culture');
  assert.match(gbTip.text.en, /optional/i); assert.match(gbTip.text.en, /discretionary service charge/i);
  const trWater = GUIDE_CARDS.find(card => card.country === 'TR' && card.category === 'water');
  assert.equal(trWater.status, 'regional'); assert.match(trWater.text.en, /Istanbul/); assert.match(trWater.text.en, /not a nationwide/i);
  const trTip = GUIDE_CARDS.find(card => card.country === 'TR' && card.category === 'culture');
  assert.match(trTip.text.en, /esnaf lokantası/); assert.match(trTip.text.en, /not establish a fixed percentage/i);
  const tax = GUIDE_CARDS.find(card => card.country === 'TR' && card.category === 'tax-free');
  assert.match(tax.text.en, /Eligible/); assert.match(tax.text.en, /resident outside/); assert.match(tax.text.en, /customs/);
  assert.doesNotMatch(Object.values(tax.text).join(' '), /\d+\s*(?:TL|TRY|%)/i, 'Conflicting amounts on the source page are not promoted into an authoritative threshold');
  assert.equal(GUIDE_VERSION, '2026-09-16', 'New fact checks do not re-date the untouched catalogue');
  assert.equal(GUIDE_CARDS.find(card => card.country === 'GB' && card.category === 'tax-free').verifiedAt, GUIDE_VERSION);
});

test('Driving facts are explicit, individually sourced and do not infer a side from a continent', () => {
  for (const country of ['GB', 'JP', 'TH']) assert.equal(countryPracticalInfo(country).driving.side, 'left');
  for (const country of ['TR', 'DE', 'FR', 'IT', 'AL', 'XK', 'GE', 'AZ', 'BA', 'RS', 'US', 'AE', 'GR']) {
    const traffic = countryPracticalInfo(country).driving;
    assert.equal(traffic.side, 'right');
    assert.ok(traffic.sources.every(source => source.checkedAt === '2026-10-20' && source.url.startsWith('https://')));
  }
  const australia = countryPracticalInfo('AU').driving;
  assert.equal(australia.side, 'left', 'Newly researched countries use their own driving side rather than a continent-wide default');
  assert.ok(australia.sources.some(source => source.checkedAt === '2026-10-21' && source.url.includes('restcountries')));
  for (const country of ['AQ', 'BV', 'ZZ']) assert.equal(countryPracticalInfo(country).driving, null, 'Site-specific or invalid destinations do not inherit a tourist driving rule');
});

test('Time differences are relative to the actual device zone and use current daylight-saving rules', () => {
  const winter = '2026-01-15T12:00:00Z', summer = '2026-07-15T12:00:00Z';
  assert.equal(time('GB', 'Europe/Istanbul', winter).minutes, -180);
  assert.equal(time('GB', 'Europe/Istanbul', summer).minutes, -120);
  assert.equal(time('DE', 'Europe/Istanbul', winter).minutes, -120);
  assert.equal(time('DE', 'Europe/Istanbul', summer).minutes, -60);
  assert.equal(time('GR', 'Europe/Istanbul', winter).minutes, -60);
  assert.equal(time('GR', 'Europe/Istanbul', summer).minutes, 0);
  assert.equal(time('US', 'America/Los_Angeles', winter).minutes, 180, 'The comparison is not hardcoded to Türkiye');
  assert.equal(time('US', 'Pacific/Honolulu', winter).minutes, 300);
  assert.equal(time('US', 'Pacific/Honolulu', summer).minutes, 360);
  assert.equal(time('TR', 'Asia/Kolkata', summer).minutes, -150, 'Fractional-hour device offsets are preserved');
  assert.equal(time('JP', 'Asia/Kathmandu', summer).minutes, 195, 'Quarter-hour device offsets are preserved');
});

test('Clock changes and date boundaries are calculated at the requested instant without an off-by-one-day offset', () => {
  assert.equal(time('GB', 'Europe/Istanbul', '2026-03-29T00:30:00Z').minutes, -180);
  assert.equal(time('GB', 'Europe/Istanbul', '2026-03-29T01:30:00Z').minutes, -120);
  assert.equal(time('GB', 'Europe/Istanbul', '2026-10-25T00:30:00Z').minutes, -120);
  assert.equal(time('GB', 'Europe/Istanbul', '2026-10-25T01:30:00Z').minutes, -180);
  assert.equal(time('JP', 'America/Los_Angeles', '2026-01-15T00:00:00Z').minutes, 1020);
  assert.equal(time('US', 'Asia/Tokyo', '2026-01-15T00:00:00Z').minutes, -840);
  assert.equal(time('TR', 'Europe/Istanbul', '2026-01-15T21:00:00.125Z').minutes, 0, 'Midnight and milliseconds do not create a 24-hour or fractional-minute error');
});

test('Multi-zone destinations always expose their reference city instead of pretending the whole country has one clock', () => {
  const us = time('US', 'Europe/Istanbul', '2026-01-15T12:00:00Z');
  assert.equal(us.multipleZones, true); assert.equal(us.referenceCity.en, 'New York'); assert.equal(us.timeZone, 'America/New_York');
  const france = time('FR', 'Europe/Istanbul', '2026-01-15T12:00:00Z');
  assert.equal(france.multipleZones, true); assert.equal(france.referenceCity.en, 'Paris');
  assert.equal(countryPracticalInfo('XK').time.referenceCity.en, 'Pristina', 'The shared IANA zone name is not presented as the destination city');
});

test('Unknown clock data, invalid zones and invalid dates return no result instead of a fabricated zero-hour difference', () => {
  const info = countryPracticalInfo('TR');
  for (const zone of ['', ' ', 'Not/A_Time_Zone']) assert.equal(countryTimeDifference(info, zone), null);
  for (const instant of [NaN, Infinity, -Infinity, 1e16]) assert.equal(countryTimeDifference(info, 'Europe/Istanbul', instant), null);
  assert.equal(countryTimeDifference({ time: { ...info.time, zone: 'Not/A_Time_Zone' } }, 'Europe/Istanbul'), null);
  assert.equal(countryTimeDifference(countryPracticalInfo('ZZ'), 'UTC'), null);
});

test('Consumers cannot mutate shared practical profiles or the safety catalogue through returned data', () => {
  const info = countryPracticalInfo('TR');
  info.plugs.types.push('G'); info.plugs.sources[0].checkedAt = '2099-01-01';
  info.emergency[0].number = '999'; info.time.referenceCity.en = 'Elsewhere';
  info.currency.name.en = 'Wrong currency'; info.currency.sources[0].checkedAt = '2099-01-01';
  info.internet.operators[0].name = 'Unrelated operator'; info.internet.operators.push({ name: 'Extra', url: 'https://example.com' });
  info.internet.sources[0].url = 'https://example.com';
  const fresh = countryPracticalInfo('TR');
  assert.deepEqual(fresh.plugs.types, ['C', 'F']); assert.equal(fresh.plugs.sources[0].checkedAt, '2026-10-20');
  assert.equal(fresh.emergency[0].number, '112'); assert.equal(emergencyContacts('TR')[0].number, '112');
  assert.equal(fresh.time.referenceCity.en, 'Istanbul');
  assert.equal(fresh.currency.name.en, 'Turkish lira'); assert.equal(fresh.currency.sources[0].checkedAt, '2026-10-20');
  assert.equal(fresh.internet.operators[0].name, 'Turkcell'); assert.equal(fresh.internet.operators.length, 3);
  assert.equal(fresh.internet.sources[0].url, 'https://www.turkcell.com.tr/');
});
