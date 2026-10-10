-- Fixed editorial timeline requested on 10 October 2026, for the disclosed
-- fictional starter discussions only. This supersedes the original seeds'
-- insertion-time-only policy; it does not imply actual historical user activity.
-- Run after both starter-topic and starter-reply seeds. No content, identities,
-- moderation, counts or genuine user timestamps are changed. Safe to rerun.
begin;
do $$
begin
  if current_timestamp < timestamptz '2026-10-10 00:00:00+03' then
    raise exception 'The fixed starter timeline must not be applied before 10 October 2026';
  end if;
end;
$$;

with plan(topic_number, reply_count, topic_at, reply_span) as (
  values
    (1, 7, timestamptz '2026-09-28 19:23:00+03', interval '5 days 17 hours'),
    (2, 3, timestamptz '2026-09-14 10:37:00+03', interval '3 days 9 hours'),
    (3, 12, timestamptz '2026-10-02 21:14:00+03', interval '5 days 20 hours'),
    (4, 5, timestamptz '2026-09-22 08:46:00+03', interval '4 days 11 hours'),
    (5, 16, timestamptz '2026-09-12 17:52:00+03', interval '11 days 4 hours'),
    (6, 8, timestamptz '2026-09-30 12:18:00+03', interval '6 days 9 hours'),
    (7, 4, timestamptz '2026-10-06 18:41:00+03', interval '2 days 16 hours'),
    (8, 11, timestamptz '2026-09-25 09:57:00+03', interval '7 days 8 hours'),
    (9, 6, timestamptz '2026-09-18 20:06:00+03', interval '5 days 3 hours'),
    (10, 15, timestamptz '2026-09-20 14:32:00+03', interval '8 days 7 hours'),
    (11, 2, timestamptz '2026-10-05 11:09:00+03', interval '3 days 2 hours'),
    (12, 9, timestamptz '2026-09-16 16:48:00+03', interval '6 days 19 hours'),
    (13, 14, timestamptz '2026-09-24 22:17:00+03', interval '8 days 15 hours'),
    (14, 10, timestamptz '2026-10-01 07:53:00+03', interval '6 days 5 hours'),
    (15, 13, timestamptz '2026-10-08 08:26:00+03', interval '1 day 12 hours')
), eligible_topics as (
  select p.*, t.id
  from plan p
  join public.forum_topics t
    on t.id = ('f09a2026-0930-4000-8000-' || lpad(p.topic_number::text, 12, '0'))::uuid
    and t.seed_key = 'starter-20260930-' || lpad(p.topic_number::text, 2, '0')
    and t.author_id is null and t.status = 'published'
    and t.is_paywalled = false and t.category = 'Ülke Bazlı Sorunlar'
), expected_replies as (
  -- The complete original ordinal range, including any missing/hidden rows,
  -- keeps each surviving reply's position stable on subsequent runs.
  select t.id as topic_id, t.topic_number, n as reply_number,
    ('f09a2026-1010-4000-8000-' || lpad(t.topic_number::text, 10, '0') || lpad(n::text, 2, '0'))::uuid as id,
    'starter-reply-20261010-' || lpad(t.topic_number::text, 2, '0') || '-' || lpad(n::text, 2, '0') as seed_key,
    37 + mod(t.topic_number * 97 + n * n * 31, 809) as gap_weight
  from eligible_topics t cross join lateral generate_series(1, t.reply_count) n
), eligible_replies as (
  select e.*
  from expected_replies e join public.forum_replies r
    on r.id = e.id and r.seed_key = e.seed_key and r.topic_id = e.topic_id
    and r.user_id is null and r.status = 'published'
), protected_boundaries as (
  -- Includes real, anonymized, moderated and identity-mismatched replies.
  -- Their dates never change; the editorial timeline must fit before them.
  select t.id, min(r.created_at) as first_protected_reply_at
  from eligible_topics t
  left join public.forum_replies r on r.topic_id = t.id
  where r.id is null or not exists (select 1 from eligible_replies e where e.id = r.id)
  group by t.id
), timelines as (
  select t.id,
    least(t.topic_at, b.first_protected_reply_at - interval '3 days') as starts_at,
    least(t.topic_at + t.reply_span,
      b.first_protected_reply_at - interval '1 minute',
      timestamptz '2026-10-10 00:00:00+03' - interval '1 minute') as ends_at
  from eligible_topics t left join protected_boundaries b on b.id = t.id
), weighted_replies as (
  select e.*,
    sum(gap_weight) over (partition by topic_id order by reply_number) as elapsed_weight,
    sum(gap_weight) over (partition by topic_id) as total_weight
  from expected_replies e
), reply_dates as (
  select e.id, e.seed_key, e.topic_id,
    t.starts_at + floor(extract(epoch from (t.ends_at - t.starts_at))
      * w.elapsed_weight / w.total_weight) * interval '1 second' as created_at
  from eligible_replies e join weighted_replies w on w.id = e.id
  join timelines t on t.id = e.topic_id
), changed_topics as (
  update public.forum_topics t set created_at = p.starts_at
  from timelines p join eligible_topics e on e.id = p.id
  where t.id = p.id
    and t.seed_key = 'starter-20260930-' || lpad(e.topic_number::text, 2, '0')
    and t.author_id is null and t.status = 'published'
    and t.is_paywalled = false and t.category = 'Ülke Bazlı Sorunlar'
    and t.created_at is distinct from p.starts_at
  returning t.id
), changed_replies as (
  update public.forum_replies r set created_at = p.created_at
  from reply_dates p where r.id = p.id and r.seed_key = p.seed_key and r.topic_id = p.topic_id
    and r.user_id is null and r.status = 'published'
    and r.created_at is distinct from p.created_at
  returning r.id
)
select (select count(*) from changed_topics) as updated_starter_topics,
  (select count(*) from changed_replies) as updated_starter_replies;
commit;
