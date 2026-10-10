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

function sessionHarness(filename, exportName, defaults, imports, globals = {}) {
  let host,key,tree,props=defaults;
  const react=Object.fromEntries(['useState','useRef','useEffect','useMemo','useCallback'].map(name=>[name,(...args)=>host.react[name](...args)]));
  const component=load(filename,{react,'react/jsx-runtime':{jsx,jsxs:jsx},...imports},{AbortController,...globals});
  const h={get tree(){return tree;},render(next={}){
    props={...props,...next};const outer=component[exportName](props);
    if(!host||key!==outer.key){host?.dispose();host=hookHost();key=outer.key;}
    tree=host.render(()=>outer.type(outer.props));return tree;
  },async settle(){await tick();return h.render();},dispose:()=>host.dispose()};
  h.render();return h;
}

function adminHarness() {
 const requests=[];
 const h=sessionHarness('mobile/src/components/AdminSocialQueue.tsx','AdminSocialQueue',{accessToken:'admin-one'},{
  '../lib/api':{requestJson:(url,options)=>{const task=deferred();requests.push({url,options,...task});return task.promise;}},
  '../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,dateLocale:'en-US'})},
  '../lib/localeFormatting':{formatAppDate:date=>date.toISOString().slice(0,10)},'./SocialPhoto':{SocialPhoto:'SocialPhoto'},
 },{URLSearchParams});
 return Object.assign(h,{requests});
}
const report={id:'report-one',username:'reporter',reason:'harassment',details:'Actual complaint',created_at:'2026-10-11T10:00:00Z',resolved_at:null,
 target:{type:'comment',id:'comment-one',postId:'post-one',username:'author',body:'Actual reported comment',caption:'Private holiday photo',photoUrl:'/api/admin/social/post-one/photo',visibility:'followers',status:'published'}};
async function reports(h,items=[report]) {
 h.requests[0].resolve({data:{items:[],nextOffset:null}});await h.settle();
 nodes(h.tree).find(n=>n.type==='select').props.onChange({target:{value:'reports'}});h.render();
 h.requests[1].resolve({data:{items,nextOffset:null}});await h.settle();
}
test('report review shows actual target, complaint and authenticated photo; hide resolves report once and refreshes',async()=>{
 const h=adminHarness();try{
  await reports(h);assert.match(text(h.tree),/Actual complaint/);assert.match(text(h.tree),/Actual reported comment/);assert.match(text(h.tree),/Private holiday photo/);assert.match(text(h.tree),/Reported comment · @author/);
  const photo=nodes(h.tree).find(n=>n.type==='SocialPhoto');assert.equal(photo.props.photoUrl,report.target.photoUrl);assert.equal(photo.props.accessToken,'admin-one');
  const hide=button(h.tree,'Hide content and resolve');assert.equal(hide.props.disabled,false);hide.props.onClick();hide.props.onClick();h.render();
  assert.equal(h.requests.length,3);assert.deepEqual(JSON.parse(JSON.stringify(h.requests[2].options.body)),{section:'reports',id:'report-one',action:'hide'});
  h.requests[2].resolve({data:{success:true}});await h.settle();assert.equal(h.requests.length,4);assert.match(h.requests[3].url,/section=reports/);
  h.requests[3].resolve({data:{items:[],nextOffset:null}});await h.settle();assert.match(text(h.tree),/No items/);
 }finally{h.dispose();}
});
test('unavailable content can only resolve; resolved filter does not expose irrelevant publication states',async()=>{
 const h=adminHarness();try{
  await reports(h,[{...report,target:null}]);assert.equal(button(h.tree,'Hide content and resolve').props.disabled,true);assert.equal(button(h.tree,'Mark resolved').props.disabled,false);
  const statuses=nodes(h.tree).filter(n=>n.type==='select')[1];assert.equal(text(statuses),'PendingResolvedAll');
  statuses.props.onChange({target:{value:'resolved'}});h.render();assert.match(h.requests[2].url,/status=resolved/);
  h.requests[2].resolve({data:{items:[{...report,resolved_at:'2026-10-11T12:00:00Z'}],nextOffset:null}});await h.settle();assert.equal(button(h.tree,'Hide content and resolve'),undefined);assert.equal(button(h.tree,'Mark resolved'),undefined);
 }finally{h.dispose();}
});
test('failed moderation keeps the item for review and a changed account cannot receive an old mutation or photo',async()=>{
 const h=adminHarness();try{
  await reports(h);button(h.tree,'Hide content and resolve').props.onClick();h.requests[2].reject(Error('network'));await h.settle();assert.match(text(h.tree),/Could not complete/);assert.match(text(h.tree),/Actual reported comment/);
  button(h.tree,'Mark resolved').props.onClick();h.render();const old=h.requests[3];h.render({accessToken:'admin-two'});assert.equal(old.options.signal.aborted,true);assert.doesNotMatch(text(h.tree),/Actual reported comment/);
  h.requests[4].resolve({data:{items:[],nextOffset:null}});await h.settle();old.resolve({data:{success:true}});await h.settle();assert.equal(h.requests.length,5);assert.match(text(h.tree),/No items/);
 }finally{h.dispose();}
});
