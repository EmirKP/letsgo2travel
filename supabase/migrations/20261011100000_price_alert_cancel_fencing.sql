-- A delivery already in flight must never reactivate a deleted/paused alert.
-- Keep its sent notification row for delivery history; only active alerts may
-- update the tracking/cooldown state.
begin;

create or replace function public.mark_alert_notified(
  p_alert_id uuid,
  p_event_price numeric,
  p_notified_at timestamptz default now()
) returns void
language sql
security definer
set search_path = public
as $$
  update public.flight_price_alerts
     set last_notified_price = least(coalesce(last_notified_price, p_event_price), p_event_price),
         last_notified_at = greatest(coalesce(last_notified_at, p_notified_at), p_notified_at),
         status = 'triggered',
         last_error_message = null,
         last_error_at = null,
         error_count = 0
   where id = p_alert_id
     and is_active = true
     and cancelled_at is null
     and status <> 'cancelled';
$$;

revoke all on function public.mark_alert_notified(uuid, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_alert_notified(uuid, numeric, timestamptz) to service_role;

commit;
