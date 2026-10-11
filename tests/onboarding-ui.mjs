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
    useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((value,j)=>!Object.is(value,old.deps[j]))){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  },render(fn,attach){for(let i=0;i<20;i++){cursor=0;dirty=false;effects=[];const tree=fn();attach?.(tree);effects.forEach(effect=>effect());if(!dirty)return tree;}throw Error('Render loop');},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
function harness({store=storage(),initialLocale='en'}={}){
  const hooks=host(),completed=[],listeners=new Map(),doc={activeElement:null};let locale=initialLocale,tree,buttons=[];
  const prefs=load('mobile/src/lib/onboardingPreferences.ts',{}, {window:{localStorage:store}});
  const root={querySelectorAll:()=>buttons,addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
  const heading={focus(){doc.activeElement=heading;}};
  const {Onboarding}=load('mobile/src/components/Onboarding.tsx',{
    react:hooks.react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Icon':{Icon:'Icon'},'./BrandMark':{BrandMark:'BrandMark'},'./LanguagePicker':{LanguageFlag:'LanguageFlag'},'../lib/locale':{APP_LOCALES:['tr','en','sq']},'../lib/onboardingPreferences':prefs,
    '../lib/i18n':{useI18n:()=>({locale,setLocale:value=>{locale=value;store.setItem('l2t-language-v1',value);},copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?sq:en})},
  },{document:doc});
  const h={prefs,completed,store,doc,listeners,get buttons(){return buttons;},get tree(){return tree;},render(){tree=hooks.render(()=>Onboarding({onComplete:destination=>completed.push(destination)}),value=>{
    value.props.ref.current=root;
    nodes(value).find(node=>node.type==='h1').props.ref.current=heading;
    byClass(value,'welcome-body').props.ref.current={scrollTop:0};
    buttons=nodes(value).filter(node=>node.type==='button'&&!node.props.disabled).map(node=>({node,focus(){doc.activeElement=this;}}));
  });return tree;},click(label){const item=button(tree,label);assert.ok(item,'Missing button: '+label);assert.notEqual(item.props.disabled,true);item.props.onClick();return h.render();},dispose(){hooks.dispose();}};
  h.render();return h;
}

test('Language is the first step and immediately translates every later step and back navigation',()=>{
  const h=harness();try{
    assert.match(text(h.tree),/Choose your language/);assert.equal(button(h.tree,'Back'),undefined);
    for(const language of ['Türkçe','English','Shqip'])assert.ok(button(h.tree,language));
    h.click('Shqip');assert.match(text(h.tree),/Zgjidh gjuhën tënde/);assert.equal(h.store.getItem('l2t-language-v1'),'sq');
    h.click('Vazhdo');assert.match(text(h.tree),/Çfarë dëshiron të bësh sot/);
    h.click('Vazhdo');assert.match(text(h.tree),/Çfarë të pëlqen në udhëtim/);
    h.click('Kulturë');h.click('Vazhdo');assert.match(text(h.tree),/Hapi yt i parë është gati/);
    h.click('Prapa');assert.equal(button(h.tree,'Kulturë').props['aria-pressed'],true);
    h.click('Prapa');h.click('Prapa');h.click('Türkçe');h.click('Devam et');assert.match(text(h.tree),/Bugün ne yapmak istersin/);
  }finally{h.dispose();}
});

test('Chosen intent opens its real destination, interests persist and duplicate finish taps complete once',()=>{
  const h=harness();try{
    h.click('Continue');
    byClass(h.tree,'welcome-intent-list').props.children.find(node=>node.key==='route').props.onClick();h.render();
    h.click('Continue');h.click('Culture');h.click('Nature');h.click('Continue');
    assert.match(text(h.tree),/Choose your departure city/);
    const finish=button(h.tree,'Start planning my route');finish.props.onClick();finish.props.onClick();
    assert.deepEqual(h.completed,['route']);
    const fresh=load('mobile/src/lib/onboardingPreferences.ts',{}, {window:{localStorage:h.store}});
    assert.deepEqual(JSON.parse(JSON.stringify(fresh.readWelcomePreferences())),{intent:'route',interests:['Kültür','Doğa']});
    const reopened=harness({store:h.store});try{reopened.click('Continue');assert.equal(byClass(reopened.tree,'welcome-intent-list').props.children.find(node=>node.key==='route').props['aria-pressed'],true);}finally{reopened.dispose();}
  }finally{h.dispose();}
});

test('Optional questions skip without inventing answers and navigation is bounded under fast repeated taps',()=>{
  const h=harness();try{
    h.click('Continue');const back=button(h.tree,'Back');back.props.onClick();back.props.onClick();h.render();assert.match(text(h.tree),/Choose your language/);
    h.click('Continue');const skip=button(h.tree,'Skip this step');for(let i=0;i<6;i++)skip.props.onClick();h.render();
    assert.match(text(h.tree),/Your first step is ready/);h.click('Start from home');
    assert.deepEqual(h.completed,[undefined]);assert.deepEqual(JSON.parse(JSON.stringify(h.prefs.readWelcomePreferences())),{intent:null,interests:[]});
  }finally{h.dispose();}
});

test('Interests cap at four and a removed choice frees a slot without losing other choices',()=>{
  const h=harness();try{
    h.click('Continue');h.click('Skip this step');
    for(const label of ['City','Culture','Food','Coast'])h.click(label);
    assert.equal(button(h.tree,'Nature').props.disabled,true);assert.match(text(h.tree),/4\/4 selected/);
    h.click('City');h.click('Nature');assert.equal(button(h.tree,'Culture').props['aria-pressed'],true);assert.equal(button(h.tree,'City').props.disabled,true);
    h.click('Continue');h.click('Explore countries');
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
  const h=harness({store:blocked});try{h.click('Continue');h.click('Skip this step');h.click('Skip this step');h.click('Start from home');assert.equal(h.completed.length,1);}finally{h.dispose();}
});

test('Existing onboarding completion survives the redesign and fresh installations complete under the same key',()=>{
  const store=storage();
  const api=load('mobile/src/lib/storage.ts',{'./id':{},'./accountCollections':{},'./routeOutbox':{},'./liveActivityGeneration':{},'./guestData':{}},{window:{localStorage:store}});
  assert.equal(api.hasCompletedOnboarding(),false);api.completeOnboarding();assert.equal(store.getItem('l2t.mobile.onboarding.v2'),'done');assert.equal(api.hasCompletedOnboarding(),true);
  const legacy=load('mobile/src/lib/storage.ts',{'./id':{},'./accountCollections':{},'./routeOutbox':{},'./liveActivityGeneration':{},'./guestData':{}},{window:{localStorage:storage({'l2t.mobile.onboarding.v2':'done'})}});
  assert.equal(legacy.hasCompletedOnboarding(),true);
});

test('App completion opens Home from a reopened tour and only resets the planner on first setup',()=>{
  const source=ts.createSourceFile('App.tsx',readFileSync('mobile/src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;
  const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='completeWelcome')handler=node.initializer.getText(source);ts.forEachChild(node,visit);};visit(source);
  assert.ok(handler);
  const code=ts.transpileModule('const run='+handler+';run(destination);',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for(const initial of [false,true])for(const destination of [undefined,'route','explore','companion']){
    let done=initial,open=true,resets=0,seen;const navigations=[];
    vm.runInNewContext(code,{destination,releaseId:'current',hasCompletedOnboarding:()=>done,completeOnboarding:()=>{done=true;},markReleaseSeen:value=>{seen=value;},setOnboardingOpen:value=>{open=value;},setRouteResetToken:fn=>{resets=fn(resets);},navigate:value=>navigations.push(value)});
    assert.equal(done,true);assert.equal(open,false);assert.equal(seen,'current');assert.deepEqual(navigations,[destination||'home']);
    assert.equal(resets,!initial&&destination==='route'?1:0,'Reopening setup must retain an existing planner draft');
  }
});
