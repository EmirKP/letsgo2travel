import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const appSource=readFileSync('mobile/src/App.tsx','utf8');
const appAst=ts.createSourceFile('App.tsx',appSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const appNodes=[];function visit(node){appNodes.push(node);ts.forEachChild(node,visit);}visit(appAst);
function variable(name){const node=appNodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(appAst)===name);assert.ok(node,`Actual App handler ${name}`);return node.initializer.getText(appAst);}
function evaluate(code,scope={}){const compiled=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const exports={};vm.runInNewContext(compiled,Object.assign(scope,{exports}));return exports;}
const helpers=evaluate(readFileSync('mobile/src/lib/pullRefresh.ts','utf8'));
function fixture(overrides={}){
 const timers=new Map();let timerId=0;
 const scope={...helpers,useCallback:fn=>fn,Element:class{},onboardingOpen:false,releaseOpen:false,notificationsOpen:false,accountOpen:false,hasOpenSheet:()=>false,pendingPull:{current:null},pullFinishTimer:{current:null},profileOwnerRef:{current:'owner-a'},activeViewRef:{current:'home'},pullStart:{current:0},edgeSwipeStart:{current:null},activeView:'home',ownerId:'owner-a',refreshTick:7,pullDistance:70,refreshing:false,nestedView:false,historyDepth:{current:0},goBack(){throw Error('Unexpected back');},navigate(){throw Error('Unexpected navigation');},Date:{now:()=>1000},window:{scrollY:0,setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id)},...overrides};
 scope.setRefreshing=value=>{scope.refreshing=value;};scope.setRefreshTick=value=>{scope.refreshTick=value;};scope.setPullDistance=value=>{scope.pullDistance=value;};
 const handlers=evaluate(`export const finishPull=${variable('finishPull')}; export const startPull=${variable('startPull')}; export const movePull=${variable('movePull')}; export const endPull=${variable('endPull')}; export const cancelPull=${variable('cancelPull')};`,scope);
 return{scope,timers,...handlers};
}
test('Pull distance and flight progress clamp direction, invalid coordinates and threshold',()=>{
 assert.equal(helpers.pullRefreshDistance(100,80),0);assert.equal(helpers.pullRefreshDistance(100,1000),96);assert.equal(helpers.pullRefreshDistance(NaN,120),0);
 assert.equal(helpers.pullRefreshProgress(31),.5);assert.equal(helpers.pullRefreshProgress(99),1);assert.equal(helpers.pullRefreshProgress(NaN),0);
 assert.equal(helpers.pullRefreshFinishDelay(1000,1200),350);assert.equal(helpers.pullRefreshFinishDelay(1000,2000),0);
});
test('Release starts exactly one refresh and keeps flight active until the real completion callback',()=>{
 const f=fixture();f.endPull({changedTouches:[]});assert.equal(f.scope.refreshTick,8);assert.equal(f.scope.refreshing,true);assert.equal(f.timers.size,0,'No pretend-success timer on release');
 f.scope.pullDistance=80;f.endPull({changedTouches:[]});assert.equal(f.scope.refreshTick,8,'Second release cannot start a parallel request');
 f.finishPull(8);assert.equal(f.timers.size,1);const timer=[...f.timers.values()][0];assert.equal(timer.delay,550);timer.fn();assert.equal(f.scope.refreshing,false);assert.equal(f.scope.pendingPull.current,null);
});
test('Short/cancelled pulls never trigger network refresh and navigation blocks release',()=>{
 for(const overrides of [{pullDistance:61},{activeView:'community'}]){const f=fixture(overrides);f.endPull({changedTouches:[]});assert.equal(f.scope.refreshTick,7);assert.equal(f.scope.refreshing,false);}
 const f=fixture();f.cancelPull();assert.equal(f.scope.pullDistance,0);assert.equal(f.scope.pullStart.current,null);assert.equal(f.scope.refreshTick,7);
});
test('A pending refresh still allows the existing edge-back gesture without starting another pull',()=>{
 const f=fixture();f.endPull({changedTouches:[]});f.startPull({touches:[{clientX:12,clientY:20}],target:null});assert.equal(f.scope.pullStart.current,null);assert.equal(f.scope.edgeSwipeStart.current.x,12);assert.equal(f.scope.refreshTick,8);
});
test('Reversing into page scroll or starting an excluded gesture disarms an old pull',()=>{
 const scrolling=fixture();scrolling.scope.window.scrollY=12;scrolling.movePull({touches:[{clientY:160}]});scrolling.endPull({changedTouches:[]});assert.equal(scrolling.scope.refreshTick,7);assert.equal(scrolling.scope.pullStart.current,null);
 const excluded=fixture();const target=new excluded.scope.Element();target.closest=()=>true;excluded.startPull({touches:[{clientX:100,clientY:20}],target});excluded.endPull({changedTouches:[]});assert.equal(excluded.scope.refreshTick,7);assert.equal(excluded.scope.pullDistance,0);
});
test('Old tokens, different owners and other screens cannot finish a pending flight',()=>{
 for(const change of [f=>f.finishPull(7),f=>{f.scope.profileOwnerRef.current='owner-b';f.finishPull(8);},f=>{f.scope.activeViewRef.current='profile';f.finishPull(8);}]){const f=fixture();f.endPull({changedTouches:[]});change(f);assert.equal(f.timers.size,0);assert.equal(f.scope.refreshing,true);}
 const f=fixture();f.endPull({changedTouches:[]});f.finishPull(8);const old=[...f.timers.values()][0];f.scope.pendingPull.current={token:9,owner:'owner-a',startedAt:1000};old.fn();assert.equal(f.scope.refreshing,true,'Queued callback cannot finish a replacement request');
});

const homeSource=readFileSync('mobile/src/screens/HomeScreen.tsx','utf8');
const homeAst=ts.createSourceFile('HomeScreen.tsx',homeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
function findEffect(node){if(ts.isCallExpression(node)&&node.expression.getText(homeAst)==='useEffect'&&node.arguments[0]?.getText(homeAst).includes('listCockpitTrips'))effect=node.arguments[0].getText(homeAst);ts.forEachChild(node,findEffect);}findEffect(homeAst);assert.ok(effect);
async function homeFixture({owner='owner-a',failure=false,cleanup=false}={}){
 const completed=[],trips=[],states=[];let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const {run}=evaluate(`export const run=${effect};`,{ownerId:owner,accessToken:owner?'token':undefined,refreshToken:8,onRefreshSettled:token=>completed.push(token),listCockpitTrips:()=>pending,nextHomeJourney:rows=>rows[0]||null,localIsoDate:()=> '2026-11-02',setTrip:v=>trips.push(v),setTripRequest:v=>states.push(v)});
 const stop=run();if(cleanup)stop();if(failure)reject(Error('offline'));else resolve([{id:'trip-a'}]);await pending.catch(()=>{});await new Promise(done=>setImmediate(done));return{completed,trips,states};
}
test('Home flight completion follows success, failure and local guest loading without false success claims',async()=>{
 const success=await homeFixture();assert.deepEqual(success.completed,[8]);assert.equal(success.states[0].state,'ready');
 const failure=await homeFixture({failure:true});assert.deepEqual(failure.completed,[8]);assert.equal(failure.states[0].state,'error');
 assert.deepEqual((await homeFixture({owner:null})).completed,[8]);
});
test('An unmounted or replaced Home request cannot acknowledge the next screen/owner',async()=>{
 for(const failure of [true,false]){const stale=await homeFixture({cleanup:true,failure});assert.deepEqual(stale.completed,[]);assert.deepEqual(stale.states,[]);assert.deepEqual(stale.trips,[]);}
});
test('Airplane is decorative, reflects only busy/drag state and reduced motion removes flight animation',()=>{
 const source=readFileSync('mobile/src/components/PullRefreshIndicator.tsx','utf8');const css=readFileSync('mobile/src/components/pull-refresh.css','utf8');
 assert.match(source,/role="status"/);assert.match(source,/aria-hidden=\{!visible/);assert.match(source,/aria-hidden="true"/);assert.match(source,/viewBox="0 0 48 48"/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*animation:none!important/);assert.match(css,/\[data-refreshing\] \.pull-flight-plane\{animation:pull-flight-takeoff/);
 assert.match(css,/color:var\(--theme-ink,#17304d\)/,'Label uses the actual light/dark text token');
 assert.doesNotMatch(appSource,/showNotice\(online \? copy\("Yenileme istendi/,'Request acknowledgement no longer creates a duplicate toast');
});
