import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const key='l2t-theme';
const plain=value=>JSON.parse(JSON.stringify(value));
function load(file,globals,imports={}){
 const output={exports:{}};
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${source}\n})`,globals,{filename:file})(name=>{
  if(name.endsWith('.css'))return {};
  if(Object.hasOwn(imports,name))return imports[name];
  throw Error(`Unexpected import ${name}`);
 },output,output.exports);
 return output.exports;
}
function browser({stored=null,dark=false,reducedMotion=false,denied='',legacyMedia=false,noMedia=false,values=new Map()}={}){
 if(stored!==null)values.set(key,stored);
 let writes=0;
 const localStorage={getItem:name=>{if(denied==='read')throw Error('blocked');return values.get(name)??null;},setItem:(name,value)=>{if(denied==='write')throw Error('blocked');writes++;values.set(name,String(value));}};
 const storageListeners=new Set(),mediaListeners=new Set(),timers=new Map();
 let clock=0,nextTimer=0;
 const media={matches:dark};
 if(legacyMedia){media.addListener=callback=>mediaListeners.add(callback);media.removeListener=callback=>mediaListeners.delete(callback);}
 else{media.addEventListener=(name,callback)=>{assert.equal(name,'change');mediaListeners.add(callback);};media.removeEventListener=(name,callback)=>{assert.equal(name,'change');mediaListeners.delete(callback);};}
 const window={matchMedia:query=>{if(noMedia)throw Error('unsupported');if(query==='(prefers-reduced-motion: reduce)')return {matches:reducedMotion};assert.equal(query,'(prefers-color-scheme: dark)');return media;},addEventListener:(name,callback)=>{assert.equal(name,'storage');storageListeners.add(callback);},removeEventListener:(name,callback)=>{assert.equal(name,'storage');storageListeners.delete(callback);},setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+delay});return id;},clearTimeout:id=>timers.delete(id)};
 Object.defineProperty(window,'localStorage',{get(){if(denied==='getter')throw Error('blocked');return localStorage;}});
 const metas=new Map(['theme-color','color-scheme'].map(name=>[name,{content:name==='theme-color'?'#0877b8':'light',setAttribute(attribute,value){assert.equal(attribute,'content');this.content=value;}}]));
 const document={documentElement:{dataset:{},style:{}},querySelector:selector=>{const name=/^meta\[name="(.+)"\]$/.exec(selector)?.[1];assert.ok(metas.has(name));return metas.get(name);}};
 const globals={window,document};
 return {globals,values,document,metas,storageListeners,mediaListeners,get writes(){return writes;},get pendingTimers(){return timers.size;},
  theme:()=>load('mobile/src/lib/theme.ts',globals),
  advance(milliseconds){const until=clock+milliseconds;for(;;){const due=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;const [id,timer]=due;clock=timer.at;timers.delete(id);timer.callback();}clock=until;},
  system(value){media.matches=value;mediaListeners.forEach(callback=>callback({matches:value}));},
  remote(value,{eventKey=key,storageArea=localStorage}={}){if(eventKey===null)values.clear();else if(value===null)values.delete(eventKey);else values.set(eventKey,value);storageListeners.forEach(callback=>callback({key:eventKey,newValue:value,storageArea}));},
 };
}
function assertAppearance(f,resolved){
 assert.equal(f.document.documentElement.dataset.theme,resolved);
 assert.equal(f.document.documentElement.style.colorScheme,resolved);
 assert.equal(f.metas.get('color-scheme').content,resolved);
 assert.equal(f.metas.get('theme-color').content,resolved==='dark'?'#101b2d':'#0877b8');
}
const html=readFileSync('mobile/index.html','utf8');
const bootstrap=/<script>([\s\S]*?)<\/script>/.exec(html);
assert.ok(bootstrap,'The first paint must not wait for the application bundle');
const runBootstrap=f=>vm.runInNewContext(bootstrap[1],f.globals);

test('First-paint theme and runtime agree for every saved choice and both device appearances',()=>{
 assert.ok(bootstrap.index<html.indexOf('</head>'));
 assert.ok(bootstrap.index<html.indexOf('type="module"'));
 for(const stored of [null,'invalid','DARK','system','light','dark'])for(const dark of [false,true]){
  const f=browser({stored,dark});runBootstrap(f);
  const expected=stored==='light'||stored==='dark'?stored:dark?'dark':'light';assertAppearance(f,expected);
  const theme=f.theme(),stop=theme.initializeTheme();assertAppearance(f,expected);
  assert.deepEqual(plain(theme.getThemeSnapshot()),{preference:stored==='light'||stored==='dark'?stored:'system',resolved:expected});
  assert.equal(f.writes,0,'Resolving the system appearance must never persist an explicit theme');stop();
 }
});

test('Runtime reconciles preference and device changes that happen after the first-paint script',()=>{
 const f=browser();runBootstrap(f);assertAppearance(f,'light');
 f.values.set(key,'dark');const theme=f.theme(),stop=theme.initializeTheme();assertAppearance(f,'dark');stop();
 f.values.delete(key);f.system(true);const restart=theme.initializeTheme();assert.deepEqual(plain(theme.getThemeSnapshot()),{preference:'system',resolved:'dark'});restart();
});

test('Explicit choice persists across restarts and system changes only update the system preference',()=>{
 const f=browser(),theme=f.theme(),stop=theme.initializeTheme();const changes=[];
 const unsubscribe=theme.subscribeTheme(()=>changes.push(plain(theme.getThemeSnapshot())));
 const initial=theme.getThemeSnapshot();f.system(false);assert.equal(theme.getThemeSnapshot(),initial,'Unchanged snapshots stay stable for React');
 f.system(true);assertAppearance(f,'dark');assert.equal(theme.getThemeSnapshot().preference,'system');assert.equal(f.writes,0);
 theme.setThemePreference('light');assertAppearance(f,'light');assert.equal(f.values.get(key),'light');
 f.system(false);f.system(true);assertAppearance(f,'light');assert.equal(changes.length,2);
 theme.setThemePreference('system');assertAppearance(f,'dark');assert.equal(f.values.get(key),'system');
 theme.setThemePreference('dark');const chosen=theme.getThemeSnapshot();theme.setThemePreference('dark');assert.equal(theme.getThemeSnapshot(),chosen);
 stop();unsubscribe();
 const restart=browser({values:f.values}),next=restart.theme(),finish=next.initializeTheme();assertAppearance(restart,'dark');assert.equal(next.getThemeSnapshot().preference,'dark');finish();
});

test('Storage denial and missing matchMedia never prevent changing appearance',()=>{
 for(const denied of ['getter','read','write']){
  const f=browser({dark:true,denied});assert.doesNotThrow(()=>runBootstrap(f));assertAppearance(f,'dark');
  const theme=f.theme(),stop=theme.initializeTheme();assert.doesNotThrow(()=>theme.setThemePreference('light'));assertAppearance(f,'light');
  f.system(false);f.system(true);assertAppearance(f,'light');assert.equal(theme.getThemeSnapshot().preference,'light');stop();
 }
 const f=browser({noMedia:true});runBootstrap(f);assertAppearance(f,'light');const theme=f.theme(),stop=theme.initializeTheme();theme.setThemePreference('dark');assertAppearance(f,'dark');stop();
});

test('Other tabs can change, remove or clear the preference without echo writes or session-storage interference',()=>{
 const f=browser({dark:true}),theme=f.theme(),stop=theme.initializeTheme();
 f.remote('light');assertAppearance(f,'light');assert.equal(theme.getThemeSnapshot().preference,'light');
 f.remote('dark',{eventKey:'unrelated'});assertAppearance(f,'light');
 f.remote('dark',{storageArea:{}});assertAppearance(f,'light');
 f.remote(null);assertAppearance(f,'dark');assert.equal(theme.getThemeSnapshot().preference,'system');
 f.remote('light');f.remote(null,{eventKey:null});assertAppearance(f,'dark');
 f.remote('invalid');assert.equal(theme.getThemeSnapshot().preference,'system');assert.equal(f.writes,0);stop();
});

test('Overlapping initializers and remounts own exactly one set of listeners; stale cleanup is harmless',()=>{
 for(const legacyMedia of [false,true]){
  const f=browser({legacyMedia}),theme=f.theme();const first=theme.initializeTheme(),second=theme.initializeTheme();
  assert.equal(f.storageListeners.size,1);assert.equal(f.mediaListeners.size,1);
  let a=0,b=0;const stopA=theme.subscribeTheme(()=>a++),stopB=theme.subscribeTheme(()=>b++);
  f.system(true);assert.equal(a,1);assert.equal(b,1);stopA();first();first();f.system(false);assert.equal(a,1);assert.equal(b,2);
  assert.equal(f.storageListeners.size,1);second();assert.equal(f.storageListeners.size,0);assert.equal(f.mediaListeners.size,0);
  f.system(true);f.values.set(key,'system');const remount=theme.initializeTheme();assertAppearance(f,'dark');
  first();second();assert.equal(f.mediaListeners.size,1);remount();stopB();assert.equal(f.storageListeners.size,0);assert.equal(f.mediaListeners.size,0);
 }
});

test('Theme initialization and preference-only changes do not animate the first paint',()=>{
 for(const stored of ['light','dark']){
  const f=browser({stored,dark:stored==='dark'});runBootstrap(f);
  const theme=f.theme(),stop=theme.initializeTheme();assertAppearance(f,stored);
  assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false);
  assert.equal(f.pendingTimers,0);
  theme.setThemePreference('system');assertAppearance(f,stored);
  assert.equal(theme.getThemeSnapshot().preference,'system');assert.equal(f.values.get(key),'system');
  assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false,'Changing the preference without changing colors does not start an animation');
  assert.equal(f.pendingTimers,0);stop();
 }
});

test('A theme change updates state and metadata immediately while its color transition expires',()=>{
 const f=browser(),theme=f.theme(),stop=theme.initializeTheme();
 let notified=false;const unsubscribe=theme.subscribeTheme(()=>{
  notified=true;assertAppearance(f,'dark');
  assert.equal(f.document.documentElement.dataset.themeTransition,'','The animation is active before subscribers render the moon');
 });
 theme.setThemePreference('dark');assert.equal(notified,true);
 assert.deepEqual(plain(theme.getThemeSnapshot()),{preference:'dark',resolved:'dark'});
 assert.equal(f.values.get(key),'dark');assert.equal(f.pendingTimers,1);
 f.advance(350);assert.equal(f.document.documentElement.dataset.themeTransition,'');
 f.advance(150);assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false);
 assert.equal(f.pendingTimers,0);assertAppearance(f,'dark');unsubscribe();stop();
});

test('Rapidly reversing the theme keeps the latest transition active past the old cleanup deadline',()=>{
 const f=browser(),theme=f.theme(),stop=theme.initializeTheme();
 theme.setThemePreference('dark');f.advance(250);
 theme.setThemePreference('light');assertAppearance(f,'light');assert.equal(f.values.get(key),'light');
 assert.equal(f.pendingTimers,1,'A new transition replaces the old cleanup timer');
 f.advance(200);assert.equal(f.document.documentElement.dataset.themeTransition,'','The first transition cannot end a newer one');
 assertAppearance(f,'light');f.advance(300);
 assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false);assert.equal(f.pendingTimers,0);stop();
});

test('Reduced motion keeps appearance changes immediate without starting animation timers',()=>{
 const f=browser({reducedMotion:true}),theme=f.theme(),stop=theme.initializeTheme();
 theme.setThemePreference('dark');assertAppearance(f,'dark');assert.equal(f.values.get(key),'dark');
 theme.setThemePreference('system');assertAppearance(f,'light');
 f.system(true);assertAppearance(f,'dark');
 f.remote('light');assertAppearance(f,'light');
 assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false);assert.equal(f.pendingTimers,0);stop();
});

test('Only the last theme owner cancels an active transition, and a remount starts without animation',()=>{
 const f=browser(),theme=f.theme(),first=theme.initializeTheme(),last=theme.initializeTheme();
 theme.setThemePreference('dark');first();
 assert.equal(f.document.documentElement.dataset.themeTransition,'');assert.equal(f.pendingTimers,1);
 last();assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false);assert.equal(f.pendingTimers,0);
 const remount=theme.initializeTheme();assertAppearance(f,'dark');
 assert.equal(Object.hasOwn(f.document.documentElement.dataset,'themeTransition'),false);assert.equal(f.pendingTimers,0);
 first();last();f.advance(1000);assertAppearance(f,'dark');remount();
});

const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):typeof tree==='string'?tree:'';
test('Localized header theme switch and menu device preference share the resolved appearance',()=>{
 for(const [locale,title,switchLabel,deviceLabel,lightStatus,darkStatus] of [
  ['tr','Görünüm','Koyu tema','Cihazın temasını kullan','Açık tema etkin','Koyu tema etkin'],
  ['en','Appearance','Dark mode','Use device appearance','Light theme active','Dark theme active'],
  ['sq','Pamja','Tema e errët','Përdor pamjen e pajisjes','Tema e çelët aktive','Tema e errët aktive'],
 ]){
  const f=browser({dark:true}),theme=f.theme(),stop=theme.initializeTheme(),jsx=(type,props)=>({type,props});
  const component=load('mobile/src/components/AppearancePicker.tsx',{}, {
   react:{useId:()=>':theme-test:'},'react/jsx-runtime':{jsx,jsxs:jsx},
   '../lib/i18n':{useI18n:()=>({copy:(tr,en,sq)=>({tr,en,sq}[locale])})},
   '../lib/useTheme':{useTheme:()=>({...theme.getThemeSnapshot(),setPreference:theme.setThemePreference})},
  });
  const renderHeader=resolved=>{
   const view=component.HeaderThemeToggle(),all=nodes(view);
   const switches=all.filter(node=>node.props?.role==='switch');assert.equal(switches.length,1);
   const toggle=switches[0];assert.equal(toggle.type,'button');assert.equal(toggle.props.type,'button');
   assert.equal(toggle.props['aria-checked'],resolved==='dark');
   const labelledBy=toggle.props['aria-labelledby'];assert.ok(labelledBy);
   assert.equal(labelledBy.split(/\s+/).map(id=>text(all.find(node=>node.props?.id===id))).join(' '),switchLabel,'The accessible switch name stays stable in both states');
   const track=nodes(toggle).find(node=>node.props?.className?.split(/\s+/).includes('theme-toggle-track'));
   assert.ok(track);assert.equal(String(track.props['aria-hidden']),'true');
   for(const iconClass of ['theme-toggle-sun','theme-toggle-moon'])assert.ok(nodes(track).some(node=>node.type==='svg'&&node.props?.className?.split(/\s+/).includes(iconClass)),`${iconClass} is decorative inside the hidden track`);
   assert.equal(all.filter(node=>node.type==='input').length,0,'Device preference stays in the menu');
   assert.equal(text(all.find(node=>node.props?.id===toggle.props['aria-describedby'])),resolved==='dark'?darkStatus:lightStatus);
   return toggle;
  };
  const renderPreferences=preference=>{
   const view=component.AppearancePicker(),all=nodes(view);
   assert.equal(view.type,'fieldset');assert.notEqual(view.props.role,'radiogroup');
   assert.equal(text(all.find(node=>node.type==='legend')),title);
   assert.equal(all.filter(node=>node.props?.role==='switch').length,0,'The menu does not duplicate the header switch');
   const inputs=all.filter(node=>node.type==='input');assert.equal(inputs.length,1);
   const device=inputs[0];assert.equal(device.props.type,'checkbox');assert.equal(device.props.checked,preference==='system');
   const label=all.find(node=>node.type==='label'&&(nodes(node).includes(device)||(device.props.id&&node.props.htmlFor===device.props.id)));
   assert.ok(label);assert.equal(text(label),deviceLabel);
   return device;
  };
  const render=(preference,resolved)=>{
   assert.deepEqual(plain(theme.getThemeSnapshot()),{preference,resolved});assertAppearance(f,resolved);
   return {toggle:renderHeader(resolved),device:renderPreferences(preference)};
  };
  const changeDevice=(device,checked)=>{const target={checked};device.props.onChange({target,currentTarget:target});};
  let controls=render('system','dark');assert.equal(f.writes,0);
  controls.toggle.props.onClick();controls=render('light','light');assert.equal(f.values.get(key),'light');
  f.system(false);f.system(true);controls=render('light','light');
  changeDevice(controls.device,true);controls=render('system','dark');assert.equal(f.values.get(key),'system');
  changeDevice(controls.device,false);controls=render('dark','dark');assert.equal(f.values.get(key),'dark');
  f.system(false);controls=render('dark','dark');
  changeDevice(controls.device,true);controls=render('system','light');assert.equal(f.values.get(key),'system');
  f.system(true);render('system','dark');f.system(false);controls=render('system','light');
  changeDevice(controls.device,false);controls=render('light','light');assert.equal(f.values.get(key),'light');
  f.system(true);controls=render('light','light');
  controls.toggle.props.onClick();render('dark','dark');assert.equal(f.values.get(key),'dark');
  f.system(false);render('dark','dark');stop();
  const restart=browser({values:f.values,dark:false}),next=restart.theme(),finish=next.initializeTheme();
  assert.deepEqual(plain(next.getThemeSnapshot()),{preference:'dark',resolved:'dark'});assertAppearance(restart,'dark');finish();
 }
});
