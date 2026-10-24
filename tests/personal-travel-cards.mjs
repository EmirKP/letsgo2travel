import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  const data = new Map(); let blocked = false, sequence = 0;
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key,value) => { if(blocked) throw Error('quota'); data.set(key,value); }, removeItem:key=>{if(blocked)throw Error('storage');data.delete(key);} };
  const output = { exports: {} };
  const code = ts.transpileModule(readFileSync('mobile/src/lib/personalTravelCards.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const window = new EventTarget();
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {localStorage:storage,window,Event,Date,Set})(name => name === './id' ? { createId:()=>`card-${++sequence}` } : {},output,output.exports);
  return { api:output.exports, data, window, block:()=>{blocked=true;} };
}
const draft = {title:'Rome weekend',hotelName:'My hotel',address:'Via Roma 10',reservationNote:'Check-in after 15:00',tripId:'trip-1'};

test('Personal cards survive an offline reload and stay isolated between accounts and guests',()=>{
  const {api}=setup();
  assert.equal(api.savePersonalTravelCard('owner-a',draft).error,null);
  const persisted=api.readPersonalTravelCards('owner-a').items[0];
  assert.equal(persisted.address,draft.address);assert.equal(persisted.tripId,'trip-1');
  assert.equal(api.readPersonalTravelCards('owner-b').items.length,0);
  assert.equal(api.readPersonalTravelCards().items.length,0);
  api.savePersonalTravelCard(null,{...draft,title:'Guest'});
  assert.equal(api.readPersonalTravelCards('owner-a').items[0].title,draft.title);
});
test('Only explicit user card fields are stored; provider and flight data never hitchhike',()=>{
  const {api,data}=setup();
  api.savePersonalTravelCard('owner-a',{...draft,providerFlight:{airline:'SECRET_PROVIDER_COPY'},flightNumber:'SECRET_FLIGHT',departureAt:'SECRET_TIME',source:'SECRET_SOURCE'});
  const raw=[...data.values()].join('');
  assert.doesNotMatch(raw,/SECRET_|providerFlight|departureAt|flightNumber/);
  assert.deepEqual(Object.keys(api.readPersonalTravelCards('owner-a').items[0]).sort(),['address','createdAt','hotelName','id','reservationNote','title','tripId','updatedAt'].sort());
});
test('Editing preserves identity and creation date, and refuses a missing edit target',()=>{
  const {api}=setup();const first=api.savePersonalTravelCard('owner-a',draft).items[0];
  const edited=api.savePersonalTravelCard('owner-a',{...draft,address:'New address'},first.id);
  assert.equal(edited.error,null);assert.equal(edited.items.length,1);assert.equal(edited.items[0].id,first.id);assert.equal(edited.items[0].createdAt,first.createdAt);
  assert.equal(api.savePersonalTravelCard('owner-a',draft,'missing').error,'invalid');assert.equal(api.readPersonalTravelCards('owner-a').items[0].address,'New address');
});
test('Invalid and oversized input cannot destroy an existing card',()=>{
  const {api}=setup();api.savePersonalTravelCard('a',draft);
  for(const value of [{...draft,title:''},{...draft,address:'a'.repeat(401)},{...draft,hotelName:'',address:'',reservationNote:''},{...draft,tripId:'../owner-b'}]) assert.equal(api.savePersonalTravelCard('a',value).error,'invalid');
  assert.equal(api.readPersonalTravelCards('a').items.length,1);
});
test('Corrupt or future-version storage is preserved and rejects saves and deletions',()=>{
  const {api,data}=setup();const key=api.PERSONAL_TRAVEL_CARDS_PREFIX+'user-a';
  for(const raw of ['{bad',JSON.stringify({version:2,items:[]}),JSON.stringify({version:1,items:[{id:'broken'}]})]){
    data.set(key,raw);assert.equal(api.readPersonalTravelCards('a').error,'unreadable');
    assert.equal(api.savePersonalTravelCard('a',draft).error,'unreadable');assert.equal(api.removePersonalTravelCard('a','broken').error,'unreadable');assert.equal(data.get(key),raw);
  }
});
test('Quota failure does not report success or replace the existing card',()=>{
  const {api,block}=setup();const first=api.savePersonalTravelCard('a',draft).items[0];block();
  assert.equal(api.savePersonalTravelCard('a',{...draft,title:'Edited'},first.id).error,'storage');
  assert.equal(api.removePersonalTravelCard('a',first.id).error,'storage');
  assert.equal(api.readPersonalTravelCards('a').items[0].title,draft.title);
});
test('Remove and undo restore the exact card without overwriting later edits',()=>{
  const {api}=setup();const first=api.savePersonalTravelCard('a',draft).items[0];
  assert.equal(api.removePersonalTravelCard('a',first.id).items.length,0);
  assert.deepEqual(api.restorePersonalTravelCard('a',first).items[0],first);
  api.savePersonalTravelCard('a',{...draft,title:'Newer edit'},first.id);
  assert.equal(api.restorePersonalTravelCard('a',first).items[0].title,'Newer edit');
});
test('Card limit rejects an extra card without silently dropping earlier notes',()=>{
  const {api}=setup();for(let i=0;i<api.MAX_PERSONAL_CARDS;i++)assert.equal(api.savePersonalTravelCard('a',{...draft,title:`Card ${i}`}).error,null);
  assert.equal(api.savePersonalTravelCard('a',draft).error,'limit');
  assert.equal(api.readPersonalTravelCards('a').items.length,api.MAX_PERSONAL_CARDS);
  assert.equal(api.readPersonalTravelCards('a').items.at(-1).title,'Card 0');
});
test('Account deletion clears only that owner and never guest or another account; failures are explicit',()=>{
  const {api,block}=setup();for(const owner of ['a','b',null])api.savePersonalTravelCard(owner,draft);
  assert.equal(api.clearPersonalTravelCards('a'),true);
  assert.equal(api.readPersonalTravelCards('a').items.length,0);
  assert.equal(api.readPersonalTravelCards('b').items.length,1);assert.equal(api.readPersonalTravelCards().items.length,1);
  assert.equal(api.clearPersonalTravelCards(''),false);assert.equal(api.clearPersonalTravelCards('../b'),false);
  block();assert.equal(api.clearPersonalTravelCards('b'),false);assert.equal(api.readPersonalTravelCards('b').items.length,1);
});

const children = tree => [tree?.props?.children].flat(Infinity).filter(value => value != null);
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...children(tree).flatMap(nodes)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? text(tree.props.children) : '';
const find = (tree, type, predicate = () => true) => nodes(tree).find(node => node.type === type && predicate(node.props));

function editor(locale = 'tr') {
  const store = setup();
  let slots = [], cursor = 0, pending = [], key, props = {};
  const react = {
    useState(initial) {
      const position = cursor++;
      if (!slots[position]) slots[position] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[position].value, next => { slots[position].value = typeof next === 'function' ? next(slots[position].value) : next; }];
    },
    useId: () => 'personal-card',
    useEffect(effect, deps) {
      const position = cursor++, previous = slots[position];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[position] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[position].cleanup = effect(); });
      }
    },
  };
  const output = { exports: {} };
  const compiled = ts.transpileModule(readFileSync('mobile/src/components/PersonalTravelCards.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const jsx = (type, props, key) => ({ type, props, key });
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { window: store.window, Date, Boolean }, { filename: 'PersonalTravelCards.tsx' })(name => ({
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './Icon': { Icon: 'Icon' },
    './TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../lib/personalTravelCards': store.api,
    '../lib/i18n': { useI18n: () => ({ copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en, dateLocale: locale === 'tr' ? 'tr-TR' : locale === 'sq' ? 'sq-AL' : 'en-GB' }) },
    '../lib/localeFormatting': { formatAppDate: (date, locale, options) => new Intl.DateTimeFormat(locale, options).format(date) },
    './personal-travel-cards.css': {},
  })[name] ?? (() => { throw Error(`Unexpected import: ${name}`); })(), output, output.exports);
  const dispose = () => slots.forEach(slot => slot.cleanup?.());
  return {
    ...store,
    render(next) {
      if (next) props = { ...props, ...next };
      const child = output.exports.PersonalTravelCards(props);
      if (child.key !== key) { dispose(); slots = []; key = child.key; }
      cursor = 0; pending = [];
      const view = child.type(child.props);
      pending.forEach(effect => effect());
      return view;
    },
    dispose,
  };
}

const trips = [
  { id: 'rome-may', title: 'Roma', startDate: '2027-05-03' },
  { id: 'rome-june', title: 'Roma', startDate: '2027-06-14' },
];
const click = (view, label) => {
  const button = find(view, 'button', props => text(props.children) === label);
  assert.ok(button, `Missing button: ${label}`);
  button.props.onClick();
};
const change = (view, suffix, value) => {
  const field = nodes(view).find(node => node.props?.id === `personal-card-${suffix}`);
  assert.ok(field, `Missing field: ${suffix}`);
  field.props.onChange({ target: { value } });
};
const submit = view => find(view, 'form').props.onSubmit({ preventDefault() {} });

test('A general card can link to an actual trip and change that link without duplicating its notes', () => {
  const h = editor();
  const original = h.api.savePersonalTravelCard('a', { ...draft, tripId: null }).items[0];
  let view = h.render({ ownerId: 'a', trips });
  assert.match(text(view), /Bir seyahate bağlı değil/);
  click(view, 'Düzenle'); view = h.render();
  const select = find(view, 'select');
  assert.equal(select.props.value, '');
  const options = nodes(select).filter(node => node.type === 'option');
  assert.deepEqual(options.map(option => option.props.value), ['', 'rome-may', 'rome-june']);
  assert.notEqual(text(options[1]), text(options[2]), 'Dates distinguish trips to the same city');
  assert.equal(text(options[1]).includes('2027'), true);
  change(view, 'trip', 'rome-may'); view = h.render(); submit(view); view = h.render();
  let saved = h.api.readPersonalTravelCards('a').items;
  assert.equal(saved.length, 1); assert.equal(saved[0].id, original.id);
  assert.equal(saved[0].tripId, 'rome-may'); assert.equal(saved[0].address, draft.address);
  assert.equal(saved[0].createdAt, original.createdAt); assert.match(text(view), /Roma/);
  click(view, 'Düzenle'); view = h.render();
  change(view, 'trip', 'rome-june'); submit(h.render());
  saved = h.api.readPersonalTravelCards('a').items;
  assert.equal(saved.length, 1); assert.equal(saved[0].tripId, 'rome-june');
  h.dispose();
});

test('Cockpit cards default to the current trip, preserve trip filtering and remain saved after unlinking', () => {
  const h = editor();
  h.api.savePersonalTravelCard('a', { ...draft, title: 'Unrelated card', tripId: 'rome-june' });
  let view = h.render({ ownerId: 'a', tripId: 'rome-may', trips });
  assert.doesNotMatch(text(view), /Unrelated card/);
  click(view, 'Kişisel kartımı oluştur'); view = h.render();
  assert.equal(find(view, 'select').props.value, 'rome-may');
  change(view, 'name', 'Current trip hotel'); change(view, 'hotel', 'Hotel in Rome');
  submit(h.render()); view = h.render();
  assert.match(text(view), /Current trip hotel/); assert.doesNotMatch(text(view), /Unrelated card/);
  click(view, 'Düzenle'); view = h.render(); change(view, 'trip', '');
  submit(h.render()); view = h.render();
  assert.doesNotMatch(text(view), /Current trip hotel/);
  assert.match(text(view), /Kart bu seyahatten ayrıldı/);
  const saved = h.api.readPersonalTravelCards('a').items;
  assert.equal(saved.length, 2); assert.equal(saved.find(card => card.title === 'Current trip hotel').tripId, null);
  view = h.render({ tripId: undefined });
  assert.match(text(view), /Current trip hotel/); assert.match(text(view), /Bir seyahate bağlı değil/);
  assert.match(text(view), /Unrelated card/);
  h.dispose();
});

test('Switching accounts or guest scope clears editor and undo state and never reassigns another owner card', () => {
  const h = editor();
  const card = h.api.savePersonalTravelCard('a', { ...draft, title: 'Private A', tripId: 'rome-may' }).items[0];
  h.api.savePersonalTravelCard('b', { ...draft, title: 'Private B', tripId: null });
  let view = h.render({ ownerId: 'a', trips });
  click(view, 'Düzenle'); view = h.render(); change(view, 'trip', 'rome-june');
  view = h.render({ ownerId: 'b', trips: [{ id: 'b-trip', title: 'Paris' }] });
  assert.equal(find(view, 'form'), undefined); assert.doesNotMatch(text(view), /Private A/);
  assert.match(text(view), /Private B/);
  click(view, 'Düzenle'); view = h.render();
  assert.deepEqual(nodes(find(view, 'select')).filter(node => node.type === 'option').map(node => node.props.value), ['', 'b-trip']);
  assert.equal(h.api.readPersonalTravelCards('a').items[0].tripId, 'rome-may');
  assert.equal(h.api.savePersonalTravelCard('b', { ...draft, tripId: 'b-trip' }, card.id).error, 'invalid');
  view = h.render({ ownerId: 'a', trips }); click(view, 'Kartı kaldır'); view = h.render();
  assert.match(text(view), /Geri al/);
  view = h.render({ ownerId: null, trips: [] });
  assert.equal(find(view, 'form'), undefined); assert.doesNotMatch(text(view), /Private A|Private B|Geri al/);
  assert.equal(h.api.readPersonalTravelCards('a').items.length, 0);
  assert.equal(h.api.readPersonalTravelCards('b').items.length, 1);
  h.dispose();
});

test('An unavailable trip is not silently unlinked offline; editing, unlinking, remove and undo preserve the card', () => {
  const h = editor();
  const original = h.api.savePersonalTravelCard('a', { ...draft, tripId: 'old-trip' }).items[0];
  let view = h.render({ ownerId: 'a', trips: [] });
  assert.match(text(view), /Bağlı seyahat şu anda listede yok/);
  click(view, 'Düzenle'); view = h.render();
  assert.equal(find(view, 'select').props.value, 'old-trip');
  assert.equal(find(view, 'option', props => props.value === 'old-trip') !== undefined, true);
  change(view, 'note', 'New offline note'); submit(h.render()); view = h.render();
  assert.equal(h.api.readPersonalTravelCards('a').items[0].tripId, 'old-trip');
  click(view, 'Düzenle'); view = h.render(); change(view, 'trip', ''); submit(h.render()); view = h.render();
  assert.equal(h.api.readPersonalTravelCards('a').items[0].tripId, null);
  click(view, 'Kartı kaldır'); view = h.render(); click(view, 'Geri al'); h.render();
  const restored = h.api.readPersonalTravelCards('a').items[0];
  assert.equal(restored.id, original.id); assert.equal(restored.tripId, null);
  assert.equal(restored.reservationNote, 'New offline note');
  h.dispose();
});
