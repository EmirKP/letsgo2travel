import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(filename) {
  let full = path.resolve(filename); if (!existsSync(full)) full += '.ts';
  if (cache.has(full)) return cache.get(full);
  const loaded = {exports:{}};
  const code = ts.transpileModule(readFileSync(full,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,URL})(name => load(path.resolve(path.dirname(full),name)),loaded,loaded.exports);
  cache.set(full,loaded.exports);return loaded.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const routes = load('mobile/src/lib/routeCockpitIntent.ts');
const budgets = load('mobile/src/lib/budgetCockpitIntent.ts');
const benchmark = load('lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS[0];
const route = {name:'Bodrum',country:'Türkiye',cityOrRegion:'Bodrum',dailyPlan:['Visit centre','Beach day'],warnings:['Check source'],estimatedBudget:'Estimate only',idealDuration:'2 days'};
const saved = () => ({id:'route-owned-generation',createdAt:'2026-10-01T08:00:00Z',input:{origin:'İstanbul',days:'2 days',vibe:['Sea']},plan:{summary:'Alternatives',routes:[{...route,name:'Rome'},plain(route)]}});

test('Saved-plan matching survives database JSON key reordering while detecting changed stop order',()=>{
  const identity=load('mobile/src/lib/savedRouteIdentity.ts'),original=saved();
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
  const fromServer=reorder(original);
  assert.equal(identity.matchingSavedRoute([fromServer],original.plan,original.input).id,original.id);
  fromServer.plan.routes[1].dailyPlan.reverse();assert.equal(identity.matchingSavedRoute([fromServer],original.plan,original.input),undefined);
});

test('Chosen saved-route handoff copies only the selected itinerary and retains source provenance without inventing dates/flights',()=>{
  const source=saved();const intent=routes.createRouteCockpitIntent(source,1,'account-a');
  assert.equal(intent.route.name,'Bodrum');assert.equal(intent.ownerId,'account-a');assert.equal(intent.sourceRouteId,source.id);assert.equal(intent.sourceSavedAt,source.createdAt);
  assert.equal(intent.routeIndex,1);assert.equal(intent.dates,undefined);assert.equal(intent.flight,undefined);
  source.plan.routes[1].dailyPlan[0]='Later edit';source.input.vibe.push('Culture');source.plan.routes=[];
  assert.equal(intent.route.dailyPlan[0],'Visit centre');assert.deepEqual(plain(intent.input.vibe),['Sea']);assert.equal(routes.validateRouteCockpitIntent(intent),true);
});
test('Route handoff rejects absent alternatives, malformed render fields, excessive stops, and impossible/reversed dates',()=>{
  assert.equal(routes.createRouteCockpitIntent(saved(),-1,'a'),null);assert.equal(routes.createRouteCockpitIntent(saved(),2,'a'),null);
  const value=routes.createRouteCockpitIntent(saved(),1,'a');
  for (const change of [{route:{...route,dailyPlan:[]}}, {route:{...route,why:{bad:'object'}}}, {route:{...route,dailyPlan:Array(31).fill('stop')}}, {dates:{startDate:'2026-02-30',endDate:'2026-03-02'}}, {dates:{startDate:'2026-10-05',endDate:'2026-10-04'}}]) assert.equal(routes.validateRouteCockpitIntent({...value,...change}),false);
  assert.equal(routes.validateRouteCockpitIntent({...value,dates:{startDate:'2026-10-05',endDate:'2026-10-05'}}),true);
});
test('Country cost handoff preserves dated component calculation, odd-party rooms, source and actual usable quote',()=>{
  const quote={base:'GBP',quote:'TRY',date:'2026-09-30',rate:60};
  const intent=budgets.createBudgetCockpitIntent(benchmark,5,3,'TRY',quote,'account-a','Saraybosna',Date.parse('2026-10-01T10:00:00Z'));
  assert.equal(intent.estimate.rooms,2);assert.equal(intent.estimate.nights,4);
  assert.equal(intent.estimate.hotel,benchmark.hotel/2*4*2);assert.equal(intent.estimate.meals,benchmark.meal/2*3*5);assert.equal(intent.estimate.travel,benchmark.travel*3*3);
  assert.equal(intent.displayTotal,intent.estimate.total*60);assert.equal(intent.sourceMonth,'2026-05');assert.equal(intent.sourceCurrency,'GBP');assert.equal(intent.exchangeRate.date,'2026-09-30');assert.equal(intent.targetAmount,undefined);
  assert.equal(budgets.validateBudgetCockpitIntent(intent),true);
});
test('Missing/stale currency rate never becomes an invented converted budget; GBP estimate remains usable offline',()=>{
  const now=Date.parse('2026-10-01T10:00:00Z');
  for (const quote of [null,{base:'GBP',quote:'EUR',date:'2026-09-01',rate:1.2}]) {
    const intent=budgets.createBudgetCockpitIntent(benchmark,3,1,'EUR',quote,'a',undefined,now);
    assert.equal(intent.displayTotal,null);assert.equal(intent.exchangeRate,null);assert.ok(intent.estimate.total>0);assert.equal(budgets.validateBudgetCockpitIntent(intent),true);
  }
  const gbp=budgets.createBudgetCockpitIntent(benchmark,3,1,'GBP',null,'a',undefined,now);
  assert.equal(gbp.displayTotal,gbp.estimate.total);assert.equal(budgets.validateBudgetCockpitIntent(gbp),true);
});
test('Budget validator rejects tampered arithmetic and hostile source but preserves a valid historical saved estimate',()=>{
  const intent=budgets.createBudgetCockpitIntent(benchmark,3,2,'GBP',null,'a');
  assert.equal(budgets.validateBudgetCockpitIntent({...intent,estimate:{...intent.estimate,total:1}}),false);
  assert.equal(budgets.validateBudgetCockpitIntent({...intent,sourcePrices:{...intent.sourcePrices,hotel:NaN}}),false);
  assert.equal(budgets.validateBudgetCockpitIntent({...intent,sourceUrl:'https://evil.example/price.pdf'}),false);
  assert.equal(budgets.validateBudgetCockpitIntent({...intent,sourceMonth:'2025-05',sourceUrl:'https://www.postoffice.co.uk/dam/previous-price-table.pdf'}),true);
  assert.equal(budgets.createBudgetCockpitIntent(benchmark,'',2,'GBP',null,'a'),null);
});
