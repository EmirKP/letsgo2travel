import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

function existingFixture() {
  const file = 'tests/active-trip-shared-flow.mjs', require = createRequire(import.meta.url);
  let source = readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const globals = { Date, Intl, console, setImmediate };
  for (const statement of [...parsed.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const importedModule = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    if (statement.importClause?.name) globals[statement.importClause.name.text] = importedModule.default ?? importedModule;
    for (const member of statement.importClause?.namedBindings?.elements || []) globals[member.name.text] = importedModule[member.propertyName?.text || member.name.text];
    source = source.slice(0, statement.pos) + source.slice(statement.end);
  }
  const output = { exports: {} };
  const js = ts.transpileModule(`${source}\nmodule.exports={hooks,load,find,button,text,nodes,tick};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(module,exports){${js}\n})`, globals)(output, output.exports);
  return output.exports;
}
const { hooks, load, find, button, text, nodes, tick } = existingFixture();
const plain = value => JSON.parse(JSON.stringify(value));
const client = load('mobile/src/lib/sharedTripInviteClient.ts', {});

function browserClock() {
  const initial = Date.parse('2026-11-01T09:00:00Z'); let now = initial, monotonic = 100, nextTimer = 0;
  const timers = new Map(), listeners = new Set();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const document = { visibilityState: 'visible', addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn) };
  return { Date: ClockDate, performance: { now: () => monotonic }, document, window: { setInterval: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id) }, now: () => now, initial,
    advance(ms) { now += ms; monotonic += ms; for (const fn of [...timers.values()]) fn(); }, shiftWall(ms) { now += ms; for (const fn of [...timers.values()]) fn(); }, suspend(ms) { now += ms; }, visibility(value) { document.visibilityState = value; for (const fn of [...listeners]) fn(); }, timerCount: () => timers.size };
}

function hubFixture({ locale = 'en', perform, role = 'owner', listTrips, getWorkspace, remembered } = {}) {
  const h = hooks(), clock = browserClock(), actions = [], copies = [], shares = [], cleared = [], notices = [];
  let generation = 0, trips = [{ id: 'trip-a', title: 'Germany test trip', destinationCode: 'DE', destinationCountry: 'Germany', startDate: '2026-11-20', endDate: '2026-11-22', role, memberCount: 2 }];
  const language = { locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq || en : en, countryName: (_code, value) => value };
  const workspace = () => ({ trip: trips[0], myRole: role, members: [{ userId: 'owner-a', name: 'Test owner', role }], options: [], budget: { currency: 'EUR', targetAmount: 0 }, expenses: [], balances: [] });
  const action = async (_token, body) => {
    actions.push(body);
    if (perform) { const result = await perform(body, clock); if (result !== undefined) return result; }
    if (body.action === 'create_invite') { generation++; return { data: { inviteCode: String(1233 + generation).padStart(6, '0'), serverNow: new Date(clock.now() + 86_400_000).toISOString(), expiresAt: new Date(clock.now() + 86_700_000).toISOString() } }; }
    if (['delete_trip', 'leave_trip'].includes(body.action)) trips = trips.filter(trip => trip.id !== body.tripId);
    return { success: true };
  };
  const imports = { react: h.react, '../lib/localeFormatting': { formatAppDate: date => date.toISOString().slice(0, 10) }, '../lib/dates': { isCalendarDate: () => true, localIsoDate: () => '2026-11-01' }, '../lib/i18n': { useI18n: () => language },
    '../lib/sharedTripInviteClient': load('mobile/src/lib/sharedTripInviteClient.ts', {}, { Date: clock.Date, performance: clock.performance }),
    '../lib/native': { shareContent: async value => { shares.push(value); return true; } },
    '../lib/tripCollaboration': { listSharedTrips: async () => listTrips ? listTrips() : trips, getTripCollaboration: async () => getWorkspace ? getWorkspace() : workspace(), collaborationAction: action, tripInviteFromUrl: value => /^\d{6}$/.test(value) ? value : '', rememberTripInvite(value) { remembered?.(value); } },
    '../data/countries': { COUNTRY_LIST: [] }, '../data/countryIso': { alpha2FromAlpha3: () => 'DE' }, '../lib/supabaseData': { createCockpitTrip() { throw Error('Fixture must not create records'); }, getSupabaseDataErrorMessage: (_error, fallback) => fallback },
    '../lib/activeTripContext': { activeTripContextFromTrip: () => null, clearActiveTripContext: (...args) => cleared.push(args), writeActiveTripContext: () => false }, '../lib/id': { createId: () => 'fixture-only' } };
  for (const name of ['DateTimeField', 'CountryPicker', 'Icon', 'TravelToolArtwork', 'CountryFlag', 'Sheet']) imports[`./${name}`] = { [name]: name };
  const { TripCollaborationHub } = load('mobile/src/components/TripCollaborationHub.tsx', imports, { Date: clock.Date, Error, window: clock.window, document: clock.document, navigator: { clipboard: { writeText: async value => copies.push(value) } } });
  h.start(TripCollaborationHub, { accessToken: 'fixture-token', userId: 'owner-a', refreshKey: '', onNotice: value => notices.push(value) });
  return { h, clock, actions, copies, shares, cleared, notices, setLocale(value) { locale=value;language.locale=value;return h.render(); }, async open() { await tick(); const tree = h.render(); find(tree, 'button', p => p.className === 'trip-collaboration-open').props.onClick(); await tick(); return h.render(); }, async invite() { let tree = await this.open(); button(tree, client.sharedTripCopy(locale, 'invite')).props.onClick(); await tick(); return h.render(); }, async remove() { await tick(); find(h.render(), 'button', p => p.className === 'trip-collaboration-remove').props.onClick(); return h.render(); } };
}

test('The invitation uses the server clock, keeps leading zeroes and expires after five minutes', () => {
  const now = Date.parse('2026-01-01T00:00:00Z'), server = '2026-11-01T12:00:00Z';
  const invite = client.readSharedTripInvite({ inviteCode: '001234', serverNow: server, expiresAt: '2026-11-01T12:05:00Z' }, 'trip-a', now);
  assert.equal(invite.code, '001234'); assert.equal(client.sharedInviteSeconds(invite, now), 300);
  assert.equal(client.sharedInviteSeconds(invite, now + 299001), 1); assert.equal(client.sharedInviteSeconds(invite, now + 300000), 0);
  assert.equal(client.sharedInviteCountdown(300), '5:00'); assert.equal(client.sharedInviteCountdown(9), '0:09');
});
test('Malformed, expired, legacy and overlong invitation leases cannot be displayed as valid codes', () => {
  for (const patch of [{ inviteCode: 'long-legacy-token' }, { inviteCode: '12345' }, { expiresAt: '2026-11-08T12:00:00Z' }, { expiresAt: '2026-11-01T12:00:00Z' }, { serverNow: 'bad' }])
    assert.equal(client.readSharedTripInvite({ inviteCode: '001234', serverNow: '2026-11-01T12:00:00Z', expiresAt: '2026-11-01T12:05:00Z', ...patch }, 'trip-a'), null);
});
test('One invite entry reveals a short code, countdown, copy and share without exposing a long URL', async () => {
  const f = hubFixture(); try {
    const tree = await f.invite(); assert.match(text(tree), /001234/); assert.match(text(tree), /5:00/); assert.doesNotMatch(text(tree), /https:|7 days/);
    assert.equal(button(tree, 'Invite friends'), undefined); assert.equal(nodes(tree).filter(n => n.type === 'button' && text(n) === 'Share').length, 1);
    await button(tree, 'Copy').props.onClick(); await button(tree, 'Share').props.onClick();
    assert.deepEqual(f.copies, ['001234']); assert.match(f.shares[0].text, /001234/); assert.equal(f.shares[0].url, undefined);
  } finally { f.h.close(); }
});
test('A visible expired invitation hides its old code and automatically requests the next five-minute code', async () => {
  const f = hubFixture(); try {
    let tree = await f.invite(); const oldCopy = button(tree, 'Copy').props.onClick;
    f.clock.advance(300000); tree = f.h.render(); assert.doesNotMatch(text(tree), /001234/);
    await oldCopy(); assert.equal(f.copies.length, 0); await tick(); tree = f.h.render();
    assert.match(text(tree), /001235/); assert.match(text(tree), /5:00/); assert.equal(f.actions.length, 2);
    await button(tree, 'Copy').props.onClick(); assert.deepEqual(f.copies, ['001235']);
  } finally { f.h.close(); } assert.equal(f.clock.timerCount(), 0);
});
test('A hidden app makes no automatic requests; returning to it renews an expired code immediately', async () => {
  const f = hubFixture(); try {
    await f.invite(); f.clock.visibility('hidden'); f.clock.advance(301000); f.h.render(); assert.equal(f.actions.length, 1);
    f.clock.visibility('visible'); await tick(); const tree = f.h.render(); assert.equal(f.actions.length, 2); assert.match(text(tree), /001235/);
  } finally { f.h.close(); }
});
test('Moving the phone clock backward or forward does not extend or prematurely expire the five-minute lease', async () => {
  for (const jump of [-36_000_000, 36_000_000]) {
    const f = hubFixture(); try {
      await f.invite(); f.clock.shiftWall(jump); let tree = f.h.render(); assert.match(text(tree), /5:00/); assert.equal(f.actions.length, 1);
      f.clock.advance(299000); tree = f.h.render(); assert.match(text(tree), /0:01/); assert.match(text(tree), /001234/);
      f.clock.advance(1000); await tick(); tree = f.h.render(); assert.equal(f.actions.length, 2); assert.match(text(tree), /001235/);
    } finally { f.h.close(); }
  }
});
test('Resuming after iOS suspends the monotonic clock revalidates the lease against the server', async () => {
  const f = hubFixture(); try {
    await f.invite(); f.clock.visibility('hidden'); f.clock.suspend(600000); f.h.render(); assert.equal(f.actions.length, 1);
    f.clock.visibility('visible'); await tick(); const tree = f.h.render(); assert.equal(f.actions.length, 2); assert.match(text(tree), /001235/);
  } finally { f.h.close(); }
});
test('Slow invitation responses do not add their network delay to the remaining lifetime', async () => {
  let first = true; const f = hubFixture({ perform: (body, clock) => { if (body.action === 'create_invite' && first) { first = false; clock.advance(10000); } } });
  try { const tree = await f.invite(); assert.match(text(tree), /4:50/); } finally { f.h.close(); }
});
test('An automatic renewal failure keeps old codes unusable and offers one deliberate retry without a request loop', async () => {
  let requests = 0; const f = hubFixture({ perform: body => { if (body.action === 'create_invite' && ++requests === 2) throw Error('Offline fixture'); } });
  try {
    await f.invite(); f.clock.advance(300000); await tick(); let tree = f.h.render(); assert.match(text(tree), /Offline fixture/); assert.equal(button(tree, 'Copy'), undefined);
    f.clock.advance(10000); f.h.render(); assert.equal(requests, 2); await button(tree, 'Retry').props.onClick(); await tick(); tree = f.h.render(); assert.match(text(tree), /001235/);
  } finally { f.h.close(); }
});
test('The old API or an uninstalled migration produces a clear error, never a seven-day fallback link', async () => {
  for (const perform of [() => ({ data: { inviteCode: 'oldLongToken', inviteUrl: 'https://example.invalid/private' } }), () => { throw Object.assign(new Error('Migration absent'), { status: 503 }); }]) {
    const f = hubFixture({ perform }); try { const tree = await f.invite(); assert.match(text(tree), /not ready on the server/); assert.doesNotMatch(text(tree), /oldLongToken|https:/); assert.equal(button(tree, 'Copy'), undefined); } finally { f.h.close(); }
  }
});
test('Losing invite access on resume hides a previously visible code and disables copy/share', async () => {
  let requests = 0; const f = hubFixture({ perform: body => { if (body.action === 'create_invite' && ++requests > 1) throw Object.assign(new Error('Membership revoked'), { status: 403 }); } });
  try {
    await f.invite(); f.clock.visibility('hidden'); f.clock.visibility('visible'); await tick(); const tree = f.h.render();
    assert.doesNotMatch(text(tree), /001234/); assert.match(text(tree), /Membership revoked/); assert.equal(button(tree, 'Copy'), undefined); assert.equal(button(tree, 'Share'), undefined);
  } finally { f.h.close(); }
});
test('Closing the workspace cancels its timer and fences a late invitation response', async () => {
  let finish; const f = hubFixture({ perform: body => body.action === 'create_invite' ? new Promise(resolve => { finish = resolve; }) : undefined });
  try {
    let tree = await f.open(); button(tree, 'Invite friends').props.onClick(); tree = f.h.render(); find(tree, 'Sheet', p => p.open && p.title === 'Shared trip').props.onClose(); f.h.render();
    finish({ data: { inviteCode: '009999', serverNow: new Date(f.clock.now()).toISOString(), expiresAt: new Date(f.clock.now() + 300000).toISOString() } }); await tick(); tree = f.h.render();
    assert.doesNotMatch(text(tree), /009999/); assert.equal(f.clock.timerCount(), 0); assert.equal(f.notices.length, 0);
  } finally { f.h.close(); }
});
test('Code entry preserves leading zeroes, rejects letters and submits exactly six digits once', async () => {
  const f = hubFixture(); try {
    await tick(); button(f.h.render(), 'Join with code').props.onClick(); let tree = f.h.render(); const input = find(find(tree, 'form', p => p.className === 'trip-invite-join'), 'input');
    assert.equal(input.props.inputMode, 'numeric'); assert.equal(input.props.maxLength, 6); input.props.onChange({ target: { value: '00a1234x9' } }); tree = f.h.render();
    assert.equal(find(tree, 'input').props.value, '001234'); const submit = find(tree, 'form', p => p.className === 'trip-invite-join').props.onSubmit;
    const first = submit({ preventDefault() {} }); await submit({ preventDefault() {} }); await first; assert.deepEqual(plain(f.actions), [{ action: 'accept_invite', inviteCode: '001234' }]);
  } finally { f.h.close(); }
});
test('A long legacy invitation cannot appear in the new six-digit field, and a new incoming code can replace it', async () => {
  const f = hubFixture(); try {
    await tick(); let tree = f.h.render({ initialInviteCode: 'old-7-day-invitation-token' });
    assert.match(text(tree), /Ask your friend for a new 6-digit code/); assert.equal(find(tree, 'input').props.value, ''); assert.doesNotMatch(text(tree), /old-7-day/);
    tree = f.h.render({ initialInviteCode: '001234' }); assert.equal(find(tree, 'input').props.value, '001234'); assert.doesNotMatch(text(tree), /no longer valid/);
  } finally { f.h.close(); }
});
test('A pending six-digit invite is kept for at most five minutes across login, then removed without a server request', () => {
  const clock = browserClock(), values = new Map();
  const localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const parser = load('lib/trip-invite.ts', {}, { URL });
  const invites = load('mobile/src/lib/tripCollaboration.ts', { './api': {}, '../../../lib/trip-invite': parser }, { localStorage, Date: clock.Date });
  assert.equal(invites.rememberTripInvite('001234'), '001234');
  assert.equal(JSON.parse(values.get('l2t:pending-trip-invite:v1')).expires, clock.initial + 300000);
  clock.advance(299999); assert.equal(invites.pendingTripInvite('capacitor://localhost'), '001234');
  clock.advance(1); assert.equal(invites.pendingTripInvite('capacitor://localhost'), ''); assert.equal(values.size, 0);
});
test('Expired and rate-limited joins give actionable feedback in every app language while preserving the entered code', async () => {
  for (const locale of ['tr', 'en', 'sq', 'ro']) for (const [code, key] of [['INVITE_EXPIRED', 'expired'], ['INVITE_RATE_LIMITED', 'rateLimited']]) {
    const f = hubFixture({ locale, perform: body => { if (body.action === 'accept_invite') throw Object.assign(new Error('Server error'), { code }); } });
    try {
      await tick(); button(f.h.render(), client.sharedTripCopy(locale, 'join')).props.onClick(); let tree = f.h.render(); find(tree, 'input').props.onChange({ target: { value: '001234' } }); tree = f.h.render();
      await find(tree, 'form', p => p.className === 'trip-invite-join').props.onSubmit({ preventDefault() {} }); tree = f.h.render();
      assert.ok(text(tree).includes(client.sharedTripCopy(locale, key))); assert.equal(find(tree, 'input').props.value, '001234');
    } finally { f.h.close(); }
  }
});
test('Delete is a separate row action and requires confirmation with the exact trip before a server write', async () => {
  const f = hubFixture(); try {
    let tree = await f.remove(); const confirmation = find(tree, 'Sheet', p => p.open && p.title === 'Delete trip'); assert.match(text(confirmation), /Germany test trip/); assert.match(text(confirmation), /cannot be undone/); assert.equal(f.actions.length, 0);
    const submit = button(confirmation, 'Delete trip').props.onClick; submit(); submit(); await tick(); tree = f.h.render();
    assert.deepEqual(plain(f.actions), [{ action: 'delete_trip', tripId: 'trip-a' }]); assert.deepEqual(f.cleared, [['owner-a', 'trip-a']]); assert.equal(find(tree, 'button', p => p.className === 'trip-collaboration-open'), undefined);
  } finally { f.h.close(); }
});
test('A participant sees Leave instead of Delete, and cancellation makes no server or context change', async () => {
  const f = hubFixture({ role: 'editor' }); try {
    let tree = await f.remove(); assert.equal(find(tree, 'Sheet', p => p.open).props.title, 'Leave trip'); button(tree, 'Cancel').props.onClick(); tree = f.h.render(); assert.equal(f.actions.length, 0); assert.equal(f.cleared.length, 0);
    tree = await f.remove(); button(tree, 'Leave trip').props.onClick(); await tick(); assert.deepEqual(plain(f.actions), [{ action: 'leave_trip', tripId: 'trip-a' }]);
  } finally { f.h.close(); }
});
test('A refused delete/leave keeps the row and selected context and permits a deliberate retry', async () => {
  for (const role of ['owner', 'viewer']) {
    const f = hubFixture({ role, perform: body => { if (['delete_trip', 'leave_trip'].includes(body.action)) throw Error('Server refused fixture'); } }); try {
      let tree = await f.remove(); button(tree, role === 'owner' ? 'Delete trip' : 'Leave trip').props.onClick(); await tick(); tree = f.h.render(); assert.match(text(tree), /Server refused fixture/); assert.ok(find(tree, 'button', p => p.className === 'trip-collaboration-open')); assert.equal(f.cleared.length, 0);
    } finally { f.h.close(); }
  }
});
test('The new invitation and destructive-action controls have all four app languages', () => {
  for (const locale of ['tr', 'en', 'sq', 'ro']) for (const key of ['join', 'codeLabel', 'delete', 'leave', 'deleteExplanation', 'unavailable', 'renews']) assert.ok(client.sharedTripCopy(locale, key).length > 2);
  assert.equal(client.sharedTripCopy('ro', 'join'), 'Alătură-te cu un cod'); assert.equal(client.sharedTripCopy('sq', 'delete'), 'Fshi udhëtimin');
});

test('A just-joined participant can leave the opened workspace even when refreshing the trip list fails', async () => {
  let reads=0;
  const f=hubFixture({role:'editor',listTrips:async()=>{ if(++reads===1)return [];throw Error('List unavailable fixture'); },perform:body=>body.action==='accept_invite'?{data:{tripId:'trip-a'}}:undefined});
  try {
    await tick();let tree=f.h.render({initialInviteCode:'001234'});
    await find(tree,'form',p=>p.className==='trip-invite-join').props.onSubmit({preventDefault(){}});await tick();tree=f.h.render();
    const workspace=find(tree,'Sheet',p=>p.open&&p.title==='Shared trip');assert.ok(workspace);
    button(workspace,'Leave trip').props.onClick();tree=f.h.render();
    const confirmation=find(tree,'Sheet',p=>p.open&&p.title==='Leave trip');assert.ok(confirmation,'Leave must use the loaded workspace, not require a missing list row');
    assert.match(text(confirmation),/Germany test trip/);assert.equal(f.actions.length,1);
    button(confirmation,'Cancel').props.onClick();assert.equal(f.actions.length,1);assert.equal(f.cleared.length,0);
  }finally{f.h.close();}
});
test('Workspace leave confirmation uses the current server role instead of an older owner role in the list',async()=>{
  const f=hubFixture({role:'editor',listTrips:async()=>[{id:'trip-a',title:'Old title',destinationCode:'DE',destinationCountry:'Germany',startDate:'2026-11-20',endDate:'2026-11-22',role:'owner',memberCount:1}]});
  try{
    let tree=await f.open();button(find(tree,'Sheet',p=>p.open&&p.title==='Shared trip'),'Leave trip').props.onClick();tree=f.h.render();
    const confirmation=find(tree,'Sheet',p=>p.open&&p.title==='Leave trip');assert.ok(confirmation);assert.match(text(confirmation),/Germany test trip/);assert.doesNotMatch(text(confirmation),/Old title/);
    button(confirmation,'Leave trip').props.onClick();await tick();assert.deepEqual(plain(f.actions),[{action:'leave_trip',tripId:'trip-a'}]);
  }finally{f.h.close();}
});
test('Reading the same incoming URL during login does not renew the original five-minute pending deadline',()=>{
  const clock=browserClock(),values=new Map(),localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const parser=load('lib/trip-invite.ts',{}, {URL}),invites=load('mobile/src/lib/tripCollaboration.ts',{'./api':{},'../../../lib/trip-invite':parser},{localStorage,Date:clock.Date});
  const url='https://www.letsgo2travel.com.tr/davet/001234';assert.equal(invites.pendingTripInvite(url),'001234');
  clock.advance(120000);assert.equal(invites.pendingTripInvite(url),'001234');
  assert.equal(JSON.parse(values.get('l2t:pending-trip-invite:v1')).expires,clock.initial+300000);
  clock.advance(180000);assert.equal(invites.pendingTripInvite('capacitor://localhost'),'');assert.equal(values.size,0);
});
test('Upgrading removes old seven-day legacy or overlong pending invitations instead of reopening an expired join',()=>{
  for(const code of ['oldLegacyInviteToken12345','001234']){
    const clock=browserClock(),values=new Map([['l2t:pending-trip-invite:v1',JSON.stringify({code,expires:clock.initial+7*86400000})]]);
    const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const parser=load('lib/trip-invite.ts',{}, {URL}),invites=load('mobile/src/lib/tripCollaboration.ts',{'./api':{},'../../../lib/trip-invite':parser},{localStorage,Date:clock.Date});
    assert.equal(invites.pendingTripInvite('capacitor://localhost'),'');assert.equal(values.size,0);
  }
});
test('Malformed or blocked pending storage cannot crash a cold start or prevent using an incoming code',()=>{
  for(const raw of ['broken-json','null','[]',JSON.stringify({code:123456,expires:Date.now()+100000}),JSON.stringify({code:'001234',expires:'tomorrow'})]){
    const values=new Map([['l2t:pending-trip-invite:v1',raw]]),localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
    const parser=load('lib/trip-invite.ts',{}, {URL}),invites=load('mobile/src/lib/tripCollaboration.ts',{'./api':{},'../../../lib/trip-invite':parser},{localStorage});
    assert.equal(invites.pendingTripInvite('capacitor://localhost'),'');assert.equal(values.size,0);
  }
  const denied=()=>{throw Error('Storage blocked fixture');},parser=load('lib/trip-invite.ts',{}, {URL});
  const invites=load('mobile/src/lib/tripCollaboration.ts',{'./api':{},'../../../lib/trip-invite':parser},{localStorage:{getItem:denied,setItem:denied,removeItem:denied}});
  assert.equal(invites.pendingTripInvite('capacitor://localhost'),'');assert.equal(invites.rememberTripInvite('001234'),'001234');
});
test('A new incoming code replaces the pending invite while a duplicate keeps its original deadline',()=>{
  const clock=browserClock(),values=new Map(),localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const parser=load('lib/trip-invite.ts',{}, {URL}),invites=load('mobile/src/lib/tripCollaboration.ts',{'./api':{},'../../../lib/trip-invite':parser},{localStorage,Date:clock.Date});
  invites.rememberTripInvite('001234');clock.advance(100000);invites.rememberTripInvite('001234');assert.equal(JSON.parse(values.get('l2t:pending-trip-invite:v1')).expires,clock.initial+300000);
  assert.equal(invites.rememberTripInvite('005678'),'005678');assert.equal(JSON.parse(values.get('l2t:pending-trip-invite:v1')).expires,clock.initial+400000);
  invites.rememberTripInvite('');assert.equal(values.size,0);
});
test('An authoritative expired-invite rejection clears its automatic login handoff but preserves the editable code',async()=>{
  const remembered=[],handled=[];
  const f=hubFixture({remembered:value=>remembered.push(value),perform:body=>{if(body.action==='accept_invite')throw Object.assign(new Error('Expired fixture'),{code:'INVITE_EXPIRED'});}});
  try{
    await tick();let tree=f.h.render({initialInviteCode:'001234',onInviteHandled:()=>handled.push(true)});
    await find(tree,'form',p=>p.className==='trip-invite-join').props.onSubmit({preventDefault(){}});tree=f.h.render();
    assert.deepEqual(remembered,['']);assert.equal(handled.length,1);assert.equal(find(tree,'input').props.value,'001234');assert.match(text(tree),/Ask your friend for a new 6-digit code/);
  }finally{f.h.close();}
});
test('Financial-history leave rejection explains retained access in every language without deleting or clearing the trip',async()=>{
  const expected={tr:'Ortak masraf kayıtların olduğu için bu seyahatten ayrılamıyorsun.',en:'You cannot leave this trip while shared expenses are linked to your account.',sq:'Nuk mund të largohesh nga ky udhëtim ndërsa shpenzimet e përbashkëta lidhen me llogarinë tënde.',ro:'Nu poți părăsi călătoria cât timp ai cheltuieli comune asociate contului.'};
  for(const locale of ['tr','en','sq','ro']){
    const f=hubFixture({locale,role:'viewer',perform:body=>{if(body.action==='leave_trip')throw Object.assign(new Error('Bu katılımcının masraf geçmişi var; hesapları korumak için katılımcı çıkarılamaz.'),{status:409});}});
    try{
      const tree=await f.remove();button(tree,client.sharedTripCopy(locale,'leave')).props.onClick();await tick();const next=f.h.render();
      assert.ok(text(next).includes(expected[locale]));assert.equal(f.cleared.length,0);assert.ok(find(next,'button',p=>p.className==='trip-collaboration-open'));
    }finally{f.h.close();}
  }
});
test('A late reply for an older invite cannot clear a newer incoming code or open the wrong workspace',async()=>{
  for(const succeeds of [false,true]){
    let finish,fail;const remembered=[],handled=[];
    const f=hubFixture({remembered:value=>remembered.push(value),perform:body=>body.action==='accept_invite'?new Promise((resolve,reject)=>{finish=resolve;fail=reject;}):undefined});
    try{
      await tick();let tree=f.h.render({initialInviteCode:'001234',onInviteHandled:()=>handled.push(true)});
      const request=find(tree,'form',p=>p.className==='trip-invite-join').props.onSubmit({preventDefault(){}});
      tree=f.h.render({initialInviteCode:'005678'});assert.equal(find(tree,'input').props.value,'005678');
      if(succeeds)finish({data:{tripId:'trip-a'}});else fail(Object.assign(new Error('Expired old request'),{code:'INVITE_EXPIRED'}));
      await request;await tick();tree=f.h.render();
      assert.equal(find(tree,'input').props.value,'005678');assert.equal(handled.length,0);assert.deepEqual(remembered,[]);
      assert.equal(find(tree,'Sheet',p=>p.open&&p.title==='Shared trip'),undefined);assert.doesNotMatch(text(tree),/no longer valid|Expired old request/);
    }finally{f.h.close();}
  }
});
test('Changing the app language does not replace a code the user is editing with the older incoming code',async()=>{
  const f=hubFixture();try{
    await tick();let tree=f.h.render({initialInviteCode:'001234'});find(tree,'input').props.onChange({target:{value:'005678'}});tree=f.h.render();assert.equal(find(tree,'input').props.value,'005678');
    tree=f.setLocale('ro');assert.equal(find(tree,'input').props.value,'005678');
  }finally{f.h.close();}
});
test('A failed join keeps its editable code and retries through Join instead of a misleading trip-list refresh button',async()=>{
  let joins=0;
  const f=hubFixture({perform:body=>{if(body.action==='accept_invite'){if(++joins===1)throw Error('Connection unavailable fixture');return {data:{tripId:'trip-a'}};}}});
  try{
    await tick();let tree=f.h.render({initialInviteCode:'001234'});
    await find(tree,'form',p=>p.className==='trip-invite-join').props.onSubmit({preventDefault(){}});tree=f.h.render();
    const alert=find(tree,'div',p=>p.className==='trip-collaboration-error');assert.match(text(alert),/Connection unavailable fixture/);assert.equal(button(alert,'Retry'),undefined,'The retry-looking button must not merely refresh unrelated list data');
    assert.ok(button(alert,'Refresh trips'));button(alert,'Refresh trips').props.onClick();await tick();tree=f.h.render();assert.equal(joins,1);assert.match(text(tree),/Connection unavailable fixture/);
    assert.equal(find(tree,'input').props.value,'001234');await find(tree,'form',p=>p.className==='trip-invite-join').props.onSubmit({preventDefault(){}});await tick();
    assert.equal(joins,2);assert.ok(find(f.h.render(),'Sheet',p=>p.open&&p.title==='Shared trip'));
  }finally{f.h.close();}
});
test('Trip-list failures retain a genuine list retry without submitting any invitation',async()=>{
  let reads=0;
  const f=hubFixture({listTrips:async()=>{if(++reads===1)throw Error('List unavailable fixture');return [];}});
  try{
    await tick();let tree=f.h.render();const alert=find(tree,'div',p=>p.className==='trip-collaboration-error');assert.ok(button(alert,'Retry'));
    button(alert,'Retry').props.onClick();await tick();tree=f.h.render();assert.equal(reads,2);assert.equal(f.actions.length,0);assert.doesNotMatch(text(tree),/List unavailable fixture/);
  }finally{f.h.close();}
});
