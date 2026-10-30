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
function profileHarness({remote,local=[],verificationRows=[],verificationFailure=false,pendingImport=false,holdVerifications=false,holdPush=false,holdShare=false,locale='en',pushPermission='unsupported',devicePush=false,sync=load('mobile/src/lib/profileSync.ts',{})}={}){
 let h=host(),editorKey;
 const storage=new Map(),reads=[],writes=[],notices=[],resumes=new Set(),verificationReads=[],storageListeners=new Set();
 const preferenceWrites=[],pushCalls=[],shares=[];let preferences={inAppNotifications:true,haptics:true};
 const profileI18n=locale==='en'?i18n:{...i18n,locale,copy:(tr,en,sq)=>locale==='tr'?tr:sq||en};
 const get=(owner,key)=>storage.get(`${owner}:${key}`)||[];
 const set=(owner,key,value)=>{storage.set(`${owner}:${key}`,value);storageListeners.forEach(fn=>fn());};
 set('a','visited',local);
 const react=Object.fromEntries(['useState','useRef','useMemo','useCallback','useEffect'].map(name=>[name,(...args)=>h.react[name](...args)]));
 let props={user:{id:'a',email:'a@example.invalid',user_metadata:{full_name:'User A'}},ownerId:'a',accessToken:'token-a',isAdmin:false,onOpenAccount(){},onNavigate(){},onOpenRelease(){},onOpenOnboarding(){},onNotice:v=>notices.push(v)};
 const source=load('mobile/src/screens/ProfileScreen.tsx',{
  react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  '../components/TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},
  '../components/NotificationPreferences':{NotificationPreferences:'NotificationPreferences'},
  '../components/CommunityProfileSheet':{CommunityProfileInline:'CommunityProfileInline'},
  '../components/AppearancePicker':{AppearancePicker:'AppearancePicker'}, '../components/TextSizePicker':{TextSizePicker:'TextSizePicker'},
  '../../../lib/leaderboard/verified':load('lib/leaderboard/verified.ts',{'./countries':load('lib/leaderboard/countries.ts',{'../countries/isoSource':{ISO_COUNTRIES:countries.ISO_3166}})}),
  '../components/Icon':{Icon:'Icon'},'../components/ProfilePhoto':{ProfilePhoto:'ProfilePhoto'},'../components/Sheet':{Sheet:'Sheet'},'../components/CommunitySafetySheet':{CommunityBlocksSheet:'Blocks'},'../components/LegalSheet':{LegalSheet:'Legal'},'../components/VerificationForm':{VerificationForm:'VerificationForm'},
  '../components/SupportSheet':{SupportSheet:'SupportSheet'},
  '../data/countries':countries,'../data/countryCodes':codes,'../data/countryIso':iso,'../lib/profileCountries':profileCountries,'../lib/config':{config:{}},
  '../lib/api':{getTravelVerifications:async token=>{if(holdVerifications){const d=deferred();verificationReads.push({token,...d});return d.promise;}if(verificationFailure)throw Error('HTTP 503');return verificationRows;},sendTestPushNotification:async token=>{const wait=holdPush?deferred():null;pushCalls.push({kind:'test',token,...wait});return wait?wait.promise:{success:true};}},'../lib/capacitor':{plugin:()=>null,addPluginListener:async()=>null},'../lib/native':{shareContent:async value=>{const wait=holdShare?deferred():null;shares.push({...value,...wait});return wait?wait.promise:true;}},
  '../lib/push':{getPushPermissionState:async()=>pushPermission,isPushEnabledForDevice:()=>devicePush,enablePushForUser:async getToken=>{const wait=holdPush?deferred():null;pushCalls.push({kind:'enable',token:getToken(),...wait});return wait?wait.promise:{ok:true};},disablePush:async(getToken,owner)=>{const wait=holdPush?deferred():null;pushCalls.push({kind:'disable',token:getToken(),owner,...wait});return wait?wait.promise:true;}},
  '../lib/i18n':{useI18n:()=>profileI18n},
  '../lib/accountResume':{onAccountResume:fn=>{resumes.add(fn);return ()=>resumes.delete(fn);}},
  '../lib/profileSync':sync,
  '../lib/supabaseData':{getUserProfile:(id,token)=>{const d=deferred();reads.push({id,token,...d});if(remote&&id==='a')d.resolve(remote);return d.promise;},updateUserProfile:(id,change,token)=>{const d=deferred();writes.push({id,change,token,...d});return d.promise;},getSupabaseDataErrorMessage:(_,fallback)=>fallback},
  '../lib/storage':{getPendingGuestDataSync:()=>pendingImport?{profile:true}:null,getMobilePreferences:()=>preferences,getVisitedCountries:owner=>get(owner,'visited'),getFavoriteDestinations:owner=>get(owner,'favorites'),getSavedRoutePlans:()=>[],saveMobilePreferences(value){preferences=value;preferenceWrites.push(value);},setVisitedCountries:(value,owner)=>set(owner,'visited',value),setFavoriteDestinations:(value,owner)=>set(owner,'favorites',value),toggleVisitedCountry:(country,owner)=>{const prev=get(owner,'visited');const next=prev.some(c=>c.alpha3===country.alpha3)?prev.filter(c=>c.alpha3!==country.alpha3):[...prev,{...country,createdAt:new Date().toISOString()}];set(owner,'visited',next);return next;}},
 },{window:{addEventListener:(event,fn)=>{if(event==='l2t:storage-change')storageListeners.add(fn);},removeEventListener:(event,fn)=>{if(event==='l2t:storage-change')storageListeners.delete(fn);}},document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'}});
 let tree;const render=(next={})=>{props={...props,...next};const child=source.ProfileScreen(props);if(child.key!==editorKey){h.dispose();h=host();editorKey=child.key;}tree=h.render(()=>child.type(child.props));return tree;};render();
 return {get h(){return h;},source,reads,writes,notices,storage,verificationReads,sync,preferenceWrites,pushCalls,shares,render,resume:()=>resumes.forEach(fn=>fn()),get tree(){return tree;},get};
}
const base={id:'a',username:'user_a',visitedCountries:[],wishlistCountries:[],optInLeaderboard:false};
const tr=countries.COUNTRY_LIST.find(c=>c.alpha3==='TUR');

test('normal Profile embeds the current community account while retaining travel and account controls',()=>{
 const h=profileHarness();
 const open=[];let view=h.render({onOpenCommunityQuestion:id=>open.push(id)});
 const inline=nodes(view).find(node=>node.type==='CommunityProfileInline');
 assert.ok(inline);assert.equal(inline.props.profileKey,'user:a');assert.equal(inline.props.userId,'a');assert.equal(inline.props.accessToken,'token-a');
 inline.props.onOpenQuestion('forum-thread');assert.deepEqual(open,['forum-thread']);
 assert.ok(nodes(view).some(node=>node.type==='ProfilePhoto'));
 assert.ok(text(view).includes('Countries I\'ve visited'));assert.ok(text(view).includes('Preferences & privacy'));
 view=h.render({user:null,ownerId:null,accessToken:''});
 assert.equal(nodes(view).some(node=>node.type==='CommunityProfileInline'),false);
 assert.match(text(view),/Keep your memories here/);
 h.h.dispose();
});

test('Profile has a direct Settings action before the feed and focuses the existing preferences heading',()=>{
 const h=profileHarness(),actions=[];
 try{
  const view=h.render(),toolbar=nodes(view).find(node=>node.props?.className==='profile-top-bar');
  assert.equal([view.props.children].flat(Infinity)[0],toolbar);
  const heading=nodes(view).find(node=>node.props?.id==='profile-settings-heading');
  assert.equal(heading.props.tabIndex,-1);
  heading.props.ref.current={focus:options=>actions.push(['focus',options]),scrollIntoView:options=>actions.push(['scroll',options])};
  const settings=nodes(toolbar).find(node=>node.type==='button');assert.equal(text(settings),'Settings');assert.equal(settings.props['aria-controls'],'profile-settings-heading');settings.props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(actions)),[['focus',{preventScroll:true}],['scroll',{block:'start',behavior:'instant'}]]);
  assert.equal(h.writes.length,0);
 }finally{h.h.dispose();}
});

test('Profile forwards the identity and edit request into its unified current-account editor',()=>{
 const h=profileHarness(),save=async()=>{},handled=()=>{};
 try{
  const view=h.render({user:{id:'a',user_metadata:{full_name:'Own Name'}},onSaveProfileIdentity:save,profileEditRequest:7,onProfileEditHandled:handled});
  const editor=nodes(view).find(node=>node.type==='CommunityProfileInline');
  assert.equal(editor.props.identityFullName,'Own Name');assert.equal(editor.props.onSaveIdentity,save);assert.equal(editor.props.editRequest,7);assert.equal(editor.props.onEditRequestHandled,handled);
 }finally{h.h.dispose();}
});

test('Account profile editing delegates to the unified editor without rendering a second set of fields',()=>{
 const h=host();let opened=0;
 const {AccountSheet}=load('mobile/src/components/AccountSheet.tsx',{
  react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  '../lib/capacitor':{isIOSNative:()=>false},'../lib/config':{config:{appleAuthEnabled:false}},
  '../lib/localeFormatting':{formatAppDate:()=> '14 Jun 2026'},'../lib/i18n':{useI18n:()=>({copy:(_,en)=>en,dateLocale:'en-GB'})},
  '../lib/supabaseData':{completeUserProfile(){throw Error('No write during navigation');},getSupabaseDataErrorMessage:(_,fallback)=>fallback},
  './LegalSheet':{LegalSheet:'Legal'},'./Icon':{Icon:'Icon'},'./Sheet':{Sheet:'Sheet'},'./AccountDeletionPanel':{AccountDeletionPanel:'AccountDeletionPanel'},
 });
 try{
  for(const metadata of [{full_name:'Own Name',username:'own_name'},{}]){
   const view=h.render(()=>AccountSheet({open:true,onClose(){},onEditProfile:()=>opened++,onNotice(){},auth:{user:{id:'a',email:'a@example.invalid',created_at:'2026-06-14',user_metadata:metadata},accessToken:'token',recoveryPending:false}}));
   assert.equal(nodes(view).filter(node=>node.type==='input').length,0);
   const action=nodes(view).find(node=>node.type==='button'&&/^(Edit profile|Complete your profile)$/.test(text(node)));
   assert.ok(action);action.props.onClick();
  }
  assert.equal(opened,2);
 }finally{h.dispose();}
});

const profileHelpCopy={
 tr:{heading:'Tercihler ve gizlilik',app:'Uygulama ve yardım',account:'Gizlilik ve hesap',guide:'Nasıl kullanılır?',support:'Destek ve sorun bildir',privacy:'Gizlilik Politikası',terms:'Kullanım Şartları',deletion:'Hesap ve veri silme'},
 en:{heading:'Preferences & privacy',app:'App & help',account:'Privacy & account',guide:'How to use the app',support:'Support & report a problem',privacy:'Privacy Policy',terms:'Terms of Use',deletion:'Account & data deletion'},
 sq:{heading:'Preferencat dhe privatësia',app:'Aplikacioni dhe ndihma',account:'Privatësia dhe llogaria',guide:'Si përdoret aplikacioni?',support:'Ndihmë dhe raporto një problem',privacy:'Politika e privatësisë',terms:'Kushtet e përdorimit',deletion:'Fshirja e llogarisë dhe të dhënave'},
};
const profileHelpButton=(view,label)=>nodes(view).find(node=>node.type==='button'&&nodes(node).some(child=>child.type==='strong'&&text(child)===label));

for(const locale of ['tr','en','sq'])test(`Profile settings group help and account controls without duplicate sections in ${locale}`,()=>{
 const h=profileHarness({locale}),labels=profileHelpCopy[locale];let guideCalls=0,accountCalls=0;
 const onGuide=()=>guideCalls++,onAccount=()=>accountCalls++;
 try{
  let view=h.render({onOpenOnboarding:onGuide,onOpenAccount:onAccount});
  const settingsSections=nodes(view).filter(node=>node.type==='section'&&node.props['aria-labelledby']==='profile-settings-heading');
  assert.equal(settingsSections.length,1,'Preferences, help and privacy share one settings section');
  const settings=settingsSections[0];
  assert.ok([view.props.children].flat(Infinity).includes(settings));
  assert.equal(nodes(settings).filter(node=>node.type==='h2').length,1);
  assert.equal(nodes(settings).find(node=>node.type==='h2').props.children,labels.heading);
  assert.equal(nodes(view).some(node=>node.props.id==='profile-help-heading'||node.props['aria-labelledby']==='profile-help-heading'),false,'No separate Help & support section remains');
  const groups=nodes(settings).filter(node=>node.type==='details');assert.ok(groups.length>=2);
  assert.ok(groups.every(group=>!group.props.open),'Settings groups start collapsed');
  const appGroup=groups.find(group=>profileHelpButton(group,labels.guide));
  const accountGroup=groups.find(group=>profileHelpButton(group,labels.privacy));
  assert.ok(appGroup);assert.ok(accountGroup);assert.notEqual(appGroup,accountGroup);
  const groupLabel=group=>nodes(nodes(group).find(node=>node.type==='summary')).find(node=>node.type==='strong')?.props.children;
  assert.equal(groupLabel(appGroup),labels.app);assert.equal(groupLabel(accountGroup),labels.account);
  for(const label of [labels.guide,labels.support])assert.ok(profileHelpButton(appGroup,label),`${label} belongs to app help`);
  for(const label of [labels.privacy,labels.terms,labels.deletion])assert.ok(profileHelpButton(accountGroup,label),`${label} belongs to privacy and account`);
  for(const label of [labels.guide,labels.support,labels.privacy,labels.terms,labels.deletion]){
   const matches=nodes(view).filter(node=>node.type==='button'&&nodes(node).some(child=>child.type==='strong'&&text(child)===label));
   assert.equal(matches.length,1,`${label} has one entry`);assert.equal(matches[0].props.type,'button');
   assert.ok(profileHelpButton(settings,label),`${label} is part of settings`);
  }
  assert.equal(nodes(view).filter(node=>node.type==='button'&&node.props.onClick===onGuide).length,1,'The guide has a single entry');
  assert.equal(nodes(view).filter(node=>node.type==='Legal'||node.type==='SupportSheet').length,0);
  assert.equal(guideCalls,0);assert.equal(accountCalls,0);assert.equal(h.writes.length,0);

  profileHelpButton(view,labels.guide).props.onClick();view=h.render();assert.equal(guideCalls,1);assert.equal(accountCalls,0);
  profileHelpButton(view,labels.support).props.onClick();view=h.render();
  let support=nodes(view).find(node=>node.type==='SupportSheet');
  assert.ok(support);assert.equal(support.props.open,true);assert.equal(support.props.screen,'profile');
  assert.equal(support.props.accessToken,'token-a');assert.equal(support.props.ownerId,'a');assert.equal(support.key,'a');
  support.props.onClose();view=h.render();assert.equal(nodes(view).some(node=>node.type==='SupportSheet'),false);

  for(const [label,slug] of [[labels.privacy,'gizlilik-politikasi'],[labels.terms,'kullanim-sartlari']]){
   profileHelpButton(view,label).props.onClick();view=h.render();
   const documents=nodes(view).filter(node=>node.type==='Legal');assert.equal(documents.length,1);
   assert.equal(documents[0].props.open,true);assert.equal(documents[0].props.slug,slug);
   assert.equal(nodes(view).some(node=>node.type==='SupportSheet'),false);
   documents[0].props.onClose();view=h.render();assert.equal(nodes(view).some(node=>node.type==='Legal'),false);
  }
  const closedButtons=nodes(view).filter(node=>node.type==='details').flatMap(group=>nodes(group).filter(node=>node.type==='button'));
  const oldLabels=['Gizlilik ve veri işlemleri','Privacy & data use','Uygulamayı tanı','Get to know the app','Njihu me aplikacionin'];
  assert.equal(closedButtons.some(button=>nodes(button).some(child=>child.type==='strong'&&oldLabels.includes(text(child)))),false,'Old privacy and tour actions are not duplicated under their former labels');
  profileHelpButton(view,labels.deletion).props.onClick();view=h.render();
  assert.equal(accountCalls,1,'Deletion opens account management for an explicit request');
  assert.equal(h.writes.length,0,'No account or profile deletion starts from the help entry');
  assert.equal(nodes(view).some(node=>node.type==='Deletion'||node.type==='AccountDeletionPanel'),false);
 }finally{h.h.dispose();}
});

test('Profile help remains available to guests and support follows the current account identity',()=>{
 const h=profileHarness();let accountCalls=0;
 try{
  let view=h.render({user:null,ownerId:null,accessToken:'',onOpenAccount:()=>accountCalls++});
  profileHelpButton(view,profileHelpCopy.en.support).props.onClick();view=h.render();
  let support=nodes(view).find(node=>node.type==='SupportSheet');
  assert.equal(support.props.ownerId,null);assert.equal(support.props.accessToken,'');assert.equal(support.key,'guest');
  view=h.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
  assert.equal(nodes(view).some(node=>node.type==='SupportSheet'),false,'Changing account closes the previous owner\'s editor');
  profileHelpButton(view,profileHelpCopy.en.support).props.onClick();view=h.render();
  support=nodes(view).find(node=>node.type==='SupportSheet');
  assert.equal(support.props.ownerId,'b');assert.equal(support.props.accessToken,'token-b');assert.equal(support.key,'b','A changed owner remounts the support draft');
  support.props.onClose();view=h.render({user:null,ownerId:null,accessToken:''});
  assert.equal(accountCalls,0,'Reading help never requires an account');
  profileHelpButton(view,profileHelpCopy.en.deletion).props.onClick();assert.equal(accountCalls,1);
  assert.equal(h.writes.length,0);
 }finally{h.h.dispose();}
});

for(const [locale,deviceLabel,accountLabel] of [
 ['tr','Bu cihaz','Hesabının bildirim türleri'],
 ['en','This device','Your account notification types'],
 ['sq','Kjo pajisje','Llojet e njoftimeve të llogarisë'],
])test(`Profile groups device and account notifications in one collapsed disclosure in ${locale}`,()=>{
 const h=profileHarness({locale});
 try{
  const view=h.render(),settings=nodes(view).find(node=>node.props['aria-labelledby']==='profile-settings-heading');
  const groups=nodes(settings).filter(node=>node.type==='details');
  const notificationGroups=groups.filter(group=>nodes(group).some(node=>node.type==='NotificationPreferences'));
  assert.equal(notificationGroups.length,1);assert.equal(notificationGroups[0].props.open,undefined);
  const group=notificationGroups[0],headings=nodes(group).filter(node=>node.type==='h3').map(text);
  assert.deepEqual(headings,[deviceLabel,accountLabel],'Device-wide settings and account types are explicitly separated inside one group');
  assert.equal(nodes(settings).filter(node=>node.type==='NotificationPreferences').length,1);
  assert.equal(nodes(group).filter(node=>node.type==='input'&&node.props.type==='checkbox').length,1,'The local in-app preference is retained');
  assert.equal(nodes(group).find(node=>node.type==='NotificationPreferences').props.accessToken,'token-a');
  const summaries=groups.flatMap(group=>nodes(group).filter(node=>node.type==='summary')).map(text);
  assert.equal(summaries.some(label=>/Bildirim tercihleri|Notification preferences|Preferencat e njoftimeve/.test(label)),false,'No second notification disclosure remains');
  assert.equal(h.writes.length,0);assert.equal(h.pushCalls.length,0);assert.equal(h.preferenceWrites.length,0,'Viewing settings must not change preferences');
 }finally{h.h.dispose();}
});

test('Grouped notification controls retain local settings, phone push and test notification behavior',async()=>{
 const h=profileHarness({pushPermission:'granted',devicePush:true});
 try{
  await tick();let view=h.render();
  const local=nodes(view).find(node=>node.type==='label'&&text(node).includes('In-app notifications'));
  const checkbox=nodes(local).find(node=>node.type==='input');assert.equal(checkbox.props.checked,true);
  checkbox.props.onChange({target:{checked:false}});view=h.render();
  assert.deepEqual(JSON.parse(JSON.stringify(h.preferenceWrites)),[{inAppNotifications:false,haptics:true}]);
  const accountTypes=nodes(view).find(node=>node.type==='NotificationPreferences');
  assert.equal(accountTypes.props.accessToken,'token-a','Changing a device preference retains the account preference component');
  assert.equal(h.writes.length,0);assert.equal(h.pushCalls.length,0,'Local toggle does not mutate the account or register device push');

  profileHelpButton(view,'Send test notification').props.onClick();await tick();view=h.render();
  assert.deepEqual(h.pushCalls,[{kind:'test',token:'token-a'}]);assert.match(h.notices.at(-1),/Test notification sent/);
  profileHelpButton(view,'Phone notifications').props.onClick();await tick();view=h.render();
  assert.deepEqual(h.pushCalls.at(-1),{kind:'disable',token:'token-a',owner:'a'});
  assert.equal(profileHelpButton(view,'Send test notification'),undefined);
  profileHelpButton(view,'Phone notifications').props.onClick();await tick();view=h.render();
  assert.deepEqual(h.pushCalls.at(-1),{kind:'enable',token:'token-a'});
  assert.ok(profileHelpButton(view,'Send test notification'));assert.equal(h.preferenceWrites.length,1,'Push changes do not overwrite the separate in-app preference');
 }finally{h.h.dispose();}
});

test('Account notification preferences remount for the current identity and disappear for guests without hiding device settings',()=>{
 const h=profileHarness();
 try{
  let view=h.render(),preferences=nodes(view).find(node=>node.type==='NotificationPreferences');
  assert.equal(preferences.key,'a');assert.equal(preferences.props.accessToken,'token-a');
  view=h.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
  preferences=nodes(view).find(node=>node.type==='NotificationPreferences');assert.equal(preferences.key,'b');assert.equal(preferences.props.accessToken,'token-b');
  for(const props of [{user:null,ownerId:null,accessToken:''},{user:{id:'b'},ownerId:'b',accessToken:''}]){
   view=h.render(props);assert.equal(nodes(view).some(node=>node.type==='NotificationPreferences'),false);
   assert.equal(nodes(view).some(node=>node.props.id==='profile-account-notifications-title'),false);
   assert.ok(profileHelpButton(view,'Phone notifications'));
   assert.ok(nodes(view).some(node=>node.type==='label'&&text(node).includes('In-app notifications')));
  }
  assert.equal(h.writes.length,0);assert.equal(h.pushCalls.length,0);
 }finally{h.h.dispose();}
});

test('Explorer League uses the explicit league action and preserves generic community navigation as a fallback',()=>{
 const h=profileHarness(),calls=[];
 try{
  let view=h.render({onOpenLeague:()=>calls.push('league'),onNavigate:view=>calls.push(`navigate:${view}`)});
  profileHelpButton(view,'Explorer League').props.onClick();assert.deepEqual(calls,['league'],'The direct action must not also open the generic feed');
  view=h.render({onOpenLeague:undefined});profileHelpButton(view,'Explorer League').props.onClick();
  assert.deepEqual(calls,['league','navigate:community']);assert.equal(h.writes.length,0,'Opening league does not opt the user into public ranking');
 }finally{h.h.dispose();}
});

for(const signedIn of [true,false])test(`Visited-country intent opens the editor once and is consumed without changing ${signedIn?'account':'guest'} data`,async()=>{
 const h=profileHarness({remote:base});let handled=0;
 const onHandled=()=>handled++;
 const sheet=view=>nodes(view).find(node=>node.type==='Sheet'&&node.props.title==="Countries I've visited");
 try{
  await tick();let view=h.render(signedIn?{}:{user:null,ownerId:null,accessToken:''});assert.equal(sheet(view),undefined);
  view=h.render({visitedCountriesRequest:31,onVisitedCountriesHandled:onHandled});assert.ok(sheet(view));assert.equal(handled,1);
  assert.equal(nodes(sheet(view)).find(node=>node.type==='input').props.id,'visited-country-search');
  assert.ok(nodes(sheet(view)).some(node=>node.type==='button'&&typeof node.props['aria-pressed']==='boolean'),'This opens the real selectable country editor');
  h.render();assert.equal(handled,1,'The same request is not consumed again on a normal render');
  view=h.render({visitedCountriesRequest:0});sheet(view).props.onClose();view=h.render();assert.equal(sheet(view),undefined);
  view=h.render({onVisitedCountriesHandled:()=>onHandled()});assert.equal(sheet(view),undefined,'After parent consumption, callback identity changes must not reopen the editor');
  view=h.render({visitedCountriesRequest:32,onVisitedCountriesHandled:onHandled});assert.ok(sheet(view));assert.equal(handled,2);
  view=h.render({visitedCountriesRequest:0});sheet(view).props.onClose();view=h.render();
  profileHelpButton(view,"Countries I've visited").props.onClick();assert.ok(sheet(h.render()),'The normal profile button still opens the editor');
  assert.equal(handled,2);assert.equal(h.writes.length,0,'Opening or consuming an intent never edits countries');
  assert.equal(h.get('a','visited').length,0);assert.equal(h.get(null,'visited').length,0);
 }finally{h.h.dispose();}
});

test('Explorer sharing describes saved country favourites as countries rather than saved routes',async()=>{
 const h=profileHarness();
 try{
  h.storage.set('b:favorites',[{alpha3:'TUR'},{alpha3:'FRA'}]);
  const view=h.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
  nodes(view).find(node=>node.type==='button'&&node.props['aria-label']==='Share Explorer Card').props.onClick();await tick();
  assert.equal(h.shares.length,1);assert.match(h.shares[0].text,/saved 2 countries/);assert.doesNotMatch(h.shares[0].text,/saved 2 routes/);
  assert.equal(h.shares[0].url,'https://www.letsgo2travel.com.tr');
 }finally{h.h.dispose();}
});

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
 assert.ok(!text(h.tree).includes('0 approved'));assert.ok(!text(h.tree).includes('0 pending'));
 assert.ok(text(h.tree).includes('Verification status unavailable'));
 const retry=nodes(h.tree).find(n=>n.type==='button'&&text(n)==='Retry');assert.ok(retry);retry.props.onClick();h.render();assert.equal(h.reads.length,2);h.h.dispose();
});
test('Failed remote profile read retains cache, disables edits and can be retried',async()=>{
 const h=profileHarness({local:[{...tr,createdAt:'2026-09-01T00:00:00Z'}]});h.reads[0].reject(Error('503'));await tick();h.render();
 assert.equal(h.get('a','visited').length,1);assert.ok(text(h.tree).includes('Your profile could not load'));assert.equal(h.writes.length,0);
 const retry=nodes(h.tree).find(n=>n.type==='button'&&text(n)==='Retry');retry.props.onClick();h.render();h.reads[1].resolve(base);await tick();h.render();assert.equal(h.get('a','visited').length,0);h.h.dispose();
});
test('Verification summaries show loading until a successful empty result establishes zero counts',async()=>{
 const h=profileHarness({holdVerifications:true});
 nodes(h.tree).find(n=>n.type==='button'&&text(n).includes('Verified Traveller')).props.onClick();h.render();
 assert.ok(text(h.tree).includes('Loading verifications'));assert.ok(!text(h.tree).includes('0 approved'));assert.ok(!text(h.tree).includes('No verifications yet'));
 h.reads[0].resolve(base);h.verificationReads[0].resolve([]);await tick();h.render();
 assert.ok(text(h.tree).includes('0 approved'));assert.ok(text(h.tree).includes('0 pending'));assert.ok(text(h.tree).includes('No verifications yet'));h.h.dispose();
});
test('Switching accounts hides previous verification rows and counts during loading and failure',async()=>{
 const h=profileHarness({holdVerifications:true});
 h.reads[0].resolve(base);h.verificationReads[0].resolve([{id:'a-private',country_code:'TR',country_name:'Private account A country',status:'approved',verification_method:'document'}]);await tick();h.render();
 nodes(h.tree).find(n=>n.type==='button'&&text(n).includes('Verified Traveller')).props.onClick();h.render();
 assert.ok(text(h.tree).includes('Private account A country'));assert.ok(text(h.tree).includes('1 approved'));
 h.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
 assert.ok(text(h.tree).includes('Loading verifications'));assert.ok(!text(h.tree).includes('Private account A country'));assert.ok(!text(h.tree).includes('1 approved'));
 h.reads[1].resolve({...base,id:'b'});h.verificationReads[1].reject(Error('503'));await tick();h.render();
 assert.ok(text(h.tree).includes('Verification status unavailable'));assert.ok(!text(h.tree).includes('Private account A country'));assert.ok(!text(h.tree).includes('0 approved'));h.h.dispose();
});
for(const succeeds of [true,false])test(`Token rotation waits for a country edit to ${succeeds?'save':'roll back'} before refreshing its account snapshot`,async()=>{
 const h=profileHarness();h.reads[0].resolve(base);await tick();h.render();
 nodes(h.tree).find(n=>n.type==='button'&&text(n).includes("Countries I've visited")).props.onClick();h.render();
 const choices=()=>nodes(h.tree).filter(n=>n.type==='button'&&typeof n.props['aria-pressed']==='boolean');
 choices()[0].props.onClick();h.render();const saved=h.get('a','visited')[0].alpha3;
 h.render({accessToken:'token-rotated'});await tick();h.render();
 assert.equal(h.reads.length,1,'A new token must not fetch a pre-write snapshot');
 assert.equal(h.get('a','visited')[0].alpha3,saved);
 const remote={...base,visitedCountries:succeeds?h.writes[0].change.visitedCountries:[]};
 if(succeeds)h.writes[0].resolve(remote);else h.writes[0].reject(Error('503'));
 await tick();h.render();assert.equal(h.reads.length,2);assert.equal(h.reads[1].token,'token-rotated');
 h.reads[1].resolve(remote);await tick();h.render();
 assert.equal(choices()[0].props['aria-pressed'],succeeds);
 choices()[1].props.onClick();h.render();
 const nextIds=h.writes[1].change.visitedCountries.map(codes.profileIdToAlpha3);
 assert.equal(nextIds.includes(saved),succeeds,'The next full-list write must preserve the previous successful selection');h.h.dispose();
});
test('Token rotation waits for a leaderboard preference write before reading it back',async()=>{
 const h=profileHarness();h.reads[0].resolve(base);await tick();h.render();
 const checkbox=()=>nodes(h.tree).find(n=>n.type==='label'&&text(n).includes('Appear in Explorer League')).props.children.at(-1);
 checkbox().props.onChange({target:{checked:true}});h.render();h.render({accessToken:'token-rotated'});await tick();
 assert.equal(h.reads.length,1);h.writes[0].resolve({...base,optInLeaderboard:true});await tick();h.render();
 assert.equal(h.reads.length,2);h.reads[1].resolve({...base,optInLeaderboard:true});await tick();h.render();assert.equal(checkbox().props.checked,true);h.h.dispose();
});

test('A newly mounted profile waits for the previous instance\'s write, with no wait in another account',async()=>{
 const first=profileHarness();first.reads[0].resolve(base);await tick();first.render();
 nodes(first.tree).find(n=>n.type==='button'&&text(n).includes("Countries I've visited")).props.onClick();first.render();
 nodes(first.tree).find(n=>n.type==='button'&&typeof n.props['aria-pressed']==='boolean').props.onClick();first.render();
 const saved=first.get('a','visited')[0].alpha3,remote={...base,visitedCountries:first.writes[0].change.visitedCountries};first.h.dispose();
 const next=profileHarness({sync:first.sync,local:first.get('a','visited')});assert.equal(next.reads.length,0,'A remount must not discard an in-flight optimistic edit');
 const other=profileHarness({sync:first.sync});other.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});assert.equal(other.reads.length,1);assert.equal(other.reads[0].id,'b');
 first.writes[0].resolve(remote);await tick();next.render();assert.equal(next.reads.length,1);assert.equal(other.reads.length,1,'The cancelled account-A wait cannot start a late read');
 next.reads[0].resolve(remote);other.reads[0].resolve({...base,id:'b'});await tick();next.render();other.render();
 assert.equal(next.get('a','visited')[0].alpha3,saved);assert.equal(other.get('b','visited').length,0);next.h.dispose();other.h.dispose();
});

test('The profile read barrier includes concurrent writes and cannot be cleared by an earlier completion',async()=>{
 const sync=load('mobile/src/lib/profileSync.ts',{}),first=deferred(),second=deferred(),third=deferred();
 sync.trackProfileWrite('a',first.promise);let settled=false;const waiting=sync.pendingProfileWrites('a').then(()=>{settled=true;});
 sync.trackProfileWrite('a',second.promise);assert.equal(sync.pendingProfileWrites('b'),null);
 first.resolve();await tick();assert.equal(settled,false);assert.ok(sync.pendingProfileWrites('a'));
 sync.trackProfileWrite('a',third.promise);second.reject(Error('503'));await tick();assert.equal(settled,false);
 third.resolve();await waiting;assert.equal(settled,true);assert.equal(sync.pendingProfileWrites('a'),null);
});

for(const operation of ['country','league'])for(const succeeds of [true,false])test(`A late ${operation} ${succeeds?'success':'failure'} cannot alter another account's profile, notices or pending write`,async()=>{
 const x=profileHarness();
 const league=()=>nodes(x.tree).find(node=>node.type==='label'&&text(node).includes('Appear in Explorer League')).props.children.at(-1);
 try{
  x.reads[0].resolve(base);await tick();x.render();
  if(operation==='country'){
   profileHelpButton(x.tree,"Countries I've visited").props.onClick();x.render();
   nodes(x.tree).find(node=>node.type==='button'&&typeof node.props['aria-pressed']==='boolean').props.onClick();
  }else league().props.onChange({target:{checked:true}});
  x.render();const old=x.writes[0];assert.equal(old.id,'a');
  x.render({user:null,ownerId:null,accessToken:''});
  x.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
  const profileB={...base,id:'b',username:'user_b',visitedCountries:['FRA'],optInLeaderboard:true};
  x.reads.findLast(read=>read.id==='b').resolve(profileB);await tick();x.render();
  assert.equal(league().props.checked,true);assert.equal(league().props.disabled,false,'The old account does not keep B busy');
  league().props.onChange({target:{checked:false}});x.render();const current=x.writes[1];
  assert.equal(current.id,'b');assert.equal(league().props.disabled,true);assert.equal(league().props.checked,false);
  if(succeeds)old.resolve({...base,...old.change});else old.reject(Error('Old account request failed'));
  await tick();x.render();
  assert.equal(league().props.checked,false,'An old successful response or rollback cannot replace B\'s optimistic profile');
  assert.equal(league().props.disabled,true,'An old finally block cannot release B\'s busy flag');
  assert.equal(x.notices.length,0,'Old-account success and failure notices stay silent');
  assert.deepEqual(x.get('b','visited').map(country=>country.alpha3),['FRA']);
  if(operation==='country')assert.equal(x.get('a','visited').length,succeeds?1:0,'A failure rolls back only the original owner\'s local selection');
  current.resolve({...profileB,optInLeaderboard:false});await tick();x.render();
  assert.equal(league().props.disabled,false);assert.equal(league().props.checked,false);assert.equal(x.notices.length,1);
 }finally{x.h.dispose();}
});

test('Returning to the original account waits for its old failed country write and reads after its own rollback',async()=>{
 const x=profileHarness();
 try{
  x.reads[0].resolve(base);await tick();x.render();profileHelpButton(x.tree,"Countries I've visited").props.onClick();x.render();
  nodes(x.tree).find(node=>node.type==='button'&&typeof node.props['aria-pressed']==='boolean').props.onClick();x.render();assert.equal(x.get('a','visited').length,1);
  x.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
  x.render({user:{id:'a'},ownerId:'a',accessToken:'token-a-returned'});
  assert.equal(x.reads.filter(read=>read.id==='a').length,1,'A returning editor waits for the shared owner barrier');
  x.writes[0].reject(Error('Offline'));await tick();x.render();
  assert.equal(x.get('a','visited').length,0);assert.equal(x.notices.length,0);
  const returned=x.reads.findLast(read=>read.id==='a');assert.equal(returned.token,'token-a-returned');
  returned.resolve(base);await tick();x.render();
  assert.equal(x.get('a','visited').length,0);assert.equal(x.writes.length,1,'No automatic write reintroduces the rolled-back visit');
 }finally{x.h.dispose();}
});

for(const operation of ['enable','disable','test','share'])test(`Late profile ${operation} completion cannot show an old-account notice or unlock another account's operation`,async()=>{
 const x=profileHarness({holdPush:true,holdShare:true,pushPermission:'granted',devicePush:operation!=='enable'});
 const action=()=>operation==='share'?nodes(x.tree).find(node=>node.type==='button'&&node.props['aria-label']==='Share Explorer Card'):profileHelpButton(x.tree,operation==='test'?'Send test notification':'Phone notifications');
 try{
  await tick();x.render();action().props.onClick();x.render();
  const first=operation==='share'?x.shares[0]:x.pushCalls[0];
  x.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});await tick();x.render();action().props.onClick();x.render();
  const second=operation==='share'?x.shares[1]:x.pushCalls[1];assert.ok(second);
  first.resolve(operation==='enable'?{ok:true}:operation==='test'?{success:true}:true);await tick();x.render();
  assert.equal(x.notices.length,0);
  if(operation!=='share')assert.equal(action().props.disabled,true,'B\'s pending phone action remains busy');
  second.resolve(operation==='enable'?{ok:true}:operation==='test'?{success:true}:true);await tick();x.render();
  assert.equal(x.notices.length,1,'Only the current account gets the result notice');
 }finally{x.h.dispose();}
});

test('A failed old-account test notification stays silent after logout and does not block the guest UI',async()=>{
 const x=profileHarness({holdPush:true,pushPermission:'granted',devicePush:true});
 try{
  await tick();x.render();profileHelpButton(x.tree,'Send test notification').props.onClick();x.render();
  x.render({user:null,ownerId:null,accessToken:''});x.pushCalls[0].reject(Error('Offline'));await tick();x.render();
  assert.equal(x.notices.length,0);assert.equal(profileHelpButton(x.tree,'Send test notification'),undefined);
  assert.ok(profileHelpButton(x.tree,'Phone notifications'));assert.equal(x.writes.length,0);
 }finally{x.h.dispose();}
});

test('Delayed profile child callbacks cannot reload another account or announce its predecessor’s result',async()=>{
 const x=profileHarness();
 try{
  x.reads[0].resolve(base);await tick();x.render();
  const oldPhoto=nodes(x.tree).find(node=>node.type==='ProfilePhoto');
  profileHelpButton(x.tree,'Verified Traveller').props.onClick();x.render();
  const oldVerification=nodes(x.tree).find(node=>node.type==='VerificationForm');
  profileHelpButton(x.tree,'Blocked users').props.onClick();x.render();
  const oldBlocks=nodes(x.tree).find(node=>node.type==='Blocks');
  x.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});
  const profileB={...base,id:'b',visitedCountries:['FRA']};x.reads.at(-1).resolve(profileB);await tick();x.render();
  const readCount=x.reads.length;
  oldPhoto.props.onNotice('Old photo saved');oldVerification.props.onNotice('Old document saved');
  oldVerification.props.onSubmitted();oldBlocks.props.onChanged();x.render();await tick();x.render();
  assert.equal(x.notices.length,0);assert.equal(x.reads.length,readCount,'Old child completion does not trigger an unrelated account refresh');
  assert.deepEqual(x.get('b','visited').map(country=>country.alpha3),['FRA']);
  profileHelpButton(x.tree,'Verified Traveller').props.onClick();x.render();
  const current=nodes(x.tree).find(node=>node.type==='VerificationForm');
  current.props.onNotice('Current document saved');current.props.onSubmitted();x.render();await tick();x.render();
  assert.deepEqual(x.notices,['Current document saved']);assert.equal(x.reads.length,readCount+1,'The current account still refreshes after a submitted document');
  assert.equal(x.reads.at(-1).id,'b');
 }finally{x.h.dispose();}
});

test('Unexpected phone-setting failure keeps current controls usable and an old-account failure silent',async()=>{
 const x=profileHarness({holdPush:true,pushPermission:'granted',devicePush:false});
 try{
  await tick();x.render();profileHelpButton(x.tree,'Phone notifications').props.onClick();x.render();
  x.pushCalls[0].reject(Error('Native plugin rejected'));await tick();x.render();
  assert.equal(profileHelpButton(x.tree,'Phone notifications').props.disabled,false);assert.match(x.notices.at(-1),/could not be changed/);
  profileHelpButton(x.tree,'Phone notifications').props.onClick();x.render();
  x.render({user:{id:'b'},ownerId:'b',accessToken:'token-b'});await tick();x.render();const noticeCount=x.notices.length;
  x.pushCalls[1].reject(Error('Old native plugin rejected'));await tick();x.render();
  assert.equal(x.notices.length,noticeCount);assert.equal(profileHelpButton(x.tree,'Phone notifications').props.disabled,false);
 }finally{x.h.dispose();}
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
 const h=profileHarness({remote:base,verificationRows:[{id:'verification-1',country_code:'TR',country_name:'Türkiye',status:'approved',verification_method:'document'}]});
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
