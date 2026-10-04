import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const migration=readFileSync('supabase/migrations/20261004230000_profile_completion_recovery.sql','utf8');

test('Profile recovery migration is idempotent and enforces own-id, role and duplicate boundaries under real RLS',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid(),auth.role() to authenticated,anon;
    create table public.profiles(id uuid primary key references auth.users(id), username text unique, role text default 'user', visited_countries text[] default '{}', wishlist_countries text[] default '{}', opt_in_leaderboard boolean default false);
    grant select on profiles to authenticated;
    create policy "Profiles own read" on profiles for select to authenticated using (auth.uid()=id);
    create policy "Legacy permissive insert" on profiles for insert to authenticated with check (true);`);
  const roleProtection=readFileSync('supabase/migrations/20260903170000_protect_profile_roles.sql','utf8');
  await db.exec(roleProtection.slice(0,roleProtection.indexOf('-- Misafir favori/ziyaret')));
  await db.exec(migration);await db.exec(migration);
  await db.query('insert into auth.users values($1),($2)',[owner,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec("set request.jwt.claim.role='authenticated'; set role authenticated");
  await assert.rejects(db.query('insert into profiles(id,username) values($1,$2)',[other,'forged_owner']),e=>e.code==='42501');
  await assert.rejects(db.query("insert into profiles(id,username,role) values($1,'elevated','admin')",[owner]),e=>e.code==='42501');
  await db.query('insert into profiles(id,username) values($1,$2)',[owner,'traveller']);
  let row=(await db.query('select * from profiles where id=$1',[owner])).rows[0];
  assert.equal(row.role,'user');assert.deepEqual(row.visited_countries,[]);assert.equal(row.opt_in_leaderboard,false);
  await db.query("update profiles set visited_countries=array['TUR'],opt_in_leaderboard=true where id=$1",[owner]);
  await db.query("insert into profiles(id,username) values($1,'other_name') on conflict(id) do nothing",[owner]);
  row=(await db.query('select * from profiles where id=$1',[owner])).rows[0];
  assert.equal(row.username,'traveller');assert.deepEqual(row.visited_countries,['TUR']);assert.equal(row.opt_in_leaderboard,true);
  await assert.rejects(db.query("update profiles set role='admin' where id=$1",[owner]),e=>e.code==='42501');

  // Simulate a legacy broad column grant: the pre-existing trigger still rejects
  // elevated roles, and the new restrictive policy still rejects another owner.
  await db.exec('reset role; grant insert on profiles to authenticated; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await assert.rejects(db.query("insert into profiles(id,username,role) values($1,'elevated','super_admin')",[other]),e=>e.code==='42501');
  await db.query('insert into profiles(id,username) values($1,$2)',[other,'another_traveller']);
  assert.equal((await db.query('select id from profiles')).rows[0].id,other);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query("insert into profiles(id,username) values($1,'anon_name')",[owner]),e=>e.code==='42501');
 }finally{await db.close();}
});
