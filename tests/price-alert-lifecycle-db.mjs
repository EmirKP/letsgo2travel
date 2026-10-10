import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Real SQL late notification completion preserves deleted/paused state and monotonic active values', async () => {
  const db = new PGlite();
  try {
    await db.exec(`set time zone 'UTC'; create role anon; create role authenticated; create role service_role;
      create table public.flight_price_alerts(id uuid primary key, is_active boolean, status text, cancelled_at timestamptz,
        last_notified_price numeric, last_notified_at timestamptz, last_error_message text, last_error_at timestamptz, error_count int);
      insert into public.flight_price_alerts(id,is_active,status,cancelled_at,last_notified_price,last_notified_at,error_count) values
      ('00000000-0000-4000-8000-000000000001', false, 'cancelled', now(), null, null, 1),
      ('00000000-0000-4000-8000-000000000002', false, 'paused', null, null, null, 1),
      ('00000000-0000-4000-8000-000000000003', true, 'active', null, 2300, '2026-10-11', 1);`);
    await db.exec(readFileSync('supabase/migrations/20261011100000_price_alert_cancel_fencing.sql', 'utf8'));
    for (const id of [1,2,3]) await db.query(`select mark_alert_notified($1,2500,'2026-10-10')`, [`00000000-0000-4000-8000-00000000000${id}`]);
    const { rows } = await db.query('select status,last_notified_price,last_notified_at,error_count from flight_price_alerts order by id');
    assert.equal(rows[0].status, 'cancelled'); assert.equal(rows[0].last_notified_price, null);
    assert.equal(rows[1].status, 'paused'); assert.equal(rows[1].last_notified_price, null);
    assert.equal(rows[2].status, 'triggered'); assert.equal(Number(rows[2].last_notified_price), 2300);
    assert.equal(new Date(rows[2].last_notified_at).toISOString(), '2026-10-11T00:00:00.000Z');
    const { rows: permissions } = await db.query(`select
      has_function_privilege('anon','public.mark_alert_notified(uuid,numeric,timestamptz)','execute') as anon,
      has_function_privilege('authenticated','public.mark_alert_notified(uuid,numeric,timestamptz)','execute') as authenticated,
      has_function_privilege('service_role','public.mark_alert_notified(uuid,numeric,timestamptz)','execute') as service`);
    assert.deepEqual(permissions[0], { anon: false, authenticated: false, service: true });
  } finally { await db.close(); }
});
