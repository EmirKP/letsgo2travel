import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const copy=value=>JSON.parse(JSON.stringify(value));
function load(path,imports={},globals={}){
 const fixtureModule={exports:{}};
 const code=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Request,Response,URL,URLSearchParams,Buffer,Uint8Array,Map,Set,Date,AbortSignal,AbortController,...globals})(name=>{if(name in imports)return imports[name];if(name.endsWith('.css'))return{};throw Error(`Missing import ${name}`);},fixtureModule,fixtureModule.exports);
 return fixtureModule.exports;
}
const safety=load('lib/community/safety.ts');
const signed=async(_db,items)=>new Map(items.filter(item=>typeof item.avatarPath==='string'&&item.avatarPath.startsWith(item.userId+'/')).map(item=>[item.userId,'https://project.example/signed-avatar']));
function source(fetch=async()=>{throw Error('Unexpected provider request');},env={}){
 return load('lib/event-community.ts',{'./community/safety':safety,'./community/profiles':{signedCommunityAvatars:signed},'./zoned-time':{validTimeZone:value=>value==='Europe/Istanbul',zonedParts:()=>({date:'2026-11-01',time:'20:00:00'})}},{fetch,process:{env}});
}
const feature=source();
test('canonical keys reject paths, arbitrary URLs and forged providers; parser allowlists fields and text bounds',()=>{
 assert.equal(feature.canonicalEventKey(a),`curated:${a}`);
 for(const input of ['https://evil.example','ticketmaster:../../private','curated:no','unknown:any','ticketmaster:',`predicthq:${'a'.repeat(161)}`]) assert.equal(feature.canonicalEventKey(input),null);
 assert.equal(feature.canonicalEventKey('ticketmaster:real-id'),'ticketmaster:real-id');
 assert.deepEqual(copy(feature.parseEventCommunityAction({action:'join',userId:b,snapshot:{title:'forged'}})),{action:'join',input:{}});
 assert.equal(feature.parseEventCommunityAction({action:'message',body:'x'.repeat(1001),requestId:a}),null);
 assert.equal(feature.parseEventCommunityAction({action:'message',body:'hi\u0000',requestId:a}),null);
 assert.equal(feature.parseEventCommunityAction({action:'message',body:'valid',requestId:'fake'}),null);
 assert.equal(feature.parseEventCommunityAction({action:'report',targetType:'message',targetId:a,reason:'other',note:'bad'}),null);
 assert.equal(feature.parseEventCommunityAction({action:'meetup',startsAt:'bad',publicPlace:'Public hall'}),null);
 assert.deepEqual(copy(feature.parseEventCommunityAction({action:'mute',muted:true,userId:b})),{action:'mute',input:{muted:true}});
});

test('source lookups only fetch exact provider IDs; unavailable or mismatched source data never creates a group',async()=>{
 let url;
 const ticket=source(async(input)=>{url=String(input);return Response.json({id:'real-event',name:'Authoritative event',url:'https://tickets.example/event',dates:{timezone:'Europe/Istanbul',start:{dateTime:'2026-11-01T17:00:00Z',localDate:'2026-11-01'},status:{code:'offsale'}},_embedded:{venues:[{name:'Public hall',city:{name:'Istanbul'},country:{countryCode:'TR'}}]}});},{TICKETMASTER_API_KEY:'test-no-real-call'});
 const event=await ticket.resolveCommunityEvent({},'ticketmaster:real-event');
 assert.equal(event.title,'Authoritative event');assert.equal(event.status,'scheduled');assert.equal(event.timePrecision,'exact');
 assert.ok(url.startsWith('https://app.ticketmaster.com/discovery/v2/events/real-event.json?'));
 const missing=source(async()=>Response.json({id:'another-event',name:'wrong'}),{TICKETMASTER_API_KEY:'fake'});
 assert.equal(await missing.resolveCommunityEvent({},'ticketmaster:real-event'),null);
 await assert.rejects(feature.resolveCommunityEvent({},'ticketmaster:real-event'),/not_configured/);
 const predicthq=source(async(input)=>{url=String(input);return Response.json({results:[{id:'phq-event',title:'Provider event',start:'2026-11-01T17:00:00Z',timezone:'Europe/Istanbul',country:'TR',state:'deleted',deleted_reason:'cancelled',geo:{address:{locality:'Istanbul'}},entities:[{type:'venue',name:'Festival park'}]}]});},{PREDICTHQ_ACCESS_TOKEN:'test-no-real-call'});
 const phq=await predicthq.resolveCommunityEvent({},'predicthq:phq-event');assert.equal(phq.status,'cancelled');assert.equal(phq.city,'Istanbul');assert.equal(new URL(url).searchParams.get('id'),'phq-event');
});

test('real Events API provider namespaces resolve unchanged for Biletix/Ticketmaster, PredictHQ and curated UUID results',async()=>{
 const id='Z698xZC2Z17y1xP';
 const payload={id,name:'Biletix source event',url:'https://www.biletix.com/etkinlik/example/TURKIYE/tr',dates:{timezone:'Europe/Istanbul',start:{dateTime:'2026-11-01T17:00:00Z',localDate:'2026-11-01'},status:{code:'onsale'}},_embedded:{venues:[{name:'Public Hall',city:{name:'Istanbul'},country:{countryCode:'TR'}}]}};
 const zoned={'./zoned-time':{validTimeZone:value=>value==='Europe/Istanbul',zonedParts:()=>({date:'2026-11-01',time:'20:00:00'})}};
 const curated={id:a,title:'Curated event',starts_at:'2026-11-01T17:00:00Z',city:'Istanbul',venue:'Hall',country_code:'TR',status:'scheduled',source_url:'https://official.example/event'};
 const fetch=async url=>Response.json(String(url).includes(`/events/${id}.json`)?payload:{_embedded:{events:[payload]}});
 const current=load('lib/travel-events.ts',{'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>null},...zoned},{fetch,process:{env:{TICKETMASTER_API_KEY:'mock-only'}}});
 const [listed]=await current.ticketmasterEvents({countryCode:'TR',startDate:'2026-11-01',endDate:'2026-11-02',limit:10});
 assert.equal(listed.id,`ticketmaster:${id}`);assert.equal(feature.canonicalEventKey(listed.id),listed.id);
 const verified=await source(fetch,{TICKETMASTER_API_KEY:'mock-only'}).resolveCommunityEvent({},listed.id);
 assert.equal(verified.id,listed.id);assert.equal(verified.title,listed.title);assert.equal(verified.startsAt,listed.startsAt);assert.equal(verified.sourceUrl,listed.sourceUrl);
 const filters=[];const query={select:()=>query,eq:(column,value)=>{filters.push([column,value]);return query;},maybeSingle:async()=>({data:curated})};
 const db={from:table=>{assert.equal(table,'travel_events');return query;}};
 const resolved=await feature.resolveCommunityEvent(db,feature.canonicalEventKey(a));assert.equal(resolved.id,a);assert.equal(resolved.title,curated.title);assert.deepEqual(filters,[['id',a],['published',true]]);
 const phqId='hgEJ7DGYkqZ55j6rJK';assert.equal(feature.canonicalEventKey(`predicthq:${phqId}`),`predicthq:${phqId}`);
 const phqPayload={id:phqId,title:'PredictHQ source event',start:'2026-11-01T17:00:00Z',timezone:'Europe/Istanbul',country:'TR',state:'active',geo:{address:{locality:'Istanbul'}},entities:[{type:'venue',name:'Festival Park'}]};
 const phqFetch=async()=>Response.json({results:[phqPayload]});
 const phqCurrent=load('lib/travel-events.ts',{'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>null},...zoned},{fetch:phqFetch,process:{env:{PREDICTHQ_ACCESS_TOKEN:'mock-only'}}});
 const [phqListed]=await phqCurrent.predictHqEvents({countryCode:'TR',city:'Istanbul',startDate:'2026-11-01',endDate:'2026-11-02',limit:10});
 const phqVerified=await source(phqFetch,{PREDICTHQ_ACCESS_TOKEN:'mock-only'}).resolveCommunityEvent({},phqListed.id);
 assert.equal(phqVerified.id,phqListed.id);assert.equal(phqVerified.startsAt,phqListed.startsAt);assert.equal(phqVerified.sourceUrl,phqListed.sourceUrl);
});

test('serializing attendees/messages/meetup uses public identities and strips unsigned avatar paths',async()=>{
 const person={key:`user:${a}`,userId:a,username:'alice',avatarPath:`${a}/${b}.jpg`,email:'private@example.com'};
 const serialized=await feature.serializeEventCommunity({}, {attendees:[person],messages:[{id:b,body:'Hello',createdAt:'2026-11-01',author:person}],meetup:{id:a,creator:person,attendees:[person]}});
 assert.equal(serialized.attendees[0].avatarUrl,'https://project.example/signed-avatar');
 for(const forbidden of ['avatarPath','email','private@example.com'])assert.ok(!JSON.stringify(serialized).includes(forbidden));
 assert.equal(serialized.meetup.attendees[0].key,`user:${a}`);
 const orphan=await feature.serializeEventCommunity({}, {attendees:[],messages:[],meetup:{id:a,creator:null,attendees:[]}});
 assert.equal(orphan.meetup,null,'An unavailable public creator cannot crash the meetup UI');
});

function harness({userId=a,rpcError=null,existing={checked_at:new Date().toISOString()},snapshot={id:'ticketmaster:real',title:'Verified',startsAt:'2026-11-01',status:'scheduled'},data={eventKey:'ticketmaster:real',joined:true,attendees:[],messages:[],meetup:null}}={}){
 const calls=[];let resolutions=0;
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:existing})})})}),rpc:async(name,args)=>{calls.push({name,args});return{data:name==='event_community_list'?[]:name==='event_community_sync'?null:name==='event_community_action'?{success:true}:data,error:rpcError};}};
 const route=load('app/api/event-community/route.ts',{'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},'@/lib/authenticated-user':{requireAuthenticatedUser:async()=>userId?{ok:true,user:{id:userId},supabase:db}:{ok:false,response:Response.json({error:'Sign in'},{status:401})}},'@/lib/event-community':{...feature,resolveCommunityEvent:async()=>{resolutions++;if(snapshot instanceof Error)throw snapshot;return snapshot;},serializeEventCommunity:async(_db,input)=>input},'@/lib/community/safety':safety,'@/lib/community/social':{readSocialJson:async request=>{if(Number(request.headers.get('content-length'))>10000)return null;return request.json().catch(()=>null);}},'@/lib/community/moderation':load('lib/community/moderation.ts')});
 return{route,calls,resolutions:()=>resolutions};
}
const request=(body)=>new Request('https://example.com/api/event-community',{method:'POST',body:JSON.stringify(body)});

test('API requires auth, never trusts actor/snapshot, and fresh RSVP revalidates the authoritative source',async()=>{
 const guest=harness({userId:null});assert.equal((await guest.route.GET(new Request('https://example.com'))).status,401);assert.equal((await guest.route.POST(request({eventId:'ticketmaster:real',action:'join'}))).status,401);
 const h=harness();const result=await h.route.POST(request({eventId:'ticketmaster:real',action:'join',userId:b,snapshot:{title:'fake'}}));
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.equal(h.resolutions(),1);assert.equal(h.calls[0].name,'event_community_sync');assert.equal(h.calls[0].args.p_snapshot.title,'Verified');
 assert.deepEqual(copy(h.calls[1]),{name:'event_community_action',args:{p_user:a,p_key:'ticketmaster:real',p_action:'join',p_input:{}}});
 assert.equal((await h.route.POST(request({eventId:'https://evil.example',action:'join'}))).status,400);
 assert.equal((await h.route.POST(request({eventId:'ticketmaster:real',action:'message',requestId:a,body:'fuck you'}))).status,400);
});

test('provider outage keeps existing chat readable, does not invent a change or permit a fresh RSVP',async()=>{
 const h=harness({existing:{checked_at:'2020-01-01'},snapshot:Error('offline')});
 const response=await h.route.GET(new Request('https://example.com?eventId=ticketmaster:real'));
 assert.equal(response.status,200);assert.equal((await response.json()).verification,'unavailable');
 assert.equal(h.calls.some(call=>call.name==='event_community_sync'),false);
 assert.equal((await h.route.POST(request({eventId:'ticketmaster:real',action:'join'}))).status,503);
 const fresh=harness({existing:null,snapshot:Error('offline')});assert.equal((await fresh.route.GET(new Request('https://example.com?eventId=ticketmaster:real'))).status,503);
});

test('API validates cursor pairs, binds member reads and maps authorization/rate errors truthfully',async()=>{
 const h=harness();assert.equal((await h.route.GET(new Request('https://example.com?eventId=ticketmaster:real&before=bad'))).status,400);
 const get=await h.route.GET(new Request(`https://example.com?eventId=ticketmaster:real&before=2026-01-01&beforeId=${b}&userId=${b}`));assert.equal(get.status,200);assert.equal(h.calls[0].args.p_user,a);assert.equal(h.calls[0].args.p_before_id,b);
 for(const [code,status] of [['42501',403],['54000',429],['23505',409],['22023',400],['P0002',404],['42P01',503]]){
  const error=harness({rpcError:{code}});assert.equal((await error.route.POST(request({eventId:'ticketmaster:real',action:'mute',muted:true}))).status,status);
 }
});

function activityHooks({ commit } = {}){
 const slots=[];let cursor=0,dirty=false,effects=[],component,props;
 const changed=(a,b)=>!a||!b||a.length!==b.length||b.some((v,i)=>!Object.is(v,a[i]));
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;};
 return{react:{useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},useRef(initial){const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},useId:()=>memo(()=>`test-id-${cursor}`,[]),useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||changed(old.deps,deps)){slots[i]={...old,deps,effect:fn};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}else slots[i].effect=fn;}},start(fn,initial){component=fn;props=initial;return this.render();},render(next){props={...props,...next};for(let n=0;n<15;n++){cursor=0;dirty=false;effects=[];const tree=component(props);commit?.(tree);effects.forEach(fn=>fn());if(!dirty)return tree;}throw Error('Unstable activity render');},hide(){slots.forEach(slot=>slot?.cleanup?.());},show(){slots.forEach(slot=>{if(slot?.effect)slot.cleanup=slot.effect();});return this.render();},dispose(){this.hide();}};
}
const uiNodes=tree=>tree&&typeof tree==='object'?[tree,...[tree.props?.children].flat(Infinity).flatMap(uiNodes)]:[];
const uiText=tree=>Array.isArray(tree)?tree.map(uiText).join(''):typeof tree==='string'||typeof tree==='number'?String(tree):tree?.props?uiText(tree.props.children):'';
const uiTick=()=>new Promise(resolve=>setImmediate(resolve));
test('chat Activity pause stops polling and a hidden successful write clears busy/draft only when the same owner returns',async()=>{
 const host=activityHooks(),timers=new Map();let timer=0,resolveWrite,reads=0;
 const state={eventKey:'ticketmaster:real',event:{title:'Real event',status:'scheduled',startsAt:'2026-11-01'},joined:true,muted:false,memberCount:1,attendees:[],messages:[],nextBefore:null,meetup:null};
 const jsx=(type,props)=>({type,props});const i18n={copy:(_tr,en)=>en,dateLocale:'en-GB',locale:'en'};
 const panel=load('mobile/src/components/EventCompanionsPanel.tsx',{'react':host.react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Sheet':{Sheet:'Sheet'},'./CommunityAvatar':{CommunityAvatar:'Avatar'},'./Icon':{Icon:'Icon'},'./CommunitySafetySheet':{CommunityBlocksSheet:'Blocks'},'../lib/i18n':{useI18n:()=>i18n},'../lib/api':{ApiError:class extends Error{}},'../lib/id':{createId:()=>b},'../hooks/useCurrentTime':{useCurrentTime:()=>Date.parse('2026-10-24')},'../lib/localeFormatting':{formatAppDate:date=>date.toISOString()},'../lib/eventCommunity':{getEventCommunity:async()=>{reads++;return{data:copy(state),verification:'current'};},actOnEventCommunity:()=>new Promise(resolve=>{resolveWrite=resolve;})}},{window:{setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id)},document:{visibilityState:'visible'}});
 const wrapper=panel.EventCompanionsPanel({event:{id:'ticketmaster:real',title:'Real event'},ownerId:a,accessToken:'token',onOpenAccount(){},onNotice(){}});
 try{
  host.start(wrapper.type,wrapper.props);await uiTick();let view=host.render();
  uiNodes(view).find(node=>node.type==='button'&&uiText(node)==='Event group chat').props.onClick();view=host.render();assert.equal(timers.size,1);
  const textarea=uiNodes(view).find(node=>node.type==='textarea');textarea.props.onChange({target:{value:'Hello from my trip'}});view=host.render();
  uiNodes(view).find(node=>node.type==='form'&&node.props.className==='event-chat-compose').props.onSubmit({preventDefault(){}});view=host.render();assert.equal(uiNodes(view).find(node=>node.type==='textarea').props.disabled,true);
  host.hide();assert.equal(timers.size,0);resolveWrite({success:true});await uiTick();
  view=host.show();await uiTick();view=host.render();const restored=uiNodes(view).find(node=>node.type==='textarea');assert.equal(restored.props.disabled,false);assert.equal(restored.props.value,'');assert.equal(timers.size,1);assert.ok(reads>=2);
 }finally{host.dispose();assert.equal(timers.size,0);}
});

test('joined-chat refresh ignores an obsolete membership response and detaches reads while Activity is hidden',async()=>{
 const host=activityHooks(),pending=[],listeners=new Map();const jsx=(type,props)=>({type,props});
 const panel=load('mobile/src/components/EventCompanionsPanel.tsx',{'react':host.react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Sheet':{Sheet:'Sheet'},'./CommunityAvatar':{CommunityAvatar:'Avatar'},'./Icon':{Icon:'Icon'},'./CommunitySafetySheet':{CommunityBlocksSheet:'Blocks'},'../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,locale:'en'})},'../lib/api':{},'../lib/id':{},'../hooks/useCurrentTime':{},'../lib/localeFormatting':{},'../lib/eventCommunity':{listJoinedEventChats:()=>new Promise(resolve=>pending.push(resolve))}},{window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}});
 const wrapper=panel.JoinedEventChats({ownerId:a,accessToken:'token',onOpenAccount(){},onNotice(){}});
 const stale={eventKey:'ticketmaster:old',event:{title:'Withdrawn event',startsAt:'2026-11-01',city:'Istanbul'},memberCount:2,muted:false};
 try{
  host.start(wrapper.type,wrapper.props);assert.equal(pending.length,1);listeners.get('focus')();assert.equal(pending.length,2);
  pending[1]({data:[]});await uiTick();host.render();pending[0]({data:[stale]});await uiTick();let view=host.render();assert.ok(!uiText(view).includes('Withdrawn event'));assert.match(uiText(view),/Chats for events you RSVP to appear here/);
  uiNodes(view).find(node=>node.type==='button'&&uiText(node)==='Refresh').props.onClick();assert.equal(pending.length,3);
  host.hide();assert.equal(listeners.size,0);pending[2]({data:[stale]});await uiTick();host.show();pending[3]({data:[]});await uiTick();view=host.render();assert.ok(!uiText(view).includes('Withdrawn event'));
 }finally{host.dispose();assert.equal(listeners.size,0);}
});

function joinedChatHarness(){
 const host=activityHooks(),pending=[],listeners=new Map();let signIns=0;
 class ApiError extends Error{constructor(status){super('Request failed');this.status=status;}}
 const jsx=(type,props)=>({type,props});
 const panel=load('mobile/src/components/EventCompanionsPanel.tsx',{'react':host.react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Sheet':{Sheet:'Sheet'},'./CommunityAvatar':{CommunityAvatar:'Avatar'},'./Icon':{Icon:'Icon'},'./CommunitySafetySheet':{CommunityBlocksSheet:'Blocks'},'../lib/i18n':{useI18n:()=>({copy:(_tr,en)=>en,locale:'en'})},'../lib/api':{ApiError},'../lib/id':{},'../hooks/useCurrentTime':{},'../lib/localeFormatting':{},'../lib/eventCommunity':{listJoinedEventChats:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}},{window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}});
 const wrapper=panel.JoinedEventChats({ownerId:a,accessToken:'token',onOpenAccount(){signIns++;},onNotice(){}});
 host.start(wrapper.type,wrapper.props);
 return{host,pending,listeners,ApiError,signIns:()=>signIns,refresh(){const view=host.render();uiNodes(view).find(node=>node.type==='button'&&uiText(node)==='Refresh').props.onClick();return host.render();}};
}
const joinedChat={eventKey:'ticketmaster:joined',event:{title:'My joined concert',startsAt:'2026-11-01',city:'Istanbul'},memberCount:2,muted:false};

test('joined-chat expired session offers sign-in, does not show an empty membership claim, and retries successfully',async()=>{
 const h=joinedChatHarness();
 try{
  h.pending[0].reject(new h.ApiError(401));await uiTick();let view=h.host.render();
  assert.match(uiText(view),/Your session has expired/);assert.doesNotMatch(uiText(view),/Chats for events you RSVP to appear here|Event chats are unavailable/);
  uiNodes(view).find(node=>node.type==='button'&&uiText(node)==='Sign in').props.onClick();assert.equal(h.signIns(),1);
  h.refresh();h.pending[1].resolve({data:[joinedChat]});await uiTick();view=h.host.render();
  assert.match(uiText(view),/My joined concert/);assert.doesNotMatch(uiText(view),/Your session has expired/);
 }finally{h.host.dispose();}
});

test('joined-chat initial server or network failure stays honest and never claims there are no memberships',async()=>{
 for(const status of [503,0]){
  const h=joinedChatHarness();
  try{
   h.pending[0].reject(new h.ApiError(status));await uiTick();let view=h.host.render();
   assert.match(uiText(view),/Event chats are unavailable right now\. Please retry/);
   assert.doesNotMatch(uiText(view),/Chats for events you RSVP to appear here|last loaded chats|Sign in/);
   h.refresh();h.pending[1].resolve({data:[]});await uiTick();view=h.host.render();
   assert.match(uiText(view),/Chats for events you RSVP to appear here/);assert.doesNotMatch(uiText(view),/unavailable/);
  }finally{h.host.dispose();}
 }
});

test('joined-chat refresh outage preserves usable last-loaded chats and clears its warning after recovery',async()=>{
 const h=joinedChatHarness();
 try{
  h.pending[0].resolve({data:[joinedChat]});await uiTick();h.host.render();
  h.refresh();h.pending[1].reject(new h.ApiError(503));await uiTick();let view=h.host.render();
  assert.match(uiText(view),/Could not refresh your chat list\. Your last loaded chats are shown/);assert.match(uiText(view),/My joined concert/);
  const chatButton=uiNodes(view).find(node=>node.type==='button'&&uiText(node).includes('My joined concert'));assert.equal(chatButton.props.disabled,undefined);
  chatButton.props.onClick();view=h.host.render();assert.equal(uiNodes(view).find(node=>node.type==='Sheet').props.open,true);
  const direct=uiNodes(view).find(node=>node.type?.name==='EventCompanionsPanel');assert.equal(direct.props.initialChatOpen,true);assert.equal(direct.props.event.id,joinedChat.eventKey);
  direct.props.onChatClose();view=h.host.render();assert.equal(uiNodes(view).find(node=>node.type==='Sheet').props.open,false,'Closing the direct conversation also closes its loading shell');
  h.refresh();h.pending[2].resolve({data:[]});await uiTick();view=h.host.render();
  assert.doesNotMatch(uiText(view),/last loaded chats|My joined concert/);assert.match(uiText(view),/Chats for events you RSVP to appear here/);
 }finally{h.host.dispose();}
});

test('obsolete or hidden joined-chat errors cannot replace a newer successful response',async()=>{
 const h=joinedChatHarness();
 try{
  h.listeners.get('focus')();h.pending[1].resolve({data:[joinedChat]});await uiTick();h.host.render();
  h.pending[0].reject(new h.ApiError(401));await uiTick();let view=h.host.render();assert.match(uiText(view),/My joined concert/);assert.doesNotMatch(uiText(view),/session has expired/);
  h.refresh();h.host.hide();h.pending[2].reject(new h.ApiError(503));await uiTick();h.host.show();
  h.pending[3].resolve({data:[joinedChat]});await uiTick();view=h.host.render();assert.match(uiText(view),/My joined concert/);assert.doesNotMatch(uiText(view),/Could not refresh|unavailable/);
 }finally{h.host.dispose();}
});

const dmAlice={key:`user:${a}`,userId:a,username:'alice',avatarUrl:null};
const dmBob={key:`user:${b}`,userId:b,username:'bob',avatarUrl:null};
const dmMessage=(id,author,body,minute=0)=>({id,author,body,createdAt:`2026-11-01T17:${String(minute).padStart(2,'0')}:00Z`});
function dmHarness({ messages=[dmMessage('own',dmAlice,'My travel plan'),dmMessage('other',dmBob,'Meet at the public entrance',1)], nextBefore=null, write, history=[], historyRead, initialChatOpen=false, onChatClose, locale='en' }={}){
 const thread={scrollTop:0,clientHeight:300,scrollHeight:1000},input={style:{},scrollHeight:24};
 let server={eventKey:'ticketmaster:real',event:{id:'ticketmaster:real',title:'Real event',startsAt:'2026-11-01T17:00:00Z',timeZone:null,status:'scheduled'},joined:true,muted:false,memberCount:2,attendees:[dmAlice,dmBob],messages:copy(messages),nextBefore,meetup:null};
 const host=activityHooks({commit(tree){for(const node of uiNodes(tree)){if(node.props?.className==='event-chat-thread')node.props.ref.current=thread;if(node.type==='textarea'&&node.props.ref)node.props.ref.current=input;}}});
 const timers=new Map(),writes=[],profiles=[],reads=[];let timer=0,sequence=0,readError=null,signIns=0;
 const jsx=(type,props)=>({type,props}),i18n={copy:(tr,en,sq)=>locale==='tr'?tr:locale==='sq'?(sq||en):en,dateLocale:locale==='tr'?'tr-TR':'en-GB',locale};
 class ApiError extends Error{constructor(status,message='Request failed',code=''){super(message);this.status=status;this.code=code;}}
 const panel=load('mobile/src/components/EventCompanionsPanel.tsx',{'react':host.react,'react/jsx-runtime':{jsx,jsxs:jsx},'./Sheet':{Sheet:'Sheet'},'./CommunityAvatar':{CommunityAvatar:'Avatar'},'./Icon':{Icon:'Icon'},'./CommunitySafetySheet':{CommunityBlocksSheet:'Blocks'},'../lib/i18n':{useI18n:()=>i18n},'../lib/api':{ApiError},'../lib/id':{createId:()=>`10000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},'../hooks/useCurrentTime':{useCurrentTime:()=>Date.parse('2026-10-24')},'../lib/localeFormatting':{formatAppDate:(date,locale,options)=>new Intl.DateTimeFormat(locale,options).format(date)},'../lib/eventCommunity':{
  getEventCommunity:async(_event,_token,_signal,cursor)=>{reads.push({cursor});if(readError)throw readError;if(cursor&&historyRead)await historyRead();return{data:copy(cursor?{...server,messages:history,nextBefore:null}:server),verification:'current'};},
  actOnEventCommunity:async(_event,_token,action)=>{writes.push(copy(action));if(write)return write(action);if(action.action==='mute')server={...server,muted:action.muted};if(action.action==='message')server={...server,messages:[...server.messages,dmMessage(`new-${sequence}`,dmAlice,action.body,2)]};return{success:true};},
 }},{window:{setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id)},document:{visibilityState:'visible'}});
 const wrapper=panel.EventCompanionsPanel({event:{id:'ticketmaster:real',title:'Real event'},ownerId:a,accessToken:'token',initialChatOpen,onChatClose,onOpenAccount(){signIns++;},onNotice(){},onOpenProfile:key=>profiles.push(key)});
 host.start(wrapper.type,wrapper.props);
 const render=()=>host.render();
 const button=(name,tree=render())=>uiNodes(tree).find(node=>node.type==='button'&&(node.props['aria-label']===name||uiText(node)===name));
 const header=()=>uiNodes(render()).find(node=>node.type==='Sheet'&&node.props.className==='event-chat-sheet').props.renderHeader(()=>{});
 return{host,thread,input,timers,writes,profiles,reads,render,button,header,ApiError,signIns:()=>signIns,setReadError(value){readError=value;},async ready(){await uiTick();render();},open(){button('Event group chat').props.onClick();return render();},info(){button('Chat details',header()).props.onClick();return render();},type(value){uiNodes(render()).find(node=>node.type==='textarea').props.onChange({target:{value}});return render();},submit(){uiNodes(render()).find(node=>node.type==='form'&&node.props.className==='event-chat-compose').props.onSubmit({preventDefault(){}});return render();},async settle(){await uiTick();return render();},async poll(){[...timers.values()][0]?.();return this.settle();},setServer(next){server={...server,...next};},dispose(){host.dispose();}};
}

test('An expired open chat offers sign-in, conceals unavailable membership and restores its unsent draft after token refresh',async()=>{
 const h=dmHarness();
 try{
  await h.ready();h.open();h.type('Keep my unsent message');
  h.setReadError(new h.ApiError(401));let view=await h.poll();
  assert.match(uiText(view),/Your session has expired/);
  assert.equal(uiNodes(view).find(node=>node.props?.className==='event-chat-sheet').props.open,false);
  assert.doesNotMatch(uiText(view),/Meet at the public entrance|Event chat is unavailable right now/);
  h.button('Sign in',view).props.onClick();assert.equal(h.signIns(),1);
  h.setReadError(null);h.host.render({accessToken:'refreshed-token'});view=await h.settle();
  assert.equal(uiNodes(view).find(node=>node.props?.className==='event-chat-sheet').props.open,true);
  assert.equal(uiNodes(view).find(node=>node.type==='textarea').props.value,'Keep my unsent message');
  assert.doesNotMatch(uiText(view),/session has expired/);
 }finally{h.dispose();}
});

test('A chat send rejected by an expired session offers sign-in and keeps the draft and idempotency key for recovery',async()=>{
 let writeError;const h=dmHarness({write:async()=>{if(writeError)throw writeError;return{success:true};}});
 try{
  await h.ready();h.open();h.type('Do not lose this reply');writeError=new h.ApiError(401);
  h.submit();let view=await h.settle();assert.match(uiText(view),/Your session has expired/);
  h.button('Sign in',view).props.onClick();assert.equal(h.signIns(),1);
  writeError=null;h.host.render({accessToken:'refreshed-token'});view=await h.settle();
  assert.equal(uiNodes(view).find(node=>node.type==='textarea').props.value,'Do not lose this reply');
  h.submit();await h.settle();assert.equal(h.writes.length,2);assert.equal(h.writes[0].requestId,h.writes[1].requestId);
 }finally{h.dispose();}
});

for(const status of [0,502,503])test(`Turkish chat connection failure ${status} offers human recovery instead of raw infrastructure errors`,async()=>{
 const h=dmHarness({locale:'tr',initialChatOpen:true});
 try{
  await h.ready();h.setReadError(new h.ApiError(status,`Sunucu hatası (${status})`));const view=await h.poll();
  assert.match(uiText(view),/Etkinlik sohbetine şu anda bağlanılamıyor/);
  assert.doesNotMatch(uiText(view),/Sunucu hatası|Oturumun sona erdi/);
  assert.ok(h.button('Tekrar dene',view));
  h.setReadError(null);h.button('Tekrar dene',view).props.onClick();const recovered=await h.settle();
  assert.doesNotMatch(uiText(recovered),/şu anda bağlanılamıyor/);assert.match(uiText(recovered),/Meet at the public entrance/);
 }finally{h.dispose();}
});

test('DM messages distinguish own and other profiles while retaining report and block actions',async()=>{
 const h=dmHarness();
 try{
  await h.ready();let view=h.open();
  const own=uiNodes(view).find(node=>node.props?.className==='event-chat-message own');
  const other=uiNodes(view).find(node=>node.props?.className==='event-chat-message');
  assert.match(uiText(own),/My travel plan/);assert.equal(uiNodes(own).filter(node=>node.props?.className==='event-message-avatar').length,0);
  assert.match(uiText(other),/@bob/);assert.equal(uiNodes(other).filter(node=>node.props?.className==='event-message-avatar').length,1);
  uiNodes(other).find(node=>node.props?.className==='event-message-avatar').props.onClick();assert.deepEqual(h.profiles,[dmBob.key]);
  h.button('Message options',other).props.onClick();view=h.render();
  const safety=uiNodes(view).find(node=>node.props?.className==='event-chat-safety');assert.match(uiText(safety),/Report content|Block user/);
  assert.doesNotMatch(uiText(view),/Seen|Typing|Read receipt/,'The backend does not supply these states');
 }finally{h.dispose();}
});

test('A joined-chat entry opens the actual conversation directly after loading and closes its parent on Back',async()=>{
 let closed=0;const h=dmHarness({initialChatOpen:true,onChatClose:()=>closed++});
 try{
  await h.ready();let view=h.render();const chat=uiNodes(view).find(n=>n.type==='Sheet'&&n.props.className==='event-chat-sheet');assert.equal(chat.props.open,true);assert.match(uiText(chat),/Meet at the public entrance/);assert.equal(h.timers.size,1);
  chat.props.onClose();view=h.render();assert.equal(closed,1);assert.equal(uiNodes(view).find(n=>n.type==='Sheet'&&n.props.className==='event-chat-sheet').props.open,false);assert.equal(h.timers.size,0);
 }finally{h.dispose();}
});

test('DM details stay collapsed until requested and preserve participant, mute, meetup and block controls',async()=>{
 const h=dmHarness();
 try{
  await h.ready();let view=h.open();assert.equal(uiNodes(view).some(node=>node.props?.className==='event-chat-details'),false);
  view=h.info();const details=uiNodes(view).find(node=>node.props?.className==='event-chat-details');
  assert.match(uiText(details),/@alice|@bob/);assert.ok(h.button('Set a meeting time and place',details));assert.ok(h.button('Blocked accounts',details));
  h.button('Mute',details).props.onClick();view=await h.settle();assert.deepEqual(h.writes[0],{action:'mute',muted:true});assert.ok(h.button('Unmute',view));assert.equal(h.timers.size,1,'Muting must not stop an open conversation');
  h.button('Unmute',view).props.onClick();view=await h.settle();assert.equal(h.timers.size,1);
  h.button('Set a meeting time and place',view).props.onClick();view=h.render();assert.ok(uiNodes(view).find(node=>node.props?.className==='event-meetup-form'));
  h.button('Blocked accounts',view).props.onClick();view=h.render();assert.equal(uiNodes(view).some(node=>node.type==='Blocks'),true);
 }finally{h.dispose();}
});

test('Muted open chat still receives new messages without changing its mute preference',async()=>{
 const h=dmHarness();
 try{
  await h.ready();h.open();h.info();h.button('Mute').props.onClick();await h.settle();
  const reads=h.reads.length;h.setServer({messages:[dmMessage('own',dmAlice,'My travel plan'),dmMessage('arrived',dmBob,'New message in muted chat',2)]});
  const view=await h.poll();assert.ok(h.reads.length>reads);assert.match(uiText(view),/New message in muted chat/);assert.ok(h.button('Unmute',view));assert.equal(h.timers.size,1);
 }finally{h.dispose();}
});

test('Loading more than 50 messages keeps polling, preserves older history, deduplicates arrivals and removes rechecked hidden messages',async()=>{
 const message=n=>({id:String(n).padStart(4,'0'),body:`Message ${n}`,createdAt:new Date(Date.UTC(2026,10,1,10,n)).toISOString(),author:dmBob});
 const recent=Array.from({length:50},(_,i)=>message(50+i)),history=Array.from({length:50},(_,i)=>message(i));
 const h=dmHarness({messages:recent,history,nextBefore:{createdAt:recent[0].createdAt,id:recent[0].id}});
 try{
  await h.ready();h.open();h.button('Earlier messages').props.onClick();let view=await h.settle();assert.equal(uiNodes(view).filter(n=>n.props?.className==='event-chat-message').length,100);assert.equal(h.timers.size,1);
  h.setServer({messages:[...recent.filter(m=>m.id!==message(80).id),message(100)],nextBefore:{createdAt:recent[0].createdAt,id:recent[0].id}});
  view=await h.poll();const rows=uiNodes(view).filter(n=>n.props?.className==='event-chat-message');assert.equal(rows.length,100);assert.match(uiText(rows[0]),/Message 0/);assert.match(uiText(rows.at(-1)),/Message 100/);assert.equal(rows.some(n=>/Message 80\b/.test(uiText(n))),false);
  view=await h.poll();assert.equal(uiNodes(view).filter(n=>n.props?.className==='event-chat-message').length,100,'Repeated refresh does not duplicate history');
 }finally{h.dispose();}
});

test('compact DM composer keeps multiline text and retries a failed send with its original request ID',async()=>{
 let reject=true;const h=dmHarness({write:async()=>{if(reject)throw Error('offline');return{success:true};}});
 try{
  await h.ready();h.open();let view=h.type('First line\nSecond line');
  const textarea=uiNodes(view).find(node=>node.type==='textarea');assert.equal(textarea.props.rows,1);assert.equal(textarea.props.onKeyDown,undefined);assert.equal(textarea.props.value,'First line\nSecond line');
  h.submit();view=await h.settle();assert.equal(uiNodes(view).find(node=>node.type==='textarea').props.value,'First line\nSecond line');assert.match(uiText(view),/unavailable right now/);
  reject=false;h.submit();view=await h.settle();assert.equal(h.writes.length,2);assert.equal(h.writes[0].requestId,h.writes[1].requestId);assert.equal(h.writes[0].body,'First line\nSecond line');assert.equal(uiNodes(view).find(node=>node.type==='textarea').props.value,'');
 }finally{h.dispose();}
});

test('DM incoming messages preserve history reading and follow updates only near the bottom',async()=>{
 const h=dmHarness();
 try{
  await h.ready();let view=h.open();assert.equal(h.thread.scrollTop,1000);
  const thread=uiNodes(view).find(node=>node.props?.className==='event-chat-thread');h.thread.scrollTop=100;thread.props.onScroll({currentTarget:h.thread});
  h.thread.scrollHeight=1100;h.setServer({messages:[dmMessage('own',dmAlice,'My travel plan'),dmMessage('other',dmBob,'Meet at the public entrance',1),dmMessage('arrived',dmBob,'New message while reading',2)]});await h.poll();assert.equal(h.thread.scrollTop,100);
  h.thread.scrollTop=800;thread.props.onScroll({currentTarget:h.thread});h.thread.scrollHeight=1200;h.setServer({messages:[dmMessage('own',dmAlice,'My travel plan'),dmMessage('other',dmBob,'Meet at the public entrance',1),dmMessage('arrived',dmBob,'New message while reading',2),dmMessage('latest',dmBob,'Near-bottom update',3)]});await h.poll();assert.equal(h.thread.scrollTop,1200);
 }finally{h.dispose();}
});

test('DM own send returns to the latest message after reading earlier history',async()=>{
 const h=dmHarness();
 try{
  await h.ready();let view=h.open();h.thread.scrollTop=100;uiNodes(view).find(node=>node.props?.className==='event-chat-thread').props.onScroll({currentTarget:h.thread});h.thread.scrollHeight=1200;
  h.type('My reply while reading');h.submit();await h.settle();assert.equal(h.thread.scrollTop,1200);
 }finally{h.dispose();}
});

test('DM loading earlier messages anchors the previously visible history instead of jumping to the latest',async()=>{
 const history=[dmMessage('older',dmBob,'Earlier conversation')];
 const h=dmHarness({nextBefore:{createdAt:'2026-11-01T17:00:00Z',id:b},history});
 try{
  await h.ready();let view=h.open();h.thread.scrollTop=80;uiNodes(view).find(node=>node.props?.className==='event-chat-thread').props.onScroll({currentTarget:h.thread});
  h.button('Earlier messages',view).props.onClick();h.thread.scrollHeight=1250;view=await h.settle();assert.equal(h.thread.scrollTop,330);assert.match(uiText(view),/Earlier conversation/);assert.equal(h.reads.some(read=>read.cursor?.id===b),true);
 }finally{h.dispose();}
});

test('DM opening group details during a history request does not discard the eventual history anchor',async()=>{
 let resolveHistory;
 const h=dmHarness({nextBefore:{createdAt:'2026-11-01T17:00:00Z',id:b},history:[dmMessage('older',dmBob,'Earlier conversation')],historyRead:()=>new Promise(resolve=>{resolveHistory=resolve;})});
 try{
  await h.ready();let view=h.open();h.thread.scrollTop=80;uiNodes(view).find(node=>node.props?.className==='event-chat-thread').props.onScroll({currentTarget:h.thread});
  h.button('Earlier messages',view).props.onClick();h.render();h.info();
  h.thread.scrollHeight=1250;resolveHistory();await h.settle();assert.equal(h.thread.scrollTop,330);
 }finally{h.dispose();}
});
