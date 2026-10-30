import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx=(type,props)=>({type,props}), runtime={jsx,jsxs:jsx};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const clone=value=>JSON.parse(JSON.stringify(value));
function load(path,imports={},environment={}){
 const fixtureModule={exports:{}};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Intl,AbortController,...environment})(name=>{if(name in imports)return imports[name];if(name.endsWith('.css'))return{};throw Error(`Missing import: ${name}`);},fixtureModule,fixtureModule.exports);
 return fixtureModule.exports;
}
const countries=JSON.parse(readFileSync('mobile/src/data/iso3166.json','utf8'));
const format=load('mobile/src/lib/localeFormatting.ts',{'./locales/sq-regions':load('mobile/src/lib/locales/sq-regions.ts')});
const search=load('mobile/src/lib/destinationSearch.ts',{'../data/countries':{ISO_3166:countries},'./localeFormatting':format,'./searchText':load('mobile/src/lib/searchText.ts')});
const nodes=tree=>tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)]:[];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):typeof tree==='string'||typeof tree==='number'?String(tree):tree?.props?text(tree.props.children):'';
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
function hooks(){
 const slots=[];let cursor=0,dirty=false,effects=[],component,props;
 const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));
 return{react:{useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},useMemo(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||changed(old.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}},start(fn,initial){component=fn;props=initial;return this.render();},render(next){props={...props,...next};for(let n=0;n<12;n++){cursor=0;dirty=false;effects=[];const tree=component(props);effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('Unstable render');},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function harness(query='Bergen',options={}){
 const host=hooks(),calls=[],planned=[],guides=[],events=[],timers=new Map();let timer=0;
 const i18n={locale:options.locale||'en',copy:(tr,en,sq)=>options.locale==='tr'?tr:options.locale==='sq'?sq||en:en};
 const component=load('mobile/src/components/DestinationSearchFallback.tsx',{'react':host.react,'react/jsx-runtime':runtime,'./CountryFlag':{CountryFlag:'CountryFlag'},'../lib/i18n':{useI18n:()=>i18n},'../lib/destinationSearch':search,'../lib/mapJourneyClient':{searchJourneyArea:(...args)=>{calls.push(args);return options.search?.(...args)??Promise.resolve([]);}}},{window:{setTimeout:(fn,delay)=>{timers.set(++timer,{fn,delay});return timer;},clearTimeout:id=>timers.delete(id)}}).DestinationSearchFallback;
 const props={query,onPlanPlace:(...args)=>planned.push(args),onOpenCountryGuide:code=>guides.push(code),onOpenCountryEvents:(...args)=>events.push(args)};
 host.start(component,props);
 return{host,calls,planned,guides,events,timers,flush:()=>{const waiting=[...timers.values()];timers.clear();waiting.forEach(item=>item.fn());},view:()=>host.render()};
}

test('all ISO country records match alpha codes and their Turkish, English and Albanian names without inventing coordinates',()=>{
 for(const locale of ['tr','en','sq'])for(const country of countries){
  const byCode=search.destinationCountryMatches(country.alpha3,locale);assert.ok(byCode.some(row=>row.alpha3===country.alpha3),`${locale}:${country.alpha3}`);
  const name=format.appRegionName(country.alpha2,locale,country.name), byName=search.destinationCountryMatches(name,locale);assert.ok(byName.some(row=>row.alpha3===country.alpha3),`${locale}:${name}`);
  assert.ok(!('latitude' in byName[0]));
 }
 for(const query of ['Almanya','Germany','Gjermani'])assert.equal(search.destinationCountryMatches(query,'sq')[0].alpha3,'DEU');
 assert.equal(search.destinationCountryMatches('Shqiperi','tr')[0].alpha3,'ALB');
});

test('place search waits for three characters and a debounce, cancels earlier queries and skips ready itineraries',async()=>{
 const h=harness('Be');try{
  assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);assert.match(text(h.view()),/at least 3 characters/);
  h.host.render({query:'Ber'});assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,400);
  h.host.render({query:'Bergen'});assert.equal(h.timers.size,1);h.flush();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'Bergen');assert.equal(h.calls[0][2],'en');
  await tick();h.host.render({hasReadyResult:true});assert.equal(h.calls[0][1].aborted,true);assert.equal(h.view(),null);
  h.host.render({query:'Valencia',hasReadyResult:true});h.flush();assert.equal(h.calls.length,1);
 }finally{h.host.dispose();}
});

test('an aborted slow city response cannot overwrite a newer query, and planning carries the exact verified area',async()=>{
 const pending=new Map(),h=harness('Bergen',{search:query=>new Promise(resolve=>pending.set(query,resolve))});try{
  h.flush();h.host.render({query:'Valencia'});h.flush();assert.equal(h.calls[0][1].aborted,true);
  const city={name:'València',address:'València, Spain',latitude:39.4699,longitude:-0.3763,sourceUrl:'https://maps.apple.com/place?auid=real'};
  pending.get('Valencia')([city]);await tick();let view=h.view();assert.match(text(view),/València, Spain/);assert.match(text(view),/no ready-made itinerary/);
  pending.get('Bergen')([{name:'Old Bergen',latitude:60,longitude:5}]);await tick();view=h.view();assert.ok(!text(view).includes('Old Bergen'));
  button(view,'Build a route for this place').props.onClick();assert.deepEqual(clone(h.planned),[['València',city]]);
 }finally{h.host.dispose();}
});

test('country results remain usable when place search fails; retry distinguishes failure from a genuine empty result',async()=>{
 let fails=true;const h=harness('Almanya',{search:()=>fails?Promise.reject(Error('private provider error')):Promise.resolve([])});try{
  h.flush();await tick();let view=h.view();assert.match(text(view),/Place search is unavailable/);assert.ok(!text(view).includes('private provider error'));
  button(view,'Country guide').props.onClick();button(view,'Build a route').props.onClick();button(view,'Events').props.onClick();assert.deepEqual(h.guides,['DEU']);assert.deepEqual(h.events,[['DE']]);assert.deepEqual(h.planned,[['Germany']]);
  fails=false;button(view,'Retry search').props.onClick();h.view();h.flush();await tick();view=h.view();assert.match(text(view),/No places matched/);assert.ok(!nodes(view).some(node=>node.props?.role==='alert'));
 }finally{h.host.dispose();}
});

test('unmount aborts a provider lookup and an invalid query never reaches the search backend',()=>{
 for(const query of ['<script>',`abc\u0000`, 'a'.repeat(121)])assert.equal(search.canSearchDestinationPlaces(query),false);
 const h=harness('Bergen',{search:()=>new Promise(()=>{})});h.flush();h.host.dispose();assert.equal(h.calls[0][1].aborted,true);
});

test('destination photos use the matching packaged asset, fall back to a flag/neutral on failure and recover for another asset',()=>{
 const host=hooks(),i18n={copy:(_tr,en)=>en};
 const Photo=load('mobile/src/components/DestinationPhoto.tsx',{'react':host.react,'react/jsx-runtime':runtime,'../data/artwork':{destinationArtwork:code=>code==='UNKNOWN'?'data:image/svg+xml,neutral':`/assets/${code}.jpg`},'./CountryFlag':{CountryFlag:'CountryFlag'},'../lib/i18n':{useI18n:()=>i18n}}).DestinationPhoto;
 try{
  let view=host.start(Photo,{code:'CDG',countryCode:'FR',label:'Paris'}),img=nodes(view).find(node=>node.type==='img');assert.equal(img.props.src,'/assets/CDG.jpg');
  img.props.onError();view=host.render();assert.equal(nodes(view).some(node=>node.type==='img'),false);assert.equal(nodes(view).find(node=>node.type==='CountryFlag').props.code,'FR');assert.match(text(view),/Photo unavailable/);
  view=host.render({code:'IST',countryCode:'TR',label:'Istanbul'});assert.equal(nodes(view).find(node=>node.type==='img').props.src,'/assets/IST.jpg');
  view=host.render({code:'UNKNOWN'});assert.equal(nodes(view).some(node=>node.type==='img'),false);assert.ok(!JSON.stringify(view).includes('launch-travel-poster'));
 }finally{host.dispose();}
});

test('an explicit budget city photo takes precedence over an airport alias and cannot fall back to a different city after failure',()=>{
 const host=hooks(),i18n={copy:(_tr,en)=>en},lookups=[];
 const Photo=load('mobile/src/components/DestinationPhoto.tsx',{'react':host.react,'react/jsx-runtime':runtime,'../data/artwork':{destinationArtwork:code=>{lookups.push(code);return `/assets/${code}.jpg`;}},'./CountryFlag':{CountryFlag:'CountryFlag'},'../lib/i18n':{useI18n:()=>i18n}}).DestinationPhoto;
 try{
  let view=host.start(Photo,{src:'/assets/trencin.webp',code:'UNRELATED',countryCode:'SK',label:'Trenčín'}),img=nodes(view).find(node=>node.type==='img');
  assert.equal(img.props.src,'/assets/trencin.webp');assert.equal(img.props.alt,'');assert.equal(img.props.loading,'lazy');assert.equal(img.props.decoding,'async');assert.equal(lookups.length,0,'An explicit city photo does not resolve a different destination alias');
  img.props.onError();view=host.render();assert.equal(nodes(view).some(node=>node.type==='img'),false);assert.equal(nodes(view).find(node=>node.type==='CountryFlag').props.code,'SK');assert.match(text(view),/Photo unavailable/);
  assert.equal(lookups.length,0,'A failed city photo cannot borrow the alias photo');
  view=host.render({src:'/assets/riga.webp',countryCode:'LV',label:'Riga'});img=nodes(view).find(node=>node.type==='img');assert.equal(img.props.src,'/assets/riga.webp','A different city recovers after the previous image failed');
  view=host.render({src:'/assets/trencin.webp',countryCode:'SK',label:'Trenčín'});assert.equal(nodes(view).some(node=>node.type==='img'),false,'A known failed asset remains neutral when revisited');
  view=host.render({src:undefined,code:'PAR',countryCode:'FR',label:'Paris'});assert.equal(nodes(view).find(node=>node.type==='img').props.src,'/assets/PAR.jpg','Callers without explicit city assets retain the existing alias behavior');
 }finally{host.dispose();}
});
