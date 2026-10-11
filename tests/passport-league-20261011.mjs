import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const read = file => fs.readFileSync(file, 'utf8');
const cache = new Map();
function load(file, stubs = {}) {
  const full = path.resolve(file);
  if (cache.has(full) && !Object.keys(stubs).length) return cache.get(full);
  const loaded = { exports: {} };
  const code = ts.transpileModule(read(full), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = name => {
    if (name in stubs) return stubs[name];
    const target = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(full), name);
    if (target.endsWith('.json')) return JSON.parse(read(target));
    return load(`${target}.ts`);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { URL, Date, Object, Set, Map, Number, console })(req, loaded, loaded.exports);
  if (!Object.keys(stubs).length) cache.set(full, loaded.exports);
  return loaded.exports;
}
const passports = load('lib/country-intelligence/passports.ts');
const reviewed = load('lib/country-intelligence/passport-reviewed.ts');
const verified = load('lib/leaderboard/verified.ts');
const countries = load('lib/leaderboard/countries.ts');
const plain = value => JSON.parse(JSON.stringify(value));

test('All passport rows, every destination and all four types resolve deterministically with provenance', () => {
  const allowed = new Set(['id_card','free','evisa','on_arrival','required','unknown','eta','restricted','domestic']);
  const destinations = [...passports.DESTINATION_INDEX.keys()];
  assert.equal(destinations.length, new Set(destinations).size);
  let official = 0;
  for (const [passport, row] of Object.entries(passports.PASSPORTS)) {
    assert.equal(row.length, destinations.length, passport);
    assert.match(row, /^[faevtnx]+$/);
    for (const type of ['ordinary','special','service','diplomatic']) for (const destination of destinations) {
      const entry = passports.passportEntry(passport,type,destination);
      assert.ok(allowed.has(entry.status));
      if (entry.provenance === 'official') { official++; assert.equal(entry.checkedAt,'2026-10-11'); assert.ok(entry.sourceUrl.startsWith('https://')); }
      if (passport === destination) assert.equal(entry.status,'domestic');
      if (passport !== 'TR' && type !== 'ordinary' && passport !== destination) assert.equal(entry.provenance,'unavailable');
    }
  }
  console.log(`Reviewed official pairs: ${official}; TR destination rows: ${Object.keys(reviewed.TURKISH_RULES).length}`);
  for (const code of Object.keys(reviewed.TURKISH_RULES)) assert.ok(passports.DESTINATION_INDEX.has(code), `Unknown reviewed destination ${code}`);
  assert.equal(Object.keys(reviewed.TURKISH_RULES).length, destinations.length - 1);
  for (const destination of destinations.filter(code=>code!=='TR')) for(const type of ['ordinary','special','service','diplomatic']) assert.equal(passports.passportEntry('TR',type,destination).provenance,'official');
});

test('Turkish special, service and diplomatic passports have independent official rules', () => {
  for (const destination of ['DE','FR','ES','BE','BG','PL','SE','NL']) assert.equal(passports.passportEntry('TR','special',destination).status,'free');
  assert.equal(passports.passportEntry('TR','ordinary','DE').status,'required');
  assert.equal(passports.passportEntry('TR','ordinary','MX').status,'evisa');
  assert.equal(passports.passportEntry('TR','special','MX').status,'required');
  assert.equal(passports.passportEntry('TR','diplomatic','MX').status,'free');
  assert.equal(passports.passportEntry('TR','special','IE').status,'required');
  assert.equal(passports.passportEntry('TR','diplomatic','IE').status,'free');
  assert.equal(passports.passportEntry('TR','special','TW').status,'evisa');
  assert.equal(passports.passportEntry('TR','service','TW').status,'required');
  assert.equal(passports.passportEntry('TR','special','NA').status,'on_arrival');
  assert.equal(passports.passportEntry('TR','service','NA').status,'free');
  assert.equal(passports.passportEntry('TR','ordinary','TH').stay,'30');
  assert.equal(passports.passportEntry('TR','special','TH').stay,'90');
  assert.equal(passports.passportEntry('TR','ordinary','AZ').status,'id_card');
  assert.match(passports.passportEntry('TR','ordinary','GE').note[0],/30.000 GEL/);
  assert.equal(passports.passportEntry('TR','special','TM').status,'unknown');
  assert.equal(passports.passportEntry('TR','special','KR').status,'eta');
  assert.equal(passports.passportEntry('TR','service','KR').status,'free');
  assert.match(passports.passportEntry('TR','service','KR').sourceUrl,/overseas.mofa.go.kr/);
});

test('Non-Turkish ordinary passports use official Schengen rules with biometric and residence conditions', () => {
  for (const passport of ['AL','BA','MK','RS','XK','UA','MD']) {
    const entry = passports.passportEntry(passport,'ordinary','FR');
    assert.equal(entry.status,'free'); assert.equal(entry.provenance,'official'); assert.match(entry.note[1],/biometric/); assert.equal(entry.stay,'90/180');
  }
  assert.equal(passports.passportEntry('VU','ordinary','IT').status,'required');
  assert.equal(passports.passportEntry('IN','ordinary','DE').status,'required');
  assert.equal(passports.passportEntry('US','ordinary','DE').status,'free');
  assert.equal(passports.passportEntry('DE','ordinary','FR').status,'free');
  assert.equal(passports.passportEntry('TW','ordinary','FR').status,'free');
  assert.match(passports.passportEntry('TW','ordinary','FR').note[1],/identity card number/);
  assert.equal(passports.passportEntry('XX','ordinary','FR').status,'unknown');
  assert.equal(passports.passportEntry('TR','invalid','FR').status,'unknown');
});

test('ETA is neither e-visa nor unconditionally visa-free; historical records never claim official review', () => {
  const entry = passports.passportEntry('TR','ordinary','KE'); assert.equal(entry.status,'eta');
  assert.equal(passports.passportStatus('TR','ordinary','KE'),'unknown');
  const historic = passports.passportEntry('GB','ordinary','AU'); assert.equal(historic.status,'eta'); assert.equal(historic.provenance,'dated-index'); assert.equal(historic.checkedAt,'2026-02-17');
  assert.equal(passports.passportStayLabel('30;90/180'), '30 gün · 180 günde 90 gün');
});

test('Approved country counter rejects pending/rejected/expired/location/malformed and deduplicates aliases', () => {
  const rows = ['TR','TUR','792','DE','DEU'].map(country_code => ({ country_code,status:'approved',verification_method:'document' }));
  for (const status of ['pending','rejected','expired','flagged']) rows.push({ country_code:'FR',status,verification_method:'document' });
  rows.push({ country_code:'FR',status:'approved',verification_method:'location' }, { country_code:'XX',status:'approved',verification_method:'document' });
  assert.equal(verified.countApprovedCountries(rows),2);
  assert.equal(verified.verifiedExplorerLevel(0),'Yeni Kaşif');
  assert.equal(verified.verifiedExplorerLevel(5),'Rota Meraklısı');
});

test('League SQL reprojects only approved evidence, revocation updates scores, privacy and complete ranking hold', async () => {
  const db = new PGlite(); const owner='10000000-0000-4000-8000-000000000001'; const privateUser='10000000-0000-4000-8000-000000000002'; const blocked='10000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key,username text,visited_countries text[],opt_in_leaderboard boolean);
      create table leaderboard_blocks(user_id uuid);
      create table travel_verifications(id uuid default gen_random_uuid(),user_id uuid,country_code text,status text,verification_method text);
      insert into profiles select gen_random_uuid(),'self_marked_'||n,'{TR,DE,FR,GB,US,JP}',true from generate_series(1,501)n;
      insert into profiles values ('${owner}','verified','{}',true),('${privateUser}','private','{TR}',false),('${blocked}','blocked','{}',true);
      insert into leaderboard_blocks values ('${blocked}');
      insert into travel_verifications(user_id,country_code,status,verification_method) values
      ('${owner}','TR','approved','document'),('${owner}','TUR','approved','document'),('${owner}','DE','approved','document'),
      ('${owner}','FR','pending','document'),('${owner}','GB','rejected','document'),('${owner}','JP','expired','document'),
      ('${owner}','US','approved','location'),('${owner}','INVALID','approved','document'),
      ('${privateUser}','TR','approved','document'),('${blocked}','TR','approved','document');`);
    await db.exec(read('supabase/migrations/20261011170000_verified_explorer_league.sql'));
    const args=[JSON.stringify(countries.explorerCountryAliases)];
    let result=await db.query('select * from get_verified_explorer_league($1::jsonb,100)',args);
    assert.deepEqual(result.rows,[{username:'verified',visited_count:2,points:20,level:'Yeni Kaşif'}]);
    assert.deepEqual((await db.query('select * from get_explorer_league($1::jsonb,100)',args)).rows,result.rows);
    const all=(await db.query('select * from get_verified_explorer_scores($1::jsonb)',args)).rows;
    assert.equal(all.length,503); assert.equal(all.find(row=>row.username==='blocked').hidden,true);
    assert.ok(all.filter(row=>row.username.startsWith('self_marked')).every(row=>row.points===0));
    await db.query("update travel_verifications set status='rejected' where user_id=$1 and country_code='DE'",[owner]);
    result=await db.query('select * from get_verified_explorer_league($1::jsonb,100)',args); assert.equal(result.rows[0].points,10);
    await db.query("update travel_verifications set status='rejected' where user_id=$1",[owner]);
    assert.equal((await db.query('select * from get_verified_explorer_league($1::jsonb,100)',args)).rows.length,0);
    for(const role of ['anon','authenticated']) assert.equal((await db.query(`select has_function_privilege('${role}','get_verified_explorer_scores(jsonb)','execute') as allowed`)).rows[0].allowed,false);
    await db.exec(read('supabase/migrations/20261011170000_verified_explorer_league.sql'));
  } finally { await db.close(); }
});

test('Both public APIs fail closed before migration and never expose self-reported legacy rows', async () => {
  const responses=[];
  for(const file of ['app/api/kasifler-ligi/route.ts','app/api/leaderboard/route.ts']) {
    const route=load(file,{'next/server':{NextResponse:{json:(body,options={})=>({body:plain(body),status:options.status||200})}},'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>({rpc:async(name)=>{responses.push(name);return {error:{code:'PGRST202'},data:null};}})}});
    assert.equal((await route.GET(new Request('https://example.test/api?limit=-5'))).status,503);
  }
  assert.deepEqual(responses,['get_verified_explorer_league','get_verified_explorer_league']);
});


test('Exported explorer cards ignore legacy points, ranks and self-reported achievements', async () => {
  const {getExplorerCardData}=load('lib/explorer-card/getExplorerCardData.ts');
  const tables={
    explorer_card_summary:{data:{user_id:'u',username:'traveller',display_name:'Traveller',profile_slug:'traveller',level_key:'world',level_label:'Dünya Gezgini',level_number:5,verified_countries:70,visa_free_discoveries:2,continents:1,explorer_points:7000,league_percentile:1,documented_traveler:true,verified_country_names:['Japan']},error:null},
    explorer_card_achievements:{data:[{id:'old',title:'100 countries',detail:'old ledger',progress:100,target:100}],error:null},
    explorer_card_preferences:{data:{show_name:true,show_ranking:true,show_country_list:true},error:null},
    travel_verifications:{data:[{country_code:'TR',country_name:'Türkiye',status:'approved',verification_method:'document'},{country_code:'TUR',country_name:'Turkey',status:'approved',verification_method:'document'},{country_code:'DE',status:'pending',verification_method:'document'},{country_code:'US',status:'approved',verification_method:'location'}],error:null},
  };
  const db={from(table){const q={then(resolve){return Promise.resolve(tables[table]).then(resolve);}};for(const method of ['select','eq','order','limit','maybeSingle'])q[method]=()=>q;return q;}};
  const card=await getExplorerCardData(db,'u');
  assert.equal(card.stats.verifiedCountries,1);assert.equal(card.stats.explorerPoints,10);assert.equal(card.level.label,'Yeni Kaşif');
  assert.equal(card.privacy.showRanking,false);assert.equal(card.verifiedCountryNames.length,1);
  assert.equal(card.achievements[0].progress,1);assert.ok(!card.achievements.some(row=>row.id==='old'));
  tables.travel_verifications={data:null,error:{message:'offline'}};
  await assert.rejects(()=>getExplorerCardData(db,'u'),/Onaylı ziyaretler/);
});
