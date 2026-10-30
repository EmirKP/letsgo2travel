import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const jsx=(type,props)=>({type,props});
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.props?.children)]:[];
const text=value=>Array.isArray(value)?value.map(text).join(''):value?.props?text(value.props.children):typeof value==='string'?value:'';
const photo='data:image/jpeg;base64,c3ludGhldGljLWZpeHR1cmU=';
function fixture({prepare=async()=>photo}={}){
 const slots=[];let cursor=0,effects=[],tree,props={ownerId:'owner-a',accessToken:'token-a',onSignIn(){signIns++;}},signIns=0;
 const calls=[];class ApiError extends Error{constructor(status){super('Fixture error');this.status=status;}}
 const react={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v}];},useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},useEffect(effect,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>!Object.is(v,old.deps[n]))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect();});}}};
 const code=ts.transpileModule(readFileSync('mobile/src/components/TravelPhotoGuide.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const output={exports:{}};
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Error,window:{addEventListener(){},removeEventListener(){}}})(name=>({react,'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/travelPhoto':{prepareImage:prepare},'../lib/api':{ApiError,requestJson:async(path,options)=>{if(!options?.method)return{available:true};return new Promise((resolve,reject)=>calls.push({path,options,resolve,reject}));}},'./Icon':{Icon:'Icon'},'../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,locale:'en'})},'../../../lib/travel-assistant/photo':{validatePhotoGuide:value=>value}}[name]||{}),output,output.exports);
 const h={calls,ApiError,render(next={}){props={...props,...next};cursor=0;effects=[];tree=output.exports.TravelPhotoGuide(props);effects.forEach(fn=>fn());return tree;},async settle(){await tick();h.render();await tick();return h.render();},button(label){return nodes(tree).find(n=>n.type==='button'&&text(n)===label)},async select(){nodes(tree).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{type:'image/jpeg',name:'fixture.jpg'}],value:'fixture'}});return h.settle();},consent(){nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();},get tree(){return tree},signIns:()=>signIns,dispose(){slots.forEach(s=>s?.cleanup?.());}};h.render();return h;
}

test('same-owner token refresh keeps the selected photo, consent and a confirmed analysis',async()=>{
 const h=fixture();try{await h.settle();await h.select();h.consent();h.render({accessToken:'token-b'});await h.settle();assert.equal(nodes(h.tree).find(n=>n.type==='img').props.src,photo);assert.equal(nodes(h.tree).find(n=>n.type==='input'&&n.props.type==='checkbox').props.checked,true);
  h.button('Analyze photo').props.onClick();h.render({accessToken:'token-c'});h.calls[0].resolve({title:'Fixture arch',observation:'Fixture observation',context:'Fixture context',uncertain:true});await h.settle();assert.match(text(h.tree),/Fixture arch/);
 }finally{h.dispose();}
});

test('same-owner token refresh during image preparation retains its eventual selection',async()=>{
 let finish;const h=fixture({prepare:()=>new Promise(resolve=>{finish=resolve})});try{await h.settle();nodes(h.tree).find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{}],value:'fixture'}});h.render({accessToken:'token-b'});finish(photo);await h.settle();assert.equal(nodes(h.tree).find(n=>n.type==='img').props.src,photo);}finally{h.dispose();}
});

test('real owner changes and sign-out clear photo/consent, and late old analysis cannot return',async()=>{
 const h=fixture();try{await h.settle();await h.select();h.consent();h.button('Analyze photo').props.onClick();h.render({ownerId:'owner-b',accessToken:'token-b'});h.calls[0].resolve({title:'Old private result'});await h.settle();assert.equal(nodes(h.tree).some(n=>n.type==='img'),false);assert.doesNotMatch(text(h.tree),/Old private result/);
  await h.select();h.render({ownerId:null,accessToken:''});await h.settle();assert.equal(nodes(h.tree).some(n=>n.type==='img'),false);
 }finally{h.dispose();}
});

test('an old-token analysis 401 preserves the same-owner photo and offers explicit retry without false sign-in',async()=>{
 const h=fixture();try{await h.settle();await h.select();h.consent();h.button('Analyze photo').props.onClick();h.render({accessToken:'token-b'});h.calls[0].reject(new h.ApiError(401));await h.settle();assert.equal(nodes(h.tree).find(n=>n.type==='img').props.src,photo);assert.doesNotMatch(text(h.tree),/session expired/);assert.match(text(h.tree),/session was refreshed/);assert.equal(h.calls.length,1,'Never upload again without an explicit user action');}finally{h.dispose();}
});
