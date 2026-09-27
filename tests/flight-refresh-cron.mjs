import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node',esModuleInterop:true}});
const {runFlightRefreshCron}=require('../lib/flight-refresh-cron.ts');
const {flightLookupSettings}=require('../lib/flight-lookup-access.ts');
const clock=Date.parse('2026-09-28T10:00Z'), trip='10000000-0000-4000-8000-000000000001', owner='20000000-0000-4000-8000-000000000001',lease='30000000-0000-4000-8000-000000000001';
const env={FLIGHT_LOOKUP_ENABLED:'true',FLIGHT_LOOKUP_MODE:'commercial',FLIGHT_LOOKUP_NATIVE_DISPLAY_ALLOWED:'true',FLIGHT_LOOKUP_BACKGROUND_ENABLED:'true',FLIGHT_LOOKUP_MONTHLY_LIMIT:'100',AERODATABOX_API_KEY:'NONFUNCTIONAL_KEY',FLIGHT_LOOKUP_RECEIPT_SECRET:'NONFUNCTIONAL_SECRET_32_CHARACTERS_MINIMUM',CRON_SECRET:'NONFUNCTIONAL_CRON',APNS_KEY_ID:'fixture',APNS_TEAM_ID:'fixture',APNS_PRIVATE_KEY:'NONFUNCTIONAL'};
function fixture() {
  const progress={status:'EnRoute',phase:'en-route',sourceUpdatedAt:new Date(clock-60000).toISOString(),freshUntil:new Date(clock+14*60000).toISOString(),freshness:'fresh',departure:{revisedAt:null,revisedKind:null},arrival:{revisedAt:null,revisedKind:null}};
  const flight={departureAt:new Date(clock-3600000).toISOString(),arrivalAt:new Date(clock+3600000).toISOString(),nativeDisplayAllowed:true,progress};
  const before={tripId:trip,userId:owner,generation:clock/1000-1,terminal:false,flight,expiresAt:new Date(clock+4*86400000).toISOString(),language:'tr',tokens:[{id:'TOKEN_ID'}]};
  const after=structuredClone(before);after.generation++;after.flight.progress.sourceUpdatedAt=new Date(clock).toISOString();after.flight.progress.status='Approaching';
  const state={jobs:[{trip_id:trip,user_id:owner,lease_id:lease,generation:before.generation}],before,after,claim:'PRIVATE_TOKEN_FIXTURE',refreshStatus:200,transport:{ok:true,shouldDisableToken:false},read:0};
  const calls={rpc:[],refresh:[],send:[]};
  const db={rpc:(name,args)=>({abortSignal:async()=>{
    calls.rpc.push({name,args});
    let data;
    if(name==='claim_flight_native_refresh_batch') data=state.jobs;
    else if(name==='read_flight_native_refresh') data=state.read++===0?state.before:state.after;
    else if(name==='claim_flight_native_delivery') data=state.claim;
    else if(name==='settle_flight_native_delivery'||name==='release_flight_native_refresh') data=true;
    else throw new Error(name);
    return {data,error:null};
  }})};
  const refresh=async(...args)=>{calls.refresh.push(args);return {status:state.refreshStatus,body:{cached:false}};};
  const send=async(...args)=>{calls.send.push(args);return state.transport;};
  const run=(settings=flightLookupSettings(env),options={})=>runFlightRefreshCron(db,settings,send,{refresh,clock:()=>clock,...options});
  return {state,calls,run};
}

test('Background defaults fail closed for trial/native rights and obey the bounded batch/deadline',async()=>{
  for(const override of [{mode:'trial'},{nativeDisplayAllowed:false}]) {
    const h=fixture();await h.run({...flightLookupSettings(env),...override});assert.equal(h.calls.rpc.length,0);assert.equal(h.calls.refresh.length,0);
  }
  const h=fixture();const result=await h.run(undefined,{softDeadlineMs:1});assert.equal(result.deferred,1);assert.equal(h.calls.refresh.length,0);assert.equal(h.calls.send.length,0);
  assert.equal(h.calls.rpc[0].args.p_limit,10);
  const overflow=fixture();overflow.state.jobs=Array(11).fill(overflow.state.jobs[0]);await assert.rejects(overflow.run,/flight-background-batch/);
});

test('Fresh updates use only activity tokens with a current generation claim, stable APNs timestamp and generic alert',async()=>{
  const h=fixture(),result=await h.run();assert.equal(result.sent,1);assert.equal(result.refreshed,1);
  assert.equal(h.calls.refresh[0][1],owner);assert.equal(h.calls.refresh[0][2],trip);assert.equal(h.calls.refresh[0][3],lease);
  const [token,payload]=h.calls.send[0];assert.equal(token,'PRIVATE_TOKEN_FIXTURE');assert.equal(payload.event,'update');assert.equal(payload.timestampMs,clock);
  assert.equal(payload.provider.status,'Approaching');assert.ok(payload.alert);assert.doesNotMatch(JSON.stringify(payload.alert),/TK|IST|LHR|AeroDataBox|PRIVATE/);
  assert.equal(h.calls.rpc.find(c=>c.name==='claim_flight_native_delivery').args.p_generation,h.state.after.generation);
  assert.equal(h.calls.rpc.at(-1).name,'release_flight_native_refresh');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|TOKEN|10000000/);
});

test('Terminal and retention-expired envelopes send immediate field-free end without provider requests or restart',async()=>{
  const h=fixture();h.state.before.terminal=true;h.state.before.flight=null;h.state.after.terminal=true;h.state.after.flight=null;h.state.after.expiresAt=null;
  const result=await h.run();assert.equal(h.calls.refresh.length,0);assert.equal(result.ended,1);
  assert.deepEqual(h.calls.send[0][1],{event:'end',collapseId:`fl-${trip}`,timestampMs:clock,departureAtMs:0});
  assert.equal(h.calls.send.some(([,p])=>p.event==='start'),false);
});

test('Old source, revoked native rights, changed owner, quota failure and stale token claims do not send',async()=>{
  for(const kind of ['stale','unknown','rights','owner','quota','claim']) {
    const h=fixture();
    if(kind==='stale') h.state.after.flight.progress.freshUntil=new Date(clock-1).toISOString();
    if(kind==='unknown') h.state.after.flight.progress.sourceUpdatedAt=null;
    if(kind==='rights') h.state.after.flight.nativeDisplayAllowed=false;
    if(kind==='owner') h.state.after.userId='DIFFERENT_OWNER';
    if(kind==='quota') h.state.refreshStatus=429;
    if(kind==='claim') h.state.claim=null;
    await h.run();assert.equal(h.calls.send.length,0,kind);assert.equal(h.calls.rpc.at(-1).name,'release_flight_native_refresh');
  }
});

test('No alert is emitted for unchanged status/time, and permanent APNs failure disables only its claimed token',async()=>{
  const h=fixture();h.state.after.flight.progress.status=h.state.before.flight.progress.status;h.state.transport={ok:false,shouldDisableToken:true};
  const result=await h.run();assert.equal(result.failed,1);assert.equal(h.calls.send[0][1].alert,undefined);
  const settle=h.calls.rpc.find(c=>c.name==='settle_flight_native_delivery');assert.equal(settle.args.p_token_id,'TOKEN_ID');assert.equal(settle.args.p_sent,false);assert.equal(settle.args.p_disable,true);
});

const routeCode=ts.transpileModule(readFileSync(new URL('../app/api/cron/refresh-flight-data/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route(overrides={}) {
  const values={...env,...overrides},calls={db:0,worker:0};const output={exports:{}};
  const imports={ 'node:crypto':require('node:crypto'),'@/lib/flight-lookup-access':{flightLookupSettings:()=>flightLookupSettings(values)},
    '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>{calls.db++;return {};}},'@/lib/flight-refresh-cron':{runFlightRefreshCron:async()=>{calls.worker++;return {sent:0};}},'@/lib/push/apns':{sendApnsLiveActivity:()=>{throw new Error('No live push');}}};
  vm.runInNewContext(`(function(require,module,exports){${routeCode}\n})`,{Response,URL,Buffer,process:{env:values}})(n=>imports[n],output,output.exports);
  return {api:output.exports,calls};
}
test('Cron authenticates header only and requires explicit background, commercial, native and APNs configuration',async()=>{
  for(const [url,authorization] of [['https://app.example/api/cron/refresh-flight-data',''],['https://app.example/api/cron/refresh-flight-data?secret=NONFUNCTIONAL_CRON','Bearer NONFUNCTIONAL_CRON'],['https://app.example/api/cron/refresh-flight-data','Bearer wrong']]) {
    const h=route();assert.equal((await h.api.GET(new Request(url,{headers:{authorization}}))).status,401);assert.equal(h.calls.db,0);assert.equal(h.calls.worker,0);
  }
  for(const value of [{FLIGHT_LOOKUP_BACKGROUND_ENABLED:undefined},{FLIGHT_LOOKUP_MODE:'trial',FLIGHT_LOOKUP_TRIAL_USER_IDS:owner},{FLIGHT_LOOKUP_NATIVE_DISPLAY_ALLOWED:'false'},{APNS_KEY_ID:undefined}]) {
    const h=route(value);assert.equal((await h.api.GET(new Request('https://app.example/api/cron/refresh-flight-data',{headers:{Authorization:'Bearer NONFUNCTIONAL_CRON'}}))).status,503);assert.equal(h.calls.db,0);
  }
  const h=route();const response=await h.api.GET(new Request('https://app.example/api/cron/refresh-flight-data',{headers:{Authorization:'Bearer NONFUNCTIONAL_CRON'}}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{success:true,sent:0});
});
