import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  const result={exports:{}};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{URL,URLSearchParams})(name=>{throw Error(`Unexpected parser dependency: ${name}`);},result,result.exports);
  return result.exports;
}
const parse=value=>load('mobile/src/lib/journeyGuideIntent.ts').journeyGuideIntentFromUrl(value);
const plain=value=>value===null?null:JSON.parse(JSON.stringify(value));
const tripId='10000000-0000-4000-8000-000000000001';
const uri=(journeyId='saved-route_1',day='1',extra='')=>`letsgo2travel://journey?journeyId=${encodeURIComponent(journeyId)}&day=${day}${extra}`;

test('A journey guide link preserves its exact saved identity and accepts only bounded canonical integer days',()=>{
  for(let day=1;day<=14;day++)assert.deepEqual(plain(parse(uri('route:family/2026.10-24',String(day)))),{journeyId:'route:family/2026.10-24',day});
  assert.deepEqual(plain(parse(`letsgo2travel://journey/?day=14&journeyId=trip.a_b-c%3Ad%2Fe&tripId=${tripId}`)),{journeyId:'trip.a_b-c:d/e',day:14,tripId});
  for(const day of ['','0','15','01','1.0','1e1','+1','-1','1%20','%201','%31%2E%30'])assert.equal(parse(uri('route',day)),null,day);
});

test('Deep links reject unsupported routes, foreign authorities, credentials, paths, fragments and malformed queries',()=>{
  for(const value of [null,undefined,42,'','not-a-link','https://journey?journeyId=route&day=1','letsgo2travel:journey?journeyId=route&day=1',
    'letsgo2travel://elsewhere?journeyId=route&day=1','letsgo2travel://journey/extra?journeyId=route&day=1',
    'letsgo2travel://user@journey?journeyId=route&day=1','letsgo2travel://user:password@journey?journeyId=route&day=1',
    'letsgo2travel://journey:123?journeyId=route&day=1',`${uri()}#other`,`${uri()}&unknown=yes`,`${uri()}&day=2`,`${uri()}&journeyId=other`,
    `${uri()}&tripId=${tripId}&tripId=${tripId}`,uri('with spaces'),uri('route?other'),uri('route#hash'),uri('route%2Fother'),uri('x'.repeat(161)),
    'letsgo2travel://journey?day=1','letsgo2travel://journey?journeyId=route',`${uri()}&tripId=not-a-uuid`,`${uri()}&tripId=10000000-0000-0000-8000-000000000001`]){
    assert.equal(parse(value),null,String(value));
  }
  assert.notEqual(parse(uri('x'.repeat(160))),null,'The documented maximum saved identity remains reachable');
});

test('Legacy flight and Cockpit links retain their real parser without being accepted as a journey guide',()=>{
  const {tripIdFromUrl}=load('mobile/src/lib/deepLink.ts');
  for(const url of [`letsgo2travel://cockpit?tripId=${tripId}`,`https://www.letsgo2travel.com.tr/open?tripId=${tripId}`,`#cockpit?tripId=${tripId}`]){
    assert.equal(tripIdFromUrl(url),tripId);assert.equal(parse(url),null);
  }
  assert.equal(tripIdFromUrl('letsgo2travel://cockpit?tripId=invalid'),null);
});
