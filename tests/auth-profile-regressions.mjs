import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const repo=process.cwd().replaceAll('\\','/');
const require=createRequire(`${repo}/package.json`);
const ts=require('typescript');
const jsx=(type,props,key)=>({type,props,key});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function load(path,imports,globals={},append=''){
 const code=ts.transpileModule(readFileSync(`${repo}/${path}`,'utf8')+append,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const m={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,console,URL,URLSearchParams,TextEncoder,crypto:globalThis.crypto,...globals})(name=>{if(Object.hasOwn(imports,name))return imports[name];if(/\.(webp|css)$/.test(name))return name;throw Error(`Missing ${name}`);},m,m.exports);
 return m.exports;
}
function host(){
 const slots=[];let cursor=0,dirty=false,effects=[],renderFn,view;
 const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
 const react={
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,n=>{const v=typeof n==='function'?n(slots[i].value):n;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},
  useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},
  useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old?.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
 };
 return {react,render(fn){renderFn=fn||renderFn;for(let pass=0;pass<30;pass++){cursor=0;dirty=false;effects=[];view=renderFn();effects.forEach(fn=>fn());if(!dirty)return view;}throw Error('render did not settle');},dispose(){slots.forEach(slot=>slot.cleanup?.());}};
}
function nodes(value){if(!value||typeof value!=='object'||value.props?.hidden||(value.type==='Sheet'&&!value.props.open))return [];return [value,...[value.props?.children].flat(Infinity).flatMap(nodes)];}
function text(value){if(Array.isArray(value))return value.map(text).join('');return value?.props?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';}
const countries=load('mobile/src/data/countries.ts',{'./iso3166.json':JSON.parse(readFileSync(`${repo}/mobile/src/data/iso3166.json`,'utf8'))});
const codes=load('mobile/src/data/countryCodes.ts',{'./countries':countries});
const iso=load('mobile/src/data/countryIso.ts',{'./countries':countries});
const profileCountries=load('mobile/src/lib/profileCountries.ts',{'../data/countries':countries,'../data/countryCodes':codes});
const i18n={copy:(_,en)=>en,countryName:(_,name)=>name,locale:'en'};
function profileHarness({remote,local=[],verificationRows=[],verificationFailure=false,pendingImport=false}={}){
 const h=host(), storage=new Map(),reads=[],writes=[],notices=[],resumes=new Set();
 const get=(owner,key)=>storage.get(`${owner}:${key}`)||[];
 const set=(owner,key,value)=>storage.set(`${owner}:${key}`,value);
 set('a','visited',local);
 let props={user:{id:'a',email:'a@example.invalid',user_metadata:{full_name:'User A'}},ownerId:'a',accessToken:'token-a',isAdmin:false,onOpenAccount(){},onNavigate(){},onOpenRelease(){},onOpenOnboarding(){},onNotice:v=>notices.push(v)};
 const source=load('mobile/src/screens/ProfileScreen.tsx',{
  react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  '../components/Icon':{Icon:'Icon'},'../components/ProfilePhoto':{ProfilePhoto:'ProfilePhoto'},'../components/Sheet':{Sheet:'Sheet'},'../components/CommunitySafetySheet':{CommunityBlocksSheet:'Blocks'},'../components/LegalSheet':{LegalSheet:'Legal'},'../components/VerificationForm':{VerificationForm:'VerificationForm'},
  '../data/countries':countries,'../data/countryCodes':codes,'../data/countryIso':iso,'../lib/profileCountries':profileCountries,'../lib/config':{config:{}},
  '../lib/api':{getTravelVerifications:async()=>{if(verificationFailure)throw Error('HTTP 503');return verificationRows;}},'../lib/capacitor':{plugin:()=>null,addPluginListener:async()=>null},'../lib/native':{shareContent:async()=>true},
  '../lib/push':{getPushPermissionState:async()=> 'unsupported',isPushEnabledForDevice:()=>false},
  '../lib/i18n':{useI18n:()=>i18n},
  '../lib/accountResume':{onAccountResume:fn=>{resumes.add(fn);return ()=>resumes.delete(fn);}},
  '../lib/supabaseData':{getUserProfile:(id)=>{const d=deferred();reads.push({id,...d});if(remote&&id==='a')d.resolve(remote);return d.promise;},updateUserProfile:(id,change,token)=>{const d=deferred();writes.push({id,change,token,...d});return d.promise;},getSupabaseDataErrorMessage:(_,fallback)=>fallback},
  '../lib/storage':{getPendingGuestDataSync:()=>pendingImport?{profile:true}:null,getMobilePreferences:()=>({}),getVisitedCountries:owner=>get(owner,'visited'),getFavoriteDestinations:owner=>get(owner,'favorites'),getSavedRoutePlans:()=>[],saveMobilePreferences(){},setVisitedCountries:(value,owner)=>set(owner,'visited',value),setFavoriteDestinations:(value,owner)=>set(owner,'favorites',value),toggleVisitedCountry:(country,owner)=>{const prev=get(owner,'visited');const next=prev.some(c=>c.alpha3===country.alpha3)?prev.filter(c=>c.alpha3!==country.alpha3):[...prev,{...country,createdAt:new Date().toISOString()}];set(owner,'visited',next);return next;}},
 },{window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'}});
 let tree;const render=(next={})=>{props={...props,...next};tree=h.render(()=>source.ProfileScreen(props));return tree;};render();
 return {h,source,reads,writes,notices,storage,render,resume:()=>resumes.forEach(fn=>fn()),get tree(){return tree;},get};
}
const base={id:'a',username:'user_a',visitedCountries:[],wishlistCountries:[],optInLeaderboard:false};
const tr=countries.COUNTRY_LIST.find(c=>c.alpha3==='TUR');

test('Returning to the app fetches current account countries instead of retaining another device\'s deleted visit',async()=>{
 const h=profileHarness();h.reads[0].resolve({...base,visitedCountries:['TUR']});await tick();h.render();
 assert.equal(h.get('a','visited').length,1);h.resume();h.render();assert.equal(h.reads.length,2);
 h.reads[1].resolve(base);await tick();h.render();assert.equal(h.get('a','visited').length,0);assert.equal(h.writes.length,0);h.h.dispose();
});

test('Successful remote profile reads remove stale local visits without writing them back', async()=>{
 const h=profileHarness({remote:base,local:[{...tr,createdAt:'2026-09-01T00:00:00Z'}]});
 await tick();h.render();assert.equal(h.writes.length,0);assert.equal(h.get('a','visited').length,0);h.h.dispose();
});
test('Explicit pending guest imports survive a remote read and remain queued for the existing sync service',async()=>{
 const h=profileHarness({remote:base,pendingImport:true,local:[{...tr,createdAt:'2026-09-01T00:00:00Z'}]});
 await tick();h.render();assert.equal(h.writes.length,0);assert.equal(h.get('a','visited')[0].alpha3,'TUR');h.h.dispose();
});
test('Kosovo legacy IDs display once and can be completely removed',()=>{
 const destinations=profileCountries.profileDestinations(['XKX','383','000','XKK']);
 assert.equal(destinations.length,1);assert.equal(destinations[0].alpha3,'XKK');
 assert.deepEqual(Array.from(codes.profileIdsForAlpha3(['XKX','383','000'],[])),[]);
});
test('Verification service failure shows retry without inventing an empty submission history',async()=>{
 const h=profileHarness({remote:base,verificationFailure:true});await tick();h.render();
 nodes(h.tree).find(n=>n.type==='button'&&text(n).includes('Verified Traveller')).props.onClick();h.render();
 assert.ok(text(h.tree).includes('Verifications could not load'));assert.ok(!text(h.tree).includes('No verifications yet'));
 const retry=nodes(h.tree).find(n=>n.type==='button'&&text(n)==='Retry');assert.ok(retry);retry.props.onClick();h.render();assert.equal(h.reads.length,2);h.h.dispose();
});
test('Failed remote profile read retains cache, disables edits and can be retried',async()=>{
 const h=profileHarness({local:[{...tr,createdAt:'2026-09-01T00:00:00Z'}]});h.reads[0].reject(Error('503'));await tick();h.render();
 assert.equal(h.get('a','visited').length,1);assert.ok(text(h.tree).includes('Your profile could not load'));assert.equal(h.writes.length,0);
 const retry=nodes(h.tree).find(n=>n.type==='button'&&text(n)==='Retry');retry.props.onClick();h.render();h.reads[1].resolve(base);await tick();h.render();assert.equal(h.get('a','visited').length,0);h.h.dispose();
});
function authHarness(){
 const h=host(),requests=[],values=new Map(),intervals=[];
 const session={access_token:'token-a',refresh_token:'refresh-a',expires_at:Math.floor(Date.now()/1000)+150,user:{id:'a',email:'a@example.invalid'}};
 values.set('l2t.mobile.auth-session.v1',JSON.stringify(session));
 values.set('l2t.mobile.password-recovery.v1','true');
 const w={localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{href:'http://test.invalid/',origin:'http://test.invalid'},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout:()=>1,clearTimeout(){}};
 const no=async()=>{};
 const {useAuth}=load('mobile/src/hooks/useAuth.ts',{
  react:h.react,'../lib/config':{config:{supabaseUrl:'http://auth.invalid',supabaseAnonKey:'public'},isSupabaseConfigured:true},'../lib/api':{ApiError:class extends Error{},requestJson:(path,options)=>{if(path.includes('/logout'))return Promise.resolve({});const d=deferred();requests.push({path,options,...d});return d.promise;}},'../lib/capacitor':{addPluginListener:async()=>null,isNativePlatform:()=>false,plugin:()=>null},'../lib/native':{closeBrowser:no,openExternal:no},'../lib/liveActivity':{endAllFlightActivities:no},'../lib/liveActivityPush':{disableLiveActivityTokensForLogout:no},'../lib/push':{detachPushForLogout:no},'../lib/i18n':{localeFromStorage:()=> 'en'},
 },{window:w});
 return {h,requests,values,intervals,session,render:()=>h.render(useAuth)};
}
for(const operation of ['updateProfile','updatePassword']){
 test(`Delayed ${operation} preserves rotated tokens`,async()=>{
  const x=authHarness();let auth=x.render();await tick();auth=x.render();
  const pending=operation==='updateProfile'?auth.updateProfile('User A updated','user_a'):auth.updatePassword('A-secure-password-123!');
  assert.equal(x.requests.length,1);x.intervals[0]();assert.equal(x.requests.length,2);
  x.requests[1].resolve({...x.session,access_token:'token-new',refresh_token:'refresh-new',expires_at:Math.floor(Date.now()/1000)+3600});await tick();auth=x.render();
  x.requests[0].resolve({...x.session.user,user_metadata:{full_name:'User A updated'}});await pending;auth=x.render();
  assert.equal(auth.session.refresh_token,'refresh-new');assert.equal(JSON.parse(x.values.get('l2t.mobile.auth-session.v1')).refresh_token,'refresh-new');x.h.dispose();
 });
 test(`Delayed ${operation} never resurrects a logged-out account`,async()=>{
  const x=authHarness();let auth=x.render();await tick();auth=x.render();
  const pending=operation==='updateProfile'?auth.updateProfile('User A updated','user_a'):auth.updatePassword('A-secure-password-123!');
  await auth.signOut();x.requests[0].resolve(x.session.user);await pending;auth=x.render();
  assert.equal(auth.session,null);assert.equal(x.values.has('l2t.mobile.auth-session.v1'),false);x.h.dispose();
 });
}

test('Admin reports show the target content and hide it only through the existing protected moderation action',async()=>{
 const h=host(),requests=[];let changed=0;
 const formatting=load('mobile/src/lib/localeFormatting.ts',{'./locales/sq-regions':load('mobile/src/lib/locales/sq-regions.ts',{})});
 const {AdminReports}=load('mobile/src/components/AdminReports.tsx',{
  react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/i18n':{useI18n:()=>({...i18n,dateLocale:'en-GB'})},'../lib/localeFormatting':formatting,
  '../lib/api':{requestJson:(path,options)=>{const d=deferred();requests.push({path,options,...d});return d.promise;}},
 },{window:{confirm:()=>true}});
 const render=()=>h.render(()=>AdminReports({accessToken:'admin-token',onChanged:()=>changed++}));let view=render();
 assert.equal(requests[0].options.headers.Authorization,'Bearer admin-token');
 requests[0].resolve({data:[{id:'report-1',reason:'Spam',target_type:'reply',status:'open',created_at:'2026-09-30',targetContent:{content:'The actual reported reply',author_name:'traveller'}}],count:21});await tick();view=render();assert.ok(text(view).includes('The actual reported reply'));
 nodes(view).find(n=>n.type==='button'&&text(n)==='Hide content and resolve').props.onClick();render();
 assert.deepEqual(JSON.parse(JSON.stringify(requests[1].options.body)),{id:'report-1',status:'resolved',action:'hide'});assert.equal(requests[1].options.method,'PATCH');assert.equal(requests[1].options.headers.Authorization,'Bearer admin-token');
 requests[1].resolve({success:true});await tick();render();assert.equal(changed,1);assert.equal(requests.length,3,'Successful moderation reloads the current report page');
 requests[2].reject(Error('503'));await tick();view=render();assert.ok(text(view).includes('Reports could not load'));assert.ok(!text(view).includes('No reports with this status'));h.dispose();
});

test('Delayed metadata response cannot overwrite a newly signed-in different account',async()=>{
 const x=authHarness();let auth=x.render();await tick();auth=x.render();
 const pending=auth.updateProfile('User A updated','user_a');
 await auth.signOut();auth=x.render();
 const signingIn=auth.signInWithEmail('b@example.invalid','test-password');
 x.requests[1].resolve({...x.session,access_token:'token-b',refresh_token:'refresh-b',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'b',email:'b@example.invalid'}});
 await signingIn;x.render();x.requests[0].resolve({...x.session.user,user_metadata:{full_name:'User A updated'}});await pending;auth=x.render();
 assert.equal(auth.user.id,'b');assert.equal(auth.session.refresh_token,'refresh-b');x.h.dispose();
});

for(const operation of ['updateProfile','updatePassword'])test(`${operation} finishing before refresh does not discard the rotated token response`,async()=>{
 const x=authHarness();let auth=x.render();await tick();auth=x.render();
 const pending=operation==='updateProfile'?auth.updateProfile('User A updated','user_a'):auth.updatePassword('A-secure-password-123!');
 x.intervals[0]();x.requests[0].resolve({...x.session.user,user_metadata:{full_name:'User A updated'}});await pending;x.render();
 x.requests[1].resolve({...x.session,access_token:'token-new',refresh_token:'refresh-new',expires_at:Math.floor(Date.now()/1000)+3600});await tick();auth=x.render();
 assert.equal(auth.session.refresh_token,'refresh-new');assert.equal(auth.user.user_metadata.full_name,'User A updated');x.h.dispose();
});

test('Verification country labels follow the selected UI language instead of stored Turkish names',async()=>{
 const original=i18n.countryName;i18n.countryName=(code,fallback)=>code==='TUR'?'Turkey':fallback;
 const h=profileHarness({remote:base,verificationRows:[{id:'verification-1',country_code:'TR',country_name:'Türkiye',status:'approved'}]});
 try{await tick();h.render();nodes(h.tree).find(n=>n.type==='button'&&text(n).includes('Verified Traveller')).props.onClick();h.render();
  const list=nodes(h.tree).find(n=>n.props?.className==='verification-list');assert.ok(text(list).includes('Turkey'));assert.ok(!text(list).includes('Türkiye'));
 }finally{h.h.dispose();i18n.countryName=original;}
});
