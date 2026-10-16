import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class ApiError extends Error { constructor(status,payload=null){super('Request failed');this.status=status;this.payload=payload;} }
function harness(){
 const timers=new Map(),requests=[];let timerId=0,time=0;
 const result={exports:{}};
 const code=ts.transpileModule(readFileSync('mobile/src/lib/communityTranslation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{AbortController,Date,Map,Set,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}})(name=>{assert.equal(name,'./api');return{ApiError,requestJson(){throw Error('default queue unused');}};},result,result.exports);
 const queue=result.exports.createCommunityTranslationQueue((items,locale,token,signal)=>new Promise((resolve,reject)=>requests.push({items,locale,token,signal,resolve,reject})),()=>time);
 return{queue,requests,flush(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},advance(ms){time+=ms;},resolve(i){const req=requests[i];req.resolve({targetLanguage:req.locale,translations:req.items.map(item=>({id:item.id,translation:`translated ${item.text}`,...(item.title?{title:`translated ${item.title}`}:{})}))});},input(text='Merhaba',locale='en',token='token'){return{text,locale,accessToken:token};}};
}
test('visible duplicates share work, batches cap six texts and concurrency is limited to two',async()=>{
 const h=harness(),received=[],stops=[];
 for(let i=0;i<13;i++)stops.push(h.queue.subscribe(h.input(`Text ${i}`),result=>received.push(result)));
 stops.push(h.queue.subscribe(h.input('Text 0'),result=>received.push(result)));h.flush();
 assert.equal(h.requests.length,2);assert.equal(h.requests[0].items.length,6);assert.equal(h.requests[1].items.length,6);
 h.resolve(0);await tick();h.flush();assert.equal(h.requests.length,3);assert.equal(h.requests[2].items.length,1);assert.equal(received.length,7);
 h.resolve(1);h.resolve(2);await tick();assert.equal(received.length,14);stops.forEach(stop=>stop());
 let cached;const stop=h.queue.subscribe(h.input('Text 0'),result=>cached=result);assert.equal(cached.status,'ready');h.flush();assert.equal(h.requests.length,3);stop();h.queue.clear();
});
test('batch character budget, text edits and target languages have independent cached results',async()=>{
 const h=harness(),results=[];
 const stops=[h.queue.subscribe({...h.input('a'.repeat(5000)),title:'Title'},result=>results.push(result)),h.queue.subscribe(h.input('b'.repeat(4000)),result=>results.push(result))];h.flush();
 assert.equal(h.requests.length,2);assert.ok(h.requests.every(req=>req.items.reduce((n,item)=>n+item.text.length+(item.title?.length||0),0)<=8000));
 h.resolve(0);h.resolve(1);await tick();assert.equal(results[0].title,'translated Title');stops.forEach(stop=>stop());
 const stop=h.queue.subscribe(h.input('a'.repeat(5000),'sq'),()=>{});h.flush();assert.equal(h.requests[2].locale,'sq');stop();h.queue.clear();
});
test('unmount cancels queued work, already-started work remains bounded, and account changes fence all old results',async()=>{
 const h=harness(),received=[];
 const queued=h.queue.subscribe(h.input('Never visible again'),()=>received.push('queued'));queued();h.flush();assert.equal(h.requests.length,0);
 const one=h.queue.subscribe(h.input('Shared'),result=>received.push(result));const two=h.queue.subscribe(h.input('Shared'),result=>received.push(result));h.flush();one();assert.equal(h.requests[0].signal.aborted,false);two();assert.equal(h.requests[0].signal.aborted,false);
 const old=h.queue.subscribe(h.input('Private'),result=>received.push(result));h.flush();const next=h.queue.subscribe(h.input('Public','sq',''),result=>received.push(result));assert.equal(h.requests[1].signal.aborted,true);h.flush();
 h.resolve(1);h.resolve(2);await tick();assert.equal(received.length,1);assert.equal(received[0].text,'translated Public');old();next();h.queue.clear();
});
test('failure and malformed target/IDs never produce translated success; negative cache expires without retry storms',async()=>{
 const h=harness();let result;const stop=h.queue.subscribe(h.input(),value=>result=value);h.flush();h.requests[0].resolve({targetLanguage:'sq',translations:[{id:'0',translation:'Wrong language'}]});await tick();assert.equal(result.status,'failed');stop();
 const cached=h.queue.subscribe(h.input(),value=>result=value);h.flush();assert.equal(h.requests.length,1);cached();h.advance(60001);
 const retry=h.queue.subscribe(h.input(),value=>result=value);h.flush();assert.equal(h.requests.length,2);h.requests[1].reject(Error('offline'));await tick();assert.equal(result.status,'failed');retry();h.queue.clear();
});
test('oversized text is rejected locally and uncached stale requests cannot cross edited content',async()=>{
 const h=harness();let invalid;h.queue.subscribe(h.input('x'.repeat(8001)),value=>invalid=value);h.flush();assert.equal(invalid.status,'failed');assert.equal(h.requests.length,0);
 let updated;const old=h.queue.subscribe(h.input('Old'),()=>assert.fail('obsolete callback'));h.flush();old();const newer=h.queue.subscribe(h.input('Edited'),value=>updated=value);h.flush();h.resolve(0);h.resolve(1);await tick();assert.equal(updated.text,'translated Edited');newer();h.queue.clear();
});
test('late old-session cleanup cannot delete the new session queued job with identical text and locale',async()=>{
 const h=harness();let updated;
 const old=h.queue.subscribe(h.input('Same','en','old-token'),()=>assert.fail('old account result'));
 const current=h.queue.subscribe(h.input('Same','en','new-token'),value=>updated=value);
 old();h.flush();assert.equal(h.requests.length,1);assert.equal(h.requests[0].token,'new-token');
 h.resolve(0);await tick();assert.equal(updated.text,'translated Same');current();h.queue.clear();
});

test('completed mounted rows release cache pins so appended discussion items keep translating beyond 200',async()=>{
 const h=harness(),results=[],stops=[];let resolved=0;
 for(let page=0;page<12;page++){
  for(let i=0;i<20;i++){const index=page*20+i;stops.push(h.queue.subscribe(h.input(`Reply ${index}`),value=>results[index]=value));}
  h.flush();
  while(results.filter(Boolean).length<(page+1)*20){while(resolved<h.requests.length)h.resolve(resolved++);await tick();h.flush();}
 }
 assert.equal(results.length,240);assert.ok(results.every(value=>value.status==='ready'));
 // No row has unmounted. The already rendered text remains in its listener's state.
 assert.equal(results[0].text,'translated Reply 0');stops.forEach(stop=>stop());h.queue.clear();
});

test('reconnect retries share work, while invalid sessions cannot be forced into another request',async()=>{
 const h=harness();let failed,recovered;
 const old=h.queue.subscribe(h.input(),value=>failed=value);h.flush();h.requests[0].reject(new ApiError(0));await tick();
 assert.equal(failed.retryOnReconnect,true);assert.equal(failed.retryAt,5000);
 const one=h.queue.subscribe(h.input(),value=>recovered=value,true),two=h.queue.subscribe(h.input(),()=>{},true);h.flush();assert.equal(h.requests.length,2);
 h.resolve(1);await tick();assert.equal(recovered.status,'ready');old();one();two();
 const auth=h.queue.subscribe(h.input('Private'),value=>failed=value);h.flush();h.requests[2].reject(new ApiError(401));await tick();
 assert.equal(failed.retryAt,undefined);h.queue.subscribe(h.input('Private'),()=>{},true);h.flush();assert.equal(h.requests.length,3);auth();h.queue.clear();
});

test('scrolling away and back reuses a paid in-flight translation and its completed session cache',async()=>{
 const h=harness();let result;
 const stop=h.queue.subscribe(h.input('A visible answer'),()=>assert.fail('unmounted row updated'));h.flush();stop();
 assert.equal(h.requests[0].signal.aborted,false);
 const back=h.queue.subscribe(h.input('A visible answer'),value=>result=value);h.flush();assert.equal(h.requests.length,1);
 h.resolve(0);await tick();assert.equal(result.text,'translated A visible answer');back();
 let cached;const again=h.queue.subscribe(h.input('A visible answer'),value=>cached=value);h.flush();
 assert.equal(h.requests.length,1);assert.equal(cached.text,result.text);again();h.queue.clear();
});

test('a quota response pauses every queued row until the shared cooldown instead of sending more failing batches',async()=>{
 const h=harness(),results=[],stops=[];
 for(let i=0;i<19;i++)stops.push(h.queue.subscribe(h.input(`Reply ${i}`),value=>results[i]=value));
 h.flush();assert.equal(h.requests.length,2);
 h.requests[0].reject(new ApiError(429));h.resolve(1);await tick();h.flush();
 assert.equal(h.requests.length,2);assert.equal(results[0].retryAt,60000);assert.equal(results[0].retryOnReconnect,false);
 h.advance(59999);h.flush();assert.equal(h.requests.length,2);
 h.advance(1);h.flush();assert.equal(h.requests.length,4);
 h.resolve(2);h.resolve(3);await tick();assert.ok(results.slice(12).every(result=>result.status==='ready'));
 stops.forEach(stop=>stop());h.queue.clear();
});

test('provider Retry-After delays all queued/retried rows and reconnect cannot force them to consume quota early',async()=>{
 const h=harness();let result;
 h.queue.subscribe(h.input('Reply'),value=>result=value);h.flush();
 h.requests[0].reject(new ApiError(429,{retryAfterSeconds:90}));await tick();
 assert.equal(result.retryAt,90000);assert.equal(result.retryOnReconnect,false);
 h.queue.subscribe(h.input('Reply'),value=>result=value,true);
 h.queue.subscribe(h.input('New reply'),()=>{});h.flush();assert.equal(h.requests.length,1);
 h.advance(89999);h.flush();assert.equal(h.requests.length,1);
 h.advance(1);h.flush();assert.equal(h.requests.length,2);assert.equal(h.requests[1].items.length,2);
 h.resolve(1);await tick();assert.equal(result.status,'ready');h.queue.clear();
 for(const retryAfterSeconds of [-1,0,'1',NaN,Infinity,86401]){
  const malformed=harness();let fallback;
  malformed.queue.subscribe(malformed.input(),value=>fallback=value);malformed.flush();
  malformed.requests[0].reject(new ApiError(429,{retryAfterSeconds}));await tick();
  assert.equal(fallback.retryAt,60000);malformed.queue.clear();
 }
});
