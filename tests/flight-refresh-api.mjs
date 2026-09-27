import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync,readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require=createRequire(import.meta.url), clock=Date.parse('2026-09-28T10:00Z');
const owner='10000000-0000-4000-8000-000000000001', tripId='20000000-0000-4000-8000-000000000001', requestId='30000000-0000-4000-8000-000000000001';
const plain=v=>JSON.parse(JSON.stringify(v));
function raw(status='EnRoute',updated='2026-09-28 09:58Z') {
  return { number:'TK 1985',status,lastUpdatedUtc:updated,isCargo:false,airline:{name:'Fixture airline'},
    departure:{airport:{iata:'IST'},scheduledTime:{utc:'2026-09-28 09:00Z',local:'2026-09-28 12:00+03:00'},revisedTime:{utc:'2026-09-28 09:15Z',local:'2026-09-28 12:15+03:00'}},
    arrival:{airport:{iata:'LHR'},scheduledTime:{utc:'2026-09-28 13:00Z',local:'2026-09-28 14:00+01:00'}} };
}
function harness(overrides={}) {
  const env={FLIGHT_LOOKUP_ENABLED:'true',FLIGHT_LOOKUP_MODE:'commercial',FLIGHT_LOOKUP_MONTHLY_LIMIT:'100',AERODATABOX_API_KEY:'NONFUNCTIONAL_FIXTURE',AERODATABOX_API_CHANNEL:'rapidapi',FLIGHT_LOOKUP_RECEIPT_SECRET:'NONFUNCTIONAL_SECRET_AT_LEAST_32_CHARACTERS',...overrides};
  const state={auth:true,kind:'reserved',quota:true,dbError:false,finishKind:null,response:()=>Response.json([raw()])};
  const calls={auth:0,rpc:[],provider:[],signals:[]};
  class Clock extends Date { constructor(...args) {super(...(args.length?args:[clock]));} static now(){return clock;} }
  const original={origin:{iata:'IST'},destination:{iata:'LHR'},fetchedAt:'2026-09-28T09:50:00.000Z',nativeDisplayAllowed:true};
  const trip={id:tripId,flight_number:'TK1985',start_date:'2026-09-28',flight_pnr:'ABC123',flight_lookup_managed:true};
  const timeout=ms=>{const controller=new AbortController();calls.signals.push({ms,controller});return controller.signal;};
  const db={rpc:(name,args)=>({abortSignal:async()=>{
    calls.rpc.push({name,args:plain(args)});
    if(state.dbError) return {error:{message:env.AERODATABOX_API_KEY},data:null};
    if(name==='reserve_flight_lookup_refresh') return {data:{kind:state.kind,trip,flight:state.kind==='terminal'?null:original,expiresAt:state.kind==='terminal'?null:'2026-10-03T09:50:00Z'},error:null};
    if(name==='consume_flight_lookup_quota') return {data:state.quota,error:null};
    if(name==='finish_flight_lookup_refresh') return {data:{kind:state.finishKind??args.p_outcome,trip,flight:args.p_outcome==='terminal'?null:args.p_flight,expiresAt:args.p_outcome==='terminal'?null:args.p_expires_at},error:null};
    throw new Error(`Unexpected RPC ${name}`);
  }})};
  const context=vm.createContext({Date:Clock,Buffer,URL,URLSearchParams,Response,Request,Headers,AbortSignal:{timeout},process:{env},setTimeout,clearTimeout,
    fetch:async(url,options)=>{calls.provider.push({url,options});return state.response(options);}});
  const cache=new Map();
  function load(filename) {
    let full=path.resolve(filename); if(!existsSync(full)) full=['.ts','.json'].map(e=>full+e).find(existsSync)||full;
    if(cache.has(full)) return cache.get(full).exports;
    const output={exports:{}};cache.set(full,output);
    if(full.endsWith('.json')) return(output.exports=JSON.parse(readFileSync(full,'utf8')));
    const code=ts.transpileModule(readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,resolveJsonModule:true}}).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`,context,{filename:full})(name=>{
      if(name==='@/lib/authenticated-user') return {requireAuthenticatedUser:async()=>{calls.auth++;return state.auth?{ok:true,user:{id:owner},supabase:db}:{ok:false,response:Response.json({error:'login'},{status:401})};}};
      return name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.resolve(path.dirname(full),name)):require(name);
    },output,output.exports); return output.exports;
  }
  const api=load('app/api/cockpit/flight-trips/refresh/route.ts');
  const request=(body={tripId,requestId},version='3')=>new Request('https://app.example/api/cockpit/flight-trips/refresh',{method:'POST',headers:{Authorization:'Bearer NONFUNCTIONAL_SESSION','X-Flight-Lookup-Version':version},body:JSON.stringify(body)});
  return {api,state,calls,env,request};
}

test('Refresh requires commercial rights, v3 auth and UUIDs before any reservation or quota',async()=>{
  for(const env of [{FLIGHT_LOOKUP_ENABLED:'false'},{FLIGHT_LOOKUP_MODE:'trial',FLIGHT_LOOKUP_TRIAL_USER_IDS:owner},{FLIGHT_LOOKUP_RECEIPT_SECRET:''}]) {
    const h=harness(env);assert.equal((await h.api.POST(h.request())).status,503);assert.equal(h.calls.auth,0);assert.equal(h.calls.rpc.length,0);
  }
  const h=harness();assert.equal((await h.api.POST(h.request(undefined,'2'))).status,426);
  h.state.auth=false;assert.equal((await h.api.POST(h.request())).status,401);
  h.state.auth=true;assert.equal((await h.api.POST(h.request({tripId:'bad',requestId}))).status,400);
  assert.equal(h.calls.rpc.length,0);assert.equal(h.calls.provider.length,0);
});

test('Cached, terminal, busy and failed reservations never consume quota or call the provider',async()=>{
  for(const kind of ['cached','terminal','busy','failed','unavailable']) {
    const h=harness();h.state.kind=kind;const response=await h.api.POST(h.request());const data=await response.json();
    assert.equal(response.status,['cached','terminal'].includes(kind)?200:409);assert.equal(h.calls.rpc.length,1);assert.equal(h.calls.provider.length,0);
    assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(data.protocol,3);
    if(kind==='cached') {assert.equal(data.cached,true);assert.equal(data.flight.nativeDisplayAllowed,false,'Revoked native gate must strip an old cached permission');}
    if(kind==='terminal') {assert.equal(data.flight,null);assert.equal(data.terminal,true);}
  }
});

test('Refresh binds stored owner, flight number and airport pair; client fields never reach provider or writes',async()=>{
  const h=harness();const response=await h.api.POST(h.request({tripId,requestId,flightNumber:'FORGED',date:'2099-01-01',flight:{destination:{iata:'CDG'}},userId:'FORGED',pnr:'PRIVATE_PNR'}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.flight.progress.phase,'en-route');assert.equal(data.flight.departureAt,'2026-09-28T09:00:00.000Z');
  assert.equal(data.flight.nativeDisplayAllowed,false);assert.equal(data.refreshAfterSeconds,300);assert.equal(data.cached,false);
  assert.deepEqual(h.calls.rpc.map(c=>c.name),['reserve_flight_lookup_refresh','consume_flight_lookup_quota','finish_flight_lookup_refresh']);
  assert.equal(h.calls.rpc[0].args.p_user,owner);assert.equal(h.calls.rpc[2].args.p_flight.flightNumber,'TK1985');
  assert.equal(new URL(h.calls.provider[0].url).hostname,'aerodatabox.p.rapidapi.com');assert.match(h.calls.provider[0].url,/TK1985\/2026-09-28/);
  assert.doesNotMatch(JSON.stringify(h.calls),/PRIVATE_PNR|FORGED|2099/);
});

test('Quota, mismatching routes, ambiguous legs and provider errors keep old details and close reservations',async()=>{
  for(const scenario of ['quota','route','ambiguous','provider','oversized']) {
    const h=harness();
    if(scenario==='quota') h.state.quota=false;
    if(scenario==='provider') h.state.response=()=>Response.json({secret:h.env.AERODATABOX_API_KEY},{status:503});
    if(scenario==='oversized') h.state.response=()=>new Response('x'.repeat(300001));
    if(scenario==='route') h.state.response=()=>{const v=raw();v.arrival.airport.iata='LGW';return Response.json([v]);};
    if(scenario==='ambiguous') h.state.response=()=>{const v=raw();v.departure.scheduledTime={utc:'2026-09-28 09:30Z',local:'2026-09-28 12:30+03:00'};return Response.json([raw(),v]);};
    const response=await h.api.POST(h.request());assert.ok(response.status>=400,scenario);const body=await response.json();
    assert.doesNotMatch(JSON.stringify(body),/NONFUNCTIONAL/);assert.equal(h.calls.rpc.at(-1).args.p_outcome,'failed',scenario);assert.equal(h.calls.rpc.at(-1).args.p_flight,null);
    if(scenario==='quota') assert.equal(h.calls.provider.length,0);
  }
});

test('Only fresh provider terminal status ends the overlay; stale terminal status never purges',async()=>{
  for(const stale of [false,true]) {
    const h=harness();h.state.response=()=>Response.json([raw('Canceled',stale?'2026-09-28 09:00Z':'2026-09-28 09:59Z')]);
    const response=await h.api.POST(h.request());const data=await response.json();
    assert.equal(response.status,stale?409:200);assert.equal(h.calls.rpc.at(-1).args.p_outcome,stale?'failed':'terminal');
    if(!stale) {assert.equal(data.flight,null);assert.equal(data.expiresAt,null);assert.equal(data.terminalStatus,'Canceled');}
    else assert.equal(data.code,'stale-source');
  }
});

test('Provider timeout releases the reservation without a late write; a CAS conflict never claims success',async()=>{
  const h=harness();let resolve;
  h.state.response=()=>new Promise(r=>{resolve=r;});const pending=h.api.POST(h.request());
  for(let i=0;i<50&&!resolve;i++) await new Promise(r=>setImmediate(r));
  const providerSignal=h.calls.signals.find(s=>s.ms===8000);assert.ok(providerSignal);
  providerSignal.controller.abort();
  assert.equal((await pending).status,503);assert.equal(h.calls.rpc.at(-1).args.p_outcome,'failed');
  resolve(Response.json([raw()]));await new Promise(r=>setImmediate(r));
  assert.equal(h.calls.rpc.filter(c=>c.name==='finish_flight_lookup_refresh').length,1);
  const conflict=harness();conflict.state.finishKind='conflict';const response=await conflict.api.POST(conflict.request());
  assert.equal(response.status,409);assert.equal((await response.json()).code,'refresh-conflict');
});
