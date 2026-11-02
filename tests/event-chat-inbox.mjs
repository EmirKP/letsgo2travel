import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const owner='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
const id='20000000-0000-4000-8000-000000000001', id2='20000000-0000-4000-8000-000000000002';
const key='ticketmaster:real-concert';
const plain=value=>JSON.parse(JSON.stringify(value));
function load(path,imports={},globals={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Request,Response,URL,URLSearchParams,Date,Map,Set,Event,...globals})(name=>{if(name in imports)return imports[name];throw Error(`Unexpected import ${name}`);},mod,mod.exports);
 return mod.exports;
}
const feature=load('lib/event-community.ts',{'./community/safety':{COMMUNITY_UUID:/^[0-9a-f-]{36}$/i,COMMUNITY_REPORT_REASONS:[]},'./community/profiles':{},'./zoned-time':{}});
const incoming={id,body:'Meet at the public entrance',createdAt:'2026-11-02T10:00:00Z',author:{userId:other,username:'traveller',avatarPath:'PRIVATE_PATH',email:'PRIVATE_EMAIL'}};
const mine={id:id2,body:'See you there',createdAt:'2026-11-02T10:01:00Z',author:{userId:owner,username:'me'}};
const item={eventKey:key,event:{title:'Real concert',city:'Rome'},joinedAt:'2026-11-01T10:00:00Z',memberCount:2};

test('Inbox summaries use the authenticated member read and return only real visible message facts',async()=>{
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{eventKey:key,joined:true,messages:[mine,incoming]}};}};
 const result=await feature.joinedEventChatSummaries(db,owner,[item]);
 assert.deepEqual(plain(calls),[{name:'event_community_read',args:{p_user:owner,p_key:key,p_before:null,p_before_id:null}}]);
 assert.equal(result[0].lastMessage.id,id2);assert.equal(result[0].lastMessage.body,'See you there');assert.equal(result[0].latestIncoming.id,id);
 assert.deepEqual(Object.keys(result[0].lastMessage.author).sort(),['userId','username']);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});

test('Membership withdrawal, wrong-event reads and malformed keys never expose a cached preview',async()=>{
 for(const data of [{eventKey:key,joined:false,messages:[incoming]},{eventKey:'ticketmaster:other',joined:true,messages:[incoming]},null]){
  const result=await feature.joinedEventChatSummaries({rpc:async()=>({data})},owner,[item]);assert.deepEqual(plain(result),[]);
 }
 let calls=0;assert.deepEqual(plain(await feature.joinedEventChatSummaries({rpc:async()=>{calls++;}},owner,[{...item,eventKey:'https://evil.example/private'}])),[]);assert.equal(calls,0);
});

test('Published visible DB window is authoritative; removed/blocked messages cannot be reconstructed from older previews',async()=>{
 const db={rpc:async()=>({data:{eventKey:key,joined:true,messages:[]}})};
 const result=await feature.joinedEventChatSummaries(db,owner,[{...item,lastMessage:incoming,latestIncoming:incoming}]);
 assert.equal(result[0].summaryStatus,'available');assert.equal(result[0].lastMessage,null);assert.equal(result[0].latestIncoming,null);
});

test('Summary failures stay unavailable rather than falsely claiming an empty chat',async()=>{
 for(const rpc of [async()=>({error:{code:'unavailable'}}),async()=>{throw Error('offline');}]){
  const result=await feature.joinedEventChatSummaries({rpc},owner,[{...item,lastMessage:incoming}]);assert.equal(result[0].summaryStatus,'unavailable');assert.equal(result[0].lastMessage,null);assert.equal(result[0].latestIncoming,null);
 }
});

test('Each inbox page bounds fan-out to twelve member reads and at most four simultaneous RPCs',async()=>{
 let active=0,max=0,calls=0;
 const db={rpc:async(_name,args)=>{calls++;active++;max=Math.max(max,active);await new Promise(resolve=>setImmediate(resolve));active--;return{data:{eventKey:args.p_key,joined:true,messages:[]}};}};
 const result=await feature.joinedEventChatSummaries(db,owner,Array.from({length:100},(_,i)=>({...item,eventKey:`ticketmaster:event-${i}`})));
 assert.equal(calls,12);assert.equal(result.length,12);assert.equal(max,4);
});

function routeFixture({guest=false,items=[item]}={}) {
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='event_community_list'?items:{eventKey:args.p_key,joined:true,messages:[incoming]}};}};
 const route=load('app/api/event-community/route.ts',{'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},'@/lib/authenticated-user':{requireAuthenticatedUser:async()=>guest?{ok:false,response:Response.json({error:'sign in'},{status:401})}:{ok:true,user:{id:owner},supabase:db}},'@/lib/event-community':feature,'@/lib/community/safety':{COMMUNITY_PRIVATE_HEADERS:{'cache-control':'private, no-store'}},'@/lib/community/social':{},'@/lib/community/moderation':{}});
 return{route,calls};
}
test('Summary API preserves legacy list clients, authenticates before reading and rejects forged actor/query controls',async()=>{
 const guest=routeFixture({guest:true});assert.equal((await guest.route.GET(new Request('https://test.example/api/event-community?summaries=true&userId='+other))).status,401);assert.equal(guest.calls.length,0);
 const legacy=routeFixture();let response=await legacy.route.GET(new Request('https://test.example/api/event-community'));assert.deepEqual((await response.json()).data,[item]);assert.equal(legacy.calls.length,1);
 const current=routeFixture();response=await current.route.GET(new Request('https://test.example/api/event-community?summaries=true&userId='+other));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(current.calls.every(call=>call.args.p_user===owner));
 for(const query of ['offset=-1','offset=101','offset=1.5','q='+encodeURIComponent('x'.repeat(121)),'q=%00'])assert.equal((await current.route.GET(new Request('https://test.example/api/event-community?summaries=true&'+query))).status,400);
});

test('Chat title/city search precedes paging across all real memberships and nextOffset is truthful',async()=>{
 const items=Array.from({length:30},(_,i)=>({...item,eventKey:`ticketmaster:event-${i}`,event:{title:`Concert ${i}`,city:i===25?'Belgrade':'Rome'}}));
 const h=routeFixture({items});let response=await h.route.GET(new Request('https://test.example/api/event-community?summaries=true'));let page=await response.json();assert.equal(page.data.length,12);assert.equal(page.nextOffset,12);
 response=await h.route.GET(new Request('https://test.example/api/event-community?summaries=true&offset=24'));page=await response.json();assert.equal(page.data.length,6);assert.equal(page.nextOffset,null);
 response=await h.route.GET(new Request('https://test.example/api/event-community?summaries=true&q=belgrade'));page=await response.json();assert.equal(page.data.length,1);assert.equal(page.data[0].eventKey,'ticketmaster:event-25');assert.equal(page.nextOffset,null);
});

function inboxFixture() {
 const values=new Map(),events=[];let failRead=false,failWrite=false;
 const window={localStorage:{getItem:key=>{if(failRead)throw Error('denied');return values.get(key)??null;},setItem:(key,value)=>{if(failWrite)throw Error('denied');values.set(key,value);}},dispatchEvent:event=>events.push(event.type)};
 return{inbox:load('mobile/src/lib/eventChatInbox.ts',{}, {window}),values,events,failRead:()=>failRead=true,failWrite:()=>failWrite=true};
}
test('Read markers are isolated by account and event and persist no private message bodies',()=>{
 const {inbox,values}=inboxFixture();const chat={...item,summaryStatus:'available',latestIncoming:incoming};
 assert.equal(inbox.eventChatHasUnread(chat,owner),true);assert.equal(inbox.markEventChatRead(owner,key,incoming),true);assert.equal(inbox.eventChatHasUnread(chat,owner),false);
 assert.equal(inbox.eventChatHasUnread(chat,other),true);assert.equal(inbox.eventChatHasUnread({...chat,eventKey:'ticketmaster:other'},owner),true);
 assert.doesNotMatch(JSON.stringify([...values.values()]),/entrance|traveller|PRIVATE/);
});

test('Same-timestamp UUID order, older history, own messages and unavailable summaries do not invent unread counts',()=>{
 const {inbox}=inboxFixture();const chat={...item,summaryStatus:'available',latestIncoming:{...incoming,id:id2}};
 inbox.markEventChatRead(owner,key,incoming);assert.equal(inbox.eventChatHasUnread(chat,owner),true);
 inbox.markEventChatRead(owner,key,{...incoming,id:id2});inbox.markEventChatRead(owner,key,incoming);assert.equal(inbox.readEventChatMarker(owner,key).id,id2);
 assert.equal(inbox.eventChatHasUnread({...chat,summaryStatus:'unavailable'},owner),false);assert.equal(inbox.eventChatHasUnread({...chat,latestIncoming:null},owner),false);
 assert.equal(inbox.eventChatHasUnread({...chat,joinedAt:'2026-11-03T00:00:00Z'},other),false);
});

test('Denied storage and malformed cursors cannot crash the conversation or overwrite an unread marker',()=>{
 for(const mode of ['failRead','failWrite']){
  const h=inboxFixture();h.inbox.markEventChatRead(owner,key,incoming);const before=[...h.values.values()];h[mode]();assert.equal(h.inbox.markEventChatRead(owner,key,{...incoming,id:id2}),false);assert.deepEqual([...h.values.values()],before);
 }
 const h=inboxFixture();for(const invalid of [{id:'fake',createdAt:'2026-11-02'},{id,createdAt:'bad'}])assert.equal(h.inbox.markEventChatRead(owner,key,invalid),false);assert.equal(h.values.size,0);
});

test('Visible latest cursor is independent of loaded order and invalid rows never advance it',()=>{
 const {inbox}=inboxFixture();assert.equal(inbox.latestVisibleChatMessage([mine,{...incoming,id:'bad'},incoming]).id,id2);assert.equal(inbox.latestVisibleChatMessage([]),null);
});
