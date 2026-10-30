import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const jsx=(type,props)=>({type,props});
const nodes=tree=>!tree||typeof tree!=='object'||tree.props?.hidden||(tree.type==='Sheet'&&!tree.props.open)?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';
const find=(tree,type,predicate=()=>true)=>nodes(tree).find(n=>n.type===type&&predicate(n.props));
const button=(tree,label)=>find(tree,'button',p=>text(p.children).trim()===label||p['aria-label']===label);
function hooks(){const slots=[];let cursor=0,dirty=false,effects=[],component,props;const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};return{react:{useState(initial){const i=cursor++;slots[i]||={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},useRef(initial){const i=cursor++;return slots[i]||={current:initial};},useMemo:memo,useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old?.deps,deps)){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}},start(fn,initial){component=fn;props=initial;return this.render();},render(next){props={...props,...next};for(let n=0;n<25;n++){cursor=0;dirty=false;effects=[];const tree=component(props);effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('Unstable render');},dispose(){slots.forEach(s=>s?.cleanup?.());}};}
function loader(imports={},globals={}){const cache=new Map();const load=file=>{const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute).exports;if(absolute.endsWith('.json'))return JSON.parse(fs.readFileSync(absolute,'utf8'));const out={exports:{}};cache.set(absolute,out);const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,Map,Set,URL,...globals})(name=>{if(Object.hasOwn(imports,name))return imports[name];if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};if(name.endsWith('.css'))return{};if(/\.(webp|png|jpg|svg)$/.test(name))return name;if(!name.startsWith('.'))throw Error(`Unexpected ${name}`);const base=path.resolve(path.dirname(absolute),name),target=[base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p));if(!target)throw Error(`Missing ${name}`);return load(target);},out,out.exports);return out.exports;};return load;}
function explore({destination='TIA',savedRouteIds=[]}={}){
 const h=hooks(),saved=[],savedPassports=[],opened=[],notices=[],countryWrites=[];let favorites=[],canWrite=true;
 const preference={country:'',type:'',setPreference(country,type){if(!canWrite)return false;this.country=country;this.type=type;return true;}};
 const i18n={locale:'tr',copy:(tr)=>tr};const noop=()=>{};
 const load=loader({react:h.react,'../lib/i18n':{useI18n:()=>i18n},'../hooks/usePassportPreference':{usePassportPreference:()=>preference},'../lib/activeTripContext':{useActiveTripContext:()=>null},'../lib/accountResume':{onAccountResume:()=>()=>{}},'../lib/supabaseData':{},'../lib/storage':{getFavoriteDestinations:()=>favorites,getPendingGuestDataSync:()=>null,addRecentDestination:noop,setFavoriteDestinations:value=>{favorites=value;},toggleFavoriteDestination:country=>{countryWrites.push(country);favorites=favorites.length?[]:[country];return favorites;}},...Object.fromEntries(['Icon','TravelToolArtwork','PageHero','CountryFlag','CountryPicker','DestinationSearchFallback','DestinationPhoto','Sheet'].map(name=>['../components/'+name,{[name]:name}]))},{window:{addEventListener:noop,removeEventListener:noop},document:{addEventListener:noop,removeEventListener:noop,visibilityState:'visible'}});
 const {ExploreScreen}=load('mobile/src/screens/ExploreScreen.tsx');
 h.start(ExploreScreen,{initialDestinationCode:destination,accessToken:'',onNavigate:noop,onSurprise:noop,onBuildRoute:noop,onNotice:value=>notices.push(value),savedRouteIds,onToggleSaved:(route,passport)=>{saved.push(route);savedPassports.push(passport);},onOpenSavedRoute:code=>opened.push(code)});
 return{h,preference,load,saved,savedPassports,opened,notices,countryWrites,setCanWrite:value=>{canWrite=value;}};
}

test('City itinerary save and country favourite are explicit independent actions; exact saved destination can reopen',async()=>{
 const x=explore();try{
  let view=x.h.render();assert.ok(button(view,'Arnavutluk ülkesini favorilere ekle'));assert.ok(button(view,'Rotayı kaydet'));
  button(view,'Rotayı kaydet').props.onClick();assert.equal(x.saved.length,1);assert.equal(x.saved[0].destinationCode,'TIA');
  const catalog=x.load('mobile/src/data/routes.ts').routeByDestinationCode('TIA','tr');assert.deepEqual(JSON.parse(JSON.stringify(x.saved[0].dailyPlan)),JSON.parse(JSON.stringify(catalog.dailyPlan)));assert.equal(x.countryWrites.length,0);
  view=x.h.render({savedRouteIds:['TIA']});assert.ok(button(view,'Rota kaydedildi'));button(view,'Kaydedilen rotayı aç').props.onClick();assert.deepEqual(x.opened,['TIA']);
 }finally{x.h.dispose();}
 const y=explore();try{await button(y.h.render(),'Arnavutluk ülkesini favorilere ekle').props.onClick();assert.equal(y.saved.length,0);assert.equal(y.countryWrites[0].alpha3,'ALB');assert.match(y.notices[0],/Arnavutluk/);}finally{y.h.dispose();}
});

test('A discovery-only city cannot create a fabricated saved itinerary before a real plan exists',()=>{
 const x=explore({destination:'TYO'});try{const view=x.h.render();assert.equal(button(view,'Rotayı kaydet'),undefined);assert.ok(button(view,'Bu rotayı planla'));assert.ok(button(view,'Japonya ülkesini favorilere ekle'));assert.equal(x.saved.length,0);}finally{x.h.dispose();}
});

test('Missing passport is explained in details and can be selected inline without navigation or loss of destination',()=>{
 const x=explore();try{
  let view=x.h.render();assert.match(text(view),/Pasaport seçilmedi/);assert.match(text(view),/Giriş durumunu görmek için/);button(view,'Pasaport seç').props.onClick();view=x.h.render();
  find(view,'CountryPicker').props.onChange('TR');view=x.h.render();assert.equal(button(view,'Pasaportu kaydet').props.disabled,true);
  find(view,'select').props.onChange({target:{value:'ordinary'}});view=x.h.render();assert.equal(button(view,'Pasaportu kaydet').props.disabled,false);
  find(view,'form').props.onSubmit({preventDefault(){}});view=x.h.render();assert.equal(x.preference.country,'TR');assert.equal(x.preference.type,'ordinary');assert.match(text(view),/Tiran/);assert.ok(button(view,'Pasaportu değiştir'));assert.equal(find(view,'select'),undefined);
  button(view,'Rotayı kaydet').props.onClick();assert.equal(x.savedPassports[0].passportCountry,'TR');assert.equal(x.savedPassports[0].passportType,'ordinary');
 }finally{x.h.dispose();}
});

test('Inline passport cancel and storage failure preserve the current document and keep the user in the same detail',()=>{
 const x=explore();try{
  button(x.h.render(),'Pasaport seç').props.onClick();let view=x.h.render();find(view,'CountryPicker').props.onChange('TR');view=x.h.render();find(view,'select').props.onChange({target:{value:'ordinary'}});view=x.h.render();button(view,'Vazgeç').props.onClick();view=x.h.render();assert.equal(x.preference.country,'');assert.ok(button(view,'Pasaport seç'));
  button(view,'Pasaport seç').props.onClick();view=x.h.render();find(view,'CountryPicker').props.onChange('TR');view=x.h.render();find(view,'select').props.onChange({target:{value:'ordinary'}});view=x.h.render();x.setCanWrite(false);find(view,'form').props.onSubmit({preventDefault(){}});view=x.h.render();assert.equal(x.preference.country,'');assert.match(text(view),/Pasaportun kaydedilemedi/);assert.ok(find(view,'select'));assert.match(text(view),/Tiran/);
 }finally{x.h.dispose();}
});

test('Exact inspiration reopen identity remains owner-scoped and ignores generated routes with the same destination',()=>{
 const catalog={a:[{id:'generated-other',plan:{routes:[{destinationCode:'TIA'}]}},{id:'inspiration.TIA:version-a',plan:{routes:[{destinationCode:'TIA'}]}}],b:[{id:'inspiration.TIA:version-b',plan:{routes:[{destinationCode:'TIA'}]}}]};
 const api=loader({'./storage':{getSavedRoutePlans:owner=>catalog[owner]||[]},'./id':{}})('mobile/src/lib/inspirationRoutes.ts');
 assert.equal(api.savedInspirationRoute('tia','a').id,'inspiration.TIA:version-a');assert.equal(api.savedInspirationRoute('TIA','b').id,'inspiration.TIA:version-b');assert.equal(api.savedInspirationRoute('TIA','guest'),undefined);
});

test('Real catalog inspiration saves keep the chosen passport in saved plan input for reopening',()=>{
 const saves=[];
 const api=loader({'./storage':{getSavedRoutePlans:()=>[],saveRoutePlan:value=>saves.push(value)},'./id':{createId:()=> 'new-generation'}})('mobile/src/lib/inspirationRoutes.ts');
 const catalog=loader()('mobile/src/data/routes.ts').routeByDestinationCode('TIA','tr');
 assert.equal(api.toggleInspirationRoute(catalog,null,{passportCountry:'TR',passportType:'ordinary'}),true);
 assert.equal(saves[0].input.passportCountry,'TR');assert.equal(saves[0].input.passportType,'ordinary');assert.equal(saves[0].plan.routes[0],catalog);assert.equal(saves[0].id,'inspiration.TIA:new-generation');
});
