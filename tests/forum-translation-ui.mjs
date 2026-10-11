import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const jsx=(type,props,key)=>{if(props?.ref && typeof props.ref==='object')props.ref.current={};return{type,props,key};};
const nodes=value=>!value||typeof value!=='object'?[]:[value,...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text=value=>Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):typeof value==='string'?value:'';
function hookHost(){
 const slots=[];let cursor,dirty,effects,tree;
 const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));
 const react={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old?.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 return{react,render(fn){for(let i=0;i<20;i++){cursor=0;dirty=false;effects=[];tree=fn();effects.forEach(f=>f());if(!dirty)return tree;}throw Error('render loop');},dispose(){slots.forEach(s=>s?.cleanup?.());}};
}
function harness({locale='en',accessToken='token',viewport=false}={}){
 let host,key,tree;const subscriptions=[],observers=[];let opened=0;
 const react=Object.fromEntries(['useState','useRef','useEffect'].map(name=>[name,(...args)=>host.react[name](...args)]));
 const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/i18n':{useI18n:()=>({locale,copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?sq:en})},'../lib/communityTranslation':{communityTranslationQueue:{subscribe(input,listener){const entry={input,listener,cancelled:false};subscriptions.push(entry);return()=>entry.cancelled=true;}}}};
 const result={exports:{}};const source=ts.transpileModule(readFileSync('mobile/src/components/ForumTranslation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){this.observed=true;}disconnect(){this.disconnected=true;}}
 vm.runInNewContext(`(function(require,module,exports){${source}\n})`,viewport?{IntersectionObserver:Observer}:{})(name=>{if(name.endsWith('.css'))return{};assert.ok(imports[name],name);return imports[name];},result,result.exports);
 let props={text:'Merhaba gezgin',title:'Yeni soru',accessToken,children:(display,title)=>jsx('button',{onClick:()=>opened++,children:[jsx('h3',{children:title}),jsx('p',{children:display})]})};
 const h={subscriptions,observers,get tree(){return tree;},get opened(){return opened;},render(next={}){props={...props,...next};const outer=result.exports.ForumTranslation(props);if(!host||key!==outer.key){host?.dispose();host=hookHost();key=outer.key;}tree=host.render(()=>outer.type(outer.props));return tree;},locale(next){locale=next;return h.render();},resolve(index,result){subscriptions[index].listener(result);return h.render();},dispose(){host.dispose();}};
 h.render();return h;
}
test('visible community text translates automatically into app language without controls and preserves clickable title/body layout',()=>{
 const h=harness();try{
  assert.equal(h.subscriptions.length,1);assert.equal(h.subscriptions[0].input.locale,'en');assert.match(text(h.tree),/Loading content/);assert.ok(!text(h.tree).includes('Merhaba'));
  h.resolve(0,{status:'ready',text:'Hello traveller',title:'New question'});assert.match(text(h.tree),/New questionHello traveller/);assert.equal(h.tree.props.lang,'en');
  assert.equal(nodes(h.tree).filter(n=>n.type==='select').length,0);assert.equal(nodes(h.tree).filter(n=>n.type==='button').length,1);
  nodes(h.tree).find(n=>n.type==='button').props.onClick();assert.equal(h.opened,1);assert.equal(h.subscriptions[0].input.text,'Merhaba gezgin');
 }finally{h.dispose();}
});
test('viewport gate defers provider work for off-screen rows and cleans observation on exit',()=>{
 const h=harness({viewport:true});try{
  assert.equal(h.subscriptions.length,0);assert.equal(h.observers[0].observed,true);
  h.observers[0].callback([{isIntersecting:false}]);h.render();assert.equal(h.subscriptions.length,0);
  h.observers[0].callback([{isIntersecting:true}]);h.render();assert.equal(h.subscriptions.length,1);assert.equal(h.observers[0].disconnected,true);
 }finally{h.dispose();}assert.equal(h.subscriptions[0].cancelled,true);
});
test('language/session/text changes clear previous display immediately and unsubscribe obsolete work',()=>{
 const h=harness();try{
  h.resolve(0,{status:'ready',text:'Hello traveller',title:'New question'});h.locale('sq');assert.equal(h.subscriptions[0].cancelled,true);assert.ok(!text(h.tree).includes('Hello'));assert.match(text(h.tree),/ngarkohet/);
  assert.equal(h.subscriptions[1].input.locale,'sq');h.resolve(1,{status:'ready',text:'Përshëndetje',title:'Pyetje'});assert.match(text(h.tree),/Përshëndetje/);
  h.render({accessToken:'other',text:'Yeni metin'});assert.equal(h.subscriptions[1].cancelled,true);assert.ok(!text(h.tree).includes('Përshëndetje'));assert.equal(h.subscriptions[2].input.accessToken,'other');
 }finally{h.dispose();}
});
test('guests translate automatically; a failed translation plainly falls back to unchanged original without a false translated label',()=>{
 const h=harness({accessToken:''});try{
  assert.equal(h.subscriptions.length,1);assert.equal(h.subscriptions[0].input.accessToken,'');h.resolve(0,{status:'failed'});
  assert.match(text(h.tree),/Merhaba gezgin/);assert.match(text(h.tree),/Translation unavailable; showing the original text/);assert.equal(h.tree.props.lang,undefined);assert.equal(nodes(h.tree).some(n=>n.type==='select'),false);
 }finally{h.dispose();}
});
