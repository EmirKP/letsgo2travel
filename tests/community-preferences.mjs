import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const iso = JSON.parse(readFileSync('mobile/src/data/iso3166.json', 'utf8'));
const source = ts.transpileModule(readFileSync('mobile/src/lib/communityPreferences.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ data = new Map(), windowMissing = false, storageDenied = false } = {}) {
  let readBlocked = false, writeBlocked = false;
  const storage = {
    getItem(key) { if (readBlocked) throw Error('read denied'); return data.get(key) ?? null; },
    setItem(key, value) { if (writeBlocked) throw Error('quota'); data.set(key, value); },
    removeItem(key) { if (writeBlocked) throw Error('remove denied'); data.delete(key); },
  };
  const window = storageDenied ? Object.defineProperty({}, 'localStorage', { get() { throw Error('access denied'); } }) : { localStorage: storage };
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, windowMissing ? {} : { window })(name => {
    assert.equal(name, '../data/countries');
    return { ISO_3166: iso };
  }, output, output.exports);
  return {
    data, api: output.exports, read: owner => Array.from(output.exports.readCommunityFollows(owner)),
    blockReads: () => { readBlocked = true; }, blockWrites: () => { writeBlocked = true; },
  };
}

test('Country follows persist across reloads and remain separate for guests and each encoded owner', () => {
  const { api, read, data } = setup();
  const owners = [null, 'guest', 'owner-a', 'owner-b', 'owner/a', 'owner%2Fa', 'özgür@example.invalid'];
  owners.forEach((owner, index) => assert.equal(api.writeCommunityFollows(owner, [iso[index].alpha2]), true));
  const reloaded = setup({ data });
  owners.forEach((owner, index) => {
    assert.deepEqual(read(owner), [iso[index].alpha2]);
    assert.deepEqual(reloaded.read(owner), [iso[index].alpha2]);
  });
  assert.equal(data.size, owners.length);
  assert.ok([...data.keys()].some(key => key.endsWith('.user-owner%2Fa')));
  assert.ok([...data.keys()].some(key => key.endsWith('.user-owner%252Fa')));
  assert.deepEqual(read('another-owner'), []);
});

test('Only current ISO country groups are stored, normalized and deduplicated in selection order', () => {
  const { api, read, data } = setup();
  const input = Object.freeze([' de ', 'TR', 'de', 'xk', 'tr']);
  assert.equal(api.writeCommunityFollows('a', input), true);
  assert.deepEqual(read('a'), ['DE', 'TR', 'XK']);
  assert.deepEqual(JSON.parse([...data.values()][0]), ['DE', 'TR', 'XK']);
  assert.deepEqual(input, [' de ', 'TR', 'de', 'xk', 'tr']);
  const first = api.readCommunityFollows('a'); first.push('FR');
  assert.deepEqual(read('a'), ['DE', 'TR', 'XK'], 'A caller cannot mutate persisted preferences through a returned array');
});

test('The country bound includes the complete ISO source, including its final country', () => {
  const { api, read } = setup();
  const codes = iso.map(country => country.alpha2);
  assert.equal(api.writeCommunityFollows('a', codes), true);
  assert.deepEqual(read('a'), codes);
  assert.equal(api.writeCommunityFollows('a', [...codes, codes[0]]), true, 'Duplicates do not consume the unique-country limit');
  assert.equal(read('a').length, new Set(codes).size);
  assert.equal(api.writeCommunityFollows('a', [...codes, 'QQ']), false, 'Unknown countries cannot expand the source-defined set');
  assert.deepEqual(read('a'), codes);
});

test('Malformed or unknown stored data reads as empty and is never repaired into another owner', () => {
  const { api, read, data } = setup();
  api.writeCommunityFollows('a', ['DE']);
  const key = [...data.keys()][0];
  api.writeCommunityFollows('b', ['TR']); api.writeCommunityFollows(null, ['FR']);
  for (const raw of ['{broken', 'null', '{}', '"DE"', '42', '[null]', '["DE","QQ"]', '["ZZ"]', '[{"country":"DE"}]', ' '.repeat(8193)]) {
    data.set(key, raw);
    assert.deepEqual(read('a'), []);
    assert.equal(data.get(key), raw, 'A read must not mutate or erase corrupt preferences');
    assert.deepEqual(read('b'), ['TR']); assert.deepEqual(read(null), ['FR']);
  }
});

test('Invalid writes and account identities cannot replace valid data or fall back to guest', () => {
  const { api, read, data } = setup();
  api.writeCommunityFollows('a', ['DE']); api.writeCommunityFollows(null, ['TR']);
  const before = JSON.stringify([...data]);
  for (const value of [null, {}, 'DE', [7], ['DE', 'QQ'], ['ZZ'], ['USA'], [{ code: 'FR' }]]) {
    assert.equal(api.writeCommunityFollows('a', value), false);
    assert.deepEqual(read('a'), ['DE']);
  }
  for (const owner of [undefined, '', ' a', 'a ', 'a'.repeat(201), '\ud800', 123]) {
    assert.equal(api.writeCommunityFollows(owner, ['FR']), false);
    assert.deepEqual(read(owner), []);
  }
  assert.equal(JSON.stringify([...data]), before);
  assert.deepEqual(read(null), ['TR']);
});

test('Unavailable storage and quota errors are explicit and preserve existing saved preferences', () => {
  const { api, read, blockReads, blockWrites } = setup();
  api.writeCommunityFollows('a', ['DE']); blockWrites();
  assert.equal(api.writeCommunityFollows('a', ['FR']), false);
  assert.equal(api.writeCommunityFollows('a', []), false);
  assert.deepEqual(read('a'), ['DE']);
  blockReads(); assert.deepEqual(read('a'), []);
  for (const options of [{ windowMissing: true }, { storageDenied: true }]) {
    const blocked = setup(options);
    assert.deepEqual(blocked.read(null), []);
    assert.equal(blocked.api.writeCommunityFollows(null, ['TR']), false);
  }
});

test('Unfollowing everything affects only the selected owner and never copies legacy or guest data', () => {
  const { api, read, data } = setup();
  api.writeCommunityFollows('a', ['DE']); api.writeCommunityFollows('b', ['FR']); api.writeCommunityFollows(null, ['TR']);
  data.set('l2t.mobile.community-follows.v1', '["JP"]');
  assert.equal(api.writeCommunityFollows('a', []), true);
  assert.deepEqual(read('a'), []); assert.deepEqual(read('b'), ['FR']); assert.deepEqual(read(null), ['TR']);
  assert.deepEqual(read('new-account'), []);
});

test('Explicit account cleanup removes only its encoded key and is safe to retry', () => {
  const { api, read, data } = setup();
  for (const owner of ['owner/a', 'owner%2Fa', 'owner-b', null]) api.writeCommunityFollows(owner, ['DE']);
  assert.equal(api.clearCommunityFollows('owner/a'), true);
  assert.deepEqual(read('owner/a'), []);
  assert.equal(data.size, 3, 'Cleanup removes the key rather than retaining an empty record');
  for (const owner of ['owner%2Fa', 'owner-b', null]) assert.deepEqual(read(owner), ['DE']);
  assert.equal(api.clearCommunityFollows('owner/a'), true);
  for (const owner of [null, undefined, '', ' a', '\ud800', 123]) assert.equal(api.clearCommunityFollows(owner), false);
  assert.equal(data.size, 3);
});

test('Account cleanup reports unavailable storage without erasing unrelated follows or reporting success', () => {
  const { api, read, blockWrites } = setup();
  api.writeCommunityFollows('a', ['TR']); blockWrites();
  assert.equal(api.clearCommunityFollows('a'), false);
  assert.deepEqual(read('a'), ['TR']);
  for (const options of [{ windowMissing: true }, { storageDenied: true }]) assert.equal(setup(options).api.clearCommunityFollows('a'), false);
});
