-- Remember where a visit came from, so attribution can show the channel.
-- A later direct visit does not erase an earlier campaign or referral.

alter table public.storefront_sessions
  add column if not exists referrer text not null default '',
  add column if not exists channel text not null default 'ישיר',
  add column if not exists channel_type text not null default 'ישיר',
  add column if not exists utm_campaign text not null default '';

create or replace function private.referrer_host(raw text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  host text := lower(btrim(coalesce(raw, '')));
begin
  if host = '' then
    return '';
  end if;
  if position('://' in host) > 0 then
    host := split_part(host, '://', 2);
  end if;
  host := split_part(split_part(host, '/', 1), '?', 1);
  host := split_part(host, ':', 1);
  if left(host, 4) = 'www.' then
    host := substring(host from 5);
  end if;
  return left(host, 120);
end;
$$;

revoke all on function private.referrer_host(text) from public, anon, authenticated;

create or replace function private.classify_visit(raw_referrer text, raw_source text, raw_medium text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  host text := private.referrer_host(raw_referrer);
  source text := left(lower(btrim(coalesce(raw_source, ''))), 40);
  medium text := left(lower(btrim(coalesce(raw_medium, ''))), 40);
  kind text;
begin
  kind := case
    when medium in ('cpc', 'ppc', 'paid', 'paidsocial', 'paid_social') then 'ממומן'
    when medium in ('email', 'newsletter') then 'אימייל'
    when medium in ('social', 'organic_social') then 'חברתי'
    when medium in ('organic', 'seo') then 'אורגני'
    when medium <> '' then 'קמפיין'
    else ''
  end;

  if source <> '' then
    return jsonb_build_object(
      'channel', source,
      'type', case when kind <> '' then kind else 'קמפיין' end,
      'referrer', host
    );
  end if;

  if host = '' then
    return jsonb_build_object('channel', 'ישיר', 'type', 'ישיר', 'referrer', '');
  end if;

  if host like 'google.%' or host like '%.google.%' or host in ('bing.com', 'yahoo.com', 'duckduckgo.com') then
    return jsonb_build_object('channel', 'חיפוש', 'type', 'אורגני', 'referrer', host);
  end if;

  if host like 'facebook.%' or host like '%.facebook.%'
    or host like 'instagram.%' or host like '%.instagram.%'
    or host like 'tiktok.%' or host like '%.tiktok.%'
    or host like 'youtube.%' or host like '%.youtube.%'
    or host like 'linkedin.%' or host like '%.linkedin.%'
    or host like 'pinterest.%' or host like '%.pinterest.%'
    or host in ('t.co', 'x.com', 'fb.com', 'l.facebook.com', 'lm.facebook.com') then
    return jsonb_build_object('channel', 'רשת חברתית', 'type', 'חברתי', 'referrer', host);
  end if;

  return jsonb_build_object('channel', host, 'type', 'הפניה', 'referrer', host);
end;
$$;

revoke all on function private.classify_visit(text, text, text) from public, anon, authenticated;

drop function public.record_storefront_event(text, text, text, text, text, text, text, numeric);

create function public.record_storefront_event(
  tracking_key text,
  hostname text,
  visitor_key text,
  event_name text,
  path text,
  country text default '',
  city text default '',
  amount numeric default null,
  referrer text default '',
  utm_source text default '',
  utm_medium text default '',
  utm_campaign text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_key text := lower(btrim(coalesce(tracking_key, '')));
  clean_visitor text := btrim(coalesce(visitor_key, ''));
  clean_host text;
  clean_path text;
  clean_country text;
  clean_city text;
  clean_amount numeric;
  found_store uuid;
  found_session uuid;
  recent_count integer;
  visit jsonb;
begin
  if clean_key !~ '^[0-9a-f]{48}$' or clean_visitor !~ '^[A-Za-z0-9_-]{16,80}$' then
    return jsonb_build_object('ok', false);
  end if;
  if event_name not in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'purchase') then
    return jsonb_build_object('ok', false);
  end if;

  begin
    clean_host := private.clean_hostname(hostname);
  exception
    when sqlstate '22023' then
      return jsonb_build_object('ok', false);
  end;

  select keys.store_id
  into found_store
  from private.store_tracking_keys as keys
  join public.stores as store on store.id = keys.store_id
  where keys.tracking_key = clean_key
    and store.status = 'active';

  if found_store is null then
    return jsonb_build_object('ok', false);
  end if;

  if not exists (
    select 1
    from public.store_domains as domain
    where domain.store_id = found_store
      and domain.hostname = clean_host
      and domain.verified_at is not null
  ) then
    return jsonb_build_object('ok', false);
  end if;

  select count(*)
  into recent_count
  from public.storefront_events as event
  join public.storefront_sessions as session
    on session.store_id = event.store_id
   and session.id = event.session_id
  where session.store_id = found_store
    and session.visitor_key = clean_visitor
    and event.occurred_at > now() - interval '1 minute';

  if recent_count >= 30 then
    return jsonb_build_object('ok', false);
  end if;

  clean_path := left(split_part(btrim(coalesce(path, '/')), '?', 1), 300);
  if clean_path = '' then
    clean_path := '/';
  elsif left(clean_path, 1) <> '/' then
    clean_path := '/' || clean_path;
  end if;
  clean_country := left(regexp_replace(coalesce(country, ''), '[[:cntrl:]]', '', 'g'), 80);
  clean_city := left(regexp_replace(coalesce(city, ''), '[[:cntrl:]]', '', 'g'), 80);
  clean_amount := case
    when event_name = 'purchase' and amount is not null and amount >= 0 and amount <= 1000000 then amount
    else null
  end;
  visit := private.classify_visit(referrer, utm_source, utm_medium);

  insert into public.storefront_sessions as session (
    store_id, visitor_key, hostname, country, city, landing_path, referrer, channel, channel_type, utm_campaign
  )
  values (
    found_store, clean_visitor, clean_host, clean_country, clean_city, clean_path,
    visit->>'referrer', visit->>'channel', visit->>'type', left(btrim(coalesce(utm_campaign, '')), 80)
  )
  on conflict on constraint storefront_sessions_store_id_visitor_key_key do update
  set
    last_seen_at = now(),
    hostname = excluded.hostname,
    country = case when excluded.country <> '' then excluded.country else session.country end,
    city = case when excluded.city <> '' then excluded.city else session.city end,
    referrer = case when excluded.channel <> 'ישיר' then excluded.referrer else session.referrer end,
    channel = case when excluded.channel <> 'ישיר' then excluded.channel else session.channel end,
    channel_type = case when excluded.channel <> 'ישיר' then excluded.channel_type else session.channel_type end,
    utm_campaign = case
      when excluded.channel <> 'ישיר' and excluded.utm_campaign <> '' then excluded.utm_campaign
      else session.utm_campaign
    end,
    converted_at = case
      when event_name = 'purchase' then coalesce(session.converted_at, now())
      else session.converted_at
    end
  returning id into found_session;

  insert into public.storefront_events (store_id, session_id, hostname, name, path, amount)
  values (found_store, found_session, clean_host, event_name, clean_path, clean_amount);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_storefront_event(text, text, text, text, text, text, text, numeric, text, text, text, text) from public, anon;
grant execute on function public.record_storefront_event(text, text, text, text, text, text, text, numeric, text, text, text, text) to anon, authenticated;

create or replace function public.store_attribution_snapshot(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today_start timestamptz;
  window_start timestamptz;
begin
  if not (
    private.has_store_permission(target_store, 'analytics.read', false)
    or private.is_platform_operator('platform.stores.read')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  today_start := (date_trunc('day', now() at time zone 'Asia/Jerusalem')) at time zone 'Asia/Jerusalem';
  window_start := today_start - interval '29 days';

  return coalesce((
    select jsonb_agg(channel_row order by (channel_row->>'visits')::int desc, channel_row->>'channel')
    from (
      select jsonb_build_object(
        'channel', grouped.channel,
        'type', grouped.channel_type,
        'visits', grouped.visits,
        'orders', grouped.orders,
        'sales', grouped.sales,
        'fresh', grouped.fresh,
        'returning', grouped.returning,
        'days', (
          select coalesce(jsonb_agg(coalesce(day.total, 0) order by slot.n), '[]'::jsonb)
          from generate_series(0, 29) as slot(n)
          left join (
            select
              (
                date_trunc('day', event.occurred_at at time zone 'Asia/Jerusalem')::date
                - (window_start at time zone 'Asia/Jerusalem')::date
              )::int as n,
              count(*)::int as total
            from public.storefront_events as event
            join public.storefront_sessions as session
              on session.store_id = event.store_id
             and session.id = event.session_id
            where event.store_id = target_store
              and event.name = 'page_view'
              and session.channel = grouped.channel
              and event.occurred_at >= window_start
              and event.occurred_at < today_start + interval '1 day'
            group by 1
          ) as day on day.n = slot.n
        )
      ) as channel_row
      from (
        select
          session.channel,
          session.channel_type,
          count(*) filter (where event.name = 'page_view')::int as visits,
          count(*) filter (where event.name = 'purchase')::int as orders,
          coalesce(sum(event.amount) filter (where event.name = 'purchase'), 0) as sales,
          count(distinct session.id) filter (
            where event.name = 'page_view' and session.started_at >= window_start
          )::int as fresh,
          count(distinct session.id) filter (
            where event.name = 'page_view' and session.started_at < window_start
          )::int as returning
        from public.storefront_events as event
        join public.storefront_sessions as session
          on session.store_id = event.store_id
         and session.id = event.session_id
        where event.store_id = target_store
          and event.occurred_at >= window_start
          and event.occurred_at < today_start + interval '1 day'
        group by session.channel, session.channel_type
      ) as grouped
      where grouped.visits > 0 or grouped.orders > 0
    ) as packed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.store_attribution_snapshot(uuid) from public, anon;
grant execute on function public.store_attribution_snapshot(uuid) to authenticated;
