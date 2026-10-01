import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const owner='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
const migration=readFileSync('supabase/migrations/20261001100000_account_collections.sql','utf8');
test('Private collections enforce identity, CAS revisions, bounded payloads and account deletion',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(migration);await db.exec(migration);
  await db.query('insert into auth.users values($1),($2)',[owner,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');
  const save=(account,kind,revision,document)=>db.query('select * from public.save_account_collection($1,$2,$3,$4::jsonb)',[account,kind,revision,JSON.stringify(document)]);
  const doc={items:{'node/1':{note:'Private'}},dayIds:['node/1']};
  assert.equal((await save(owner,'saved_places',0,doc)).rows[0].revision,1);
  assert.equal((await db.query('select * from account_collections')).rows.length,1);
  await assert.rejects(save(owner,'saved_places',0,doc),e=>e.code==='40001');
  assert.equal((await save(owner,'saved_places',1,{...doc,dayIds:[]})).rows[0].revision,2);
  await assert.rejects(save(other,'saved_places',0,doc),e=>e.code==='42501');
  await assert.rejects(db.query("update account_collections set revision=10 where owner_id=$1",[owner]),e=>e.code==='42501');
  await assert.rejects(save(owner,'invalid',0,doc),e=>e.code==='22023');
  for(const invalid of [{items:[],dayIds:[]},{items:{},dayIds:['missing']},{items:{a:{}},dayIds:['a','a']},{items:{a:{note:'x'.repeat(800001)}},dayIds:[]},{items:Object.fromEntries(Array.from({length:1001},(_,i)=>[`item-${i}`,{}])),dayIds:[]}])await assert.rejects(save(owner,'saved_events',0,invalid),e=>e.code==='22023');
  await assert.rejects(save(owner,'saved_events',0,doc),e=>e.code==='22023');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);assert.equal((await db.query('select * from account_collections')).rows.length,0);
  assert.equal((await save(other,'saved_events',0,{items:{},dayIds:[]})).rows[0].revision,1);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from account_collections'),e=>e.code==='42501');await assert.rejects(save(other,'saved_events',1,{items:{},dayIds:[]}),e=>e.code==='42501');
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[owner]);const left=(await db.query('select owner_id from account_collections')).rows;assert.deepEqual(left,[{owner_id:other}]);
 }finally{await db.close();}
});
