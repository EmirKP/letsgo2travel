import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx=(type,props,key)=>({type,props,key});
const nodes=value=>!value||typeof value!=='object'?[]:[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text=value=>Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):typeof value==='string'?value:'';
function load(file,imports,globals={}) {
  const fixture={exports:{}};
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`,globals)(name=>name.endsWith('.css')?{}:imports[name],fixture,fixture.exports);
  return fixture.exports;
}
function harness(view = 'home') {
  const slots=[];let cursor,dirty,effects,tree,active=true,paused=false,revision=0,frames=[];const observers=new Set(),windowEvents=new Map(),docEvents=new Map();
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},
    useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const store=new Map(),storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  const progress=load('mobile/src/lib/appGuide.ts',{}, {window:{localStorage:storage}});progress.saveGuideProgress({active:true,seen:[]});
  const body={},sheet={getBoundingClientRect:()=>({top:40,left:0,width:390,height:700})},targets=[];
  const doc={body,querySelectorAll:selector=>targets.filter(t=>`[data-guide="${t.guide}"]`===selector),addEventListener:(key,fn)=>docEvents.set(key,fn),removeEventListener:key=>docEvents.delete(key)};
  const win={innerWidth:390,innerHeight:844,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame:()=>{},addEventListener:(key,fn)=>windowEvents.set(key,fn),removeEventListener:key=>windowEvents.delete(key)};
  class Observer { constructor(fn){this.fn=fn;}observe(){observers.add(this);}disconnect(){observers.delete(this);} }
  const {AppGuide}=load('mobile/src/components/AppGuide.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-dom':{createPortal:(children,host)=>({type:'portal',props:{children,host}})},'../lib/appGuide':progress,'../lib/i18n':{useI18n:()=>({copy:(tr,en)=>en})},'./Icon':{Icon:'Icon'}},{document:doc,window:win,MutationObserver:Observer});
  const h={progress,targets,sheet,body,observers,windowEvents,docEvents,get tree(){return tree;},render(){for(let n=0;n<25;n++){cursor=0;dirty=false;effects=[];tree=AppGuide({active,revision,paused,view,onStop:()=>{active=false;progress.saveGuideProgress({...progress.readGuideProgress(),active:false});}});effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('render loop');},
    mutate(){for(const observer of observers)observer.fn();const pending=frames;frames=[];pending.forEach(fn=>fn());return h.render();},
    target(guide,{inert=false,insideSheet=false,top=180}={}){const events=new Map(),classes=new Set(),attrs=new Map([['aria-describedby','existing-description']]);const t={guide,inert,top,insideSheet,actions:0,classes,attrs,
      closest:selector=>selector.startsWith('[inert]')?(t.inert?{}:null):(t.insideSheet?sheet:null),getClientRects:()=>[{}],getBoundingClientRect:()=>({left:30,top:t.top,width:300,height:48,bottom:t.top+48}),classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},getAttribute:key=>attrs.get(key)||null,setAttribute:(key,v)=>attrs.set(key,v),removeAttribute:key=>attrs.delete(key),addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),focus(){t.focused=true;},act(key){t.actions++;events.get(key)?.();}};targets.push(t);return t;},
    click(label){const b=nodes(tree).find(n=>n.type==='button'&&(text(n)===label||n.props['aria-label']===label));assert.ok(b,label);assert.notEqual(b.props.disabled,true);b.props.onClick();h.render();},pause(value){paused=value;return h.render();},reopen(){active=true;progress.saveGuideProgress({active:true,seen:[]});revision++;return h.render();},dispose(){slots.forEach(slot=>slot?.cleanup?.());},
  };return h;
}

test('Guide follows actual visible controls into the active Sheet outside inert root, without blocking their actions',()=>{
  const h=harness();try{
    const plans=h.target('nav-plans',{inert:true,top:760});
    const destination=h.target('journey-destination',{insideSheet:true});h.render();
    assert.equal(h.tree.props.host,h.sheet,'Guide is in the real top dialog and keyboard focus trap, not the inert App root');
    assert.match(text(h.tree),/Choose where to go/);assert.ok(destination.classes.has('app-guide-target'));assert.equal(plans.classes.size,0);assert.equal(destination.focused,undefined,'Guide never steals focus from typing');
    assert.equal(destination.attrs.get('aria-describedby'),'existing-description app-guide-description');
    destination.act('input');h.render();assert.equal(h.tree,null);assert.equal(destination.actions,1);assert.equal(destination.attrs.get('aria-describedby'),'existing-description');
    assert.deepEqual([...h.progress.readGuideProgress().seen],['destination']);
    const edit=h.target('journey-edit',{insideSheet:true}),save=h.target('journey-save',{insideSheet:true,top:80});h.mutate();assert.match(text(h.tree),/Make the route yours/);
    edit.act('click');h.render();assert.equal(edit.actions,1);assert.match(text(h.tree),/Save your route/);assert.equal(save.actions,0,'Teaching never saves or generates a plan automatically');
    save.act('click');h.render();assert.equal(h.tree,null);assert.equal(save.actions,1);
  }finally{h.dispose();}
});

test('Tour can be dismissed and reopened, omits hidden/offscreen controls and cleans every listener when paused',()=>{
  const h=harness();try{
    const destination=h.target('journey-destination',{insideSheet:true,top:900});h.render();assert.equal(h.tree,null,'Hidden controls are never scrolled or clicked for the user');
    destination.top=200;h.mutate();assert.ok(h.tree);h.click('Close tour');assert.equal(h.tree,null);assert.equal(h.progress.readGuideProgress().active,false);assert.equal(h.observers.size,0);assert.equal(destination.classes.size,0);
    h.reopen();assert.match(text(h.tree),/Choose where to go/);h.click('Got it');assert.equal(h.tree,null);assert.equal(destination.focused,true);
    h.reopen();h.pause(true);assert.equal(h.tree,null);assert.equal(h.observers.size,0);assert.equal(h.docEvents.size,0);assert.equal(h.windowEvents.size,0);assert.equal(destination.classes.size,0);
  }finally{h.dispose();}
});

test('Navigation lessons use real Plans and Tools buttons and retain progress without rerunning earlier questions',()=>{
  const h=harness();try{
    const plans=h.target('nav-plans',{top:760}),tools=h.target('nav-tools',{top:760});h.render();assert.equal(h.tree.props.host,h.body);assert.match(text(h.tree),/Your plans live here/);
    plans.act('click');h.render();assert.match(text(h.tree),/Find help in Tools/);tools.act('click');h.render();assert.equal(h.tree,null);
    assert.deepEqual([...h.progress.readGuideProgress().seen],['plans','tools']);assert.equal(plans.actions,1);assert.equal(tools.actions,1);
  }finally{h.dispose();}
});


test('Route lazy loading never flashes navigation lessons before its actual destination field exists',()=>{
  const h=harness('route');try{h.target('nav-plans',{top:760});h.target('nav-tools',{top:760});h.render();assert.equal(h.tree,null);h.target('journey-destination',{insideSheet:true});h.mutate();assert.match(text(h.tree),/Choose where to go/);}finally{h.dispose();}
});

test('Detailed Home lessons teach real search and Event Radar controls, support back, skip and restart without triggering navigation',()=>{
  const h=harness();try{
    const search=h.target('home-search'),route=h.target('home-route'),events=h.target('home-events');h.render();
    assert.match(text(h.tree),/What are you looking for/);assert.match(text(h.tree),/Istanbul/);assert.match(text(h.tree),/currency/);
    h.click('Got it');assert.match(text(h.tree),/Create your first route/);assert.equal(search.actions,0);assert.equal(route.actions,0);
    h.click('Back');assert.match(text(h.tree),/What are you looking for/);h.click('Got it');assert.match(text(h.tree),/Create your first route/);
    h.click('Skip');assert.match(text(h.tree),/Discover Event Radar/);assert.match(text(h.tree),/country, optional city and dates/);assert.equal(events.actions,0);
    h.click('Restart guide');assert.match(text(h.tree),/What are you looking for/);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
    search.act('input');h.render();assert.match(text(h.tree),/Create your first route/);assert.equal(search.actions,1);
    h.click('Close tour');assert.equal(h.tree,null);assert.equal(events.classes.size,0);
  }finally{h.dispose();}
});

test('Day and discovery lessons describe real map controls and wait for them without performing mutations',()=>{
  const h=harness('route');try{
    const days=h.target('journey-days',{insideSheet:true}),discover=h.target('journey-discover',{insideSheet:true,top:600});h.render();
    assert.match(text(h.tree),/Review each day/);assert.match(text(h.tree),/Swipe/);h.click('Got it');
    assert.match(text(h.tree),/Add a place to your route/);assert.match(text(h.tree),/Search this area/);assert.equal(days.actions,0);assert.equal(discover.actions,0);
    h.click('Back');assert.match(text(h.tree),/Review each day/);
  }finally{h.dispose();}
});
