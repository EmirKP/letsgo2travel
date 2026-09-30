import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain=value=>JSON.parse(JSON.stringify(value));
function load(file,imports={}){
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const m={exports:{}};vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{URL,console:{error(){}}})(name=>{assert.ok(name in imports,`Missing ${name}`);return imports[name];},m,m.exports);return m.exports;
}
const iso=load('lib/countries/isoSource.ts',{'./iso3166.json':JSON.parse(readFileSync('lib/countries/iso3166.json','utf8'))});
const sync=load('lib/community/forum-sync.ts',{'../countries/isoSource':iso});
const safety=load('lib/community/safety.ts');
const serializers=load('lib/community/serializers.ts');
const next={NextResponse:{json:(body,init={})=>({body:plain(body),status:init.status||200,headers:new Headers(init.headers)})}};
const id='f09a2026-0930-4000-8000-000000000099';
const blocked='f09a2026-0930-4000-8000-000000000098';
const topic=(n,slug='japonya')=>({id:`f09a2026-0930-4000-8000-${String(n).padStart(12,'0')}`,country_slug:slug,title:`Topic ${n}`,content:'Travel discussion',author_name:'traveller',author_id:null,status:'published',created_at:`2026-09-${String(30-Math.floor(n/40)).padStart(2,'0')}T12:00:00Z`});
function dbFixture(topics,replies=[]){
 const calls=[];let locked=false,unlocked=false,fail=false;
 const db={calls,from(table){
  const call={table,eq:[],or:[],in:[],orders:[],range:null};calls.push(call);
  const query={select(){return query;},eq(k,v){call.eq.push([k,v]);return query;},in(k,v){call.in.push([k,v]);return query;},or(v){call.or.push(v);return query;},order(k,options){call.orders.push([k,options]);return query;},range(a,b){call.range=[a,b];return query;},maybeSingle(){call.single=true;return query;},then(resolve){
   if(fail)return Promise.resolve({data:null,error:{code:'42501'}}).then(resolve);
   let rows=(table==='forum_topics'?topics:replies).filter(row=>call.eq.every(([k,v])=>row[k]===v)&&call.in.every(([k,v])=>v.includes(row[k])));
   for(const expression of call.or){
    if(expression.includes('.not.in.')){const column=expression.split('.')[0];rows=rows.filter(row=>row[column]!==blocked);}
    if(expression.includes('title.ilike.')){const needle=expression.match(/title\.ilike\.%([^%]*)%/)[1].toLowerCase();rows=rows.filter(row=>[row.title,row.content,row.author_name].some(v=>v?.toLowerCase().includes(needle)));}
   }
   for(const [k,o] of [...call.orders].reverse())rows.sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(o.ascending?1:-1));
   const count=rows.length;if(call.range)rows=rows.slice(call.range[0],call.range[1]+1);
   return Promise.resolve({data:call.single?rows[0]||null:rows,count,error:null}).then(resolve);
  }};return query;
 },async rpc(name,args){
  if(name==='is_forum_topic_paywalled')return {data:locked,error:null};
  if(name==='has_forum_topic_unlock')return {data:unlocked,error:null};
  assert.equal(name,'get_forum_visible_reply_counts');return {data:args.p_topic_ids.map(topic_id=>({topic_id,reply_count:0})),error:null};
 }};
 return {db,setLocked:v=>locked=v,setUnlocked:v=>unlocked=v,setFail:v=>fail=v};
}
function routes(fixture,viewer={ok:true,userId:id,hiddenUserIds:[blocked]}){
 const imports={'next/server':next,'@/lib/community/viewer':{communityViewer:async()=>viewer},'@/lib/community/safety':safety,'@/lib/community/serializers':serializers,'@/lib/community/forum-sync':sync,'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>fixture.db},'@/lib/community/photos':{communityPhotoTopics:async()=>new Set()}};
 return {feed:load('app/api/country-community/feed/route.ts',imports),detail:load('app/api/country-community/questions/[id]/route.ts',imports)};
}
test('Country feed filters before its page boundary, includes legacy aliases and has no duplicate adjacent pages',async()=>{
 const all=Array.from({length:45},(_,i)=>topic(i));all.push(...Array.from({length:43},(_,i)=>topic(100+i,'turkiye')),{...topic(999,'turkiye'),author_id:blocked},{...topic(998,'turkiye'),status:'pending'});
 const fixture=dbFixture(all),{feed}=routes(fixture);
 const first=await feed.GET(new Request('https://test?countries=TR'));assert.equal(first.status,200);assert.equal(first.body.data.length,40);assert.ok(first.body.data.every(row=>row.countryCode==='TR'));assert.equal(first.body.nextOffset,40);
 const second=await feed.GET(new Request('https://test?countries=TR&offset=40'));assert.equal(second.body.data.length,3);assert.equal(second.body.nextOffset,null);assert.equal(new Set([...first.body.data,...second.body.data].map(row=>row.id)).size,43);
 assert.equal(first.headers.get('Cache-Control'),'private, no-store');
 const gb=dbFixture([topic(500,'ingiltere'),topic(501,'GB'),topic(502,'birlesik-krallik')]);assert.equal((await routes(gb).feed.GET(new Request('https://test?countries=GB'))).body.data.length,3);
});
test('Feed searches older full content before pagination and read failures do not claim an empty success',async()=>{
 const all=Array.from({length:45},(_,i)=>topic(i));all.push({...topic(900,'turkiye'),content:'x'.repeat(1000)+' ferry'});
 const fixture=dbFixture(all),{feed}=routes(fixture);const response=await feed.GET(new Request('https://test?search=ferry'));assert.equal(response.body.data.length,1);assert.equal(response.body.data[0].id,all.at(-1).id);
 fixture.setFail(true);assert.equal((await feed.GET(new Request('https://test'))).status,500);
});
test('Reply pagination exposes the 101st reply only with full access; offsets never bypass a locked preview',async()=>{
 const parent={...topic(99,'turkiye'),id};const replies=Array.from({length:101},(_,i)=>({id:`reply-${String(i).padStart(3,'0')}`,topic_id:id,user_id:null,author_name:'traveller',content:`Reply ${i}`,status:'published',created_at:'2026-09-30T12:00:00Z'}));replies.push({...replies[0],id:'blocked-reply',user_id:blocked},{...replies[0],id:'pending-reply',status:'pending'});
 const fixture=dbFixture([parent],replies),{detail}=routes(fixture),params={params:Promise.resolve({id})};
 let response=await detail.GET(new Request('https://test'),params);assert.equal(response.body.data.answers.length,100);assert.equal(response.body.data.totalAnswerCount,101);assert.equal(response.body.data.nextOffset,100);
 response=await detail.GET(new Request('https://test?offset=100'),params);assert.deepEqual(response.body.data.answers.map(row=>row.body),['Reply 100']);assert.equal(response.body.data.nextOffset,null);
 fixture.setLocked(true);response=await detail.GET(new Request('https://test?offset=100'),params);assert.deepEqual(response.body.data.answers.map(row=>row.body),['Reply 0','Reply 1']);assert.equal(response.body.data.hiddenAnswerCount,99);assert.equal(response.body.data.nextOffset,null);
 fixture.setUnlocked(true);response=await detail.GET(new Request('https://test?offset=100'),params);assert.equal(response.body.data.answers[0].body,'Reply 100');
});
test('Denied viewer never starts a service-role feed or reply query',async()=>{
 const fixture=dbFixture([]),route=routes(fixture,{ok:false,response:next.NextResponse.json({error:'Unauthorized'},{status:401})});
 assert.equal((await route.feed.GET(new Request('https://test'))).status,401);assert.equal((await route.detail.GET(new Request('https://test'),{params:Promise.resolve({id})})).status,401);assert.equal(fixture.db.calls.length,0);
});
