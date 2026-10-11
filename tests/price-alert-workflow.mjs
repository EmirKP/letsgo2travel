import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path,imports,globals={}) {
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,URL,Response,Symbol,console,...globals})(name=>{
    if (name in imports) return imports[name];throw Error(name);
  },loaded,loaded.exports);
  return loaded.exports;
}
class RetryableError extends Error {}
function harness({remaining=185,stalled=false,conflict=null,retryBacklog=0,unpersistedAlerts=0}={}) {
  const state={remaining,retryBacklog,calls:[],sleep:0,children:[],ownership:[]};
  const workflow=load('workflows/price-alert-scan.ts',{
    workflow:{RetryableError,sleep:async()=>{state.sleep++;},createHook:options=>{
      state.ownership.push(options);return{getConflict:async()=>conflict,[Symbol.dispose](){}};
    }},
    'workflow/api':{start:async(fn,args)=>{state.children.push({fn,args});return{runId:'continuation'};}},
    '../lib/price-alert-cron':{runPriceAlertCheck:async options=>{
      state.calls.push(options);
      // Six successful eight-second retry deliveries consume the whole step
      // budget before the fresh-price scan can start.
      if(state.retryBacklog>0){const retryProcessed=Math.min(6,state.retryBacklog);state.retryBacklog-=retryProcessed;return{processedAlerts:0,retryProcessed,deadlineReached:true};}
      const processed=stalled?0:Math.min(state.remaining,options.limit);state.remaining-=processed;
      return{processedAlerts:processed+unpersistedAlerts,retryProcessed:0,deadlineReached:false};
    }},
    '../lib/supabaseAdmin':{getSupabaseAdmin:()=>({})},
    '../lib/price-alert-scan':{remainingPriceAlertScanRows:async()=>state.remaining},
    '../lib/date-utils':{todayIsoInTimeZone:()=> '2026-10-12'},
  },{console:{log(){}}});
  return{workflow,state};
}
const cutoff='2026-10-12T09:00:00.000Z';

test('durable orchestration continues past first80 and stops only after remaining eligible rows reach zero',async()=>{
  const h=harness();const result=await h.workflow.priceAlertScan(cutoff,80);
  assert.equal(result.status,'complete');assert.equal(result.processed,185);assert.equal(h.state.calls.length,3);assert.equal(h.state.remaining,0);
  assert.ok(h.state.calls.every(call=>call.checkedBefore===cutoff));assert.equal(h.state.sleep,2);
});
test('scan chunks cap replay history and enqueue durable continuation with the same cutoff',async()=>{
  const h=harness({remaining:8100});const result=await h.workflow.priceAlertScan(cutoff,80);
  assert.equal(result.status,'continued');assert.equal(result.nextRunId,'continuation');assert.equal(h.state.calls.length,100);
  assert.equal(h.state.children.length,1);assert.deepEqual(Array.from(h.state.children[0].args),[cutoff,80,1]);
});
test('concurrent same-day runs perform no provider work; failed persistence retries instead of reporting complete',async()=>{
  const duplicate=harness({conflict:{runId:'owner'}});assert.equal((await duplicate.workflow.priceAlertScan(cutoff)).runId,'owner');assert.equal(duplicate.state.calls.length,0);
  const stalled=harness({stalled:true,unpersistedAlerts:80});await assert.rejects(stalled.workflow.checkPriceAlertBatch(cutoff,80),RetryableError);
  assert.equal(stalled.workflow.checkPriceAlertBatch.maxRetries,8);
});

test('a delivery retry backlog spanning more than eight budgets advances before checking every fresh alert',async()=>{
  const h=harness({remaining:185,retryBacklog:60});
  const result=await h.workflow.priceAlertScan(cutoff,80);
  assert.equal(result.status,'complete');assert.equal(result.processed,185);
  assert.equal(h.state.retryBacklog,0);assert.equal(h.state.remaining,0);
  assert.equal(h.state.calls.length,13);assert.equal(h.state.sleep,12);
  assert.ok(h.state.calls.every(call=>call.checkedBefore===cutoff));
});
test('scan filter accepts only timestamp input and uses one nested expression for delivery, day boundary and snapshot',()=>{
  const scan=load('lib/price-alert-scan.ts',{});
  assert.equal(scan.priceAlertScanFilter(), 'notify_email.eq.true,notify_push.eq.true');
  assert.match(scan.priceAlertScanFilter(cutoff),/last_checked_at\.lt\.2026-10-12T00:00:00.000Z/);
  assert.match(scan.priceAlertScanFilter(cutoff),/created_at\.lte\.2026-10-12T09:00:00.000Z/);
  assert.throws(()=>scan.priceAlertScanFilter('x),is_active.eq.false'));
});
test('cron authenticates only a bearer secret and queues a workflow without invoking price providers',async()=>{
  const calls=[];
  const route=load('app/api/cron/check-price-alerts/route.ts',{
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    'workflow/api':{start:async(fn,args)=>{calls.push(args);return{runId:'queued-run'};}},
    '@/workflows/price-alert-scan':{priceAlertScan:()=>{}},
    '@/lib/price-alert-cron-auth':load('lib/price-alert-cron-auth.ts',{}, {process:{env:{CRON_SECRET:'fixture-secret'}}}),
  },{process:{env:{CRON_SECRET:'fixture-secret'}}});
  for(const request of [new Request('https://example.test?secret=fixture-secret'),new Request('https://example.test',{headers:{authorization:'Bearer wrong'}})])assert.equal((await route.GET(request)).status,401);
  assert.equal(calls.length,0);
  const response=await route.GET(new Request('https://example.test?limit=999',{headers:{authorization:'Bearer fixture-secret'}}));
  assert.equal(response.status,202);assert.equal((await response.json()).runId,'queued-run');assert.equal(calls[0][1],200);
});


test('safe deployment healthcheck only queues its diagnostic probe and rejects missing or URL-based authorization',async()=>{
 let probes=0;let healthy=true;
 const route=load('app/api/cron/check-price-alerts/health/route.ts',{
  'workflow/runtime':{getWorld:async()=>({healthOnly:true}),healthCheck:async(world,opts)=>{
   assert.equal(world.healthOnly,true);assert.equal(opts.timeout,20_000);probes++;return{healthy,latencyMs:23,specVersion:6,workflowCoreVersion:'fixture'};
  }},
  '@/lib/price-alert-cron-auth':load('lib/price-alert-cron-auth.ts',{}, {process:{env:{CRON_SECRET:'fixture-secret'}}}),
 });
 assert.equal((await route.GET(new Request('https://example.test?secret=fixture-secret'))).status,401);assert.equal(probes,0);
 const request=()=>new Request('https://example.test',{headers:{authorization:'Bearer fixture-secret'}});
 const response=await route.GET(request());assert.equal(response.status,200);assert.equal((await response.json()).healthy,true);assert.equal(probes,1);
 healthy=false;assert.equal((await route.GET(request())).status,503);
});
