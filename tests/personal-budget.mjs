import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function modules(overrides = {}, globals = {}) {
  const cache = new Map();
  const context = vm.createContext({ Date, Intl, URL, console, ...globals });
  const load = filename => {
    let full = path.resolve(filename); if (!existsSync(full)) full += '.ts';
    if (cache.has(full)) return cache.get(full).exports;
    const fixtureModule = { exports: {} }; cache.set(full, fixtureModule);
    const source = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const resolve = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.') ? load(path.resolve(path.dirname(full), name)) : require(name);
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: full })(resolve, fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  }; return load;
}
const load = modules();
const { personalTripBudget: estimate, DEFAULT_PERSONAL_BUDGET: defaults, personalBudgetDuration, validatePersonalBudget } = load('lib/country-intelligence/personal-budget.ts');
const row = { id: 'IT-test', code: 'IT', city: { tr: 'Roma', en: 'Rome' }, hotel: 200, meal: 60, travel: 10, basket: 999 };
const prefs = next => ({ ...defaults, ...next });
const json = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < .000001, `${actual} != ${expected}`);

test('Shared double rooms are charged once; solo, family rooms and apartments have explicit capacity', () => {
  const two = estimate(row, prefs({ buffer: '0' }));
  const solo = estimate(row, prefs({ adults: '1', buffer: '0' }));
  assert.equal(two.hotel, 200); assert.equal(solo.hotel, 200);
  assert.equal(two.meals, 306); assert.equal(two.travel, 40);
  assert.equal(estimate(row, prefs({ children: '1' })), null, 'A child cannot silently exceed double-room capacity');
  const family = estimate(row, prefs({ children: '2', roomType: 'family' }));
  assert.equal(family.rooms, 1); assert.equal(family.people, 4); assert.equal(family.hotel, 300);
  const apartment = estimate(row, prefs({ children: '2', roomType: 'family', accommodation: 'apartment' }));
  close(apartment.hotel, 270);
  assert.equal(estimate(row, prefs({ adults: '4', rooms: '2' })).hotel, 400);
  assert.equal(row.basket, 999, 'The 12-item research basket is never mutated or used as a per-person daily price');
});

test('Calendar travel dates include both travel days, count nights once and reject impossible/reversed dates', () => {
  const dated = prefs({ startDate: '2026-10-24', endDate: '2026-10-26', days: '20' });
  assert.deepEqual(json(personalBudgetDuration(dated)), { days: 3, nights: 2 });
  assert.equal(estimate(row, dated).hotel, 200);
  const same = estimate(row, prefs({ startDate: '2026-10-24', endDate: '2026-10-24', rooms: 'invalid' }));
  assert.equal(same.days, 1); assert.equal(same.nights, 0); assert.equal(same.rooms, 0); assert.equal(same.hotel, 0);
  for (const dates of [{startDate:'2026-02-30',endDate:'2026-03-02'}, {startDate:'2026-10-24',endDate:'2026-10-23'}, {startDate:'2026-10-24',endDate:''}, {startDate:'2026-10-01',endDate:'2026-10-31'}]) assert.equal(estimate(row, prefs(dates)), null);
});

test('Season and holiday scenarios affect lodging; date-derived seasons are overridable', () => {
  const normal = estimate(row, prefs({ season: 'normal' }));
  const summer = estimate(row, prefs({ startDate: '2027-07-01', endDate: '2027-07-03' }));
  const low = estimate(row, prefs({ season: 'low' }));
  const holiday = estimate(row, prefs({ season: 'high', holiday: true }));
  close(summer.hotel, normal.hotel * 1.25); close(low.hotel, normal.hotel * .85); close(holiday.hotel, normal.hotel * 1.25 * 1.2);
  assert.equal(summer.meals, normal.meals); assert.equal(summer.travel, normal.travel);
  assert.equal(estimate(row, prefs({ startDate:'2027-07-01',endDate:'2027-07-03',season:'normal' })).hotel, normal.hotel);
  assert.equal(summer.season, 'high'); assert.equal(estimate(row, prefs({ startDate:'2027-02-01',endDate:'2027-02-03' })).season, 'low');
});

test('Hostels count beds; style, stars and daily preferences change the corresponding components', () => {
  assert.equal(estimate(row, prefs({ accommodation:'hostel' })).hotel, 120);
  assert.equal(estimate(row, prefs({ stars:'4' })).hotel, 280);
  const economy = estimate(row, prefs({ style:'economical',food:'self-catering',transport:'walk' }));
  const comfort = estimate(row, prefs({ style:'comfort',food:'restaurants',transport:'taxi' }));
  assert.ok(economy.total < comfort.total); assert.equal(economy.travel, 0);
  close(comfort.travel, 40 * 1.15 * 3);
  close(estimate(row, prefs({ children:'1',rooms:'2' })).meals, 30 * 3 * 2.7 * 1.7);
});

test('Unknown paid activity and zero-source taxi costs remain partial, while explicit free/zero is complete', () => {
  const missing = estimate(row, prefs({ activities:'paid' }));
  assert.equal(missing.activities, null); assert.equal(missing.partial, true);
  const zero = estimate(row, prefs({ activities:'paid',activityAllowance:'0' }));
  assert.equal(zero.activities, 0); assert.equal(zero.partial, false);
  const paid = estimate(row, prefs({ activities:'mixed',activityAllowance:'5',buffer:'0' }));
  assert.equal(paid.activities, 30); assert.equal(paid.partial, false);
  assert.equal(estimate({ ...row,travel:0 }, prefs({ transport:'taxi' })).partial, true);
  assert.equal(estimate({ ...row,travel:0 }, prefs({ transport:'public' })).partial, false);
});

test('Item ranges add to total ranges and daily/person ranges reconcile with party and duration', () => {
  const value = estimate(row, prefs({ activities:'mixed',activityAllowance:'5',buffer:'15',season:'high',holiday:true }));
  for (const side of ['low','high']) {
    const sum = Object.values(value.ranges).reduce((total, range) => total + range[side], 0);
    close(sum, value.totalRange[side]); close(value.perPersonRange[side] * value.people, value.totalRange[side]);
    close(value.perPersonDayRange[side] * value.days * value.people, value.totalRange[side]);
  }
  assert.ok(value.totalRange.low < value.total); assert.ok(value.totalRange.high > value.total);
  close(value.total, value.hotel + value.meals + value.travel + value.activities + value.contingency);
});

test('Malformed preferences cannot produce NaN, impossible parties or totals from invented room capacity', () => {
  for (const patch of [{days:''},{days:'1.5'},{days:'1e1'},{adults:'0'},{adults:'20',children:'1'},{children:'-1'},{rooms:'0'},{roomType:'unknown'},{roomType:'__proto__'},{stars:'7'},{food:'__proto__'},{activities:'invalid'},{holiday:'yes'},{buffer:'51'},{buffer:''},{activityAllowance:'-1'},{activityAllowance:'NaN'}]) {
    const value=prefs(patch); assert.notEqual(validatePersonalBudget(value),null,JSON.stringify(patch)); assert.equal(estimate(row,value),null);
  }
  assert.equal(estimate({...row,hotel:NaN},prefs({})),null);
});

test('Personal budget snapshots validate recomputed preferences and totals while legacy snapshots remain valid', () => {
  const intent = load('mobile/src/lib/budgetCockpitIntent.ts');
  const personal = intent.createPersonalBudgetCockpitIntent(row,prefs({roomType:'family',children:'1'}),'GBP',null,'owner-a');
  assert.equal(intent.validateBudgetCockpitIntent(personal),true);
  for (const mutate of [v=>v.estimate.total++,v=>v.estimate.totalRange.high++,v=>v.personalPreferences.children='10',v=>v.model='fabricated',v=>v.sourceUrl='https://example.com/table.pdf']) {
    const forged=json(personal); mutate(forged); assert.equal(intent.validateBudgetCockpitIntent(forged),false);
  }
  assert.equal(intent.validateBudgetCockpitIntent(intent.createBudgetCockpitIntent(row,3,2,'GBP',null,'owner-a')),true);
});

test('Preferences are isolated per account and invalid edits cannot overwrite the last valid saved settings', () => {
  const saved=new Map();
  const store={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
  const storage=modules({}, {localStorage:store})('mobile/src/lib/personalBudgetPreferences.ts');
  storage.savePersonalBudgetPreferences({...prefs({adults:'3',rooms:'2'}),currency:'EUR'},'a');
  storage.savePersonalBudgetPreferences({...prefs({days:''}),currency:'USD'},'a');
  assert.equal(storage.readPersonalBudgetPreferences('a').adults,'3'); assert.equal(storage.readPersonalBudgetPreferences('a').currency,'EUR');
  assert.equal(storage.readPersonalBudgetPreferences('b').adults,'2'); assert.equal(storage.readPersonalBudgetPreferences(null).currency,'TRY');
  saved.set('l2t-personal-budget-v1:a','{"days":null}'); assert.equal(storage.readPersonalBudgetPreferences('a').days,'3');
});

test('FX conversion accepts last available weekend quotes and rejects stale, future and impossible calendar dates', () => {
  const {usableBudgetRate}=load('lib/country-intelligence/trip-budget.ts');
  const now=Date.parse('2026-10-04T12:00:00Z');
  const quote={base:'GBP',quote:'EUR',rate:1.2,date:'2026-10-02'};
  assert.equal(usableBudgetRate(quote,'EUR',now),1.2);
  for(const date of ['2026-09-31','2026-10-05','2026-09-20','2026-10-02T00:00:00Z','2026-10-40']) assert.equal(usableBudgetRate({...quote,date},'EUR',now),null,date);
});

test('FX refreshes automatically on a new day, throttles same-day focus, and retries on reconnection without stale-currency leaks', async () => {
  let now=Date.parse('2026-10-04T12:00:00Z'),cursor=0,dirty=false,effects=[];
  const slots=[],events=new Map(),waiting=[],timers=[];
  class Clock extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;dirty=true;}];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((x,j)=>!Object.is(x,old.deps[j]))){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
  const invokeDailyRate=modules({react,'./travelAssistant':{storedQuote:()=>null,loadQuote:(base,quote)=>new Promise((resolve,reject)=>waiting.push({base,quote,resolve,reject}))}},
    {Date:Clock,window:{setInterval:fn=>(timers.push(fn),timers.length),clearInterval(){},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}})('mobile/src/lib/useDailyBudgetRate.ts').useDailyBudgetRate;
  const render=currency=>{for(let i=0;i<10;i++){cursor=0;dirty=false;effects=[];const result=invokeDailyRate(currency);effects.forEach(fn=>fn());if(!dirty)return result;}throw Error('Unstable hook');};
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  try {
    render('EUR'); assert.equal(waiting.length,1); waiting[0].resolve({base:'GBP',quote:'EUR',rate:1.2,date:'2026-10-02'}); await tick(); assert.equal(render('EUR').rate,1.2);
    events.get('focus')(); render('EUR'); assert.equal(waiting.length,1);
    now+=86400000; timers[0](); render('EUR'); assert.equal(waiting.length,2);
    waiting[1].reject(Error('offline')); await tick(); assert.equal(render('EUR').rate,1.2); assert.equal(render('EUR').failed,true);
    events.get('online')(); render('EUR'); assert.equal(waiting.length,3);
    render('USD'); assert.equal(render('USD').rate,null,'The EUR result cannot price USD');
    waiting[2].resolve({base:'GBP',quote:'EUR',rate:1.3,date:'2026-10-05'}); await tick(); assert.equal(render('USD').rate,null);
    waiting[3].resolve({base:'GBP',quote:'USD',rate:1.5,date:'2026-10-05'}); await tick(); assert.equal(render('USD').rate,1.5);
  }finally{slots.forEach(slot=>slot?.cleanup?.());}
});
