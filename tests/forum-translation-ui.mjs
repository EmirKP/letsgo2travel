import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
function load(filename, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX }}).outputText;
  const result = {exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,Intl,...globals})(name => {
    if(name.endsWith('.css')) return {};
    if(Object.hasOwn(imports,name)) return imports[name];
    throw Error(name);
  },result,result.exports);
  return result.exports;
}
function nodes(value) { return !value || typeof value !== 'object' ? [] : [value,...[value.props?.children].flat(Infinity).flatMap(nodes)]; }
function text(value) { return Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (text(node.props.children).trim() === label || node.props['aria-label'] === label));
function hookHost() {
  const slots = []; let cursor,dirty,effects,tree;
  const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((value,i)=>!Object.is(value,a[i]));
  const react={
    useState(initial){const i=cursor++; if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial}; return [slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(!Object.is(value,slots[i].value)){slots[i].value=value;dirty=true;}}];},
    useRef(initial){const i=cursor++; if(!slots[i])slots[i]={current:initial};return slots[i];},
    useMemo(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(changed(old?.deps,deps)){slots[i]={...old,deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  return {react,render(fn){for(let i=0;i<20;i++){cursor=0;dirty=false;effects=[];tree=fn();effects.forEach(e=>e());if(!dirty)return tree;}throw Error('Render loop');},dispose(){slots.forEach(s=>s?.cleanup?.());}};
}

function harness({ text: source = 'Merhaba gezgin', accessToken = 'token', locale = 'sq' } = {}) {
  let host, key, tree;
  const requests=[],calls={signIn:0};
  const copy=(_,en)=>en;
  class ApiError extends Error { constructor(message,status){super(message);this.status=status;} }
  const react=Object.fromEntries(['useState','useRef','useEffect'].map(name=>[name,(...args)=>host.react[name](...args)]));
  const component=load('mobile/src/components/ForumTranslation.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/api':{ApiError,requestJson:(url,options)=>{const task=deferred();requests.push({url,options,...task});return task.promise;}},
    '../lib/i18n':{useI18n:()=>({copy,locale})},
  },{AbortController});
  let props={text:source,accessToken,onSignIn:()=>calls.signIn++,children:jsx('p',{children:source})};
  const h={requests,calls,ApiError,get tree(){return tree;},render(next={}){
    props={...props,...next};if(next.text)props.children=jsx('p',{children:next.text});
    const outer=component.ForumTranslation(props);
    if(!host||key!==outer.key){host?.dispose();host=hookHost();key=outer.key;}
    tree=host.render(()=>outer.type(outer.props));return tree;
  },async settle(){await tick();return h.render();},dispose:()=>host.dispose()};
  h.render();return h;
}
const click=(h,label)=>button(h.tree,label).props.onClick({stopPropagation(){}});
const select=(h,value)=>nodes(h.tree).find(n=>n.type==='select').props.onChange({target:{value}});

test('Translation uses app language by default, preserves original and reuses target cache',async()=>{
  const h=harness();try{
    assert.equal(nodes(h.tree).find(n=>n.type==='select').props.value,'sq');
    click(h,'Translate');h.render();assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.body.targetLanguage,'sq');
    h.requests[0].resolve({translation:'Përshëndetje udhëtar',targetLanguage:'sq'});await h.settle();
    assert.match(text(h.tree),/Përshëndetje udhëtar/);assert.match(text(h.tree),/Automatic translation/);assert.equal(text(h.tree).includes('Merhaba gezgin'),false);
    click(h,'Show original');h.render();assert.match(text(h.tree),/Merhaba gezgin/);
    click(h,'Translate');h.render();assert.equal(h.requests.length,1);assert.match(text(h.tree),/Përshëndetje udhëtar/);
  }finally{h.dispose();}
});

test('Rapid taps do not duplicate provider work; changing language aborts and ignores stale responses',async()=>{
  const h=harness();try{
    click(h,'Translate');click(h,'Translate');h.render();assert.equal(h.requests.length,1);
    select(h,'en');h.render();assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[0].resolve({translation:'Old result',targetLanguage:'sq'});await h.settle();assert.equal(text(h.tree).includes('Old result'),false);
    click(h,'Translate');h.requests[1].resolve({translation:'Hello traveller',targetLanguage:'en'});await h.settle();assert.match(text(h.tree),/Hello traveller/);
  }finally{h.dispose();}
});

test('Provider and quota failures preserve the original text and permit retry',async()=>{
  const h=harness();try{
    click(h,'Translate');h.requests[0].reject(new h.ApiError('quota',429));await h.settle();assert.match(text(h.tree),/Translation limit reached/);assert.match(text(h.tree),/Merhaba gezgin/);
    click(h,'Translate');h.requests[1].resolve({translation:'Hello',targetLanguage:'en'});await h.settle();assert.match(text(h.tree),/Translation is unavailable/);assert.equal(button(h.tree,'Show original'),undefined);
  }finally{h.dispose();}
});

test('Guest action requests sign in and never sends forum text to provider',()=>{
  const h=harness({accessToken:''});try{click(h,'Translate');assert.equal(h.calls.signIn,1);assert.equal(h.requests.length,0);}finally{h.dispose();}
});

test('A text/session switch aborts old work and clears private cached translations',async()=>{
  const h=harness();try{
    click(h,'Translate');h.render({text:'Yeni metin',accessToken:'other-token'});assert.equal(h.requests[0].options.signal.aborted,true);
    h.requests[0].resolve({translation:'Old private result',targetLanguage:'sq'});await h.settle();assert.equal(text(h.tree).includes('Old private result'),false);assert.match(text(h.tree),/Yeni metin/);
    click(h,'Translate');assert.equal(h.requests[1].options.headers.Authorization,'Bearer other-token');assert.equal(h.requests[1].options.body.text,'Yeni metin');
  }finally{h.dispose();}
});
