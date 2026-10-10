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
function browser({stored=null,dark=false,denied='',legacyMedia=false,noMedia=false,values=new Map()}={}){
 if(stored!==null)values.set(key,stored);
 let writes=0;
 const localStorage={getItem:name=>{if(denied==='read')throw Error('blocked');return values.get(name)??null;},setItem:(name,value)=>{if(denied==='write')throw Error('blocked');writes++;values.set(name,String(value));}};
 const storageListeners=new Set(),mediaListeners=new Set();
 const media={matches:dark};
 if(legacyMedia){media.addListener=callback=>mediaListeners.add(callback);media.removeListener=callback=>mediaListeners.delete(callback);}
 else{media.addEventListener=(name,callback)=>{assert.equal(name,'change');mediaListeners.add(callback);};media.removeEventListener=(name,callback)=>{assert.equal(name,'change');mediaListeners.delete(callback);};}
 const window={matchMedia:query=>{assert.equal(query,'(prefers-color-scheme: dark)');if(noMedia)throw Error('unsupported');return media;},addEventListener:(name,callback)=>{assert.equal(name,'storage');storageListeners.add(callback);},removeEventListener:(name,callback)=>{assert.equal(name,'storage');storageListeners.delete(callback);}};
 Object.defineProperty(window,'localStorage',{get(){if(denied==='getter')throw Error('blocked');return localStorage;}});
 const metas=new Map(['theme-color','color-scheme'].map(name=>[name,{content:name==='theme-color'?'#0877b8':'light',setAttribute(attribute,value){assert.equal(attribute,'content');this.content=value;}}]));
 const document={documentElement:{dataset:{},style:{}},querySelector:selector=>{const name=/^meta\[name="(.+)"\]$/.exec(selector)?.[1];assert.ok(metas.has(name));return metas.get(name);}};
 const globals={window,document};
 return {globals,values,document,metas,storageListeners,mediaListeners,get writes(){return writes;},
  theme:()=>load('mobile/src/lib/theme.ts',globals),
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

const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const text=tree=>Array.isArray(tree)?tree.map(text).join(''):tree?.props?text(tree.props.children):typeof tree==='string'?tree:'';
test('Appearance picker exposes labelled native radio choices in Turkish, English and Albanian',()=>{
 for(const [locale,labels,title] of [['tr',['Açık','Koyu','Sistem'],'Görünüm'],['en',['Light','Dark','System'],'Appearance'],['sq',['E çelët','E errët','Sistemi'],'Pamja']]){
  const f=browser(),theme=f.theme(),stop=theme.initializeTheme(),jsx=(type,props)=>({type,props});
  const component=load('mobile/src/components/AppearancePicker.tsx',{}, {
   react:{useId:()=>':theme-test:'},'react/jsx-runtime':{jsx,jsxs:jsx},
   '../lib/i18n':{useI18n:()=>({copy:(tr,en,sq)=>({tr,en,sq}[locale])})},
   '../lib/useTheme':{useTheme:()=>({...theme.getThemeSnapshot(),setPreference:theme.setThemePreference})},
  });
  const render=()=>component.AppearancePicker();let view=render(),all=nodes(view);
  assert.equal(view.type,'fieldset');assert.equal(view.props.role,'radiogroup');
  assert.equal(text(all.find(node=>node.props?.id===view.props['aria-labelledby'])),title);
  assert.ok(all.find(node=>node.props?.id===view.props['aria-describedby']));
  assert.deepEqual(all.filter(node=>node.type==='label').map(text),labels);
  let inputs=all.filter(node=>node.type==='input');assert.ok(inputs.every(input=>input.props.type==='radio'));assert.equal(new Set(inputs.map(input=>input.props.name)).size,1);
  assert.deepEqual(inputs.filter(input=>input.props.checked).map(input=>input.props.value),['system']);
  inputs.find(input=>input.props.value==='dark').props.onChange();assertAppearance(f,'dark');assert.equal(f.values.get(key),'dark');
  inputs=nodes(render()).filter(node=>node.type==='input');assert.deepEqual(inputs.filter(input=>input.props.checked).map(input=>input.props.value),['dark']);stop();
 }
});
