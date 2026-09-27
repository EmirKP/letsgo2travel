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
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {localStorage:storage,window:new EventTarget(),Event,Date,Set})(name => name === './id' ? { createId:()=>`card-${++sequence}` } : {},output,output.exports);
  return { api:output.exports, data, block:()=>{blocked=true;} };
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
