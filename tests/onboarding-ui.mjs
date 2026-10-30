import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx=(type,props,key)=>({type,props,key});
const nodes=value=>!value||typeof value!=='object'?[]:[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text=value=>Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):typeof value==='string'||typeof value==='number'?String(value):'';
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&(text(node)===label||node.props['aria-label']===label));
const byClass=(tree,name)=>nodes(tree).find(node=>node.props?.className===name);
function load(file,imports={},globals={}){
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const result={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{...globals})(name=>{
    if(name.endsWith('.css'))return {};
    if(Object.hasOwn(imports,name))return imports[name];
    throw Error('Missing import: '+name);
  },result,result.exports);
  return result.exports;
}
function storage(initial={}){
  const values=new Map(Object.entries(initial));
  return {get length(){return values.size;},key:i=>[...values.keys()][i]||null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function host(){
  const slots=[];let cursor,dirty,effects;
  return {react:{
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useMemo(fn){return fn();},
    useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j]))){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  },render(fn,attach){for(let i=0;i<20;i++){cursor=0;dirty=false;effects=[];const tree=fn();attach?.(tree);effects.forEach(effect=>effect());if(!dirty)return tree;}throw Error('Render loop');},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function harness({store=storage(),initialLocale='en',signedIn=false,guestAllowed=true}={}){
  const hooks=host(),completed=[],completionOptions=[],listeners=new Map(),doc={activeElement:null};let locale=initialLocale,tree,buttons=[],theme='system';
  const prefs=load('mobile/src/lib/onboardingPreferences.ts',{}, {window:{localStorage:store}});
  const passports={PASSPORTS:{TR:'',DE:'',AL:''},passportStatus:()=> 'unknown'};
  const passportPreference=load('mobile/src/lib/passportPreference.ts',{'../../../lib/country-intelligence/passports':passports,'./locale':{translateCopy:()=>''}}, {window:{localStorage:store,dispatchEvent(){}},CustomEvent:class{}});
  const root={querySelectorAll:()=>buttons,addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
  const heading={focus(){doc.activeElement=heading;}};
  const {Onboarding}=load('mobile/src/components/Onboarding.tsx',{
    react:hooks.react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Icon':{Icon:'Icon'},'./WelcomeArtwork':{WelcomeArtwork:'WelcomeArtwork'},'./TravelToolArtwork':{TravelToolArtwork:'TravelToolArtwork'},'../lib/useTheme':{useTheme:()=>({preference:theme,setPreference:value=>{theme=value;store.setItem('l2t-theme',value);}})},'./BrandMark':{BrandMark:'BrandMark'},'./LanguagePicker':{LanguageFlag:'LanguageFlag'},'../lib/locale':{APP_LOCALES:['tr','en','sq']},'../lib/onboardingPreferences':prefs,'./CountryPicker':{CountryPicker:'CountryPicker'},'../../../lib/country-intelligence/passports':passports,'../lib/passportPreference':passportPreference,
    '../lib/i18n':{useI18n:()=>({locale,setLocale:value=>{locale=value;store.setItem('l2t-language-v1',value);},copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?sq:en})},
  },{document:doc});
  const h={prefs,passportPreference,completed,completionOptions,store,doc,listeners,get buttons(){return buttons;},get tree(){return tree;},render(){tree=hooks.render(()=>Onboarding({signedIn,guestAllowed,onComplete:(destination,options)=>{completed.push(destination);completionOptions.push(options);}}),value=>{
    value.props.ref.current=root;
    nodes(value).find(node=>node.type==='h1').props.ref.current=heading;
    byClass(value,'welcome-body').props.ref.current={scrollTop:0};
    buttons=nodes(value).filter(node=>node.type==='button'&&!node.props.disabled).map(node=>({node,focus(){doc.activeElement=this;}}));
  });return tree;},click(label){const item=button(tree,label);assert.ok(item,'Missing button: '+label);assert.notEqual(item.props.disabled,true);item.props.onClick();return h.render();},dispose(){hooks.dispose();}};
  h.render();return h;
}

test('Language is first, theme is explicitly asked next and later steps follow the chosen locale',()=>{
  const h=harness();try{
    assert.match(text(h.tree),/Choose your language/);assert.equal(button(h.tree,'Back'),undefined);
    for(const language of ['Türkçe','English','Shqip'])assert.ok(button(h.tree,language));
    h.click('Shqip');assert.match(text(h.tree),/Zgjidh gjuhën tënde/);assert.equal(h.store.getItem('l2t-language-v1'),'sq');
    h.click('Vazhdo');assert.match(text(h.tree),/Si dëshiron të duket/);
    byClass(h.tree,'welcome-theme-list').props.children.find(node=>node.key==='dark').props.onClick();h.render();
    assert.equal(h.store.getItem('l2t-theme'),'dark');
    h.click('Vazhdo');assert.match(text(h.tree),/Çfarë dëshiron të bësh sot/);
    h.click('Vazhdo');assert.match(text(h.tree),/Çfarë të pëlqen në udhëtim/);h.click('Kulturë');
    h.click('Prapa');h.click('Prapa');assert.equal(byClass(h.tree,'welcome-theme-list').props.children.find(node=>node.key==='dark').props['aria-pressed'],true);
    h.click('Prapa');h.click('Türkçe');h.click('Devam et');assert.match(text(h.tree),/Nasıl görünsün/);
  }finally{h.dispose();}
});

test('Early guest exploration is available immediately, completes once, and preserves selected language/theme/task/interests',()=>{
  const first=harness();try{const guest=button(first.tree,'Explore as a guest');assert.ok(guest);guest.props.onClick();guest.props.onClick();first.render();assert.deepEqual(first.completed,['explore']);assert.deepEqual(JSON.parse(JSON.stringify(first.completionOptions)),[{guest:true}]);}finally{first.dispose();}
  const h=harness();try{
    h.click('Türkçe');h.click('Devam et');h.click('KoyuKoyu arka plan');h.click('Devam et');h.click('Gezimi planlıyorumSürene ve bütçene uygun bir rota hazırla.');h.click('Devam et');h.click('Kültür');h.click('Misafir olarak keşfet');
    assert.equal(h.store.getItem('l2t-language-v1'),'tr');assert.equal(h.store.getItem('l2t-theme'),'dark');assert.deepEqual(JSON.parse(JSON.stringify(h.prefs.readWelcomePreferences())),{intent:'route',interests:['Kültür']});assert.deepEqual(h.completed,['route']);assert.equal(h.completionOptions[0].guest,true);
  }finally{h.dispose();}
  const member=harness({signedIn:true}),pending=harness({guestAllowed:false});try{assert.equal(button(member.tree,'Explore as a guest'),undefined);assert.equal(button(pending.tree,'Explore as a guest').props.disabled,true);}finally{member.dispose();pending.dispose();}
});

test('Explicit guest completion bypasses the account sheet while active recovery and budget sign-in retain precedence',()=>{
  const source=ts.createSourceFile('App.tsx',readFileSync('mobile/src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='completeWelcome')handler=node.initializer.getText(source);ts.forEachChild(node,visit);};visit(source);
  const code=ts.transpileModule('const run='+handler+';run("explore",{guest:true});',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const recovery of ['none','budget','password']){
    let account=false,pending='existing-intent',stored='existing-intent',guided=null;
    vm.runInNewContext(code,{ownerId:null,auth:{loading:false,recoveryPending:recovery==='password'},hasBudgetSignInResume:()=>recovery==='budget',releaseId:'current',hasCompletedOnboarding:()=>false,completeOnboarding(){},markReleaseSeen(){},setOnboardingOpen(){},setRouteResetToken(){},setAccountOpen:value=>{account=value;},rememberWelcomeDestination:value=>{stored=value;},setWelcomeDestination:value=>{pending=value;},beginWelcomeGuide:value=>{guided=value;}});
    if(recovery==='none'){assert.equal(account,false);assert.equal(pending,null);assert.equal(stored,null);assert.equal(guided,'explore');}else{assert.equal(account,true);assert.equal(pending,'existing-intent');assert.equal(stored,'existing-intent');assert.equal(guided,null);}
  }
});

test('Guest setup ends at real sign-in handoff and preserves intent and interests exactly once',()=>{
  const h=harness();try{
    h.click('Continue');h.click('Continue');
    byClass(h.tree,'welcome-intent-list').props.children.find(node=>node.key==='route').props.onClick();h.render();
    h.click('Continue');h.click('Culture');h.click('Nature');
    assert.doesNotMatch(text(h.tree),/Your first step is ready|departure city/);
    h.click('Continue');assert.match(text(h.tree),/Which passport will you travel with/);
    const finish=button(h.tree,'Sign in or create account');finish.props.onClick();finish.props.onClick();
    assert.deepEqual(h.completed,['route']);
    const fresh=load('mobile/src/lib/onboardingPreferences.ts',{}, {window:{localStorage:h.store}});
    assert.deepEqual(JSON.parse(JSON.stringify(fresh.readWelcomePreferences())),{intent:'route',interests:['Kültür','Doğa']});
    const reopened=harness({store:h.store});try{reopened.click('Continue');reopened.click('Continue');assert.equal(byClass(reopened.tree,'welcome-intent-list').props.children.find(node=>node.key==='route').props['aria-pressed'],true);}finally{reopened.dispose();}
  }finally{h.dispose();}
});

test('Theme cannot be silently skipped, optional intent and interests remain optional under repeated taps',()=>{
  const h=harness();try{
    const next=button(h.tree,'Continue');next.props.onClick();next.props.onClick();h.render();
    assert.match(text(h.tree),/Choose your appearance/,'A fast double tap cannot skip the theme question');assert.equal(button(h.tree,'Skip this step'),undefined);
    const back=button(h.tree,'Back');back.props.onClick();back.props.onClick();h.render();assert.match(text(h.tree),/Choose your language/);
    h.click('Continue');h.click('Continue');const skip=button(h.tree,'Skip this step');for(let i=0;i<6;i++)skip.props.onClick();h.render();
    assert.match(text(h.tree),/What do you love on a trip/);h.click('Continue');h.click('Choose passport later');
    assert.deepEqual(h.completed,['explore']);assert.deepEqual(JSON.parse(JSON.stringify(h.prefs.readWelcomePreferences())),{intent:null,interests:[]});
  }finally{h.dispose();}
});

test('Interests cap at four and a removed choice frees a slot without losing other choices',()=>{
  const h=harness();try{
    h.click('Continue');h.click('Continue');h.click('Skip this step');
    for(const label of ['City','Culture','Food','Coast'])h.click(label);
    assert.equal(button(h.tree,'Nature').props.disabled,true);assert.match(text(h.tree),/4\/4 selected/);
    h.click('City');h.click('Nature');assert.equal(button(h.tree,'Culture').props['aria-pressed'],true);assert.equal(button(h.tree,'City').props.disabled,true);
    h.click('Continue');h.click('Sign in or create account');
    assert.deepEqual(JSON.parse(JSON.stringify(h.prefs.readWelcomePreferences().interests)),['Kültür','Yeme-içme','Deniz','Doğa']);
  }finally{h.dispose();}
});

test('Setup traps keyboard focus and announces the heading on each step',()=>{
  const h=harness();try{
    let prevented=0;h.listeners.get('keydown')({key:'Tab',shiftKey:true,preventDefault(){prevented++;}});
    assert.equal(h.doc.activeElement,h.buttons.at(-1));
    h.listeners.get('keydown')({key:'Tab',shiftKey:false,preventDefault(){prevented++;}});assert.equal(h.doc.activeElement,h.buttons[0]);assert.equal(prevented,2);
    h.click('Continue');assert.equal(h.doc.activeElement,nodes(h.tree).find(node=>node.type==='h1').props.ref.current);
  }finally{h.dispose();assert.equal(h.listeners.size,0);}
});

test('Corrupt preferences and blocked storage cannot break setup or mutate default planner input',()=>{
  const bad=storage({'l2t.mobile.welcome-preferences.v1':'{broken'});
  let prefs=load('mobile/src/lib/onboardingPreferences.ts',{}, {window:{localStorage:bad}});
  assert.equal(prefs.readWelcomePreferences().interests.length,0);
  bad.setItem('l2t.mobile.welcome-preferences.v1',JSON.stringify({intent:'admin',interests:['Doğa','Doğa',null,'invented','Kültür']}));
  assert.deepEqual(JSON.parse(JSON.stringify(prefs.readWelcomePreferences())),{intent:null,interests:['Doğa','Kültür']});
  bad.setItem('l2t.mobile.welcome-preferences.v1',JSON.stringify({intent:['route'],interests:[]}));
  assert.equal(prefs.readWelcomePreferences().intent,null);
  const blocked={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  prefs=load('mobile/src/lib/onboardingPreferences.ts',{}, {window:{localStorage:blocked}});
  prefs.saveWelcomePreferences({intent:'companion',interests:['Deniz']});
  const input={vibe:['Şehir'],origin:'IST',destination:{code:'FCO'},mode:'fixed'};
  const next=prefs.withWelcomeInterests(input);assert.equal(next.vibe[0],'Deniz');assert.equal(input.vibe[0],'Şehir');assert.equal(next.destination,input.destination);
  const h=harness({store:blocked});try{h.click('Continue');h.click('Continue');h.click('Skip this step');h.click('Continue');h.click('Sign in or create account');assert.equal(h.completed.length,1);}finally{h.dispose();}
});

test('Existing onboarding completion survives the redesign and fresh installations complete under the same key',()=>{
  const store=storage();
  const api=load('mobile/src/lib/storage.ts',{'./id':{},'./accountCollections':{},'./routeOutbox':{},'./liveActivityGeneration':{},'./guestData':{}},{window:{localStorage:store}});
  assert.equal(api.hasCompletedOnboarding(),false);api.completeOnboarding();assert.equal(store.getItem('l2t.mobile.onboarding.v2'),'done');assert.equal(api.hasCompletedOnboarding(),true);
  const legacy=load('mobile/src/lib/storage.ts',{'./id':{},'./accountCollections':{},'./routeOutbox':{},'./liveActivityGeneration':{},'./guestData':{}},{window:{localStorage:storage({'l2t.mobile.onboarding.v2':'done'})}});
  assert.equal(legacy.hasCompletedOnboarding(),true);
});

test('App completion opens existing auth for guests, skips auth for members and preserves the selected destination',()=>{
  const source=ts.createSourceFile('App.tsx',readFileSync('mobile/src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='completeWelcome')handler=node.initializer.getText(source);ts.forEachChild(node,visit);};visit(source);
  assert.ok(handler);
  const code=ts.transpileModule('const run='+handler+';run(destination);',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const ownerId of [null,'member'])for(const initial of [false,true])for(const destination of [undefined,'route','explore','companion']){
    let done=initial,open=true,resets=0,seen,accountOpen=false,pending=null,stored=null,guides=0;const navigations=[];
    vm.runInNewContext(code,{destination,ownerId,auth:{loading:false,recoveryPending:false},hasBudgetSignInResume:()=>false,releaseId:'current',hasCompletedOnboarding:()=>done,completeOnboarding:()=>{done=true;},markReleaseSeen:value=>{seen=value;},setOnboardingOpen:value=>{open=value;},setRouteResetToken:fn=>{resets=fn(resets);},openNavigationView:value=>navigations.push(value),rememberWelcomeDestination:value=>{stored=value;},setWelcomeDestination:value=>{pending=value;},setAccountOpen:value=>{accountOpen=value;},beginWelcomeGuide:value=>{guides++;navigations.push(value);}});
    assert.equal(done,true);assert.equal(open,false);assert.equal(seen,'current');
    assert.deepEqual(navigations,ownerId?[destination||'home']:[]);assert.equal(accountOpen,!ownerId);assert.equal(guides,ownerId?1:0);
    assert.equal(pending,ownerId?null:destination||'home');assert.equal(stored,pending);
    assert.equal(resets,!initial&&destination==='route'?1:0,'Reopening setup must retain an existing planner draft');
  }
});

test('Welcome auth return remembers only a valid destination and clears it after the real account flow closes',()=>{
  const sessionStorage=storage(),localStorage=storage();
  const api=load('mobile/src/lib/appGuide.ts',{}, {window:{sessionStorage,localStorage}});
  api.rememberWelcomeDestination('route');assert.equal(api.readWelcomeDestination(),'route');
  const restored=load('mobile/src/lib/appGuide.ts',{}, {window:{sessionStorage,localStorage}});assert.equal(restored.readWelcomeDestination(),'route');
  const source=ts.createSourceFile('App.tsx',readFileSync('mobile/src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='closeAccount')handler=node.initializer.arguments[0].getText(source);ts.forEachChild(node,visit);};visit(source);
  let accountOpen=true,pending='route',guide=0,clearedBudget=0,pendingEventTrip={id:'cancelled-event'};const navigations=[];
  const run=ts.transpileModule('const run='+handler+';run();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(run,{welcomeDestination:pending,clearBudgetSignInResume:()=>{clearedBudget++;},setPendingEventTrip:v=>{pendingEventTrip=v;},hasBudgetSignInResume:()=>false,setAccountOpen:v=>{accountOpen=v;},setWelcomeDestination:v=>{pending=v;},rememberWelcomeDestination:api.rememberWelcomeDestination,beginWelcomeGuide:v=>{guide++;navigations.push(v);}});
  assert.equal(accountOpen,false);assert.equal(pending,null);assert.equal(api.readWelcomeDestination(),null);assert.equal(guide,1);assert.deepEqual(navigations,['route']);
  assert.equal(clearedBudget,1,'Cancelling the account also cancels an unrelated pending budget action');
  assert.equal(pendingEventTrip,null,'Explicit cancellation also discards the pending event add-to-trip intent');
  const authenticatedRun=ts.transpileModule('const run='+handler+';run(true);',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const retainedEvent={id:'resume-after-login'};pendingEventTrip=retainedEvent;accountOpen=true;pending='route';clearedBudget=0;guide=0;
  vm.runInNewContext(authenticatedRun,{welcomeDestination:pending,clearBudgetSignInResume:()=>{clearedBudget++;},setPendingEventTrip:v=>{pendingEventTrip=v;},hasBudgetSignInResume:()=>true,setAccountOpen:v=>{accountOpen=v;},setWelcomeDestination:v=>{pending=v;},rememberWelcomeDestination:api.rememberWelcomeDestination,beginWelcomeGuide:()=>{guide++;}});
  assert.equal(accountOpen,false);assert.equal(clearedBudget,0,'Successful sign-in preserves the budget continuation');
  assert.equal(pendingEventTrip,retainedEvent,'Successful sign-in preserves the exact event for the remounted Events screen');
  assert.equal(pending,'route');assert.equal(guide,0,'A pending budget continuation retains precedence over the welcome guide');
  sessionStorage.setItem('l2t.mobile.welcome-auth.v1','admin');assert.equal(api.readWelcomeDestination(),null);
});

test('Contextual guide stores bounded progress, can be reopened and survives blocked device storage',()=>{
  const localStorage=storage(),sessionStorage=storage();
  const api=load('mobile/src/lib/appGuide.ts',{}, {window:{localStorage,sessionStorage}});
  assert.equal(api.readGuideProgress().active,false);
  api.saveGuideProgress({active:true,seen:['destination','destination','forged','edit']});
  assert.deepEqual(JSON.parse(JSON.stringify(api.readGuideProgress())),{active:true,seen:['destination','edit']});
  api.saveGuideProgress({...api.readGuideProgress(),active:false});assert.equal(api.readGuideProgress().active,false);
  api.saveGuideProgress({active:true,seen:[]});assert.equal(api.readGuideProgress().seen.length,0);
  const blocked=load('mobile/src/lib/appGuide.ts',{}, {window:{localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},sessionStorage:{getItem(){throw Error('blocked');}}}});
  assert.equal(blocked.readWelcomeDestination(),null);blocked.saveGuideProgress({active:true,seen:['save']});assert.equal(blocked.readGuideProgress().seen[0],'save');
});


test('Optional passport asks for both fields and persists the selected travel document before sign-in',()=>{
  const h=harness();try{
    for(let i=0;i<4;i++)h.click('Continue');
    assert.match(text(h.tree),/Which passport will you travel with/);
    assert.deepEqual(JSON.parse(JSON.stringify(h.passportPreference.readPassportPreference())),{country:'',type:''});
    nodes(h.tree).find(n=>n.type==='CountryPicker').props.onChange('TR');h.render();
    assert.equal(button(h.tree,'Sign in or create account').props.disabled,true);
    nodes(h.tree).find(n=>n.type==='select').props.onChange({target:{value:'special'}});h.render();
    h.click('Sign in or create account');
    assert.deepEqual(JSON.parse(JSON.stringify(h.passportPreference.readPassportPreference())),{country:'TR',type:'special'});
    assert.equal(h.completed.length,1);
  }finally{h.dispose();}
});

test('Skipping an unfinished passport choice preserves a saved document and never invents nationality',()=>{
  const store=storage({'l2t:passport-country':'TR','l2t:passport-type':'special'});
  const h=harness({store});try{
    for(let i=0;i<4;i++)h.click('Continue');
    assert.equal(nodes(h.tree).find(n=>n.type==='select').props.value,'special');
    nodes(h.tree).find(n=>n.type==='CountryPicker').props.onChange('DE');h.render();
    h.click('Choose passport later');
    assert.deepEqual(JSON.parse(JSON.stringify(h.passportPreference.readPassportPreference())),{country:'TR',type:'special'});
    assert.equal(store.getItem('l2t:passport-preference.v1'),null);
  }finally{h.dispose();}
});

test('Passport storage failure keeps setup open with an explicit skip path and preserves the previous document',()=>{
  const store=storage({'l2t:passport-country':'AL','l2t:passport-type':'ordinary'}),h=harness({store});
  try{
    for(let i=0;i<4;i++)h.click('Continue');
    nodes(h.tree).find(n=>n.type==='CountryPicker').props.onChange('TR');h.render();
    store.setItem=()=>{throw Error('quota');};
    h.click('Sign in or create account');
    assert.equal(h.completed.length,0);assert.match(text(h.tree),/could not be saved/);
    assert.equal(h.passportPreference.readPassportPreference().country,'AL');
    h.click('Choose passport later');assert.equal(h.completed.length,1);
  }finally{h.dispose();}
});

test('Passport question and field labels follow Turkish and Albanian without changing existing completion storage',()=>{
  for(const [locale,next,heading] of [['tr','Devam et','Hangi pasaportla'],['sq','Vazhdo','Me cilën pasaportë']]){
    const h=harness({initialLocale:locale});try{
      for(let i=0;i<4;i++)h.click(next);
      assert.ok(text(h.tree).includes(heading));
      assert.ok(nodes(h.tree).find(n=>n.type==='CountryPicker').props.label);
      assert.equal(nodes(h.tree).find(n=>n.type==='select').props.value,'');
    }finally{h.dispose();}
  }
});
