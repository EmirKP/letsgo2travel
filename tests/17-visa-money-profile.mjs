import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function modules(overrides={},globals={}) {
  const cache=new Map();
  const load=file=>{
    let full=path.resolve(file);if(!existsSync(full))full+='.ts';
    if(cache.has(full))return cache.get(full).exports;
    const output={exports:{}};cache.set(full,output);
    if(full.endsWith('.json'))return output.exports=JSON.parse(readFileSync(full,'utf8'));
    const code=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,URL,URLSearchParams,console,setTimeout,clearTimeout,...globals})(name=>{
      if(Object.hasOwn(overrides,name))return overrides[name];
      if(name.endsWith('.css'))return {};
      return name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name);
    },output,output.exports);return output.exports;
  };return load;
}

// Reuse the existing executable React/service fixtures without importing their
// test registrations. Only setup preceding the first test is evaluated; the
// product components, event closures and effects still run unchanged.
function existingHarness(file,names) {
  const raw=readFileSync(file,'utf8'),boundary=raw.indexOf('\ntest(');
  assert.ok(boundary>0,`Existing fixture setup is available: ${file}`);
  let setup=raw.slice(0,boundary);
  const source=ts.createSourceFile(file,setup,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const globals={Date,Intl,URL,URLSearchParams,console,process,setTimeout,clearTimeout,setImmediate,TextEncoder,AbortController,Event,crypto:globalThis.crypto};
  for(const statement of [...source.statements].reverse())if(ts.isImportDeclaration(statement)){
    const imported=require(statement.moduleSpecifier.text),clause=statement.importClause;
    if(clause?.name)globals[clause.name.text]=imported.default??imported;
    if(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings))for(const member of clause.namedBindings.elements)globals[member.name.text]=imported[member.propertyName?.text||member.name.text];
    setup=setup.slice(0,statement.pos)+setup.slice(statement.end);
  }
  setup=setup.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.resolve(file)).href));
  const output={exports:{}};
  const code=ts.transpileModule(`${setup}\nmodule.exports={${names.join(',')}};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(module,exports){${code}\n})`,globals,{filename:`${file}:fixture-setup`})(output,output.exports);
  return output.exports;
}

test('Montenegro ordinary-passport rules switch exactly at 1 November while official types keep their independent exemption',()=>{
  const load=modules(),passports=load('lib/country-intelligence/passports.ts');
  const before=passports.passportEntry('TR','ordinary','ME','2026-10-31');
  const after=passports.passportEntry('TR','ordinary','ME','2026-11-01');
  assert.equal(before.status,'free');assert.equal(before.stay,'30');assert.deepEqual(plain(before.upcoming),{effectiveOn:'2026-11-01',status:'required'});
  assert.equal(after.status,'required');assert.equal(after.stay,null);assert.equal(after.upcoming,undefined);
  for(const entry of [before,after]){assert.equal(entry.provenance,'official');assert.equal(entry.checkedAt,'2026-10-24');assert.match(entry.sourceUrl,/^https:\/\/www\.gov\.me\//);assert.match(entry.note[0],/muafiyet|istisna/);}
  assert.match(after.note[0],/Schengen.*ABD.*Birleşik Krallık.*İrlanda/);assert.match(after.note[1],/conditional exemption.*30 days/);
  for(const type of ['special','service','diplomatic'])for(const date of ['2026-10-31','2026-11-01']){
    const entry=passports.passportEntry('TR',type,'ME',date);assert.equal(entry.status,'free');assert.equal(entry.stay,'90/180');assert.equal(entry.upcoming,undefined);
  }
});

test('Impossible or malformed travel dates use current-date guidance and cannot accidentally cross a future rule boundary',()=>{
  const now=Date.parse('2026-10-24T12:00:00Z');
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const passports=modules({}, {Date:Clock})('lib/country-intelligence/passports.ts');
  for(const day of ['2026-10-32','2026-11-31','2026-11-01T00:00:00Z','invalid','']){
    const entry=passports.passportEntry('TR','ordinary','ME',day);assert.equal(entry.status,'free',day);assert.equal(entry.upcoming.effectiveOn,'2026-11-01');
  }
  assert.equal(passports.passportEntry('TR','unknown','ME','2026-11-01').status,'unknown');
});

test('Planner and shared passport labels carry the same explicit travel date, upcoming warning and verified provenance',()=>{
  const load=modules({'./locale':{translateCopy:(locale,tr,en,sq)=>locale==='tr'?tr:locale==='sq'?sq||en:en}});
  const planner=load('lib/planner-passport.ts'),preferences=load('mobile/src/lib/passportPreference.ts');
  for(const locale of ['tr','en','sq']){
    const before=planner.plannerEntry({passportCountry:'TR',passportType:'ordinary',travelDate:'2026-10-31'},'ME',locale);
    const after=planner.plannerEntry({passportCountry:'TR',passportType:'ordinary',travelDate:'2026-11-01'},'ME',locale);
    assert.equal(before.verifiedEntryStatus,'visa_free');assert.equal(after.verifiedEntryStatus,'visa_required');assert.equal(after.visaVerifiedAt,'2026-10-24');
    assert.match(before.visaStatus,locale==='tr'?/1 Kasım/:locale==='sq'?/1 nëntori/:/1 November/);
    const earlier=preferences.preferredEntry({country:'TR',type:'ordinary'},'ME',locale,'2026-10-31');
    const later=preferences.preferredEntry({country:'TR',type:'ordinary'},'ME',locale,'2026-11-01');
    assert.equal(earlier.visaFree,true);assert.equal(later.visaFree,false);assert.equal(later.status,'required');
    assert.match(earlier.label,locale==='tr'?/1 Kasım/:locale==='sq'?/1 nëntori/:/1 November/);
  }
  assert.equal(planner.normalizePlannerPassport({passportCountry:'tr',passportType:'ordinary',travelDate:'2026-11-31'}).travelDate,undefined);
});

test('Passport keeps the selected identity compact and puts searched countries before the optional map without changing date-based guidance',()=>{
  const {host,nodes,text}=existingHarness('tests/auth-profile-regressions.mjs',['host','nodes','text']);
  const h=host(),writes=[]; let preference={country:'TR',type:'ordinary'};
  const jsx=(type,props,key)=>({type,props,key});
  const load=modules({
    react:{...h.react,useDeferredValue:value=>value,lazy:()=> 'PassportWorldMap',Suspense:'Suspense'},
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '../lib/i18n':{useI18n:()=>({locale:'tr',copy:(tr)=>tr,countryName:(_,name)=>name})},
    '../hooks/usePassportPreference':{usePassportPreference:()=>({...preference,setPreference:(country,type)=>{preference={country,type};writes.push(preference);return true;}})},
    '../lib/activeTripContext':{useActiveTripContext:()=>null},
    '../hooks/useCurrentTime':{useCurrentTime:()=>Date.parse('2026-10-27T12:00:00Z')},
    '../lib/countryIntelligence':{useAdvisories:()=>[]},
    '../components/CountryPicker':{CountryPicker:'CountryPicker'},
    '../components/CountryFlag':{CountryFlag:'CountryFlag'},
    '../components/Icon':{Icon:'Icon'},
    '../components/Sheet':{Sheet:'Sheet'},
    '../components/CountryAdvisory':{CountryAdvisory:'CountryAdvisory',CountryRiskBadge:'CountryRiskBadge'},
    '../lib/native':{openExternal:()=>true},
  });
  const {PassportScreen}=load('mobile/src/screens/PassportScreen.tsx');
  const render=()=>h.render(()=>PassportScreen({onOpenCountryNews(){}}));
  const byClass=(view,name)=>nodes(view).find(node=>node.props.className?.split(' ').includes(name));
  let view=render();
  assert.ok(byClass(view,'passport-compact-context'));
  assert.equal(nodes(view).some(node=>node.type==='CountryPicker'),false);
  assert.match(text(view),/1 Kasım 2026/);
  nodes(view).find(node=>node.type==='input'&&node.props.id==='passport-country-search').props.onChange({target:{value:'Sırbistan'}});
  view=render();
  const ordered=nodes(view),list=byClass(view,'country-list'),map=byClass(view,'passport-map-disclosure');
  assert.ok(ordered.indexOf(list)<ordered.indexOf(map));
  assert.notEqual(map.props.open,true);
  const result=byClass(view,'country-row'); assert.match(text(result),/Sırbistan/);
  result.props.onClick();view=render();
  assert.ok(nodes(view).find(node=>node.type==='Sheet'&&node.props.open));
  assert.ok(text(view).includes('SRB'));
  nodes(view).find(node=>node.type==='Sheet').props.onClose();render();
  nodes(render()).find(node=>node.type==='input'&&node.props.type==='date').props.onChange({target:{value:'2026-11-01'}});
  assert.match(text(render()),/Karadağ, seçili tarihte/);
  nodes(render()).find(node=>node.type==='button'&&text(node)==='Değiştir').props.onClick();view=render();
  assert.ok(nodes(view).find(node=>node.type==='CountryPicker'));
  nodes(view).find(node=>node.type==='select').props.onChange({target:{value:'special'}});view=render();
  assert.deepEqual(writes,[{country:'TR',type:'special'}]);
  assert.match(text(byClass(view,'passport-compact-context')),/Hususi/);
  assert.equal(nodes(view).find(node=>node.type==='input'&&node.props.type==='date').props.value,'2026-11-01');
  assert.doesNotMatch(text(view),/Karadağ, seçili tarihte/);
  h.dispose();
});

test('The prominent money swap requests the inverse pair, recalculates the amount and reverses quick shortcuts consistently',async()=>{
  const {mount,quote,nodes,text,byClass,namedButton}=existingHarness('tests/travel-assistant/money-ui.mjs',['mount','quote','nodes','text','byClass','namedButton']);
  const rates={'EUR:TRY':44,'TRY:EUR':1/44,'TRY:USD':1/40};
  const app=mount({loader:async(base,target)=>{assert.ok(rates[`${base}:${target}`]);return quote({base,quote:target,rate:rates[`${base}:${target}`],previousRate:null,previousDate:null,changePercent:null});}});
  try{
    await app.settle();nodes(app.tree).find(node=>node.type==='input').props.onChange({target:{value:'88'}});app.render();
    assert.match(text(byClass(app.tree,'tm-conversion')),/≈ 3,872/);
    const swap=namedButton(app.tree,'Swap currencies');assert.ok(byClass(swap,'tm-board-swap'),'Swap lives in the visible pair heading');swap.props.onClick();app.render();
    assert.deepEqual(plain(app.calls.at(-1)),['TRY','EUR']);assert.doesNotMatch(text(byClass(app.tree,'tm-conversion')),/≈/,'The old forward rate is never used while the inverse is loading');
    await app.settle();assert.match(text(byClass(app.tree,'tm-rate')),/1 TRY =0\.022727EUR/);assert.match(text(byClass(app.tree,'tm-conversion')),/≈ 2/);
    const shortcuts=byClass(app.tree,'tm-quick-pairs'),usd=nodes(shortcuts).find(node=>node.type==='button'&&text(byClass(node,'tm-quick-pair-label'))==='TRY/ USD');
    assert.ok(usd,'Reversing also changes every quick shortcut direction');usd.props.onClick();app.render();await app.settle();
    assert.deepEqual(plain(app.calls.at(-1)),['TRY','USD']);assert.match(text(byClass(app.tree,'tm-conversion')),/≈ 2\.2/);
    assert.deepEqual(plain(app.choices.at(-1)),{base:'TRY',quote:'USD'});
  }finally{app.dispose();}
});

test('Profile begins with one explorer card and one country count while keeping compact account identity and verified points separate',async()=>{
  const {profileHarness,nodes,text,countries}=existingHarness('tests/auth-profile-regressions.mjs',['profileHarness','nodes','text','countries']);
  const local=countries.COUNTRY_LIST.filter(country=>['TUR','DEU'].includes(country.alpha3));
  const h=profileHarness({local,remote:{id:'a',username:'user_a',visitedCountries:['TUR','DEU'],wishlistCountries:[],optInLeaderboard:false},verificationRows:[{country_code:'TR',status:'approved',verification_method:'document'},{country_code:'TUR',status:'approved',verification_method:'document'},{country_code:'DE',status:'pending',verification_method:'document'}]});
  try{
    await tick();const view=h.render(),rootChildren=[view.props.children].flat(Infinity).filter(value=>value&&typeof value==='object');
    assert.equal(rootChildren[0].props.className,'profile-top-bar');
    assert.ok(nodes(rootChildren[0]).some(node=>node.type==='button'&&text(node)==='Settings'),'Settings has a direct entry before account content');
    assert.equal(rootChildren[1].props.className,'explorer-card','Explorer card remains the first profile content card');
    assert.equal(nodes(view).filter(node=>node.props?.className==='explorer-card').length,1);
    const stats=nodes(view).filter(node=>node.props?.className==='explorer-stats');assert.equal(stats.length,1);
    const count=nodes(stats[0]).filter(node=>node.type==='div'&&nodes(node).some(child=>child.type==='span'&&text(child)==='Countries'));
    assert.ok(count.some(node=>text(node)==='2Countries'),'The self-reported list count appears in the single explorer stats row');
    assert.match(text(view),/1 verified countries · 10 league points/);
    const identity=nodes(view).find(node=>node.props?.className==='profile-hero');assert.ok(identity);
    assert.equal(nodes(identity).some(node=>node.type==='img'||node.type==='PageHero'),false,'Identity has no decorative cover');
    assert.equal(nodes(view).filter(node=>node.props?.className==='profile-stats').length,0,'The former duplicate totals are absent');
    assert.ok(nodes(identity).some(node=>node.type==='ProfilePhoto'));
  }finally{h.h.dispose();}
});

test('Tools opens directly without a hero, retains its country and reaches useful phrases through the actual child callback',()=>{
  const {host,nodes,text}=existingHarness('tests/auth-profile-regressions.mjs',['host','nodes','text']);
  const h=host(),selected=[];let locationCalls=0;
  const react={...h.react,lazy:()=> 'TravelAssistant',Suspense:'Suspense'};
  const jsx=(type,props)=>({type,props});
  const source=modules({react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    '../components/Icon':{Icon:'Icon'},'../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},'../components/CompanionShortcutArtwork':{CompanionShortcutArtwork:'CompanionShortcutArtwork'},
    '../components/CountryPicker':{CountryPicker:'CountryPicker'},'../components/TravelAreaPicker':{TravelAreaPicker:'TravelAreaPicker'},
    '../components/TravelSafety':{EvidenceLine:'EvidenceLine'},'../lib/capacitor':{isNativePlatform:()=>false},
    '../lib/i18n':{useI18n:()=>({locale:'en',copy:(_tr,en)=>en,countryName:(_code,fallback)=>fallback})},
    '../lib/api':{getTravelNow:()=>{throw Error('Opening tools must not request AI or weather');}},
    '../lib/native':{openExternal:()=>{throw Error('Opening tools must not navigate externally');}},
    '../lib/travelSelection':{readTravelCountry:()=>'',selectTravelCountry:code=>selected.push(code)},
    '../lib/eventSearchContext':{nearbyEventContext:()=>{throw Error('Opening tools must not request events');}},
  },{window:{requestAnimationFrame:fn=>fn()},document:{querySelector:()=>null},navigator:{geolocation:{getCurrentPosition:()=>locationCalls++}}})('mobile/src/screens/TravelCompanionScreen.tsx');
  try{
    const props={initialCountry:'TR',accessToken:'',ownerId:null,onSignIn(){},onNavigate(){},onNotice(){}};
    const render=()=>h.render(()=>source.TravelCompanionScreen(props));let view=render();
    assert.equal(nodes(view).some(node=>node.type==='header'),false,'The default tools directory has no introductory cover');
    assert.equal(nodes(view).some(node=>node.type==='img'||node.type==='PageHero'),false);
    const assistant=nodes(view).find(node=>node.type==='TravelAssistant');assert.ok(assistant);assert.equal(assistant.props.initialCountry,'TR');
    assistant.props.onPhrases('TR');view=render();
    assert.equal(view.props['data-section'],'phrases');assert.equal(text(nodes(view).find(node=>node.type==='h1')),'Useful phrases');
    assert.equal(nodes(view).find(node=>node.type==='CountryPicker').props.value,'TR');assert.equal(locationCalls,0);
    assert.ok(selected.includes('TR'));
  }finally{h.dispose();}
});

test('A successful-save toast opens the exact saved category once and failed, dismissed, expired or other-account notices cannot show the action',()=>{
  const {appHarness,nodes,text}=existingHarness('tests/navigation-ux.mjs',['appHarness','nodes','text']);
  const app=appHarness({initialView:'events',locale:'en'});
  const action=view=>nodes(view).find(node=>node.type==='button'&&node.props.className==='notice-action');
  let view=app.render(),delay,timer;app.window.setTimeout=(fn,ms)=>{timer=fn;delay=ms;return 2;};
  const events=app.screen(view,'EventsScreen');
  events.props.onNotice('Saved event.',{label:'Open saved',onClick:events.props.onOpenSaved});view=app.render();
  assert.equal(delay,7000);assert.equal(text(action(view)),'Open saved');action(view).props.onClick();view=app.render();
  assert.equal(app.screen(view,'PlansScreen').props.initialSection,'events');assert.equal(action(view),undefined);
  let opens=0;const notify=app.screen(view,'PlansScreen').props.onNotice;
  notify('Saved.',{label:'Open',onClick:()=>opens++});view=app.render();notify('Could not save.');view=app.render();assert.equal(action(view),undefined);assert.equal(opens,0);
  notify('Saved.',{label:'Open',onClick:()=>opens++});view=app.render();nodes(view).find(node=>node.props?.['aria-label']==='Dismiss notification').props.onClick();view=app.render();assert.equal(action(view),undefined);assert.equal(opens,0);
  notify('Saved.',{label:'Open',onClick:()=>opens++});view=app.render();timer();view=app.render();assert.equal(action(view),undefined);assert.equal(opens,0);
  notify('Saved.',{label:'Open',onClick:()=>opens++});app.render();app.auth.user={id:'different-account'};view=app.render();assert.equal(action(view),undefined);assert.equal(opens,0);
});
