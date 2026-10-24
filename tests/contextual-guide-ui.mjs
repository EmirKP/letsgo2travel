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
function harness(view = 'home', { task, intent, navigationTop } = {}) {
  const slots=[];let cursor,dirty,effects,tree,active=true,paused=false,revision=0,frames=[];const observers=new Set(),windowEvents=new Map(),docEvents=new Map(),examples=[];
  const react={
    useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},
    useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const store=new Map(),storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  const progress=load('mobile/src/lib/appGuide.ts',{}, {window:{localStorage:storage}});progress.saveGuideProgress({active:true,seen:[]});
  const body={},sheet={getBoundingClientRect:()=>({top:40,left:0,width:390,height:700})},targets=[];
  const nav={closest:()=>null,getClientRects:()=>[{}],getBoundingClientRect:()=>({top:navigationTop})};
  const doc={body,querySelectorAll:selector=>selector==='nav.bottom-nav'?(navigationTop?[nav]:[]):targets.filter(t=>`[data-guide="${t.guide}"]`===selector),addEventListener:(key,fn)=>docEvents.set(key,fn),removeEventListener:key=>docEvents.delete(key)};
  const win={innerWidth:390,innerHeight:844,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame:()=>{},addEventListener:(key,fn)=>windowEvents.set(key,fn),removeEventListener:key=>windowEvents.delete(key)};
  class Observer { constructor(fn){this.fn=fn;}observe(){observers.add(this);}disconnect(){observers.delete(this);} }
  const {AppGuide}=load('mobile/src/components/AppGuide.tsx',{react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-dom':{createPortal:(children,host)=>({type:'portal',props:{children,host}})},'../lib/appGuide':progress,'../lib/i18n':{useI18n:()=>({copy:(tr,en)=>en})},'./Icon':{Icon:'Icon'}},{document:doc,window:win,MutationObserver:Observer});
  const h={progress,targets,sheet,body,observers,windowEvents,docEvents,examples,get tree(){return tree;},render(){for(let n=0;n<25;n++){cursor=0;dirty=false;effects=[];tree=AppGuide({active,revision,paused,view,task,intent,onOpenExample:()=>examples.push('example'),onStop:()=>{active=false;progress.saveGuideProgress({...progress.readGuideProgress(),active:false});}});effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('render loop');},
    mutate(){for(const observer of observers)observer.fn();const pending=frames;frames=[];pending.forEach(fn=>fn());return h.render();},
    target(guide,{inert=false,insideSheet=false,top=180,hidden=false}={}){const events=new Map(),classes=new Set(),attrs=new Map([['aria-describedby','existing-description'],['data-guide',guide]]);const t={guide,inert,top,hidden,insideSheet,actions:0,scrolls:0,classes,attrs,
      closest:selector=>selector==='.event-search-card'&&t.filterControl?{querySelector:()=>t.filterControl}:selector==='[data-guide="event-save"]'&&guide==='event-save'?t:selector.startsWith('[inert]')?(t.inert?{}:null):(t.insideSheet?sheet:null),getClientRects:()=>t.hidden?[]:[{}],getBoundingClientRect:()=>({left:30,top:t.top,width:300,height:48,bottom:t.top+48}),classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},getAttribute:key=>attrs.get(key)||null,setAttribute:(key,v)=>attrs.set(key,v),removeAttribute:key=>attrs.delete(key),addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),focus(){t.focused=true;},scrollIntoView(options){t.scrolls++;t.scrollOptions=options;t.top=180;},act(key){t.actions++;events.get(key)?.();}};targets.push(t);return t;},
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
    assert.match(text(h.tree),/What are you looking for/);assert.doesNotMatch(text(h.tree),/Istanbul/);h.click('How do I do this?');assert.match(text(h.tree),/Istanbul/);assert.match(text(h.tree),/currency/);
    h.click('Got it');assert.match(text(h.tree),/Create your first route/);assert.equal(search.actions,0);assert.equal(route.actions,0);
    h.click('Back');assert.match(text(h.tree),/What are you looking for/);h.click('Got it');assert.match(text(h.tree),/Create your first route/);
    h.click('Skip');assert.match(text(h.tree),/Discover Event Radar/);h.click('How do I do this?');assert.match(text(h.tree),/country, optional city and dates/);assert.equal(events.actions,0);
    h.click('Restart guide');assert.match(text(h.tree),/What are you looking for/);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
    search.act('input');h.render();assert.match(text(h.tree),/Create your first route/);assert.equal(search.actions,1);
    h.click('Close tour');assert.equal(h.tree,null);assert.equal(events.classes.size,0);
  }finally{h.dispose();}
});

test('Profile lesson teaches the current help path and the top language control without opening settings',()=>{
  const h=harness('profile');try{
    const profile=h.target('nav-profile',{top:760});h.render();
    assert.match(text(h.tree),/Manage your account and preferences in Profile/);
    assert.match(text(h.tree),/flag button at the top/);
    h.click('How do I do this?');
    assert.match(text(h.tree),/Profile → Preferences & privacy → App & help → How to use/);
    assert.doesNotMatch(text(h.tree),/App → Get to know the app|language and appearance from Profile/);
    assert.equal(profile.actions,0);
  }finally{h.dispose();}
});

test('Day and discovery lessons describe real map controls and wait for them without performing mutations',()=>{
  const h=harness('route');try{
    const days=h.target('journey-days',{insideSheet:true}),discover=h.target('journey-discover',{insideSheet:true,top:600});h.render();
    assert.match(text(h.tree),/Review each day/);h.click('How do I do this?');assert.match(text(h.tree),/Swipe/);h.click('Got it');
    assert.match(text(h.tree),/Add a place to your route/);h.click('How do I do this?');assert.match(text(h.tree),/Search this area/);assert.equal(days.actions,0);assert.equal(discover.actions,0);
    h.click('Back');assert.match(text(h.tree),/Review each day/);
  }finally{h.dispose();}
});


test('Event, saved-plan and tools lessons wait for real controls and never run a search or mutate a plan',()=>{
  for(const [view,guide,label,event] of [['events','event-search','Find events for your dates','click'],['trips','saved-library','Find your saved plan','click'],['companion','tool-search','Find the tool you need','input']]) {
    const h=harness(view);try{h.target('nav-plans',{top:760});h.render();assert.equal(h.tree,null);const control=h.target(guide);h.mutate();assert.ok(text(h.tree).includes(label));assert.equal(control.actions,0);h.click('Skip');assert.equal(control.actions,0);assert.equal(h.tree,null);h.reopen();control.act(event);h.render();assert.equal(control.actions,1);assert.equal(h.tree,null);}finally{h.dispose();}
  }
});

test('Guide menu separates the isolated example from the retained route and includes inspiration',()=>{
  const chosen=[];let closed=0;
  const {GuideMenu}=load('mobile/src/components/GuideMenu.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'./Sheet':{Sheet:'Sheet'},'./Icon':{Icon:'Icon'},'./TravelToolArtwork':{TravelToolArtwork:'Artwork'},'../lib/i18n':{useI18n:()=>({copy:(tr,en)=>en})}});
  const tree=GuideMenu({open:true,hasRouteDraft:true,onClose:()=>closed++,onChoose:(value,mode)=>chosen.push([value,mode])});
  assert.deepEqual(chosen,[]);tree.props.onClose();assert.equal(closed,1);assert.deepEqual(chosen,[]);
  const buttons=nodes(tree).filter(n=>n.type==='button');assert.equal(buttons.length,6);buttons.forEach(b=>b.props.onClick());assert.deepEqual(chosen,[['explore',undefined],['route','example'],['events',undefined],['trips',undefined],['companion',undefined],['route','resume']]);
  assert.match(text(tree),/Uses no AI allowance/);assert.match(text(tree),/Continue my draft/);
});

test('Inspiration follows the selected task instead of unrelated visible navigation and focus is not completion',()=>{
  const h=harness('explore',{intent:'explore'});try{
    h.target('nav-plans',{top:760});h.render();assert.equal(h.tree,null,'No unrelated Plans tip while Explore loads');
    const search=h.target('explore-search');h.mutate();assert.match(text(h.tree),/Start exploring with a place/);
    h.click('Let me try');assert.equal(search.focused,true);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);assert.match(nodes(h.tree).find(node=>node.type==='aside').props.className,/app-guide-minimized/);h.click('Show guide');assert.match(text(h.tree),/Start exploring/);
    search.value='I';search.act('input');h.render();assert.match(text(h.tree),/Start exploring/);
    search.value='Italy';search.act('input');h.render();assert.equal(h.tree,null,'Wait for the matching real result, do not fall through to Plans');
    const place=h.target('explore-place');h.mutate();assert.match(text(h.tree),/Open a place/);place.act('click');h.render();
    const save=h.target('explore-save',{insideSheet:true});h.mutate();assert.match(text(h.tree),/Keep a country/);
    save.act('click');h.render();assert.match(text(h.tree),/Keep a country/,'A pending or failed save is not completion');
    save.attrs.set('aria-pressed','true');h.mutate();assert.equal(h.tree,null);
    assert.deepEqual([...h.progress.readGuideProgress().seen],['exploreSearch','explorePlace','exploreSave']);
  }finally{h.dispose();}
});

test('Task skip is recorded separately from completed work, and restart preserves its intent',()=>{
  const h=harness('explore',{task:'inspiration'});try{
    h.target('explore-search');h.target('explore-place');h.render();h.click('Skip');
    assert.match(text(h.tree),/Open a place/);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);assert.deepEqual([...h.progress.readGuideProgress().skipped],['exploreSearch']);
    h.click('Restart guide');assert.match(text(h.tree),/Start exploring/);assert.equal(h.progress.readGuideProgress().task,'inspiration');assert.deepEqual([...h.progress.readGuideProgress().skipped],[]);
  }finally{h.dispose();}
});

test('On-trip lesson uses the chosen country and a real tool action before completing',()=>{
  const h=harness('companion',{intent:'companion'});try{
    h.target('nav-plans',{top:760});const country=h.target('travel-country');h.render();assert.match(text(h.tree),/Choose the country/);
    country.act('click');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
    country.attrs.set('data-guide-complete','true');const search=h.target('tool-search');h.mutate();assert.match(text(h.tree),/Find the tool you need/);
    search.value='offline';search.act('input');h.render();const tool=h.target('travel-tool');h.mutate();assert.match(text(h.tree),/Open the tool/);assert.match(text(h.tree),/confirmed download/);
    tool.act('click');h.render();assert.equal(h.tree,null);assert.equal(h.progress.readGuideProgress().active,false);
    assert.deepEqual([...h.progress.readGuideProgress().seen],['toolSearch','travelCountry','travelTool']);
  }finally{h.dispose();}
});

test('Planning intent never reuses the retained route survey as an example lesson',()=>{
  const h=harness('route',{intent:'route'});try{
    h.target('journey-destination',{insideSheet:true});h.target('nav-plans',{top:760});h.render();assert.equal(h.tree,null,'The isolated RouteExampleLesson owns this task');assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
  }finally{h.dispose();}
});

test('Event lesson waits for successful search and successful save before opening saved events',()=>{
  const h=harness('events',{task:'events'});try{
    const search=h.target('event-search');h.render();search.act('click');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],[],'A failed search is not task completion');
    search.attrs.set('data-guide-complete','true');const save=h.target('event-save');h.mutate();assert.match(text(h.tree),/Save an event/);
    save.act('click');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch']);
    save.attrs.set('aria-pressed','true');save.attrs.set('data-guide-save-success','1');const saved=h.target('event-saved');h.mutate();assert.match(text(h.tree),/Return to your saved/);
    saved.act('click');h.render();assert.equal(h.tree,null);assert.equal(h.progress.readGuideProgress().active,false);
    assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch','eventSaved','eventSave']);
  }finally{h.dispose();}
});

test('Hiding a task card for the phone keyboard still observes actual search typing',()=>{
  const h=harness('explore',{task:'inspiration'});try{
    const search=h.target('explore-search');h.render();h.pause(true);assert.equal(h.tree,null);assert.equal(search.classes.size,0);
    search.value='Rome';search.act('input');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],['exploreSearch']);
    h.target('explore-place');h.pause(false);assert.match(text(h.tree),/Open a place/);
  }finally{h.dispose();}
});

test('Task outside the viewport keeps a compact card above bottom navigation and scrolls only on user request',()=>{
  const h=harness('trips',{task:'saved',navigationTop:700});try{
    const target=h.target('saved-library',{top:1100});h.render();
    assert.match(text(h.tree),/Find your saved plan/);assert.match(text(h.tree),/elsewhere on this page/);
    const card=nodes(h.tree).find(node=>node.type==='aside');assert.match(card.props.className,/app-guide-offscreen/);assert.equal(card.props.style.position,'fixed');assert.ok(card.props.style.top+310<700);
    assert.equal(target.scrolls,0);assert.equal(target.focused,undefined);assert.equal(target.classes.size,0);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
    h.click('Show the step');assert.equal(target.scrolls,1);assert.equal(target.scrollOptions.block,'center');assert.equal(target.focused,true);assert.equal(target.actions,0);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
    h.mutate();assert.doesNotMatch(nodes(h.tree).find(node=>node.type==='aside').props.className,/offscreen/);assert.ok(target.classes.has('app-guide-target'));assert.match(text(h.tree),/Let me try/);
    target.act('click');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],['library']);
  }finally{h.dispose();}
});

test('Offscreen task stays inside its actual Sheet and never advertises hidden or inert targets',()=>{
  const h=harness('explore',{task:'inspiration'});try{
    h.target('explore-search',{insideSheet:true,top:1100,inert:true});h.render();assert.equal(h.tree,null);
    const target=h.target('explore-search',{insideSheet:true,top:1100,hidden:true});h.mutate();assert.equal(h.tree,null);
    target.hidden=false;h.mutate();assert.equal(h.tree.props.host,h.sheet);assert.match(text(h.tree),/Show the step/);
    const card=nodes(h.tree).find(node=>node.type==='aside');assert.equal(card.props.style.position,'absolute');assert.ok(card.props.style.top+310<700);
    assert.equal(target.scrolls,0);h.click('Show the step');assert.equal(target.scrolls,1);h.mutate();assert.ok(target.classes.has('app-guide-target'));
  }finally{h.dispose();}
});

test('A confirmed empty saved-route lesson offers the isolated example without claiming a successful open',()=>{
  const h=harness('trips',{task:'saved'});try{
    const library=h.target('saved-library');h.render();library.act('click');h.render();assert.equal(h.tree,null,'A loading or failed read without a confirmed empty anchor is not treated as empty');
    const empty=h.target('saved-routes-empty',{hidden:true});h.mutate();assert.equal(h.tree,null,'Hidden empty state is never taught');
    empty.hidden=false;h.mutate();assert.match(text(h.tree),/You do not have a saved route yet/);assert.match(text(h.tree),/without using your AI allowance/);
    empty.act('click');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],['library'],'Clicking the empty placeholder is not a successful saved-route open');
    h.click('Learn with an example');assert.deepEqual(h.examples,['example']);assert.deepEqual([...h.progress.readGuideProgress().seen],['library']);assert.equal(h.progress.readGuideProgress().active,true,'App owns switching to the isolated example; this task is not falsely completed');
  }finally{h.dispose();}
});

test('Empty event results keep filter guidance without marking a save; pending and failed searches are distinct',()=>{
  const h=harness('events',{task:'events'});try{
    const search=h.target('event-search');search.attrs.set('data-guide-complete','true');search.attrs.set('data-guide-event-recovery','empty');h.render();
    assert.match(text(h.tree),/Your last search found no events/);assert.match(text(h.tree),/Change the country, dates or category/);assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch']);
    h.click('Show filters');assert.equal(search.scrolls,1);assert.equal(search.actions,0);assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch']);
    search.attrs.delete('data-guide-event-recovery');search.attrs.delete('data-guide-complete');h.mutate();assert.equal(h.tree,null,'No empty marker is fabricated for loading or failed requests');
    search.attrs.set('data-guide-event-recovery','empty');h.mutate();h.click('Show guide');assert.match(text(h.tree),/Your last search found no events/);
  }finally{h.dispose();}
});

test('A previously saved event never completes new save work, including when every result is already saved',()=>{
  const h=harness('events',{task:'events'});try{
    const search=h.target('event-search');search.attrs.set('data-guide-complete','true');
    const old=h.target('event-save');old.attrs.set('aria-pressed','true');old.attrs.set('data-guide-save-success','9');search.attrs.set('data-guide-event-recovery','saved');h.render();
    assert.match(text(h.tree),/These results are already saved/);assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch']);assert.equal(old.classes.size,0);
    const fresh=h.target('event-save');fresh.attrs.set('aria-pressed','false');search.attrs.delete('data-guide-event-recovery');h.mutate();assert.ok(fresh.classes.has('app-guide-target'));assert.equal(old.classes.size,0);
    fresh.attrs.set('aria-pressed','true');fresh.attrs.set('data-guide-save-success','10');h.mutate();assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch'],'A static saved state without a current task click is insufficient');
    fresh.attrs.set('aria-pressed','false');h.mutate();fresh.act('click');h.render();assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch'],'Pending or failed storage keeps the task incomplete');
    fresh.attrs.set('aria-pressed','true');fresh.attrs.set('data-guide-save-success','11');h.target('event-saved');h.mutate();assert.match(text(h.tree),/Return to your saved/);assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch','eventSave']);
  }finally{h.dispose();}
});

test('Saving another real result also completes the task without forcing the highlighted first result',()=>{
  const h=harness('events',{task:'events'});try{
    const search=h.target('event-search');search.attrs.set('data-guide-complete','true');const first=h.target('event-save'),other=h.target('event-save');h.render();
    assert.ok(first.classes.has('app-guide-target'));assert.equal(other.classes.size,0);
    h.docEvents.get('click')({target:other});h.render();other.attrs.set('aria-pressed','true');other.attrs.set('data-guide-save-success','1');h.target('event-saved');h.mutate();
    assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch','eventSave']);assert.equal(first.actions,0);assert.match(text(h.tree),/Return to your saved/);
  }finally{h.dispose();}
});

test('Restarting after a successful event save clears its attempt and requires new save work',()=>{
  const h=harness('events',{task:'events'});try{
    const search=h.target('event-search');search.attrs.set('data-guide-complete','true');const save=h.target('event-save');h.target('event-saved');h.render();
    save.act('click');h.render();save.attrs.set('aria-pressed','true');save.attrs.set('data-guide-save-success','1');search.attrs.set('data-guide-event-recovery','saved');h.mutate();
    assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch','eventSave']);assert.match(text(h.tree),/Return to your saved/);
    h.click('Restart guide');assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch'],'The retained successful search is valid, but the old save attempt is not');
    assert.match(text(h.tree),/These results are already saved/);assert.doesNotMatch(text(h.tree),/Return to your saved/);
  }finally{h.dispose();}
});

test('Let me try leaves fields unobstructed with a compact, reopenable guide and does not complete the task',()=>{
  const h=harness('events',{task:'events',navigationTop:700});try{
    const search=h.target('event-search');h.render();h.click('Let me try');
    const card=nodes(h.tree).find(node=>node.type==='aside');assert.match(card.props.className,/app-guide-minimized/);assert.equal(card.props.style.top,undefined);assert.equal(card.props.style.bottom,156);
    assert.equal(search.focused,true);assert.equal(search.actions,0);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);assert.match(text(h.tree),/Show guide/);
    h.click('Show guide');assert.match(text(h.tree),/Find events for your dates/);assert.doesNotMatch(nodes(h.tree).find(node=>node.type==='aside').props.className,/minimized/);assert.deepEqual([...h.progress.readGuideProgress().seen],[]);
  }finally{h.dispose();}
});

test('Empty-event filter recovery focuses the real field and minimizes the card without acknowledging a save',()=>{
  const h=harness('events',{task:'events',navigationTop:700});try{
    const search=h.target('event-search');search.attrs.set('data-guide-complete','true');search.attrs.set('data-guide-event-recovery','empty');
    const country={scrolls:0,focus(){this.focused=true;},scrollIntoView(){this.scrolls++;}};search.filterControl=country;h.render();h.click('Show filters');
    assert.equal(country.focused,true);assert.equal(country.scrolls,1);assert.equal(search.actions,0);assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch']);
    const card=nodes(h.tree).find(node=>node.type==='aside');assert.match(card.props.className,/app-guide-minimized/);assert.equal(card.props.style.top,undefined);assert.equal(card.props.style.bottom,156);
    search.inert=true;h.mutate();assert.equal(h.tree,null,'The country picker temporarily makes the page inert');search.inert=false;h.mutate();assert.match(nodes(h.tree).find(node=>node.type==='aside').props.className,/app-guide-minimized/,'Closing the picker must not reopen a card over the next date field');
    h.click('Show guide');assert.match(text(h.tree),/Your last search found no events/);assert.deepEqual([...h.progress.readGuideProgress().seen],['eventSearch']);
  }finally{h.dispose();}
});
