import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL, URLSearchParams, AbortController, AbortSignal, DOMException, Date, Response, Request, ...globals })(name => imports[name] || {}, output, output.exports);
  return output.exports;
}
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function network() {
  const wait = deferred(), calls = [], timers = new Map(); let id = 0;
  const api = load('mobile/src/lib/api.ts', {
    './capacitor': { isNativePlatform: () => true, plugin: () => ({ request: options => { calls.push(options); return wait.promise; } }) },
    './config': { config: { apiBaseUrl: 'https://example.test' } }, './i18n': { localeFromStorage: () => 'en' },
  }, { window: { setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) } });
  return { ...wait, calls, timers, api, deadline() { [...timers.values()].forEach(fn => fn()); } };
}

test('Native cancellation settles before the bridge resolves and ignores its later result', async () => {
  const h = network(), controller = new AbortController();
  const pending = h.api.requestJson('/places', { signal: controller.signal });
  assert.equal(h.calls.length, 1);
  const rejection = assert.rejects(pending, error => error.code === 'aborted');
  controller.abort(); await rejection;
  assert.equal(h.timers.size, 0);
  h.resolve({ status: 200, data: { mustNotAppear: true } });
  await Promise.resolve();
  await assert.rejects(h.api.requestJson('/places', { signal: controller.signal }), error => error.code === 'aborted');
  assert.equal(h.calls.length, 1);
});

test('Native wall-clock deadline settles a hanging bridge and consumes a late rejection safely', async () => {
  const h = network();
  const pending = h.api.requestJson('/places', { timeoutMs: 25 });
  assert.equal(h.calls[0].connectTimeout, 25); assert.equal(h.calls[0].readTimeout, 25);
  const rejection = assert.rejects(pending, error => error.code === 'timeout');
  h.deadline(); await rejection;
  assert.equal(h.timers.size, 0);
  h.reject(new Error('Late native socket failure'));
  await new Promise(setImmediate);
});

test('Native success and HTTP failures clear their timers without changing payload semantics', async () => {
  const good = network(); const result = good.api.requestJson('/rates');
  good.resolve({ status: 200, data: '{"rate":1.25}' });
  assert.equal((await result).rate, 1.25); assert.equal(good.timers.size, 0);
  const bad = network(); const error = bad.api.requestJson('/photo');
  bad.resolve({ status: 429, data: { code: 'daily-limit' } });
  await assert.rejects(error, failure => failure.status === 429 && failure.code === 'daily-limit');
  assert.equal(bad.timers.size, 0);
});

function transport({ native, locale, online, rawError = new TypeError('Private socket details: https://internal.example.test/session'), response } = {}) {
  const calls = [], timers = new Map(); let timerId = 0, nextError = rawError, nextResponse = response;
  async function send(options) {
    calls.push(options);
    if (nextError !== null) throw nextError;
    return native ? nextResponse : new Response(JSON.stringify(nextResponse.data), { status: nextResponse.status, headers: { 'Content-Type': 'application/json' } });
  }
  const api = load('mobile/src/lib/api.ts', {
    './capacitor': { isNativePlatform: () => native, plugin: () => ({ request: send }) },
    './config': { config: { apiBaseUrl: 'https://example.test' } },
    './i18n': { localeFromStorage: () => locale },
  }, {
    window: { setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id) },
    ...(online === undefined ? {} : { navigator: { onLine: online } }),
    fetch: (_url, options) => send(options),
  });
  return { api, calls, timers, recover(data = { saved: true }) { nextError = null; nextResponse = { status: 200, data }; } };
}

test('Browser and native raw connection failures become localized offline/network ApiErrors in all three languages', async () => {
  const translations = {
    tr: { offline: 'İnternet bağlantısı yok. Bağlantını kontrol edip tekrar dene.', network: 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.' },
    en: { offline: "You're offline. Check your connection and try again.", network: "Couldn't reach the server. Check your connection and try again." },
    sq: { offline: 'Je jashtë linje. Kontrollo lidhjen dhe provo sërish.', network: 'Nuk u arrit serveri. Kontrollo lidhjen dhe provo sërish.' },
  };
  for (const native of [false, true]) for (const locale of ['tr', 'en', 'sq']) for (const online of [false, true, undefined]) {
    const code = online === false ? 'offline' : 'network';
    for (const rawError of [new TypeError('Failed to fetch private session URL'), { message: 'NSURLErrorDomain -1009; private hostname', code: -1009 }, 'Network request failed']) {
      const h = transport({ native, locale, online, rawError });
      await assert.rejects(h.api.requestJson('/private-data'), error => {
        assert.ok(error instanceof h.api.ApiError);
        assert.equal(error.name, 'ApiError'); assert.equal(error.status, 0); assert.equal(error.code, code);
        assert.equal(error.message, translations[locale][code]); assert.equal(error.payload, null);
        assert.doesNotMatch(error.message, /private|NSURLErrorDomain|Failed to fetch/i);
        return true;
      });
      assert.equal(h.calls.length, 1); assert.equal(h.calls[0].headers['Accept-Language'], locale);
      assert.equal(h.timers.size, 0, 'Failed connections must not leave deadline timers behind');
    }
  }
});

test('Failed POSTs are never retried automatically; only a deliberate second request resends the preserved body', async () => {
  const body = { description: 'My unsent description', requestId: 'unchanged-retry-id' };
  for (const native of [false, true]) {
    const h = transport({ native, locale: 'en', online: false });
    await assert.rejects(h.api.requestJson('/api/support/issues', { method: 'POST', body }), error => error.code === 'offline');
    await new Promise(setImmediate);
    assert.equal(h.calls.length, 1, 'A mutation must not be replayed after a connection failure');
    assert.equal(h.timers.size, 0, 'No retry/deadline timer may remain');
    assert.equal(h.calls[0].method, 'POST');
    const sentBody = call => native ? call.data : JSON.parse(call.body);
    assert.deepEqual(sentBody(h.calls[0]), body);
    h.recover();
    assert.equal((await h.api.requestJson('/api/support/issues', { method: 'POST', body })).saved, true);
    assert.equal(h.calls.length, 2);
    assert.deepEqual(sentBody(h.calls[1]), body);
    assert.deepEqual(body, { description: 'My unsent description', requestId: 'unchanged-retry-id' }, 'Transport cannot mutate the caller draft');
  }
});

test('Structured HTTP errors retain their message, status, code and payload even when device connectivity reports offline', async () => {
  for (const native of [false, true]) for (const locale of ['tr', 'en', 'sq']) for (const payload of [
    { error: 'Server validation detail', code: 'validation', field: 'destination' },
    { data: { message: 'Nested quota detail', code: 'daily-limit' }, remaining: 0 },
  ]) {
    const h = transport({ native, locale, online: false, rawError: null, response: { status: 422, data: payload } });
    await assert.rejects(h.api.requestJson('/save', { method: 'POST', body: { destination: '' } }), error => {
      assert.ok(error instanceof h.api.ApiError); assert.equal(error.status, 422);
      assert.equal(error.message, payload.error || payload.data.message);
      assert.equal(error.code, payload.code || payload.data.code);
      assert.deepEqual(JSON.parse(JSON.stringify(error.payload)), payload);
      return true;
    });
    assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
  }
});

test('A successful noopener handoff never also navigates the application tab', async () => {
  const opened = [], assigned = [];
  const api = load('mobile/src/lib/native.ts', {
    './capacitor': { isNativePlatform: () => false, plugin: () => null },
    './config': { config: { apiBaseUrl: 'https://example.test' } },
  }, { window: { open: (...args) => { opened.push(args); return null; }, location: { assign: url => assigned.push(url) } } });
  assert.equal(await api.openExternal('https://www.google.com/maps/'), true);
  assert.equal(opened.length, 1); assert.equal(opened[0][2], 'noopener,noreferrer');
  assert.deepEqual(assigned, []);
  assert.equal(await api.openExternal('javascript:alert(1)'), false);
  assert.equal(opened.length, 1);
});

test('A failed external handoff reports failure without navigating the app', async () => {
  const api = load('mobile/src/lib/native.ts', { './capacitor': { isNativePlatform: () => false, plugin: () => null }, './config': { config: { apiBaseUrl: 'https://example.test' } } }, { window: { open: () => { throw Error('unavailable'); }, location: { assign() { throw Error('Unexpected app navigation'); } } } });
  assert.equal(await api.openExternal('/advice'), false);
});

test('A valid slow interchange lookup fits within the station picker request budget', async () => {
  let elapsed = 0;
  const transit = load('lib/travel-assistant/transit.ts', {});
  const route = load('app/api/travel-assistant/transit/route.ts', {
    '@/lib/travel-assistant/transit': transit,
    '@/lib/country-intelligence/fetch': { publicJson: async url => {
      if (url.includes('/Search?')) { elapsed += 9000; return { matches: [{ id: 'HUBWAT', name: 'Waterloo' }] }; }
      elapsed += 7000; return { children: [{ id: '940GZZLUWLO', commonName: 'Waterloo Underground', modes: ['tube'] }] };
    } },
  });
  const hooks = []; let index = 0, search;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = value; }]; },
    useRef(initial) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; }, useEffect() {},
  };
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/components/TravelTransit.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/config': { config: { travelAssistantApiBaseUrl: 'https://example.test' } }, '../lib/i18n': { useI18n: () => ({ copy: (tr, en) => en }) }, '../../../lib/travel-assistant/transit': transit,
    '../lib/api': { requestJson: (url, options) => { search = (async () => { const result = await route.GET(new Request(url)); if (elapsed >= options.timeoutMs) throw Error('Client deadline'); return result.json(); })(); return search; } },
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\nexports.StopPickerForTest = StopPicker;})`, { URLSearchParams })(name => imports[name] || {}, output, output.exports);
  const render = () => { index = 0; return output.exports.StopPickerForTest({ label: 'From', value: null, onChange() {} }); };
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  nodes(render()).find(node => node.type === 'input').props.onChange({ target: { value: 'Waterloo' } });
  nodes(render()).find(node => node.type === 'button').props.onClick();
  await search; await new Promise(setImmediate);
  assert.equal(elapsed, 16000);
  assert.ok(nodes(render()).some(node => node.type === 'button' && node.props.children === 'Waterloo Underground'));
});

test('Offline download displays the newer retained pack after a late response and accepts the next newer update', async () => {
  const places=load('lib/travel-assistant/places.ts',{});
  const offline=load('lib/travel-assistant/offline-map.ts',{'./places':places});
  const center={latitude:41.01,longitude:28.98}, now=Date.now();
  const street={type:'way',id:1,tags:{highway:'residential'},geometry:[{lat:41.01,lon:28.98},{lat:41.011,lon:28.981}]};
  const pharmacy={type:'node',id:2,lat:41.01,lon:28.98,tags:{amenity:'pharmacy',name:'Saved pharmacy'}};
  const pack=(time,points=[])=>offline.normalizeOfflineMap({elements:[street,...points]},center,new Date(time));
  const other=offline.normalizeOfflineMap({elements:[street]},{...center,latitude:41.02},new Date(now));
  let stored=JSON.stringify([pack(now-10800000),other]), writes=0;
  const storage=load('mobile/src/lib/offlineMaps.ts',{'../../../lib/travel-assistant/offline-map':offline,'../../../lib/travel-assistant/places':places},{Blob,localStorage:{
    getItem:()=>stored,setItem:(_,value)=>{stored=value;writes++;},
  }});
  const hooks=[],requests=[];let index=0;
  const jsx=(type,props)=>({type,props});
  const react={
    useState(initial){const i=index++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},
    useRef(initial){const i=index++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];},
    useEffect(){},
  };
  const component=load('mobile/src/components/TravelOfflineMap.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/offlineMaps':storage,
    '../../../lib/travel-assistant/offline-map':offline,'../../../lib/travel-assistant/places':places,
    '../lib/i18n':{useI18n:()=>({copy:(_,en)=>en,dateLocale:'en'})},
    '../lib/localeFormatting':{formatAppDate:date=>date.toISOString()},
    '../hooks/useCurrentTime':{useCurrentTime:()=>now},
    '../lib/config':{config:{travelAssistantApiBaseUrl:'https://example.test'}},
    '../lib/travelAssistant':{locateForTravel:async()=>center},
    '../lib/travelAreas':{TRAVEL_CENTRES:[]},
    '../lib/api':{ApiError:class extends Error{},requestJson:()=>{const wait=deferred();requests.push(wait);return wait.promise;}},
    './Sheet':{Sheet:'Sheet'},'./TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},
  },{Blob});
  const render=()=>{index=0;return component.TravelOfflineMap();};
  const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):typeof tree==='string'?tree:'';
  const download=async()=>{
    nodes(render()).find(node=>node.type==='TravelAreaPicker').props.onChange(center);
    const view=render();
    const update=nodes(view).find(node=>node.type==='button'&&node.props.children==='Update selected area');
    (update || nodes(view).find(node=>node.type==='button'&&node.props.children==='Download my current area')).props.onClick();
    await new Promise(setImmediate);
  };

  await download();
  const current=pack(now-3600000,[pharmacy]);
  storage.saveOfflineMap(current); // A newer download finishes elsewhere while this request is pending.
  const before=stored;
  requests[0].resolve({...pack(now-7200000),stale:true});
  await new Promise(setImmediate);
  let view=render();
  assert.equal(stored,before);assert.equal(writes,1);
  assert.match(text(view),/A newer map of this area is already on your device/);
  assert.match(text(view),new RegExp(current.downloadedAt.replaceAll('.','\\.')));
  assert.doesNotMatch(text(view),/The last retrieved pack for this area was saved/);
  const shown=nodes(view).find(node=>node.type?.name==='OfflinePackExplorer').props.pack;
  assert.equal(shown.downloadedAt,current.downloadedAt);assert.equal(shown.places[0].name,'Saved pharmacy');
  nodes(view).find(node=>node.type==='button'&&node.props['aria-pressed']===false).props.onClick();
  assert.doesNotMatch(text(render()),/A newer map of this area is already on your device/);

  await download();
  assert.doesNotMatch(text(render()),/A newer map of this area is already on your device/);
  const newest=pack(now,[{...pharmacy,tags:{...pharmacy.tags,name:'Updated pharmacy'}}]);
  requests[1].resolve(newest);await new Promise(setImmediate);
  view=render();
  assert.equal(writes,2);assert.equal(storage.readOfflineMaps()[0].downloadedAt,newest.downloadedAt);
  assert.equal(nodes(view).find(node=>node.type?.name==='OfflinePackExplorer').props.pack.places[0].name,'Updated pharmacy');
  assert.doesNotMatch(text(view),/A newer map of this area is already on your device/);
});

function offlineDownloadHarness({saved=[]}={}){
  const places=load('lib/travel-assistant/places.ts',{});
  const offline=load('lib/travel-assistant/offline-map.ts',{'./places':places});
  const center={latitude:41.01,longitude:28.98};
  const street={type:'way',id:1,tags:{highway:'residential',name:'Saved street'},geometry:[{lat:41.01,lon:28.98},{lat:41.011,lon:28.981}]};
  const pack=(c=center)=>offline.normalizeOfflineMap({elements:[street]},c);
  let stored=JSON.stringify(saved.map(value=>value===true?pack():value)),writes=0;
  const storage=load('mobile/src/lib/offlineMaps.ts',{'../../../lib/travel-assistant/offline-map':offline,'../../../lib/travel-assistant/places':places},{Blob,localStorage:{getItem:()=>stored,setItem:(_,value)=>{stored=value;writes++;}}});
  let cursor=0; const hooks=[],requests=[];
  const jsx=(type,props)=>({type,props});
  const react={useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},useRef(initial){const i=cursor++;return hooks[i]||={current:initial};},useEffect(){}};
  class ApiError extends Error {constructor(status){super('Map source unavailable');this.status=status;}}
  const component=load('mobile/src/components/TravelOfflineMap.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/offlineMaps':storage,
    '../../../lib/travel-assistant/offline-map':offline,'../../../lib/travel-assistant/places':places,
    '../lib/i18n':{useI18n:()=>({copy:(_,en)=>en,dateLocale:'en'})},
    '../lib/localeFormatting':{formatAppDate:date=>date.toISOString()},'../hooks/useCurrentTime':{useCurrentTime:()=>Date.now()},
    '../lib/config':{config:{travelAssistantApiBaseUrl:'https://example.test'}},'../lib/travelAssistant':{locateForTravel:async()=>center},
    '../lib/travelAreas':{TRAVEL_CENTRES:[]},'../lib/api':{ApiError,requestJson:(url,options)=>{const wait=deferred();requests.push({...wait,url,options});return wait.promise;}},
    './Sheet':{Sheet:'Sheet'},'./TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},
  },{Blob});
  const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):typeof tree==='string'?tree:'';
  const render=()=>{cursor=0;return component.TravelOfflineMap();};
  return{center,pack,requests,ApiError,render,text,
    select(c=center){nodes(render()).find(node=>node.type==='TravelAreaPicker').props.onChange(c);},
    click(label){const node=nodes(render()).find(node=>node.type==='button'&&text(node)===label);assert.ok(node,`Missing button ${label}`);node.props.onClick();},
    get stored(){return stored;},get writes(){return writes;},get saved(){return storage.readOfflineMaps();},
  };
}

test('A verified local map opens without any network request; failed explicit update keeps it readable',async()=>{
  const h=offlineDownloadHarness({saved:[true]}); h.select();
  const before=h.stored;
  h.click('Open saved map'); await new Promise(setImmediate);
  assert.equal(h.requests.length,0); assert.equal(h.writes,0);
  assert.match(h.text(h.render()),/already on your device/);
  h.click('Update selected area'); assert.equal(h.requests.length,1);
  h.requests[0].reject(new h.ApiError(503)); await new Promise(setImmediate);
  assert.equal(h.stored,before); assert.equal(h.writes,0);
  assert.match(h.text(h.render()),/The map source is busy/);
  assert.match(h.text(h.render()),/Saved on device · Available offline/);
});

test('Opening an older saved area remains offline and shows its age instead of forcing a refresh',async()=>{
  const sample=offlineDownloadHarness();
  const old={...sample.pack(),downloadedAt:new Date(Date.now()-8*86400000).toISOString()};
  const h=offlineDownloadHarness({saved:[old]});h.select();h.click('Open saved map');
  await new Promise(setImmediate);
  assert.equal(h.requests.length,0);assert.equal(h.writes,0);
  assert.match(h.text(h.render()),/Pack is over 7 days old/);
  assert.match(h.text(h.render()),/without internet/);
});

test('An invalid or wrong-area download is not saved, and retry keeps the manually selected area',async()=>{
  const h=offlineDownloadHarness();h.select();h.click('Download selected area');
  h.requests[0].resolve(h.pack({...h.center,latitude:41.02}));await new Promise(setImmediate);
  assert.equal(h.saved.length,0);assert.equal(h.writes,0);
  assert.doesNotMatch(h.text(h.render()),/Ready to open without internet/);
  h.click('Retry the same area');assert.equal(h.requests.length,2);
  assert.equal(h.requests[1].options.body.latitude,h.center.latitude);
  assert.equal(h.requests[1].options.body.longitude,h.center.longitude);
  h.requests[1].resolve(h.pack());await new Promise(setImmediate);
  assert.equal(h.saved.length,1);assert.equal(h.writes,1);
  assert.match(h.text(h.render()),/Ready to open without internet/);
});

test('Cancelling a map download fences a late response while a later retry can still succeed',async()=>{
  const h=offlineDownloadHarness();h.select();h.click('Download selected area');
  h.click('Cancel download');assert.equal(h.requests[0].options.signal.aborted,true);
  assert.match(h.text(h.render()),/Download cancelled/);
  h.click('Download selected area');assert.equal(h.requests.length,2);
  h.requests[0].resolve(h.pack());await new Promise(setImmediate);
  assert.equal(h.writes,0);assert.equal(h.saved.length,0);
  h.requests[1].resolve(h.pack());await new Promise(setImmediate);
  assert.equal(h.writes,1);assert.equal(h.saved.length,1);
});

// Keep the actual classic loader, discovery validator and response validator in
// the chain. Only the HTTP boundary is replaced; the wrong public-host route or
// an accidental AI/quota request must fail this harness instead of being hidden.
function classicMapAdapter(provider='apple') {
  const calls=[];let now=Date.parse('2026-10-24T10:00:00.000Z'),writes=0;
  class Clock extends Date {static now(){return now;}}
  const places=load('lib/travel-assistant/places.ts',{});
  const evidence=load('lib/travel-assistant/evidence.ts',{}, {Date:Clock});
  const money=load('lib/travel-assistant/money.ts',{}, {Date:Clock});
  const responses=load('lib/travel-assistant/responses.ts',{'./places':places,'./evidence':evidence,'./money':money},{Date:Clock});
  const fixture=(body,changes={})=>{
    const culture=body.category==='culture',id=provider==='apple'?`apple/${culture?'CULTURE':'ESSENTIALS'}_1`:`node/${culture?101:202}`;
    const center={latitude:Math.round(body.latitude*100)/100,longitude:Math.round(body.longitude*100)/100};
    const fetchedAt=new Date(now).toISOString(),category=culture?'museum':'pharmacy';
    return{center,fetchedAt,radius:3000,limited:false,attribution:provider==='apple'?'Apple Maps':'© OpenStreetMap contributors',
      places:[{...center,id,category,name:culture?'Museum fixture':'Pharmacy fixture',description:null,hours:null,free:null,accessible:null,
        website:null,representedCountry:null,sourceUrl:provider==='apple'?`https://maps.apple.com/place?place-id=${id.slice(6)}`:`https://www.openstreetmap.org/${id}`,
        fetchedAt,group:body.category,kind:category,address:null}],...changes};
  };
  let respond=(_path,options)=>fixture(options.body);
  const requestJson=async(path,options)=>{
    calls.push({path,options});
    assert.equal(path,'/api/travel-assistant/discover','Classic maps use the canonical main discovery API, never the OSM-only host, AI generation or daily-quota endpoints');
    assert.equal(options.method,'POST');
    assert.ok(options.timeoutMs>=30000&&options.timeoutMs<=35000);
    return respond(path,options);
  };
  const journey=load('mobile/src/lib/mapJourneyClient.ts',{
    './api':{requestJson},'./travelAreas':{TRAVEL_CENTRES:[]},'./searchText':{normalizeSearchText:value=>value.trim().toLowerCase()},
    '../../../lib/travel-assistant/places':places,
  },{Date:Clock});
  const api=load('mobile/src/lib/travelAssistant.ts',{
    './api':{requestJson},'./config':{config:{apiBaseUrl:'https://canonical.example.test',travelAssistantApiBaseUrl:'https://osm-only.example.test'}},
    './mapJourneyClient':journey,'../../../lib/travel-assistant/places':places,'../../../lib/travel-assistant/responses':responses,
    '../../../lib/travel-assistant/money':money,
  },{Date:Clock,localStorage:{getItem:()=>null,setItem:()=>{writes++;},removeItem:()=>{writes++;}}});
  return{api,calls,fixture,responses,setResponder(next){respond=next;},advance(ms){now+=ms;},get writes(){return writes;}};
}

test('Classic sightseeing and essentials maps use the real main discovery adapter with exact Apple or OSM provenance and no AI allowance request',async()=>{
  for(const provider of ['apple','osm']){
    const h=classicMapAdapter(provider),point={latitude:48.86012,longitude:2.35028};
    const sightseeing=await h.api.loadPlaces(point,'explore');
    assert.equal(h.calls[0].path,'/api/travel-assistant/discover');
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].options.body)),{latitude:48.86,longitude:2.35,category:'culture',placeCategoryVersion:3});
    assert.equal(sightseeing.places[0].category,'museum');
    assert.equal(sightseeing.attribution,provider==='apple'?'Apple Maps':'© OpenStreetMap contributors');
    assert.equal(sightseeing.places[0].id,provider==='apple'?'apple/CULTURE_1':'node/101');
    assert.equal(sightseeing.places[0].sourceUrl,provider==='apple'?'https://maps.apple.com/place?place-id=CULTURE_1':'https://www.openstreetmap.org/node/101');
    for(const field of ['hours','free','accessible','website'])assert.equal(sightseeing.places[0][field],null,'Unknown provider attributes must not be invented during adaptation');
    const essentials=await h.api.loadPlaces(point,'needs');
    assert.equal(h.calls[1].options.body.category,'essentials');assert.equal(essentials.places[0].category,'pharmacy');
    assert.equal(essentials.attribution,sightseeing.attribution);assert.equal(h.calls.length,2);
    assert.equal(h.writes,0,'Public map discovery neither stores a quota marker nor writes an AI operation');
  }
});

test('The classic adapter shares in-flight work and fresh same-cell results while keeping map modes isolated',async()=>{
  const h=classicMapAdapter(),waits=[];
  h.setResponder((_path,options)=>{const wait=deferred();waits.push({wait,body:options.body});return wait.promise;});
  const first=h.api.loadPlaces({latitude:48.8601,longitude:2.3501},'explore');
  const same=h.api.loadPlaces({latitude:48.8602,longitude:2.3502},'explore');
  const other=h.api.loadPlaces({latitude:48.8601,longitude:2.3501},'needs');
  const completed=Promise.all([first,same,other]);void completed.catch(()=>{});
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.calls.length,2);assert.deepEqual(h.calls.map(call=>call.options.body.category),['culture','essentials']);
  for(const pending of waits)pending.wait.resolve(h.fixture(pending.body));
  const [a,b,c]=await completed;assert.equal(a,b);
  assert.equal(a.places[0].category,'museum');assert.equal(c.places[0].category,'pharmacy');
  await h.api.loadPlaces({latitude:48.8603,longitude:2.3503},'needs');assert.equal(h.calls.length,2,'A fresh same-cell snapshot must avoid another HTTP request');
  const invalidBefore=h.calls.length;
  await assert.rejects(h.api.loadPlaces({latitude:'48.86',longitude:2.35},'explore'));
  await assert.rejects(h.api.loadPlaces({latitude:48.86,longitude:2.35},'culture'));
  assert.equal(h.calls.length,invalidBefore,'Invalid coordinates and map modes fail before any network work');
});

test('Discovery failures remain failures on a cold cell and cannot turn into empty successful classic maps',async()=>{
  for(const kind of ['upstream','malformed','wrong-provider','wrong-category','wrong-cell']){
    const h=classicMapAdapter();
    const outage=Object.assign(new Error('Places temporarily unavailable'),{status:503,code:'discovery_unavailable'});
    h.setResponder((_path,options)=>{
      if(kind==='upstream')throw outage;
      if(kind==='malformed')return{error:'provider unavailable'};
      const result=h.fixture(options.body);
      if(kind==='wrong-provider')result.attribution='© OpenStreetMap contributors';
      if(kind==='wrong-category')result.places[0].category='restaurant';
      if(kind==='wrong-cell')result.center={latitude:52.52,longitude:13.4};
      return result;
    });
    await assert.rejects(h.api.loadPlaces({latitude:48.86,longitude:2.35},'explore'),error=>kind!=='upstream'||error===outage);
    assert.equal(h.calls.length,1,'Failure must not fall back to the old OSM-only API or an AI route');assert.equal(h.writes,0);
    h.setResponder((_path,options)=>h.fixture(options.body));
    assert.equal((await h.api.loadPlaces({latitude:48.86,longitude:2.35},'explore')).places.length,1,'A deliberate retry can recover after failed validation');
    assert.equal(h.calls.length,2);
  }
  const empty=classicMapAdapter();empty.setResponder((_path,options)=>empty.fixture(options.body,{places:[]}));
  const result=await empty.api.loadPlaces({latitude:48.86,longitude:2.35},'explore');
  assert.equal(result.places.length,0);assert.equal(result.stale,false);assert.equal(result.attribution,'Apple Maps','A genuine valid empty response stays distinct from a failed request');
});

test('Classic discovery outage fallback preserves the original provider and date only for the same cell and mode, then expires',async()=>{
  const h=classicMapAdapter(),point={latitude:48.86,longitude:2.35};
  const first=await h.api.loadPlaces(point,'explore');h.advance(60000);
  const outage=Object.assign(new Error('Unavailable'),{status:503});h.setResponder(()=>{throw outage;});
  const stale=await h.api.loadPlaces({latitude:48.8602,longitude:2.3502},'explore',{refresh:true});
  assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,first.fetchedAt);assert.equal(stale.attribution,'Apple Maps');assert.equal(stale.places[0].sourceUrl,first.places[0].sourceUrl);
  await assert.rejects(h.api.loadPlaces(point,'needs'),error=>error===outage);
  await assert.rejects(h.api.loadPlaces({latitude:52.52,longitude:13.4},'explore'),error=>error===outage);
  h.advance(6*3600000);
  await assert.rejects(h.api.loadPlaces(point,'explore'),error=>error===outage,'Expired Apple data cannot be revived during an outage');
  assert.ok(h.calls.every(call=>call.path==='/api/travel-assistant/discover'));assert.equal(h.writes,0);
});
