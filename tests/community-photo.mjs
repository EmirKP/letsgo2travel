import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync('mobile/src/lib/communityPhoto.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const path = '/api/country-community/questions/12345678-1234-1234-1234-123456789abc/photo';
const bytes = Uint8Array.from([255, 216, 255, 224, 0, 1, 255, 217]);
const jpegData = `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;

function setup({ native = false, request, fetch, width = 3000, height = 2000, decodeError = false, encode } = {}) {
  const calls = [], revoked = [], drawings = [], encodings = [];
  const canvas = {
    width: 0, height: 0,
    getContext() { return { fillRect() {}, drawImage(...args) { drawings.push(args.slice(1)); } }; },
    toDataURL(type, quality) {
      encodings.push({ width: this.width, height: this.height, type, quality });
      return encode?.(encodings.at(-1), encodings.length) || jpegData;
    },
  };
  class Image {
    naturalWidth = width;
    naturalHeight = height;
    src = '';
    async decode() { if (decodeError) throw new Error('Bad image'); }
  }
  class TestURL extends URL {
    static createObjectURL() { return 'blob:selected-photo'; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const output = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    Image, document: { createElement: () => canvas }, URL: TestURL, Blob, DOMException,
    AbortController, setTimeout, clearTimeout, Uint8Array, atob,
    fetch: async (...args) => {
      calls.push(args);
      return fetch ? fetch(...args) : new Response(bytes, { headers: { 'content-type': 'image/jpeg' } });
    },
  })((name) => {
    if (name === './capacitor') return { isNativePlatform: () => native, plugin: () => ({ request: async (options) => {
      calls.push(options);
      return request ? request(options) : { status: 200, data: Buffer.from(bytes).toString('base64'), url: options.url, headers: { 'Content-Type': 'image/jpeg' } };
    } }) };
    if (name === './config') return { config: { apiBaseUrl: 'https://app.example.test' } };
    throw new Error(`Unexpected dependency ${name}`);
  }, output, output.exports);
  return { api: output.exports, calls, revoked, drawings, encodings };
}

test('Photo preparation re-encodes proportionally without cropping and revokes the selected file URL', async () => {
  const h = setup();
  assert.equal(await h.api.prepareCommunityPhoto({ type: 'image/png', size: 300_000, name: 'trip.png' }), jpegData);
  assert.deepEqual(h.encodings[0], { width: 1280, height: 853, type: 'image/jpeg', quality: 0.84 });
  assert.deepEqual(h.drawings, [[0, 0, 1280, 853]]);
  assert.deepEqual(h.revoked, ['blob:selected-photo']);
});

test('Compression retries lower quality and then reduces dimensions to stay below the upload limit', async () => {
  const oversized = `data:image/jpeg;base64,${Buffer.alloc(300_001).toString('base64')}`;
  const h = setup({ encode: (_, count) => count < 5 ? oversized : jpegData });
  assert.equal(await h.api.prepareCommunityPhoto({ type: 'image/jpeg', size: 3_000_000, name: 'trip.jpg' }), jpegData);
  assert.deepEqual(h.encodings.map(item => item.quality), [0.84, 0.72, 0.6, 0.48, 0.84]);
  assert.equal(h.encodings[4].width, 998);
  assert.equal(h.revoked.length, 1);
});

test('Rejected formats, large input and failed or oversized image decodes expose useful errors and clean up', async () => {
  for (const [file, message] of [
    [{ type: 'image/heic', size: 10, name: 'trip.heic' }, 'photo_heic'],
    [{ type: 'image/svg+xml', size: 10, name: 'trip.svg' }, 'photo_type'],
    [{ type: 'image/jpeg', size: 12_000_001, name: 'trip.jpg' }, 'photo_size'],
  ]) {
    const h = setup();
    await assert.rejects(h.api.prepareCommunityPhoto(file), { message });
    assert.equal(h.revoked.length, 0);
  }
  for (const [options, message] of [[{ decodeError: true }, 'photo_decode'], [{ width: 10_000, height: 10_000 }, 'photo_dimensions']]) {
    const h = setup(options);
    await assert.rejects(h.api.prepareCommunityPhoto({ type: 'image/jpeg', size: 100, name: 'trip.jpg' }), { message });
    assert.deepEqual(h.revoked, ['blob:selected-photo']);
  }
});

test('Only a canonical protected photo path may receive an account token', async () => {
  const h = setup();
  for (const bad of ['https://other.example/photo', '//other.example/photo', `${path}?next=https://other.example`, `${path}/../photo`, '/api/profile/avatar', path.replace('12345678', 'arbitrary')]) {
    await assert.rejects(h.api.loadCommunityPhoto(bad, 'private-token'), { message: 'photo_path' });
  }
  assert.equal(h.calls.length, 0);
  const photo = await h.api.loadCommunityPhoto(path, 'private-token');
  assert.equal(photo.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), bytes);
  const [url, options] = h.calls[0];
  assert.equal(url, `https://app.example.test${path}`);
  assert.equal(options.headers.Authorization, 'Bearer private-token');
  assert.equal(options.redirect, 'error');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.credentials, 'omit');
});

test('Guests send no Authorization header and forbidden photos do not retry as another viewer', async () => {
  const guest = setup();
  await guest.api.loadCommunityPhoto(path, '');
  assert.equal(guest.calls[0][1].headers.Authorization, undefined);
  const expired = setup({ fetch: () => new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(expired.api.loadCommunityPhoto(path, 'expired-token'), { message: 'photo_response' });
  assert.equal(expired.calls.length, 1);
});

test('Social and admin photos use only exact protected routes, with no token in query or image URL', async () => {
  const h = setup();
  for (const photoPath of [path.replace('/questions/', '/social/'), path.replace('/country-community/questions/', '/admin/social/')]) {
    await h.api.loadCommunityPhoto(photoPath, 'private-token');
    const [url, options] = h.calls.at(-1);
    assert.equal(url, `https://app.example.test${photoPath}`);
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    assert.equal(options.redirect, 'error');
    await assert.rejects(h.api.loadCommunityPhoto(`${photoPath}?token=secret`, 'private-token'), { message: 'photo_path' });
  }
  assert.equal(h.calls.length, 2);
});

test('Native binary requests decode Capacitor base64 and disable redirects', async () => {
  const h = setup({ native: true });
  const photo = await h.api.loadCommunityPhoto(path, 'account-token');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), bytes);
  assert.equal(h.calls[0].responseType, 'arraybuffer');
  assert.equal(h.calls[0].disableRedirects, true);
  assert.equal(h.calls[0].headers.Authorization, 'Bearer account-token');
  assert.equal(h.calls[0].readTimeout, 15_000);
});

test('Native cancellation settles immediately and rejects stale results; oversized or incorrect responses fail', async () => {
  let resolve;
  const pending = setup({ native: true, request: () => new Promise(done => { resolve = done; }) });
  const controller = new AbortController();
  const loading = pending.api.loadCommunityPhoto(path, 'account-token', controller.signal);
  controller.abort();
  await assert.rejects(loading, { name: 'AbortError' });
  resolve({ status: 200, data: Buffer.from(bytes).toString('base64'), headers: { 'content-type': 'image/jpeg' } });
  for (const bad of [
    { data: Buffer.alloc(300_001).toString('base64') },
    { data: Buffer.from('not a jpeg').toString('base64') },
    { url: 'https://other.example/photo' },
    { headers: { 'content-type': 'text/html' } },
  ]) {
    const h = setup({ native: true, request: () => ({ status: 200, data: Buffer.from(bytes).toString('base64'), headers: { 'content-type': 'image/jpeg' }, ...bad }) });
    await assert.rejects(h.api.loadCommunityPhoto(path, 'account-token'), { message: 'photo_response' });
  }
});
