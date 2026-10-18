import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props, key) => ({ type, props, key });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));
const button = (tree, name) => find(tree, 'button', props => text(props.children).trim() === name || props['aria-label'] === name);
const field = (tree, name, type = 'input') => {
  const label = find(tree, 'label', props => props.children === name || typeof props.children?.[0] === 'string' && props.children[0] === name);
  assert.ok(label, `Missing field label: ${name}`);
  return label.props.htmlFor ? find(tree, type, props => props.id === label.props.htmlFor) : find(label, type);
};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const quotaValue=(changes={})=>{const reset=new Date();reset.setUTCHours(24,0,0,0);return {limit:1,used:0,remaining:1,pending:false,resetAt:reset.toISOString(),timeZone:'UTC',...changes};};

function load(path, imports = {}, environment = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    Error, Date, Intl, URL, AbortController, setTimeout, clearTimeout, requestAnimationFrame: fn => fn(), window:{addEventListener(){},removeEventListener(){}}, ...environment,
  })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
    throw Error(`Missing fixture import: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}
const placeData = load('lib/travel-assistant/places.ts');
const areas = load('mobile/src/lib/travelAreas.ts');
const searchText = load('mobile/src/lib/searchText.ts');
let nextId = 0;
const model = load('mobile/src/lib/mapJourney.ts', {
  '../../../lib/travel-assistant/places': placeData, './id': { createId: () => `fixture-${++nextId}` },
});
const client = load('mobile/src/lib/mapJourneyClient.ts', {
  './api': { requestJson() { throw Error('Unexpected real request in UI fixture'); } },
  './travelAreas': areas, './searchText': searchText, '../../../lib/travel-assistant/places': placeData,
});
const planClient = load('mobile/src/lib/journeyPlanClient.ts', {
  './api': { requestJson() { throw Error('Unexpected real plan request in UI fixture'); } },
  '../../../lib/travel-assistant/places': placeData, './mapJourney': model,
});
const place = (id, name, category = 'museum', extra = {}) => ({
  id: `node/${id}`, name, category, latitude: 41.9 + id / 100_000, longitude: 12.5 + id / 100_000,
  description: null, hours: null, website: null, free: null, accessible: null, representedCountry: null,
  sourceUrl: `https://www.openstreetmap.org/node/${id}`, fetchedAt: new Date().toISOString(),
  group: category === 'hospital' ? 'essentials' : category === 'cafe' ? 'food' : category === 'boutique' ? 'shopping' : 'culture', ...extra,
});
function journey() {
  let plan = model.createMapJourney({ city: 'Roma', center: { latitude: 41.9, longitude: 12.5 }, dayCount: 2, interests: ['culture', 'food'] });
  plan = model.addJourneyStop(plan, place(1, 'Museum A'), 1);
  plan = model.addJourneyStop(plan, place(2, 'Museum B'), 1);
  return model.addJourneyStop(plan, place(3, 'Museum C'), 2);
}
const response = places => ({ places, center: { latitude: 41.9, longitude: 12.5 }, radius: 2500, limited: false, stale: false, fetchedAt: new Date().toISOString(), attribution: 'OpenStreetMap' });
const route = (stops, seconds = 300) => ({ profile: 'foot-walking', geometry: { type: 'LineString', coordinates: stops.map(p => [p.longitude, p.latitude]) }, legs: stops.slice(1).map(() => ({ distanceMeters: 400, durationSeconds: seconds })), distanceMeters: 400 * (stops.length - 1), durationSeconds: seconds * (stops.length - 1), fetchedAt: new Date().toISOString(), sourceUrl: 'https://openrouteservice.org/', attribution: 'OpenRouteService' });
const generated = request => ({
  destination: request.destination, dayCount: request.dayCount, startDate: request.startDate || null, firstDayStartTime: request.firstDayStartTime || null,
  preferences: Object.fromEntries(['party', 'budget', 'pace', 'walking', 'interests', 'notes'].map(key => [key, request[key]])),
  locale: request.locale, summary: `A personal itinerary for ${request.destination.name}.`,
  generatedBy: 'ai', fetchedAt: new Date().toISOString(), attribution: 'Apple Maps', limitations: ['Check visiting hours before travelling.'],
  days: Array.from({ length: request.dayCount }, (_, index) => ({ day: index + 1, theme: `Explore ${request.destination.name}: day ${index + 1}`, explanation: 'Nearby places with time for a break.',
    stops: [0, 1].map(number => ({ place: place(1000 + index * 2 + number, `${request.destination.name} place ${index * 2 + number + 1}`, number ? 'cafe' : 'museum', { latitude: request.destination.latitude + number / 10000, longitude: request.destination.longitude + index / 10000 }), reason: number ? 'A local food break.' : 'Start with a cultural stop.', durationMinutes: number ? 45 : 75 })),
  })),
});

function fixture(options = {}) {
  let active, dirty = false, effects = [], root, props, output, frames = [];
  const fibers = new Map();
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const react = {
    useState(initial) { const fiber = active, i = fiber.cursor++; if (!fiber.slots[i]) { if(options.strict&&typeof initial==='function')initial(); fiber.slots[i] = { value: typeof initial === 'function' ? initial() : initial }; } return [fiber.slots[i].value, next => { const value = typeof next === 'function' ? next(fiber.slots[i].value) : next; if (!Object.is(value, fiber.slots[i].value)) { fiber.slots[i].value = value; dirty = true; } }]; },
    useRef(initial) { const i = active.cursor++; if (!active.slots[i]) active.slots[i] = { current: initial }; return active.slots[i]; },
    useMemo(fn, dependencies) { const i = active.cursor++; if (!active.slots[i] || changed(active.slots[i].dependencies, dependencies)) active.slots[i] = { value: fn(), dependencies }; return active.slots[i].value; },
    useEffect(fn, dependencies) { const fiber = active, i = fiber.cursor++, old = fiber.slots[i]; if (!old || changed(old.dependencies, dependencies)) { fiber.slots[i] = { ...old, dependencies }; effects.push(() => { old?.cleanup?.(); fiber.slots[i].cleanup = fn(); if(options.strict&&!old){fiber.slots[i].cleanup?.();fiber.slots[i].cleanup=fn();} }); } },
  };
  const calls = { draftClears: [], discovery: [], gps: 0, saved: [], synced: [], notices: [], route: [], generation: [], photos: [], placeSaves: [], quota:[], signIn:0 };
  let locale = options.locale || 'en';
  let savedItems = options.savedItems || [];
  const localStorageData = options.storage || new Map();
  const localStorage = { getItem:key=>localStorageData.get(key)??null, setItem:(key,value)=>localStorageData.set(key,value), removeItem:key=>localStorageData.delete(key) };
  const draftLib = load('mobile/src/lib/journeySurveyDraft.ts', {}, {window:{localStorage}});
  const suggestions = load('mobile/src/lib/journeyAreaSuggestions.ts', {'./mapJourneyClient':client, './searchText':searchText, './travelAreas':areas});
  const survey = load('mobile/src/components/JourneySetupSurvey.tsx', {
    '../lib/surveyKeyboard': {observeSurveyKeyboard:()=>()=>{}},
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, './Icon': { Icon: 'Icon' },
    './WelcomeArtwork': {WelcomeArtwork:'WelcomeArtwork'}, '../lib/journeySurveyDraft':draftLib, '../lib/journeyAreaSuggestions':suggestions,
    '../lib/onboardingPreferences': {readWelcomePreferences:()=>({interests:options.welcomeInterests || ['Kültür','Yeme-içme']})},
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) },
    '../lib/mapJourneyClient': { ...client, searchJourneyArea: options.search || (async query => client.knownJourneyArea(query) ? [client.knownJourneyArea(query)] : []) },
  });
  const Main = load('mobile/src/components/MapJourneyPlanner.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) },
    '../lib/localeFormatting':{formatAppDate:(date,locale,options)=>new Intl.DateTimeFormat(locale,options).format(date)},
    './Icon': { Icon: 'Icon' }, './JourneyMap': { JourneyMap: 'JourneyMap' }, './JourneySetupSurvey': survey,
    './RouteTranslation': { RouteTranslation: ({text}) => text },
    './JourneyPlacePhoto': {JourneyPlacePhoto:'JourneyPlacePhoto'},
    '../lib/journeyPhotoClient': {journeyPhotoKey:place=>JSON.stringify([place.id,place.name,place.latitude,place.longitude,place.sourceUrl]),loadJourneyPhotos:(...args)=>{calls.photos.push(args);return options.photos?options.photos(...args):Promise.resolve(new Map());}},
    '../lib/journeyPlanClient': { ...planClient, hasPendingJourneyPlan:()=>!!options.recovery,hasJourneyPlanRecovery:async (...args)=>typeof options.recovery==='function'?options.recovery(...args):!!options.recovery,
      loadJourneyPlanQuota:(...args)=>{calls.quota.push(args);if(options.quota)return options.quota(...args);const reset=new Date();reset.setUTCHours(24,0,0,0);return {then(fn){fn({limit:1,used:0,remaining:1,pending:false,resetAt:reset.toISOString(),timeZone:'UTC'});return {catch(){}};}};},
      generateJourneyPlan: (...args) => { calls.generation.push(args); return options.generate ? options.generate(...args) : Promise.resolve(generated(args[0])); } },
    '../../../lib/travel-assistant/places': placeData, '../lib/travelAreas': areas,
    '../lib/travelAssistant': { locateForTravel: () => { calls.gps++; return options.gps ? options.gps() : Promise.reject(Error('denied')); }, directionsUrl: value => `https://maps.example/${value}` },
    '../lib/native': { openExternal: async () => true },
    '../lib/savedPlaces': { readSavedPlaces: () => ({ items: options.bookmarks || [], dayIds: [], error: null }), subscribeSavedPlaces: () => () => {}, saveTravelPlace(...args) {calls.placeSaves.push(args);} },
    '../lib/routeSync': { syncSavedRoutes: async (...args) => { calls.synced.push(args); return options.sync ? options.sync(...args) : undefined; } },
    '../lib/mapJourneyStorage': {
      readMapJourneys: () => ({ items: savedItems, error: null }),
      saveMapJourney: (...args) => { calls.saved.push(args); const result = options.save ? options.save(...args) : { journey: args[0], status: args[1] ? 'queued' : 'device' }; savedItems = [result.journey]; return result; },
    },
    '../lib/mapJourney': model, '../lib/id': {createId:()=>`fixture-copy-${++nextId}`},
    '../lib/journeySurveyDraft':{...draftLib,clearJourneySurveyDraft:(...args)=>{calls.draftClears.push(args);return draftLib.clearJourneySurveyDraft(...args);}},
    '../lib/mapJourneyClient': {
      ...client,
      searchJourneyArea: options.search || (async query => client.knownJourneyArea(query) ? [client.knownJourneyArea(query)] : []),
      discoverJourneyPlaces: (...args) => { calls.discovery.push(args); return options.discover ? options.discover(...args) : Promise.resolve(response([place(11, 'Real museum')])); },
      loadWalkingRoute: (...args) => { calls.route.push(args); return options.route ? options.route(...args) : Promise.reject(Object.assign(Error('Unavailable'), { code: 'routing_unavailable' })); },
    },
  }).MapJourneyPlanner;
  root = Main; props = { ownerId: Object.hasOwn(options,'ownerId')?options.ownerId:'fixture-owner', accessToken: Object.hasOwn(options,'token')?options.token:'fixture-token', initialCity: 'Roma', initialJourney: options.initialJourney, onUpdateTrip: options.updateTrip,onOpenAccount:()=>calls.signIn++, onNotice: value => calls.notices.push(value) };
  function resolve(node, path, visited) {
    if (Array.isArray(node)) return node.map((child, index) => resolve(child, `${path}/${child?.key ?? index}`, visited));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const key = `${path}:${node.type.name}:${node.key ?? ''}`;
      visited.add(key);
      let fiber = fibers.get(key);
      if (!fiber) { fiber = { slots: [], cursor: 0 }; fibers.set(key, fiber); }
      fiber.cursor = 0; active = fiber;
      return resolve(node.type(node.props), `${key}/render`, visited);
    }
    if (node.props?.ref && !node.props.ref.current) node.props.ref.current = { focus() {}, closest: () => options.sheet || null, scrollTop: 0, scrollIntoView() {}, clientHeight: 800, getBoundingClientRect(){return {top:0,left:0,right:390,bottom:800,width:390,height:800};}, querySelector(){return null;}, querySelectorAll(){return [];} };
    return { ...node, props: { ...node.props, children: resolve(node.props?.children, `${path}/children`, visited) } };
  }
  const app = {
    calls,
    render(next) {
      props = { ...props, ...next };
      frames = [];
      for (let pass = 0; pass < 20; pass++) {
        dirty = false; effects = [];
        const visited = new Set();
        output = resolve(jsx(root, props), 'root', visited);
        frames.push(output);
        for (const [key, fiber] of fibers) if (!visited.has(key)) { fiber.slots.forEach(slot => slot?.cleanup?.()); fibers.delete(key); }
        effects.forEach(fn => fn());
        if (!dirty) return output;
      }
      throw Error('Unstable journey editor render');
    },
    get tree() { return output; },
    get frames() { return frames; },
    get map() { return find(output, 'JourneyMap')?.props; },
    click(name) { const found = button(output, name); assert.ok(found, `Missing button: ${name}`); assert.equal(Boolean(found.props.disabled), false, `Disabled button: ${name}`); if(found.props.type === 'submit') find(output, 'form').props.onSubmit({preventDefault(){}}); else found.props.onClick(); return this.render(); },
    submit() { find(output, 'form').props.onSubmit({preventDefault(){}}); return this.render(); },
    choice(name,value) { const found=find(output,'input',props=>props.name===name&&props.value===value);assert.ok(found,`Missing choice ${name}: ${value}`);found.props.onChange();return this.render(); },
    interest(value) { const found=find(output,'input',props=>props.type==='checkbox'&&props.value===value);assert.ok(found);found.props.onChange();return this.render(); },
    input(name, value, type = 'input') { const found = field(output, name, type); assert.ok(found, `Missing ${type}: ${name}`); found.props.onChange({ target: { value, checked: value } }); return this.render(); },
    locale(value) { locale = value; return this.render(); },
    dispose() { fibers.forEach(fiber => fiber.slots.forEach(slot => slot?.cleanup?.())); },
  };
  app.render();
  return app;
}

test('Map and day list share selected place identity, and moving the selected stop follows its new day', async () => {
  const app = fixture({ initialJourney: journey() });
  try {
    assert.equal(app.map.activeDay, 1);
    app.click('Overview');
    assert.equal(app.map.activeDay, null);
    app.map.onSelectPlace(app.map.stops.find(stop => stop.name === 'Museum C'));
    app.render();
    assert.equal(app.map.activeDay, 2);
    assert.equal(app.map.selectedPlaceId, 'node/3');
    app.input('Move to another day', '1', 'select');
    assert.equal(app.map.activeDay, 1);
    assert.equal(app.map.stops.find(stop => stop.id === 'node/3').day, 1);
    app.click('Undo last change');
    assert.equal(app.map.stops.find(stop => stop.id === 'node/3').day, 2);
    assert.equal(app.map.selectedPlaceId, null);
    app.click('Day 2');
    assert.equal(app.map.activeDay, 2);
  } finally { app.dispose(); }
});

test('Optional venue photos enrich the active map and cards without delaying editing, changing the plan or marking it dirty', async () => {
  const waiting = deferred(), original = journey();
  const app = fixture({ initialJourney: original, photos: () => waiting.promise });
  const metadata = {imageUrl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Museum.jpg/640px-Museum.jpg',imageSourceUrl:'https://commons.wikimedia.org/wiki/File:Museum.jpg',imageAttribution:'Photographer',imageLicenseLabel:'CC BY-SA 4.0',imageLicenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'};
  const photoKey = p=>JSON.stringify([p.id,p.name,p.latitude,p.longitude,p.sourceUrl]);
  try {
    assert.ok(app.map, 'Map is already usable while photo lookup is unfinished');
    assert.deepEqual(clone(app.calls.photos[0][0].map(p=>p.id)), ['node/1','node/2']);
    assert.doesNotMatch(text(app.tree), /Unsaved changes/);
    waiting.resolve(new Map([[photoKey(original.stops[0].place),metadata]]));await tick();app.render();
    assert.equal(app.map.stops.find(p=>p.id==='node/1').imageUrl,metadata.imageUrl);
    assert.equal(find(app.tree,'JourneyPlacePhoto',p=>p.compact&&p.place.id==='node/1').props.place.imageAttribution,'Photographer');
    assert.doesNotMatch(text(app.tree), /Unsaved changes/);assert.equal(original.stops[0].place.imageUrl,undefined);
    app.click('Save');await tick();app.render();
    assert.deepEqual(clone(app.calls.saved[0][0].stops),clone(original.stops));
  } finally {app.dispose();}
});

test('An abandoned photo response cannot populate a different account or reopen a departed map', async () => {
  const waiting = deferred(), original = journey();const app=fixture({initialJourney:original,ownerId:'photo-owner-a',photos:()=>waiting.promise});
  try {
    app.render({ownerId:'photo-owner-b',initialJourney:undefined});assert.equal(app.map,undefined);
    const p=original.stops[0].place;
    waiting.resolve(new Map([[JSON.stringify([p.id,p.name,p.latitude,p.longitude,p.sourceUrl]),{imageUrl:'old-owner-photo'}]]));await tick();app.render();
    assert.equal(app.map,undefined);assert.equal(app.calls.saved.length,0);
  } finally {app.dispose();}
});

test('Saving or adding a photo-enriched discovered place keeps the original provider snapshot compatible with stored trips', async()=>{
  const metadata={imageUrl:'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Museum.jpg/960px-Museum.jpg',imageSourceUrl:'https://commons.wikimedia.org/wiki/File:Museum.jpg',imageAttribution:'Photographer',imageLicenseLabel:'CC BY-SA 4.0',imageLicenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'};
  const app=fixture({initialJourney:journey(),photos:async requested=>new Map(requested.map(p=>[JSON.stringify([p.id,p.name,p.latitude,p.longitude,p.sourceUrl]),metadata]))});
  try {
    app.click('＋ Add a place');await tick();app.render();app.map.onSelectPlace(app.map.discoveredPlaces[0]);app.render();await tick();app.render();
    const detail=find(app.tree,'article',p=>p.className==='mj-place-detail');assert.equal(find(detail,'JourneyPlacePhoto').props.place.imageUrl,metadata.imageUrl);
    button(detail,'Save').props.onClick();app.render();assert.equal(app.calls.placeSaves[0][0].imageUrl,undefined);
    app.click('Add to my plan');app.click('Save');await tick();app.render();
    const added=app.calls.saved[0][0].stops.find(stop=>stop.place.id==='node/11');assert.ok(added);assert.equal(added.place.imageUrl,undefined);
  }finally{app.dispose();}
});

test('Opening the planner asks for a destination without requesting GPS or providers, and all survey preferences reach actual generation', async () => {
  const app = fixture({ ownerId:'traveller-a',token:'fixture-token' });
  try {
    assert.match(text(app.tree), /Where would you like to go/);
    assert.equal(app.map,undefined);assert.equal(app.calls.gps,0);assert.equal(app.calls.generation.length,0);assert.equal(app.calls.discovery.length,0);
    app.click('Tokyo');app.submit();
    app.input('How many days?','2');app.click('Specific dates');app.input('Start date','2027-04-15');app.input('Start exploring at','14:30');app.submit();
    app.choice('jsv-party','family');app.choice('jsv-budget','economical');app.choice('jsv-pace','relaxed');app.choice('jsv-walking','light');app.submit();
    app.interest('nature');app.input('Anything else you would like?','Quiet mornings and a sunset view.','textarea');
    app.click('Create my AI itinerary');await tick();app.render();
    assert.equal(app.calls.generation.length,1);
    assert.deepEqual(app.calls.draftClears,[],'Keep exact survey input for recovery before the user saves');
    const [request,token]=app.calls.generation[0];
    assert.deepEqual(clone(request),{destination:clone(client.knownJourneyArea('Tokyo')),dayCount:2,startDate:'2027-04-15',firstDayStartTime:'14:30',party:'family',budget:'economical',pace:'relaxed',walking:'light',interests:['culture','food','nature'],notes:'Quiet mornings and a sunset view.',locale:'en'});
    assert.equal(token,'fixture-token');assert.equal(app.map.center.latitude,35.68);assert.equal(app.map.stops.length,4);
    assert.match(text(app.tree),/Explore Tokyo: day 1|Nearby places with time for a break/);
    assert.equal(app.calls.saved.length,0,'Generation is a draft until Save is explicitly chosen');
    app.click('Save');await tick();app.render();
    assert.equal(app.calls.saved[0][0].planning.preferences.walking,'light');
    assert.equal(app.calls.saved[0][0].firstDayStartTime,'14:30');
    assert.equal(app.calls.saved[0][0].stops[0].note,'Start with a cultural stop.');
  }finally{app.dispose();}
});

test('Guest AI creation opens real sign-in and the next account receives the exact survey once without an automatic paid request',async()=>{
  const app=fixture({ownerId:null,token:'',strict:true});
  try{
    assert.equal(app.calls.quota.length,0);app.click('Tokyo');app.submit();app.input('How many days?','2');app.submit();app.submit();
    app.input('Anything else you would like?','Quiet mornings','textarea');app.click('Sign in to continue');
    assert.equal(app.calls.signIn,1);assert.equal(app.calls.generation.length,0);
    app.render({ownerId:'signed-owner',accessToken:'signed-token'});
    assert.equal(field(app.tree,'Anything else you would like?','textarea').props.value,'Quiet mornings');
    assert.equal(app.calls.generation.length,0);assert.equal(app.calls.quota.length,2);
    app.click('Create my AI itinerary');await tick();app.render();
    assert.equal(app.calls.generation[0][0].destination.name,'Tokyo');assert.equal(app.calls.generation[0][0].notes,'Quiet mornings');
    app.render({ownerId:'different-owner',accessToken:'other-token'});assert.equal(app.map,undefined);assert.doesNotMatch(text(app.tree),/Quiet mornings/);
  }finally{app.dispose();}
});

test('The signed-in owner can resume a claimed guest survey after a second committed remount; another account cannot',()=>{
  const storage=new Map(),guest=fixture({ownerId:null,token:'',storage,strict:true});
  try{guest.click('Tokyo');guest.submit();guest.submit();guest.submit();guest.input('Anything else you would like?','Persist across committed remount','textarea');guest.click('Sign in to continue');}finally{guest.dispose();}
  for(let mount=0;mount<2;mount++){
    const signed=fixture({ownerId:'same-claim-owner',token:'signed-token',storage,strict:true});
    try{assert.equal(field(signed.tree,'Anything else you would like?','textarea').props.value,'Persist across committed remount');assert.equal(signed.calls.generation.length,0);}finally{signed.dispose();}
  }
  const other=fixture({ownerId:'other-claim-owner',token:'other-token',storage,strict:true});
  try{assert.doesNotMatch(text(other.tree),/Persist across committed remount/);assert.match(text(other.tree),/Where would you like to go/);}finally{other.dispose();}
});

test('Used allowance disables a new AI plan but existing itineraries still open, edit and save without quota requests',async()=>{
  const app=fixture({quota:async()=>quotaValue({used:1,remaining:0})});
  try{
    await tick();app.render();app.submit();app.submit();app.submit();
    assert.equal(button(app.tree,'Create my AI itinerary').props.disabled,true);app.submit();assert.equal(app.calls.generation.length,0);
    assert.match(text(app.tree),/allowance is used/);assert.ok(find(app.tree,'time').props.dateTime);
  }finally{app.dispose();}
  const saved=fixture({initialJourney:journey(),quota:async()=>{throw Error('Should never request allowance for saved plan');}});
  try{saved.click('Save');await tick();saved.render();assert.equal(saved.calls.saved.length,1);assert.equal(saved.calls.quota.length,0);assert.equal(saved.calls.generation.length,0);}finally{saved.dispose();}
});

test('Rotated tokens discard stale quota replies and generation results without replacing the current account plan',async()=>{
  const old=deferred(),current=deferred(),calls=[];
  const app=fixture({token:'old',quota:(token,signal)=>{calls.push({token,signal});return token==='old'?old.promise:current.promise;}});
  try{
    app.render({accessToken:'rotated'});assert.equal(calls[0].signal.aborted,true);
    current.resolve(quotaValue({used:1,remaining:0}));await tick();app.render();
    old.resolve(quotaValue());await tick();app.render();assert.match(text(app.tree),/allowance is used/);assert.doesNotMatch(text(app.tree),/1 new AI itinerary available today/);
    app.render({ownerId:'another',accessToken:'another'});assert.doesNotMatch(text(app.frames[0]),/allowance is used/);
  }finally{app.dispose();}
});

test('Quota exhaustion still permits exact receipt recovery but rejects an edited intent before another POST',async()=>{
  let expected='same notes';const app=fixture({quota:async()=>quotaValue({used:1,remaining:0}),recovery:input=>input.notes===expected});
  try{
    await tick();app.render();app.submit();app.submit();app.submit();app.input('Anything else you would like?','changed notes','textarea');
    app.click('Open previous itinerary / result');await tick();app.render();assert.equal(app.calls.generation.length,0);assert.match(text(app.tree),/allowance is currently unavailable/);
    app.input('Anything else you would like?',expected,'textarea');app.click('Open previous itinerary / result');await tick();app.render();
    assert.equal(app.calls.generation.length,1);assert.ok(app.map);
  }finally{app.dispose();}
});

test('Immutable submitted answers survive later edits and reload; restoring them recovers the original request language',async()=>{
  const storage=new Map();let used=false;
  const settings={ownerId:'recovery-owner',storage,recovery:input=>input.notes==='Original wishes',quota:async()=>quotaValue(used?{used:1,remaining:0}:{})};
  const app=fixture(settings);
  try{
    await tick();app.render();app.click('Tokyo');app.submit();app.submit();app.submit();app.input('Anything else you would like?','Original wishes','textarea');app.submit();await tick();app.render();
    used=true;app.click('Change my preferences');await tick();app.render();app.submit();app.submit();app.submit();app.input('Anything else you would like?','Edited after success','textarea');
    app.click('Restore previous choices');assert.equal(field(app.tree,'Anything else you would like?','textarea').props.value,'Original wishes');
    app.input('Anything else you would like?','Another unsent edit','textarea');
  }finally{app.dispose();}
  const reopened=fixture({...settings,locale:'tr'});
  try{
    await tick();reopened.render();
    assert.ok(nodes(reopened.tree).find(node=>node.type==='textarea'&&node.props.value==='Original wishes'));
    reopened.submit();await tick();reopened.render();assert.equal(reopened.calls.generation.length,1);
    assert.equal(reopened.calls.generation[0][0].notes,'Original wishes');assert.equal(reopened.calls.generation[0][0].locale,'en');assert.ok(reopened.map);
  }finally{reopened.dispose();}
});

test('An oversized free-capacity request retains preferences and tells all three locales that allowance was not spent',async()=>{
  for(const [locale,expected] of [['en',/daily allowance was not used/],['tr',/günlük hakkın kullanılmadı/],['sq',/e drejta ditore nuk u përdor/]]){
    const app=fixture({locale,generate:async()=>{throw Object.assign(Error('too large'),{code:'plan_request_too_large'});}});
    try{app.submit();app.submit();app.submit();app.submit();await tick();app.render();assert.match(text(app.tree),expected);assert.equal(app.map,undefined);assert.equal(app.calls.generation.length,1);}finally{app.dispose();}
  }
});

test('Cancelling generation allows a different city, fences its late result, and preserves the newer generated plan', async () => {
  const pending=deferred();let attempt=0;
  const app=fixture({generate:request=>attempt++?Promise.resolve(generated(request)):pending.promise});
  try{
    app.submit();app.submit();app.submit();app.submit();
    const oldRequest=app.calls.generation[0][0];
    app.click('Stop and edit my choices');assert.equal(app.calls.generation[0][2].aborted,true);
    app.click('Back');app.click('Back');app.click('Back');app.click('Paris');
    app.submit();app.submit();app.submit();app.submit();await tick();app.render();
    assert.equal(app.calls.generation.length,2);assert.equal(app.map.center.latitude,48.86);
    const current=clone(app.map.stops);
    pending.resolve(generated(oldRequest));await tick();app.render();
    assert.equal(app.map.center.latitude,48.86);assert.deepEqual(clone(app.map.stops),current);assert.doesNotMatch(text(app.tree),/Roma place/);
  }finally{app.dispose();}
});

test('AI planning sends only chosen preferences and never silently injects saved emergencies or unrelated places', async () => {
  const bookmarks=[place(90,'Saved hospital','hospital'),place(91,'Saved cafe','cafe'),place(92,'Saved museum')].map(p=>({place:p,note:'',savedAt:p.fetchedAt}));
  const app=fixture({bookmarks});
  try{
    app.submit();app.submit();app.submit();app.interest('food');app.submit();await tick();app.render();
    assert.deepEqual(clone(app.calls.generation[0][0].interests),['culture']);
    assert.equal(app.calls.discovery.length,0,'Place discovery belongs to the bounded AI planning service, not the client');
    assert.doesNotMatch(text(app.tree),/Saved hospital|Saved cafe|Saved museum/);
    assert.equal(app.map.stops.length,6);
  }finally{app.dispose();}
});

test('A failed AI replacement preserves the existing plan and survey choices; explicit retry keeps the same intent', async () => {
  const initial=journey(),before=clone(initial);let attempts=0;
  const app=fixture({initialJourney:initial,generate:async request=>{if(!attempts++)throw Object.assign(Error('unavailable'),{code:'plan_places_unavailable'});return generated(request);}});
  try{
    app.click('Create or open another plan');app.click('Paris');app.submit();app.input('How many days?','2');app.submit();
    app.choice('jsv-party','friends');app.choice('jsv-budget','comfortable');app.submit();app.input('Anything else you would like?','Art museums and a quiet afternoon.','textarea');app.submit();
    await tick();app.render();
    assert.equal(app.map,undefined);assert.match(text(app.tree),/Your choices are kept/);
    assert.ok(button(app.tree,'Return to my open plan · Roma'));
    assert.equal(field(app.tree,'Anything else you would like?','textarea').props.value,'Art museums and a quiet afternoon.');
    assert.deepEqual(clone(initial),before,'A failed replacement must not mutate existing stops');
    assert.equal(app.calls.saved.length,0);
    app.submit();await tick();app.render();
    assert.equal(app.calls.generation.length,2);
    assert.deepEqual(clone(app.calls.generation[1][0]),clone(app.calls.generation[0][0]));
    assert.equal(app.map.center.latitude,48.86);assert.equal(app.map.stops.length,4);
    app.click('Change my preferences');
    assert.equal(field(app.tree,'Destination').props.value,'Paris');
    app.submit();assert.equal(field(app.tree,'How many days?').props.value,'2');app.submit();
    assert.equal(find(app.tree,'input',p=>p.name==='jsv-party'&&p.value==='friends').props.checked,true);
  }finally{app.dispose();}
  const failed=fixture({initialJourney:initial,generate:async()=>{throw Error('temporary');}});
  try{
    failed.click('Create or open another plan');failed.submit();failed.submit();failed.submit();failed.submit();await tick();failed.render();
    failed.click('Return to my open plan · Roma');failed.click('Save');await tick();failed.render();
    assert.deepEqual(clone(failed.calls.saved[0][0]),before,'The retained plan is still editable and saveable after generation fails');
  }finally{failed.dispose();}
});

test('Provider busy and unknown service errors preserve the open plan and survey without automatic retries or false quota claims', async () => {
  for (const code of ['plan_busy', 'future_service_error']) {
    const initial = journey(), before = clone(initial);
    const app = fixture({ initialJourney: initial, generate: async () => { throw Object.assign(Error('private-provider-message'), { code }); } });
    try {
      app.click('Create or open another plan'); app.click('Paris'); app.submit(); app.submit(); app.submit();
      app.input('Anything else you would like?', 'A quiet museum morning.', 'textarea'); app.submit();
      await tick(); app.render(); await tick(); app.render();
      assert.match(text(app.tree), code === 'plan_busy' ? /cannot accept another request right now/ : /Your itinerary could not be prepared/);
      assert.doesNotMatch(text(app.tree), /reached the planning limit|private-provider-message/);
      assert.equal(field(app.tree, 'Anything else you would like?', 'textarea').props.value, 'A quiet museum morning.');
      assert.equal(app.calls.generation.length, 1); assert.equal(app.calls.saved.length, 0);
      assert.deepEqual(clone(initial), before);
      app.click('Return to my open plan · Roma');
      assert.equal(app.map.stops.length, before.stops.length);
    } finally { app.dispose(); }
  }
});

test('Daily provider capacity explains service availability in every locale without blaming the user or promising a reset', async () => {
  const messages = {
    tr: 'AI rota servisi günlük kapasite sınırı nedeniyle şu anda yeni plan oluşturamıyor. Tercihlerin ve önceki planın korundu.',
    en: 'The AI planning service cannot create new plans because its daily capacity limit has been reached. Your preferences and previous plan are kept.',
    sq: 'Shërbimi AI nuk mund të krijojë plane të reja për shkak të kufirit të kapacitetit ditor. Preferencat dhe plani i mëparshëm ruhen.',
  };
  for (const [locale, expected] of Object.entries(messages)) {
    const initial = journey(), before = clone(initial);
    const app = fixture({ initialJourney: initial, generate: async () => { throw Object.assign(Error('private-provider-message'), { code: 'plan_daily_capacity' }); } });
    try {
      app.click('Create or open another plan'); app.click('Paris'); app.submit(); app.submit(); app.submit();
      app.input('Anything else you would like?', 'A quiet museum morning.', 'textarea'); app.locale(locale); app.submit();
      await tick(); app.render();
      assert.equal(text(find(app.tree, 'p', props => props.role === 'alert')), expected);
      assert.equal(find(app.tree, 'textarea').props.value, 'A quiet museum morning.');
      assert.equal(app.calls.generation.length, 1); assert.equal(app.calls.saved.length, 0);
      assert.deepEqual(clone(initial), before);
      app.locale('en'); app.click('Return to my open plan · Roma');
      assert.equal(app.map.stops.length, before.stops.length);
    } finally { app.dispose(); }
  }
});

test('Locale and token changes cancel old AI work, preserve answers, and reject old success or failure before a fresh retry', async () => {
  for(const mode of ['locale','token']){
    const pending=deferred();let attempt=0;
    const app=fixture({ownerId:`generation-${mode}`,token:'old-token',generate:request=>attempt++?Promise.resolve(generated(request)):pending.promise});
    try{
      app.click('Tokyo');app.submit();app.input('How many days?','2');app.submit();app.choice('jsv-party','couple');app.submit();app.input('Anything else you would like?','A quiet evening.','textarea');app.submit();
      const old=app.calls.generation[0][0];
      if(mode==='locale')app.locale('sq');else app.render({accessToken:'new-token'});
      assert.equal(app.calls.generation[0][2].aborted,true);
      if(mode==='locale')pending.resolve(generated(old));else pending.reject(Error('obsolete failure'));
      await tick();app.render();assert.equal(app.map,undefined);
      assert.doesNotMatch(text(app.tree),/Your itinerary could not be prepared/);
      assert.equal(find(app.tree,'textarea').props.value,'A quiet evening.');
      app.submit();await tick();app.render();
      assert.equal(app.map.center.latitude,35.68);assert.equal(app.calls.generation[1][0].party,'couple');
      assert.equal(app.calls.generation[1][0].locale,mode==='locale'?'sq':'en');
      assert.equal(app.calls.generation[1][1],mode==='token'?'new-token':'old-token');
    }finally{app.dispose();}
  }
});

test('Account switches and unmount abort AI work; the previous account cannot populate the new survey or map', async () => {
  const pending=deferred();const app=fixture({ownerId:'ai-account-a',token:'token-a',generate:()=>pending.promise});
  try{
    app.click('Tokyo');app.submit();app.submit();app.choice('jsv-party','family');app.submit();app.input('Anything else you would like?','Private family preferences','textarea');app.submit();
    const old=app.calls.generation[0][0];
    app.render({ownerId:'ai-account-b',accessToken:'token-b'});
    assert.equal(app.calls.generation[0][2].aborted,true);
    pending.resolve(generated(old));await tick();app.render();
    assert.equal(app.map,undefined);assert.match(text(app.tree),/Where would you like to go/);
    assert.doesNotMatch(text(app.tree),/Private family preferences|Tokyo place/);
    assert.equal(field(app.tree,'Destination').props.value,'Roma');
  }finally{app.dispose();}
  const hanging=deferred();const departed=fixture({generate:()=>hanging.promise});
  departed.submit();departed.submit();departed.submit();departed.submit();
  departed.dispose();assert.equal(departed.calls.generation[0][2].aborted,true);
  hanging.resolve(generated(departed.calls.generation[0][0]));await tick();
  assert.equal(departed.calls.saved.length,0);assert.equal(departed.calls.notices.length,0);
});

test('An invalid initial journey falls back to the destination survey rather than a blank editor', () => {
  const app=fixture({initialJourney:{...journey(),dayCount:99}});
  try{
    assert.equal(app.map,undefined);
    assert.match(text(app.tree),/Where would you like to go/);
    assert.equal(app.calls.route.length,0);
  }finally{app.dispose();}
});

test('Stop reservation edits persist, Undo restores their visible fields, and duration errors do not alter the plan', async () => {
  const original = journey();
  const app = fixture({ initialJourney: original });
  try {
    app.map.onSelectPlace(app.map.stops.find(stop => stop.name === 'Museum A')); app.render();
    app.input('Fixed booking time', '11:30');
    app.input('Visit (min)', '90');
    app.input('Note', 'Timed ticket');
    app.click('Apply changes');
    app.click('Save'); await tick(); app.render();
    const saved = app.calls.saved[0][0].stops.find(stop => stop.place.id === 'node/1');
    assert.equal(saved.fixedTime, '11:30'); assert.equal(saved.durationMinutes, 90); assert.equal(saved.note, 'Timed ticket');
    app.click('Undo last change');
    app.map.onSelectPlace(app.map.stops.find(stop => stop.name === 'Museum A')); app.render();
    assert.equal(field(app.tree, 'Fixed booking time').props.value, '');
    assert.equal(field(app.tree, 'Visit (min)').props.value, 60);
    app.input('Visit (min)', '0');
    assert.equal(button(app.tree, 'Apply changes').props.disabled, true);
  } finally { app.dispose(); }
});

test('Save reports storage failures and queued sync honestly, preserves locale, and adopts a replacement identity', async () => {
  const broken = fixture({ initialJourney: journey(), save: () => { throw Error('quota'); } });
  try { broken.click('Save'); await tick(); broken.render(); assert.match(text(broken.tree), /could not save/); assert.equal(broken.calls.notices.length, 0); } finally { broken.dispose(); }
  const app = fixture({ initialJourney: journey(), ownerId: 'fixture-owner', token: 'fixture-token', sync: async () => { throw Error('offline'); }, save: value => ({ journey: { ...value, id: 'journey-replacement' }, status: 'queued' }) });
  try {
    app.click('Save'); await tick(); app.render();
    assert.match(text(app.tree), /Saved on this device; waiting to sync/);
    assert.doesNotMatch(text(app.tree), /Plan saved to your account/);
    assert.equal(app.calls.saved[0][2], 'en');
    app.click('Save'); await tick(); app.render();
    assert.equal(app.calls.saved[1][0].id, 'journey-replacement');
  } finally { app.dispose(); }
});

test('An edited plan cannot receive a stale save success; a departed account cannot receive old discovery or route data', async () => {
  const sync = deferred(), road = deferred();
  const initialJourney = journey();
  const app = fixture({ initialJourney, ownerId: 'account-a', token: 'fixture', sync: () => sync.promise, route: () => road.promise });
  try {
    app.click('Save');
    app.click('Museum A: Move down');
    sync.resolve(); await tick(); app.render();
    assert.equal(app.calls.notices.length, 0);
    assert.doesNotMatch(text(app.tree), /Plan saved to your account/);
    app.render({ ownerId: 'account-b', initialJourney: undefined });
    road.resolve(route(initialJourney.stops.filter(s => s.day === 1).map(s => s.place)));
    await tick(); app.render();
    assert.equal(app.map, undefined);
    assert.doesNotMatch(text(app.tree), /Museum A|Museum B/);
  } finally { app.dispose(); }
});

test('Discovery is explicit and abandoning the editor cannot reopen it from old results', async () => {
  const discoveries = [], roads = [];
  const app = fixture({ initialJourney: journey(), discover: () => { const pending = deferred(); discoveries.push(pending); return pending.promise; }, route: stops => { const pending = deferred(); roads.push({ ...pending, stops }); return pending.promise; } });
  try {
    app.map.onViewportChange({ center: { latitude: 48.86, longitude: 2.35 } }); app.render();
    assert.equal(app.calls.discovery.length, 0);
    app.click('Search this area');
    assert.deepEqual(clone(app.calls.discovery[0][0]), { latitude: 48.86, longitude: 2.35 });
    app.click('My itinerary');
    app.click('Create or open another plan');
    discoveries[0].resolve(response([place(99, 'Obsolete discovery')]));
    roads[0].resolve(route(roads[0].stops));
    await tick(); app.render();
    assert.doesNotMatch(text(app.tree), /Obsolete discovery/);
    assert.equal(app.map, undefined);
  } finally { app.dispose(); }
});

test('Returning to setup aborts walking and discovery batches and never starts hidden follow-up provider work', async () => {
  const pendingDiscovery=deferred(),pendingRoad=deferred();
  const initial=model.addJourneyStop(spreadJourney(),place(251,'Second-day companion','museum',{latitude:48.8601,longitude:2.3501}),2);
  const app=fixture({initialJourney:initial,discover:()=>pendingDiscovery.promise,route:()=>pendingRoad.promise});
  try{
    app.click('Discover places');app.click('Around my route');
    assert.equal(app.calls.discovery.length,1);assert.equal(app.calls.route.length,2);
    app.click('My itinerary');app.click('Create or open another plan');
    assert.equal(app.calls.discovery[0][2].aborted,true);assert.equal(app.calls.route[0][1].aborted,true);
    pendingDiscovery.resolve(response([place(922,'Obsolete hidden shop','boutique')]));pendingRoad.resolve(route(app.calls.route[0][0]));
    await tick();app.render();
    assert.equal(app.calls.discovery.length,1,'A cancelled discovery batch must not query its next area');
    assert.equal(app.calls.route.length,2,'A hidden map must not request another day');
    assert.ok(app.calls.route.every(([,signal])=>signal.aborted));
    assert.equal(app.map,undefined);assert.doesNotMatch(text(app.tree),/Obsolete hidden shop/);
  }finally{app.dispose();}
});

test('A reordered itinerary ignores old route geometry and displays only the matching new walking legs', async () => {
  const requests = [];
  const app = fixture({ initialJourney: journey(), route: stops => { const pending = deferred(); requests.push({ ...pending, stops }); return pending.promise; } });
  try {
    assert.equal(requests.length, 1);
    app.click('Museum A: Move down');
    assert.equal(requests.length, 2);
    requests[0].resolve(route(requests[0].stops, 300));
    await tick(); app.render();
    assert.equal(app.map.routes.length, 0);
    assert.doesNotMatch(text(app.tree), /5 min walk/);
    requests[1].resolve(route(requests[1].stops, 660));
    await tick(); app.render();
    assert.deepEqual(clone(app.map.routes[0].coordinates), clone(requests[1].stops.map(stop => [stop.latitude, stop.longitude])));
    assert.match(text(app.tree), /11 min walk/);
    app.render();
    assert.equal(requests.length, 2, 'Unrelated rerenders must not consume another route request');
  } finally { app.dispose(); }
});

function routedDays(count = 4) {
  let plan = model.createMapJourney({ city: 'Roma', center: { latitude: 41.9, longitude: 12.5 }, dayCount: count });
  for (let day = 1; day <= count; day++) {
    for (let stop = 0; stop < 2; stop++) plan = model.addJourneyStop(plan, place(300 + day * 2 + stop, `Day ${day} place ${stop + 1}`), day);
  }
  return plan;
}

test('Walking routes run at most two requests and a day switch prioritizes queued work without restarting requests', async () => {
  const requests = [];
  const app = fixture({ initialJourney: routedDays(), route: (stops, signal) => {
    const pending = deferred(); requests.push({ ...pending, stops, signal }); return pending.promise;
  } });
  try {
    assert.deepEqual(requests.map(item => item.stops[0].name), ['Day 1 place 1', 'Day 2 place 1']);
    app.click('Day 4');
    assert.equal(requests.length, 2, 'Tab changes must not duplicate in-flight requests');
    assert.ok(requests.every(item => !item.signal.aborted));
    requests[0].resolve(route(requests[0].stops)); await tick(); app.render();
    assert.equal(requests.length, 3);
    assert.equal(requests[2].stops[0].name, 'Day 4 place 1');
    requests[2].resolve(route(requests[2].stops)); await tick(); app.render();
    assert.equal(requests.length, 4);
    assert.equal(requests[3].stops[0].name, 'Day 3 place 1');
    assert.ok(app.map.routes.some(item => item.day === 4), 'Visible day renders before a slow earlier day finishes');
    requests[1].reject(Error('slow day failed')); requests[3].resolve(route(requests[3].stops));
    await tick(); app.render();
    assert.deepEqual(clone(app.map.routes.map(item => item.day)), [1, 3, 4]);
  } finally { app.dispose(); }
});

test('Editing one day keeps unchanged cached routes visible while the changed day reloads', async () => {
  const requests = [];
  const app = fixture({ initialJourney: routedDays(3), route: stops => {
    const pending = deferred(); requests.push({ ...pending, stops }); return pending.promise;
  } });
  try {
    requests[0].resolve(route(requests[0].stops)); requests[1].resolve(route(requests[1].stops));
    await tick(); requests[2].resolve(route(requests[2].stops)); await tick(); app.render();
    assert.equal(app.map.routes.length, 3);
    app.click('Day 2'); app.click('Day 2 place 1: Move down');
    assert.equal(requests.length, 4);
    for (const frame of app.frames) assert.deepEqual(clone(find(frame, 'JourneyMap').props.routes.map(item => item.day)), [1, 3]);
    requests[3].resolve(route(requests[3].stops)); await tick(); app.render();
    assert.equal(app.map.routes.length, 3);
    app.click('Day 3');
    assert.equal(requests.length, 4);
  } finally { app.dispose(); }
});

test('Cancelling a route queue aborts both workers and never launches a pending day after late completion', async () => {
  const requests = [];
  const app = fixture({ initialJourney: routedDays(), route: (stops, signal) => {
    const pending = deferred(); requests.push({ ...pending, stops, signal }); return pending.promise;
  } });
  try {
    app.click('Create or open another plan');
    assert.ok(requests.every(item => item.signal.aborted));
    requests.forEach(item => item.resolve(route(item.stops))); await tick(); app.render();
    assert.equal(requests.length, 2);
    assert.equal(app.map, undefined);
  } finally { app.dispose(); }
});

test('Apple walking legs keep separate paths and show only the selected day totals with real attribution', async () => {
  let plan=journey();
  plan=model.moveJourneyStop(plan,plan.stops.find(stop=>stop.day===2).id,1);
  const app=fixture({initialJourney:plan,route:async stops=>({...route(stops,360),
    sourceUrl:'https://maps.apple.com/',attribution:'Apple Maps',
    geometry:{type:'MultiLineString',coordinates:stops.slice(1).map((stop,index)=>[
      [stops[index].longitude+0.00001,stops[index].latitude],[stop.longitude,stop.latitude]])}})});
  try {
    await tick();app.render();
    assert.equal(app.map.routes.length,2,'Adjacent legs must not gain a made-up connecting path');
    assert.equal(app.map.routes[0].coordinates.length,2);
    assert.notDeepEqual(clone(app.map.routes[0].coordinates.at(-1)),clone(app.map.routes[1].coordinates[0]));
    assert.match(text(app.tree),/0.8 km · 12 min walk/);
    assert.match(text(app.tree),/6 min walk · Apple Maps/);
    assert.doesNotMatch(text(app.tree),/OpenRouteService/);
    app.click('Day 2');
    assert.doesNotMatch(text(app.tree),/0.8 km · 12 min walk/);
    assert.match(text(app.tree),/Add at least two places to the same day/);
    app.click('Overview');
    assert.match(text(app.tree),/0.8 km · 12 min walk/);
  } finally {app.dispose();}
});

test('A day with no walking route cannot prevent another day from showing its genuine route', async () => {
  const plan=model.addJourneyStop(journey(),place(4,'Museum D'),2);
  const app=fixture({initialJourney:plan,route:async stops=>{
    if(stops[0].id==='node/1')throw Object.assign(Error('No walking path'),{code:'routing_unavailable'});
    return route(stops,420);
  }});
  try {
    await tick();app.render();
    assert.equal(app.calls.route.length,2,'A different day is an independent request, not a retry of the failed path');
    assert.equal(app.map.routes.length,1);
    assert.equal(app.map.routes[0].day,2);
    assert.match(text(app.tree),/Some walking routes are unavailable/);
    app.click('Day 2');
    assert.match(text(app.tree),/0.4 km · 7 min walk/);
    assert.doesNotMatch(text(app.tree),/Some walking routes are unavailable/);
    app.click('Overview');
    assert.match(text(app.tree),/Calculated days/);
  }finally{app.dispose();}
});

test('Undo restores only the last change, preserving the preceding reorder and fixed reservation', async () => {
  let initial = journey();
  initial = model.updateJourneyStop(initial, initial.stops[0].id, { fixedTime: '10:00', note: 'Ticket' });
  const app = fixture({ initialJourney: initial });
  try {
    app.click('Museum A: Move down');
    app.map.onSelectPlace(app.map.stops.find(stop => stop.name === 'Museum B')); app.render();
    app.input('Note', 'Last edit'); app.click('Apply changes');
    app.click('Undo last change');
    app.click('Save'); await tick(); app.render();
    const saved = app.calls.saved[0][0];
    assert.deepEqual(clone(model.journeyDayStops(saved, 1).map(stop => stop.place.name)), ['Museum B', 'Museum A']);
    assert.equal(saved.stops.find(stop => stop.place.name === 'Museum B').note, '');
    assert.equal(saved.stops.find(stop => stop.place.name === 'Museum A').fixedTime, '10:00');
    assert.equal(saved.stops.find(stop => stop.place.name === 'Museum A').note, 'Ticket');
    assert.equal(button(app.tree, 'Undo last change').props.disabled, true);
  } finally { app.dispose(); }
});

test('A successful later discovery clears the previous empty-area notice', async () => {
  let attempt = 0;
  const app = fixture({ initialJourney: journey(), discover: async () => response(attempt++ ? [place(82, 'Actual boutique', 'boutique')] : []) });
  try {
    app.click('Search this area'); await tick(); app.render();
    assert.match(text(app.tree), /No results in this area/);
    app.click('Search this area'); await tick(); app.render();
    assert.match(text(app.tree), /Actual boutique/);
    assert.doesNotMatch(text(app.tree), /No results in this area/);
  } finally { app.dispose(); }
});

test('Undo after a deleted-plan replacement preserves the new saved identity', async () => {
  const initial = journey();
  const app = fixture({ initialJourney: initial, ownerId: 'fixture-owner', save: value => ({ journey: { ...value, id: 'journey-replacement' }, status: 'queued' }) });
  try {
    app.click('Museum A: Move down');
    app.click('Save'); await tick(); app.render();
    app.click('Undo last change');
    app.click('Save'); await tick(); app.render();
    assert.equal(app.calls.saved[1][0].id, 'journey-replacement');
    assert.deepEqual(clone(model.journeyDayStops(app.calls.saved[1][0], 1).map(stop => stop.place.name)), ['Museum A', 'Museum B']);
  } finally { app.dispose(); }
});

test('A saved empty plan opens without providers, then a discovered shop can be added, moved, undone, saved and reopened', async () => {
  const shop = place(133, 'Ceramics shop', 'boutique');
  const empty = model.createMapJourney({city:'Roma',center:{latitude:41.9,longitude:12.5},dayCount:3});
  const app = fixture({ initialJourney:empty,discover: async () => response([shop]) });
  try {
    assert.equal(app.map.stops.length, 0);
    assert.equal(app.map.activeDay, 1);
    assert.ok(button(app.tree, 'Day 3'));
    assert.equal(app.calls.discovery.length, 0);
    assert.equal(app.calls.gps, 0);
    assert.equal(app.calls.route.length, 0);
    assert.match(text(app.tree), /This day is empty/);

    app.map.onViewportChange({ center: { latitude: 41.9, longitude: 12.5 } });
    app.click('Search this area'); await tick(); app.render();
    assert.equal(app.calls.discovery.length, 1);
    app.map.onSelectPlace(app.map.discoveredPlaces[0]); app.render();
    app.input('Which day?', '2', 'select');
    app.input('Visit (min)', '30');
    app.input('Note (optional)', 'Look at pottery');
    app.click('Add to my plan');
    assert.equal(app.map.stops.length, 1);
    assert.equal(app.map.activeDay, 2);
    assert.equal(app.map.stops[0].id, shop.id);
    assert.equal(app.map.stops[0].order, 1);
    app.input('Move to another day', '3', 'select');
    assert.equal(app.map.activeDay, 3);
    assert.equal(app.map.stops[0].day, 3);
    app.click('Undo last change');
    assert.equal(app.map.stops[0].day, 2);
    app.click('Save'); await tick(); app.render();
    const saved = app.calls.saved[0][0];
    assert.equal(saved.city, 'Roma'); assert.equal(saved.dayCount, 3);
    assert.equal(saved.stops[0].note, 'Look at pottery');
    assert.equal(saved.stops[0].durationMinutes, 30);

    app.click('Create or open another plan');
    app.click('Roma3 days');
    app.click('Day 2');
    assert.equal(app.map.stops.length, 1);
    assert.equal(app.map.stops[0].id, shop.id);
    assert.equal(app.map.stops[0].day, 2);
    assert.equal(app.calls.discovery.length, 1, 'Reopening must reuse the genuine saved place snapshot');
    assert.equal(app.calls.route.length, 0, 'A single place has no travel leg to invent');
  } finally { app.dispose(); }
});

test('Generating a different city clears old discovery pins and opens only its genuine generated stops', async () => {
  const app = fixture({ initialJourney: journey(), discover: async () => response([place(144, 'Old Rome shop', 'boutique')]) });
  try {
    app.click('Search this area'); await tick(); app.render();
    assert.equal(app.map.discoveredPlaces.length, 1);
    app.click('My itinerary'); app.click('Create or open another plan');
    app.click('Paris');app.submit();app.submit();app.submit();app.submit();await tick();app.render();
    assert.equal(app.map.discoveredPlaces.length, 0);
    assert.doesNotMatch(text(app.tree), /Old Rome shop/);
    assert.ok(app.map.stops.every(stop=>stop.name.startsWith('Paris place')));
    assert.equal(app.map.center.latitude, 48.86);
  } finally { app.dispose(); }
});

test('An immediate area search uses a newly generated or opened Kyoto center before the map reports its viewport', async () => {
  const kyoto={name:'Kyoto',latitude:35.0116,longitude:135.7681};
  const draft=model.createMapJourney({city:kyoto.name,center:{latitude:kyoto.latitude,longitude:kyoto.longitude},dayCount:2});
  for(const mode of ['generated','saved']){
    const app=fixture({initialJourney:journey(),savedItems:[draft],search:async()=>[kyoto]});
    try{
      assert.equal(app.map.center.latitude,41.9);
      app.click('Create or open another plan');
      if(mode==='saved')app.click('Kyoto2 days');
      else{
        app.input('Destination','Kyoto');await new Promise(resolve=>setTimeout(resolve,320));await tick();app.render();app.click('Kyoto');
        app.submit();app.input('How many days?','2');app.submit();app.submit();app.submit();await tick();app.render();
      }
      assert.equal(app.map.center.latitude,kyoto.latitude);
      assert.equal(app.map.center.longitude,kyoto.longitude);
      app.click('Search this area');await tick();app.render();
      assert.equal(app.calls.discovery.length,1);
      assert.equal(app.calls.discovery[0][0].latitude,kyoto.latitude,`${mode} plan must replace the previous city's search latitude`);
      assert.equal(app.calls.discovery[0][0].longitude,kyoto.longitude,`${mode} plan must replace the previous city's search longitude`);
    }finally{app.dispose();}
  }
});

test('Editing already-loaded stops removes mismatched route lines and travel times before effect cleanup', async () => {
  const requests = [];
  const app = fixture({ initialJourney: journey(), route: stops => { const pending = deferred(); requests.push({ ...pending, stops }); return pending.promise; } });
  try {
    requests[0].resolve(route(requests[0].stops, 420));
    await tick(); app.render();
    assert.equal(app.map.routes.length, 1);
    assert.match(text(app.tree), /7 min walk/);
    app.click('Museum A: Move down');
    for (const frame of app.frames) {
      assert.equal(find(frame, 'JourneyMap').props.routes.length, 0);
      assert.doesNotMatch(text(frame), /7 min walk/);
    }
    requests[1].resolve(route(requests[1].stops, 540));
    await tick(); app.render();
    assert.equal(app.map.routes.length, 1);
    assert.match(text(app.tree), /9 min walk/);
  } finally { app.dispose(); }
});

test('Unavailable walking routes retain itinerary edits and recover only through an explicit retry', async () => {
  let attempt = 0;
  const app = fixture({ initialJourney: journey(), route: async stops => { if (!attempt++) throw Object.assign(Error('temporary'), { code: 'routing_unavailable' }); return route(stops, 360); } });
  try {
    await tick(); app.render();
    assert.equal(app.map.routes.length, 0);
    assert.match(text(app.tree), /Some walking routes are unavailable/);
    const before = clone(app.map.stops);
    app.render();
    assert.equal(attempt, 1);
    app.click('Retry walking route'); await tick(); app.render();
    assert.equal(attempt, 2);
    assert.equal(app.map.routes.length, 1);
    assert.match(text(app.tree), /6 min walk/);
    assert.deepEqual(clone(app.map.stops), before);
    assert.doesNotMatch(text(app.tree), /Some walking routes are unavailable/);
  } finally { app.dispose(); }
});

function spreadJourney() {
  let plan = model.createMapJourney({ city: 'Roma', center: { latitude: 41.9, longitude: 12.5 }, dayCount: 2 });
  for (let index = 0; index < 4; index++) plan = model.addJourneyStop(plan, place(200 + index, `Area ${index + 1}`, 'museum', { latitude: 41.7 + index * 0.15, longitude: 12.5 }), 1);
  return model.addJourneyStop(plan, place(250, 'Different-day stop', 'museum', { latitude: 48.86, longitude: 2.35 }), 2);
}

test('Around-route discovery uses only selected-day stops and searches at most three distinct areas sequentially', async () => {
  const initial = spreadJourney(), requests = [];
  const app = fixture({ initialJourney: initial, discover: center => { const pending = deferred(); requests.push({ ...pending, center }); return pending.promise; } });
  try {
    app.click('Discover places'); app.click('Around my route');
    assert.equal(requests.length, 1, 'The first area must finish before another provider request begins');
    for (let index = 0; index < 3; index++) {
      assert.equal(requests.length, index + 1);
      const { center } = requests[index];
      assert.ok(initial.stops.some(stop => stop.day === 1 && stop.place.latitude === center.latitude && stop.place.longitude === center.longitude));
      requests[index].resolve(response([place(700 + index, `Area shop ${index + 1}`, 'boutique', center)]));
      await tick(); app.render();
    }
    assert.equal(requests.length, 3);
    assert.equal(new Set(requests.map(request => JSON.stringify(clone(request.center)))).size, 3);
    assert.equal(app.map.discoveredPlaces.length, 3);
    assert.match(text(app.tree), /Only some stop areas were searched/);
    assert.match(text(app.tree), /3 stop areas/);
    app.click('Day 2'); app.click('Around my route');
    assert.equal(requests.length, 4);
    assert.deepEqual(clone(requests[3].center), { latitude: 48.86, longitude: 2.35 });
    requests[3].resolve(response([place(750, 'Second-day shop', 'boutique', requests[3].center)]));
    await tick(); app.render();
    assert.equal(requests.length, 4);
    assert.deepEqual(clone(app.map.discoveredPlaces.map(item => item.name)), ['Second-day shop']);
  } finally { app.dispose(); }
});

test('A failed middle route-area query preserves successful areas and still searches the remaining center', async () => {
  const requests = [];
  const app = fixture({ initialJourney: spreadJourney(), discover: center => { const pending = deferred(); requests.push({ ...pending, center }); return pending.promise; } });
  try {
    const before = clone(app.map.stops);
    app.click('Discover places'); app.click('Around my route');
    requests[0].resolve(response([place(800, 'Confirmed first-area shop', 'boutique', requests[0].center)]));
    await tick(); app.render();
    assert.equal(requests.length, 2);
    requests[1].reject(Error('temporary provider failure'));
    await tick(); app.render();
    assert.equal(requests.length, 3, 'An independent area must still be searched after a failure');
    requests[2].resolve(response([place(802, 'Confirmed third-area shop', 'boutique', requests[2].center)]));
    await tick(); app.render();
    assert.deepEqual(clone(app.map.discoveredPlaces.map(item => item.name)), ['Confirmed first-area shop', 'Confirmed third-area shop']);
    assert.match(text(app.tree), /Only some stop areas were searched/);
    assert.match(text(app.tree), /2 stop areas/);
    assert.doesNotMatch(text(app.tree), /Places service unavailable/);
    assert.deepEqual(clone(app.map.stops), before);
    assert.equal(button(app.tree, 'Around my route').props.disabled, false);
  } finally { app.dispose(); }
});

test('A first-area failure still returns later discoveries, while failure of every area shows an error', async () => {
  for (const allFail of [false, true]) {
    let attempted = 0;
    const app = fixture({ initialJourney: spreadJourney(), discover: async center => {
      if (++attempted === 1 || allFail) throw Error('temporary provider failure');
      return response([place(810 + attempted, `Later shop ${attempted}`, 'boutique', center)]);
    } });
    try {
      app.click('Discover places'); app.click('Around my route'); await tick(); app.render();
      assert.equal(attempted, 3);
      if (allFail) {
        assert.equal(app.map.discoveredPlaces.length, 0);
        assert.match(text(app.tree), /Places service unavailable/);
      } else {
        assert.equal(app.map.discoveredPlaces.length, 2);
        assert.match(text(app.tree), /Only some stop areas were searched/);
        assert.match(text(app.tree), /2 stop areas/);
        assert.doesNotMatch(text(app.tree), /Places service unavailable/);
      }
    } finally { app.dispose(); }
  }
});

test('Opening another saved journey fences an unfinished route-area batch and prevents its next query', async () => {
  const requests = [], replacement = model.createMapJourney({ city: 'Paris', center: { latitude: 48.86, longitude: 2.35 }, dayCount: 2 });
  const app = fixture({ initialJourney: spreadJourney(), savedItems: [replacement], discover: center => { const pending = deferred(); requests.push({ ...pending, center }); return pending.promise; } });
  try {
    app.click('Discover places'); app.click('Around my route');
    requests[0].resolve(response([place(850, 'First old area', 'boutique', requests[0].center)]));
    await tick(); app.render();
    assert.equal(requests.length, 2);
    app.click('My itinerary'); app.click('Create or open another plan');
    app.click('Paris2 days');
    requests[1].resolve(response([place(851, 'Late old area', 'boutique', requests[1].center)]));
    await tick(); app.render();
    assert.equal(requests.length, 2);
    assert.equal(app.map.discoveredPlaces.length, 0);
    assert.equal(app.map.stops.length, 0);
    assert.deepEqual(clone(app.map.center), { latitude: 48.86, longitude: 2.35 });
    assert.doesNotMatch(text(app.tree), /First old area|Late old area|Only some stop areas/);
    assert.equal(button(app.tree, 'Search this area').props.disabled, false);
  } finally { app.dispose(); }
});


test('Map opens with a compact dock, its expand button receives taps, and the visible exit closes the editor', async()=>{
  const app=fixture({initialJourney:journey()});let closed=0;
  app.render({onClose:()=>closed++});
  let panel=find(app.tree,'section',props=>props['aria-label']==='Daily itinerary panel');
  assert.ok(panel.props.className.includes('is-collapsed'));
  const expand=button(app.tree,'Expand or collapse itinerary panel');
  assert.equal(expand.props['aria-expanded'],false);
  let stopped=false;expand.props.onPointerDown({stopPropagation(){stopped=true;}});
  assert.equal(stopped,true,'the drag parent must not steal the button tap');
  await app.click('Expand or collapse itinerary panel');
  assert.equal(button(app.tree,'Expand or collapse itinerary panel').props['aria-expanded'],true);
  await app.click('Expand or collapse itinerary panel');
  assert.equal(button(app.tree,'Expand or collapse itinerary panel').props['aria-expanded'],false);
  await app.click('Close map');assert.equal(closed,1);
  app.dispose();
});


test('A trip map updates explicitly without writing a library copy, while copying remains an independent action', async () => {
  const writes = [], initial = journey(), app = fixture({ownerId:'trip-owner',initialJourney:initial,updateTrip:async value=>writes.push(value)});
  try {
    app.click('Update this trip'); await tick(); app.render();
    assert.equal(writes.length,1); assert.equal(writes[0].id,initial.id); assert.equal(app.calls.saved.length,0);
    assert.match(text(app.tree),/Your trip was updated/);
    assert.ok(nodes(app.tree).find(item=>item.props?.['data-guide']==='journey-saved'));
    app.click('Save a copy to my plans'); await tick(); app.render();
    assert.equal(writes.length,1); assert.equal(app.calls.saved.length,1); assert.notEqual(app.calls.saved[0][0].id,initial.id);
    assert.equal(app.map.stops.length,initial.stops.length);
    app.click('Update this trip'); await tick(); app.render();
    assert.equal(writes[1].id,initial.id,'Saving a copy never changes the trip editor target');
  } finally {app.dispose();}
});

test('Failed trip update leaves edits open and shows no saved confirmation', async () => {
  const app = fixture({ownerId:'trip-failure',initialJourney:journey(),updateTrip:async()=>{throw Error('Retry this trip update');}});
  try {
    app.click('Update this trip'); await tick(); app.render();
    assert.match(text(app.tree),/Retry this trip update/);
    assert.equal(nodes(app.tree).some(item=>item.props?.['data-guide']==='journey-saved'),false);
    assert.equal(app.calls.saved.length,0); assert.equal(app.map.stops.length,3);
  } finally {app.dispose();}
});

test('Opening the canonical saved snapshot restores its genuine beach category before map display and editing', async () => {
  let initial = model.createMapJourney({city:'Coast',center:{latitude:41.9,longitude:12.5},dayCount:1,firstDayStartTime:'14:30',interests:['sea']});
  initial = model.addJourneyStop(initial,place(999,'Actual beach','beach',{group:'nature',kind:'beach'}),1);
  const stored = model.mapJourneyToSavedRoute(initial).plan.routes[0].mapJourney;
  assert.equal(stored.stops[0].place.category,'attraction');
  const app = fixture({initialJourney:stored});
  try {
    assert.equal(app.map.stops[0].category,'beach');
    app.click('Save'); await tick(); app.render();
    assert.equal(app.calls.saved[0][0].stops[0].place.category,'beach');
    assert.equal(app.calls.saved[0][0].firstDayStartTime,'14:30');
    assert.equal(stored.stops[0].place.category,'attraction');
  } finally { app.dispose(); }
});

test('Unsaved reorders cannot disappear through Close, sheet back or opening another saved route; staying retains edits', async () => {
  const original=journey(), sheet=new EventTarget(); let closed=0;
  const app=fixture({initialJourney:original,sheet,savedItems:[original]});
  app.render({onClose:()=>closed++});
  try {
    app.click('Museum A: Move down');
    assert.match(text(app.tree),/Unsaved changes/);
    const edited=clone(app.map.stops);
    const back=new Event('sheet:before-close',{cancelable:true});
    assert.equal(sheet.dispatchEvent(back),false);
    app.render(); assert.ok(find(app.tree,'div',p=>p.role==='alertdialog'));
    assert.equal(closed,0); assert.equal(app.calls.saved.length,0);
    app.click('Keep editing');assert.deepEqual(clone(app.map.stops),edited);
    app.click('Close map');app.click('Continue without saving');
    assert.equal(closed,1);assert.equal(app.calls.saved.length,0);
    assert.equal(original.stops[0].place.name,'Museum A');
    assert.deepEqual(clone(app.map.stops),clone(original.stops.map(stop=>({...stop.place,day:stop.day,order:stop.order+1}))));
  } finally {app.dispose();}
});

test('Save-and-close confirms durable success; failed save keeps the exact edited plan and close prompt open', async () => {
  for(const fails of [false,true]){
    let closed=0;const app=fixture({initialJourney:journey(),save:fails?()=>{throw Error('quota');}:undefined});
    app.render({onClose:()=>closed++});
    try{
      app.click('Museum A: Move down');const edited=clone(app.map.stops);
      app.click('Close map');app.click('Save and continue');await tick();app.render();
      assert.equal(app.calls.saved.length,1);assert.equal(closed,fails?0:1);
      assert.deepEqual(clone(app.map.stops),edited);
      if(fails){assert.ok(find(app.tree,'div',p=>p.role==='alertdialog'));assert.match(text(app.tree),/Plan could not save/);}
      else {assert.ok(!find(app.tree,'div',p=>p.role==='alertdialog'));assert.doesNotMatch(text(app.tree),/Unsaved changes/);}
    }finally{app.dispose();}
  }
});

test('Saving a separate library copy does not mark the edited trip saved; failed trip updates remain guarded', async()=>{
  let closed=0;const app=fixture({initialJourney:journey(),updateTrip:async()=>{throw Error('Update unavailable');}});
  app.render({onClose:()=>closed++});
  try{
    app.click('Museum A: Move down');app.click('Save a copy to my plans');await tick();app.render();
    app.click('Close map');assert.ok(find(app.tree,'div',p=>p.role==='alertdialog'));
    app.click('Save and continue');await tick();app.render();
    assert.equal(closed,0);assert.match(text(app.tree),/Update unavailable/);assert.equal(app.calls.saved.length,1);
    app.click('Keep editing');assert.match(text(app.tree),/Unsaved changes/);
  }finally{app.dispose();}
});

test('The explicit day picker reaches the last day even when its horizontal tab is offscreen',()=>{
  const app=fixture({initialJourney:{...journey(),dayCount:14}});
  try{
    const picker=find(app.tree,'select',p=>p['aria-label']==='Choose day');assert.ok(picker);
    assert.ok(find(picker,'option',p=>p.value===14));
    picker.props.onChange({target:{value:'14'}});app.render();assert.equal(app.map.activeDay,14);assert.match(text(app.tree),/This day is empty/);
  }finally{app.dispose();}
});

test('Every Sheet dismissal path honors its scoped cancellable editor event',()=>{
  const effects=[],refs=[],keyHandlers=new Map();let registeredClose,closed=0;
  const sheet=new EventTarget();Object.assign(sheet,{contains:()=>false,querySelector:()=>null,querySelectorAll:()=>[]});
  const fakeDocument={activeElement:null,body:{classList:{add(){},remove(){}}},getElementById:()=>null};
  const component=load('mobile/src/components/Sheet.tsx',{
    react:{useEffect:fn=>effects.push(fn),useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useState:value=>[value,()=>{}],useId:()=> 'sheet-title'},
    'react/jsx-runtime':{jsx,jsxs:jsx},'react-dom':{createPortal:node=>node},'./Icon':{Icon:'Icon'},'../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en})},
    '../lib/sheetStack':{isTopSheet:()=>true,registerSheet:(_token,close)=>{registeredClose=close;},unregisterSheet(){},subscribeSheetStack:()=>()=>{}},
  },{document:fakeDocument,Event,HTMLElement:class{},window:{addEventListener:(name,fn)=>keyHandlers.set(name,fn),removeEventListener:name=>keyHandlers.delete(name),requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){}}}).Sheet;
  const tree=component({open:true,title:'Map',onClose:()=>closed++,children:'Editor'});
  refs[0].current=sheet;const cleanup=effects.map(fn=>fn());
  const block=event=>event.preventDefault();sheet.addEventListener('sheet:before-close',block);
  find(tree,'button').props.onClick();registeredClose();keyHandlers.get('keydown')({key:'Escape',preventDefault(){}});
  tree.props.onMouseDown({currentTarget:sheet,target:sheet});assert.equal(closed,0);
  sheet.removeEventListener('sheet:before-close',block);registeredClose();assert.equal(closed,1);
  cleanup.forEach(fn=>fn?.());
});
