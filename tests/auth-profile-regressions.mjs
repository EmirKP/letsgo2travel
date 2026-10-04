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
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Error,Date,Intl,console,URL,URLSearchParams,TextEncoder,crypto:globalThis.crypto,...globals})(name=>{if(Object.hasOwn(imports,name))return imports[name];if(/\.(webp|css)$/.test(name))return name;throw Error(`Missing ${name}`);},m,m.exports);
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
  '../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},
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
function authHarness({native=false, seedSession=true, openOAuthSession=async()=>null, values=new Map(), getLaunchUrl, href='http://test.invalid/'}={}){
 const h=host(),requests=[],intervals=[],listeners=new Map(),timers=[],assignments=[];
 const session={access_token:'token-a',refresh_token:'refresh-a',expires_at:Math.floor(Date.now()/1000)+150,user:{id:'a',email:'a@example.invalid'}};
 if(seedSession){
  values.set('l2t.mobile.auth-session.v1',JSON.stringify(session));
  values.set('l2t.mobile.password-recovery.v1','true');
 }
 const w={localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{href,origin:'http://test.invalid',assign:url=>assignments.push(url)},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 const no=async()=>{};
 const {useAuth}=load('mobile/src/hooks/useAuth.ts',{
  react:h.react,'../lib/config':{config:{supabaseUrl:'http://auth.invalid',supabaseAnonKey:'public',appleAuthEnabled:true},isSupabaseConfigured:true},'../lib/api':{ApiError:class extends Error{},requestJson:(path,options)=>{if(path.includes('/logout'))return Promise.resolve({});const d=deferred();requests.push({path,options,...d});return d.promise;}},'../lib/capacitor':{addPluginListener:async(name,event,fn)=>{listeners.set(`${name}:${event}`,fn);return {remove:async()=>listeners.delete(`${name}:${event}`)};},isNativePlatform:()=>native,plugin:name=>name==='App'&&getLaunchUrl?{getLaunchUrl}:null},'../lib/native':{closeBrowser:no,openOAuthSession},'../lib/liveActivity':{endAllFlightActivities:no},'../lib/liveActivityPush':{disableLiveActivityTokensForLogout:no},'../lib/push':{detachPushForLogout:no},'../lib/i18n':{localeFromStorage:()=> 'en'},
 },{window:w,btoa:value=>Buffer.from(value,'binary').toString('base64')});
 return {h,requests,values,intervals,session,listeners,timers,assignments,render:()=>h.render(useAuth)};
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


// These exercise the real hook with mocked native/backend responses. Empty local
// storage does not reproduce Apple's first-account consent or an actual iPad UI.
async function waitForAuthRequests(x,count){
 for(let i=0;i<100&&x.requests.length<count;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(x.requests.length,count,'Expected token exchange must start');
}
function assertOAuthSuccess(x,expected){
 const auth=x.render(),saved=JSON.parse(x.values.get('l2t.mobile.auth-session.v1'));
 assert.equal(auth.session.access_token,expected.access_token);
 assert.equal(auth.session.refresh_token,expected.refresh_token);
 assert.equal(auth.user.id,expected.user.id);
 assert.equal(saved.access_token,expected.access_token);
 assert.equal(saved.refresh_token,expected.refresh_token);
 assert.equal(saved.user.id,expected.user.id);
 assert.equal(auth.loading,false);assert.equal(auth.authError,'');
 assert.equal(auth.recoveryPending,false);
 assert.equal(x.values.has('l2t.mobile.password-recovery.v1'),false);
 assert.equal(x.values.has('l2t.mobile.oauth-transaction.v2'),false);
}
for(const seedSession of [false,true])test(`Native OAuth persists PKCE session with ${seedSession?'an existing session':'empty local storage'}`,async()=>{
 let opened;
 const x=authHarness({native:true,seedSession,openOAuthSession:async url=>{opened=new URL(url);return 'tr.com.letsgo2travel.app://auth/callback?code=synthetic-code';}});
 try{
 x.render();await tick();const auth=x.render();
 assert.equal(auth.session?.user.id??null,seedSession?'a':null);
 assert.equal(x.values.has('l2t.mobile.auth-session.v1'),seedSession);
 const pending=auth.signInWithApple();await waitForAuthRequests(x,1);
 assert.equal(opened.searchParams.get('provider'),'apple');
 assert.equal(opened.searchParams.get('code_challenge_method'),'s256');
 assert.equal(opened.searchParams.get('redirect_to'),'tr.com.letsgo2travel.app://auth/callback');
 assert.match(x.requests[0].path,/\/token\?grant_type=pkce$/);
 assert.equal(x.requests[0].options.body.auth_code,'synthetic-code');
 assert.ok(x.requests[0].options.body.code_verifier.length>=43);
 assert.equal(x.render().loading,true);
 assert.equal(x.values.has('l2t.mobile.oauth-transaction.v2'),true);
 const response={...x.session,access_token:'new-apple-token',refresh_token:'new-apple-refresh',user:{id:'apple-user',email:'apple@example.invalid'}};
 x.requests[0].resolve(response);await pending;assertOAuthSuccess(x,response);
 }finally{x.h.dispose();}
});

for(const seedSession of [false,true])test(`Cancelled native OAuth can retry successfully with ${seedSession?'an existing session':'empty local storage'}`,async()=>{
 let attempts=0;const x=authHarness({native:true,seedSession,openOAuthSession:async()=>{
  attempts++;if(attempts===1)throw Error('Sign-in cancelled');
  return 'tr.com.letsgo2travel.app://auth/callback?code=retry-after-cancel';
 }});
 try{
 x.render();await tick();let auth=x.render();await assert.rejects(auth.signInWithApple(),/cancelled/);
 auth=x.render();assert.equal(auth.loading,false);assert.match(auth.authError,/cancelled/);
 assert.equal(auth.session?.user.id??null,seedSession?'a':null);
 assert.equal(x.values.has('l2t.mobile.auth-session.v1'),seedSession);
 assert.equal(x.values.has('l2t.mobile.oauth-transaction.v2'),false);assert.equal(x.requests.length,0);
 const pending=auth.signInWithApple();await waitForAuthRequests(x,1);
 assert.equal(attempts,2);assert.equal(x.render().authError,'');
 const response={...x.session,access_token:'retry-token',refresh_token:'retry-refresh'};
 x.requests[0].resolve(response);await pending;assertOAuthSuccess(x,response);
 }finally{x.h.dispose();}
});

test('Rapid duplicate OAuth taps cannot create two authentication sessions',async()=>{
 const waiting=deferred();let calls=0;const x=authHarness({native:true,openOAuthSession:()=>{calls++;return waiting.promise;}});
 const auth=x.render();const first=auth.signInWithApple();
 await assert.rejects(auth.signInWithApple(),/already in progress/);
 for(let i=0;i<30&&!calls;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(calls,1);waiting.reject(Error('Sign-in cancelled'));await assert.rejects(first,/cancelled/);x.h.dispose();
});

test('Provider error callback cannot create a signed-in session',async()=>{
 const x=authHarness({native:true,seedSession:false,openOAuthSession:async()=> 'tr.com.letsgo2travel.app://auth/callback?error=access_denied'});
 try{
 x.render();await tick();await x.render().signInWithApple();const auth=x.render();
 assert.equal(x.requests.length,0);assert.equal(auth.session,null);assert.equal(auth.user,null);
 assert.equal(auth.loading,false);assert.match(auth.authError,/cancelled/);
 assert.equal(x.values.has('l2t.mobile.auth-session.v1'),false);
 assert.equal(x.values.has('l2t.mobile.oauth-transaction.v2'),false);
 }finally{x.h.dispose();}
});

for(const failure of ['request rejection','incomplete session'])test(`Fresh native OAuth ${failure} leaves no session and permits a new PKCE attempt`,async()=>{
 let attempts=0;const x=authHarness({native:true,seedSession:false,openOAuthSession:async()=>
  `tr.com.letsgo2travel.app://auth/callback?code=attempt-${++attempts}`});
 try{
 x.render();await tick();const first=x.render().signInWithApple();await waitForAuthRequests(x,1);
 const firstVerifier=x.requests[0].options.body.code_verifier;
 if(failure==='request rejection')x.requests[0].reject(Error('Failed to fetch'));
 else x.requests[0].resolve({access_token:'incomplete-token'});
 await first;let auth=x.render();
 assert.equal(auth.session,null);assert.equal(auth.user,null);assert.equal(auth.loading,false);
 assert.ok(auth.authError.length>0);assert.equal(x.values.has('l2t.mobile.auth-session.v1'),false);
 assert.equal(x.values.has('l2t.mobile.oauth-transaction.v2'),false);
 const retry=auth.signInWithApple();await waitForAuthRequests(x,2);
 assert.equal(attempts,2);assert.equal(x.requests[1].options.body.auth_code,'attempt-2');
 assert.notEqual(x.requests[1].options.body.code_verifier,firstVerifier,'Retry creates a new PKCE transaction');
 assert.equal(x.render().authError,'');assert.equal(x.render().loading,true);
 const response={...x.session,access_token:'fresh-retry-token',refresh_token:'fresh-retry-refresh',user:{id:'new-apple-user',email:'new-apple@example.invalid'}};
 x.requests[1].resolve(response);await retry;assertOAuthSuccess(x,response);
 }finally{x.h.dispose();}
});

const oauthKey='l2t.mobile.oauth-transaction.v2';
function interruptedOAuth(){
 const transaction={provider:'apple',verifier:'a'.repeat(128),createdAt:Date.now()};
 return {transaction,values:new Map([[oauthKey,JSON.stringify(transaction)]])};
}

test('Explicit retry after process restart replaces an orphaned transaction without waiting for its TTL',async()=>{
 const {transaction,values}=interruptedOAuth();
 const x=authHarness({native:true,seedSession:false,values,getLaunchUrl:async()=>({}),openOAuthSession:async()=> 'tr.com.letsgo2travel.app://auth/callback?code=restarted'});
 try{
  x.render();await tick();const auth=x.render();
  assert.equal(JSON.parse(values.get(oauthKey)).verifier,transaction.verifier,'Startup preserves a possible delayed app-link callback');
  const pending=auth.signInWithApple();await waitForAuthRequests(x,1);
  assert.notEqual(x.requests[0].options.body.code_verifier,transaction.verifier);
  x.requests[0].resolve(x.session);await pending;assertOAuthSuccess(x,x.session);
 }finally{x.h.dispose();}
});

test('Native cold-start callback retains its saved PKCE verifier and blocks a competing new login',async()=>{
 const {transaction,values}=interruptedOAuth(),launch=deferred();
 let opened=0;const x=authHarness({native:true,seedSession:false,values,getLaunchUrl:()=>launch.promise,openOAuthSession:async()=>{opened++;return null;}});
 try{
  const auth=x.render();await tick();assert.equal(x.render().loading,true);
  await assert.rejects(auth.signInWithApple(),/already in progress/);
  assert.equal(JSON.parse(values.get(oauthKey)).verifier,transaction.verifier);
  launch.resolve({url:'tr.com.letsgo2travel.app://auth/callback?code=from-launch'});await waitForAuthRequests(x,1);
  await assert.rejects(x.render().signInWithGoogle(),/already in progress/);
  assert.equal(x.requests[0].options.body.code_verifier,transaction.verifier);
  x.requests[0].resolve(x.session);await tick();assertOAuthSuccess(x,x.session);assert.equal(opened,0);
 }finally{x.h.dispose();}
});

test('A delayed app-link callback after launch still exchanges the restored verifier once',async()=>{
 const {transaction,values}=interruptedOAuth();const x=authHarness({native:true,seedSession:false,values,getLaunchUrl:async()=>({})});
 try{
  x.render();await tick();x.render();
  const event={url:'tr.com.letsgo2travel.app://auth/callback?code=delayed-link'};
  x.listeners.get('App:appUrlOpen')(event);await waitForAuthRequests(x,1);
  x.listeners.get('App:appUrlOpen')(event);assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].options.body.code_verifier,transaction.verifier);
  x.requests[0].resolve(x.session);await tick();assertOAuthSuccess(x,x.session);
 }finally{x.h.dispose();}
});

test('Web redirect exchanges its persisted verifier before allowing another login',async()=>{
 const {transaction,values}=interruptedOAuth();const x=authHarness({seedSession:false,values,href:'http://test.invalid/auth/callback?code=web-return'});
 try{
  x.render();await waitForAuthRequests(x,1);
  await assert.rejects(x.render().signInWithApple(),/already in progress/);
  assert.equal(x.requests[0].options.body.code_verifier,transaction.verifier);
  x.requests[0].resolve(x.session);await tick();assertOAuthSuccess(x,x.session);
 }finally{x.h.dispose();}
});

test('A current-process Android browser login remains guarded after Browser.open resolves',async()=>{
 const x=authHarness({native:true,seedSession:false});
 try{
  x.render();await tick();await x.render().signInWithGoogle();
  const first=JSON.parse(x.values.get(oauthKey)).verifier;
  await assert.rejects(x.render().signInWithApple(),/already in progress/);
  assert.equal(JSON.parse(x.values.get(oauthKey)).verifier,first);
  x.listeners.get('Browser:browserFinished')({});x.timers.at(-1)();
  assert.equal(x.values.has(oauthKey),false);
  await x.render().signInWithGoogle();assert.notEqual(JSON.parse(x.values.get(oauthKey)).verifier,first);
 }finally{x.h.dispose();}
});

test('Returning to the web app without a callback allows an explicit fresh redirect',async()=>{
 const {transaction,values}=interruptedOAuth();const x=authHarness({seedSession:false,values});
 try{
  x.render();await tick();await x.render().signInWithGoogle();
  assert.equal(x.assignments.length,1);assert.notEqual(JSON.parse(values.get(oauthKey)).verifier,transaction.verifier);
  await assert.rejects(x.render().signInWithGoogle(),/already in progress/);
 }finally{x.h.dispose();}
});

test('Unavailable native launch URL does not strand an orphaned login',async()=>{
 const {values}=interruptedOAuth();const x=authHarness({native:true,seedSession:false,values,getLaunchUrl:async()=>{throw Error('Unavailable');}});
 try{x.render();await tick();assert.equal(x.render().loading,false);await x.render().signInWithApple();}
 finally{x.h.dispose();}
});

class ProfileApiError extends Error{
 constructor(status,code=''){super(`HTTP ${status}`);this.status=status;this.code=code;}
}
const profileOwner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const completeProfileRow={id:profileOwner,username:'traveller',visited_countries:['TUR'],wishlist_countries:['ALB'],opt_in_leaderboard:true};
function completionHarness(responses){
 const requests=[];
 const data=load('mobile/src/lib/supabaseData.ts',{
  './api':{ApiError:ProfileApiError,requestJson:async(url,options)=>{requests.push({url,options});assert.ok(responses.length,'Unexpected profile request');const result=responses.shift();if(result instanceof Error)throw result;return result;}},
  './config':{config:{supabaseUrl:'https://auth.invalid',supabaseAnonKey:'public-key'},isSupabaseConfigured:true},
  './dates':{},'./i18n':{localeFromStorage:()=> 'en'},'./id':{},'./flightSelection':{},
 });
 return {requests,data,complete:()=>data.completeUserProfile(profileOwner,'traveller','owner-token')};
}

test('Existing profile completion only updates the username through the authenticated own-row PATCH',async()=>{
 const x=completionHarness([[completeProfileRow]]);const profile=await x.complete();
 assert.equal(profile.username,'traveller');assert.equal(x.requests.length,1);
 assert.equal(x.requests[0].options.method,'PATCH');assert.equal(new URL(x.requests[0].url).searchParams.get('id'),`eq.${profileOwner}`);
 assert.deepEqual(JSON.parse(JSON.stringify(x.requests[0].options.body)),{username:'traveller'});
 assert.equal(x.requests[0].options.headers.Authorization,'Bearer owner-token');
});

test('Missing profile completion verifies ownership and inserts only id and validated username under existing RLS',async()=>{
 const x=completionHarness([[],{id:profileOwner},[],null,[completeProfileRow]]);const result=await x.complete();
 assert.equal(x.requests.length,5);assert.match(x.requests[1].url,/\/auth\/v1\/user$/);
 assert.equal(x.requests[3].options.method,'POST');assert.equal(new URL(x.requests[3].url).searchParams.get('on_conflict'),'id');
 assert.deepEqual(JSON.parse(JSON.stringify(x.requests[3].options.body)),{id:profileOwner,username:'traveller'});
 assert.equal(x.requests[3].options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
 assert.ok(x.requests.every(r=>r.options.headers.Authorization==='Bearer owner-token'));
 assert.equal(result.visitedCountries[0],'TUR');assert.equal(result.optInLeaderboard,true);
 assert.equal(x.requests.at(-1).options.method,'PATCH','Read/update after ignored concurrent creation, never merge-overwrite defaults');
});

test('Missing profile recovery refuses a mismatched authenticated owner before inserting',async()=>{
 const x=completionHarness([[],{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}]);
 await assert.rejects(x.complete(),error=>error.code==='forbidden');assert.equal(x.requests.length,2);
 assert.ok(x.requests.every(r=>r.options.method!=='POST'));
});

for(const status of [401,403,503])test(`Profile update HTTP ${status} never triggers a recovery insert`,async()=>{
 const x=completionHarness([new ProfileApiError(status)]);await assert.rejects(x.complete());assert.equal(x.requests.length,1);
});

test('A delayed signup-created profile is updated without attempting another insert',async()=>{
 const x=completionHarness([[],{id:profileOwner},[completeProfileRow],[completeProfileRow]]);
 await x.complete();assert.equal(x.requests.length,4);assert.ok(x.requests.every(r=>r.options.method!=='POST'));
});

test('Recovery respects insert policy denial and reports incomplete profile rather than signed-out state',async()=>{
 const x=completionHarness([[],{id:profileOwner},[],new ProfileApiError(403)]);
 await assert.rejects(x.complete(),error=>{
  assert.equal(error.code,'profile_unavailable');assert.match(x.data.getSupabaseDataErrorMessage(error),/You are signed in/);return true;
 });assert.equal(x.requests.length,4);
});

test('A live schema requiring additional server fields reports a setup problem instead of blaming valid profile input',async()=>{
 const x=completionHarness([[],{id:profileOwner},[],new ProfileApiError(400,'23502')]);
 await assert.rejects(x.complete(),error=>error.code==='profile_unavailable');assert.equal(x.requests.length,4);
});

test('Username conflicts are surfaced without retrying with defaults or overwriting another profile',async()=>{
 const x=completionHarness([[],{id:profileOwner},[],new ProfileApiError(409,'23505')]);
 await assert.rejects(x.complete(),error=>error.code==='conflict');assert.equal(x.requests.length,4);
});

test('A failed profile lookup never becomes an insert attempt',async()=>{
 const x=completionHarness([[],{id:profileOwner},new ProfileApiError(503)]);
 await assert.rejects(x.complete(),error=>error.code==='service_unavailable');assert.equal(x.requests.length,3);
});

for(const recoverySucceeds of [false,true])test(`Account sheet ${recoverySucceeds?'updates auth metadata only after':'does not claim completion when'} profile recovery ${recoverySucceeds?'succeeds':'fails'}`,async()=>{
 const h=host(),pending=deferred(),notices=[],metadata=[];let calls=0;
 const auth={user:{id:profileOwner,email:'owner@example.invalid',created_at:'2026-10-04',user_metadata:{full_name:'Traveller'}},accessToken:'owner-token',updateProfile:async(...args)=>metadata.push(args)};
 const {AccountSheet}=load('mobile/src/components/AccountSheet.tsx',{
  react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/localeFormatting':{formatAppDate:()=> '4 October'},'../lib/capacitor':{isIOSNative:()=>true},'../lib/config':{config:{appleAuthEnabled:true}},
  './LegalSheet':{LegalSheet:'Legal'},'./Icon':{Icon:'Icon'},'./Sheet':{Sheet:'Sheet'},'./AccountDeletionPanel':{AccountDeletionPanel:'Deletion'},'../lib/i18n':{useI18n:()=>i18n},
  '../lib/supabaseData':{completeUserProfile:(id,username,token)=>{assert.equal(id,profileOwner);assert.equal(username,'traveller');assert.equal(token,'owner-token');calls++;return pending.promise;},getSupabaseDataErrorMessage:e=>e.message},
 });
 const render=()=>h.render(()=>AccountSheet({open:true,onClose(){},auth,onNotice:message=>notices.push(message)}));
 try{
  let view=render();nodes(view).find(n=>n.type==='input'&&n.props.placeholder==='example_traveller').props.onChange({target:{value:'traveller'}});view=render();
  nodes(view).find(n=>n.type==='button'&&text(n)===' Complete profile').props.onClick();render();
  assert.equal(calls,1);assert.equal(metadata.length,0);assert.equal(notices.length,0);
  if(recoverySucceeds)pending.resolve(completeProfileRow);else pending.reject(Error('Profile could not be prepared'));
  await tick();view=render();
  assert.equal(metadata.length,recoverySucceeds?1:0);
  assert.equal(notices.at(-1),recoverySucceeds?'Your profile was updated on web and mobile.':'Profile could not be prepared');
  assert.equal(nodes(view).find(n=>n.type==='button'&&text(n)===' Complete profile').props.disabled,false,'Retry remains available after the response');
 }finally{h.dispose();}
});
