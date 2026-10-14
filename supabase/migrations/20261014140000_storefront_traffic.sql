-- One store can be reached on a Vercel hostname while it is being built
-- and on the real hostname after launch. Both are verified domains of the
-- same store, so visits and purchases from either hostname share one store_id.
-- The browser never sends a store id. The storefront server sends the
-- tracking key plus the hostname it actually served.

create or replace function private.clean_hostname(raw text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  clean_host text;
begin
  clean_host := lower(btrim(coalesce(raw, '')));
  if position('://' in clean_host) > 0 then
    clean_host := split_part(clean_host, '://', 2);
  end if;
  clean_host := split_part(split_part(clean_host, '/', 1), '?', 1);
  clean_host := split_part(clean_host, ':', 1);
  if clean_host = '' then
    raise exception 'חסר דומיין' using errcode = '22023';
  end if;
  if position('.' in clean_host) = 0 then
    clean_host := clean_host || '.localhost';
  end if;
  if clean_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'הדומיין לא תקין' using errcode = '22023';
  end if;
  return clean_host;
end;
$$;

revoke all on function private.clean_hostname(text) from public, anon, authenticated;

alter table public.store_domains
  add column kind text not null default 'preview' check (kind in ('preview', 'primary'));

create unique index store_domains_one_preview on public.store_domains (store_id) where kind = 'preview';
create unique index store_domains_one_primary on public.store_domains (store_id) where kind = 'primary';

create table private.store_tracking_keys (
  store_id uuid primary key references public.stores (id),
  tracking_key text not null unique
);

alter table private.store_tracking_keys enable row level security;
alter table private.store_tracking_keys force row level security;
revoke all on table private.store_tracking_keys from public, anon, authenticated;

insert into private.store_tracking_keys (store_id, tracking_key)
select store.id, encode(extensions.gen_random_bytes(24), 'hex')
from public.stores as store
on conflict (store_id) do nothing;

create table public.storefront_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  visitor_key text not null,
  hostname text not null,
  country text not null default '',
  city text not null default '',
  landing_path text not null default '/',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  converted_at timestamptz,
  unique (store_id, id),
  unique (store_id, visitor_key)
);

create index storefront_sessions_seen_idx on public.storefront_sessions (store_id, last_seen_at desc);

create table public.storefront_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  session_id uuid not null,
  hostname text not null,
  name text not null check (name in ('page_view', 'product_view', 'add_to_cart', 'begin_checkout', 'purchase')),
  path text not null default '/',
  amount numeric(12, 2),
  occurred_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, session_id) references public.storefront_sessions (store_id, id)
);

create index storefront_events_time_idx on public.storefront_events (store_id, occurred_at desc);
create index storefront_events_session_idx on public.storefront_events (store_id, session_id, occurred_at desc);

alter table public.storefront_sessions enable row level security;
alter table public.storefront_sessions force row level security;
alter table public.storefront_events enable row level security;
alter table public.storefront_events force row level security;

create trigger storefront_sessions_lock_store
before update on public.storefront_sessions
for each row execute function private.reject_store_id_change();

create trigger storefront_events_lock_store
before update on public.storefront_events
for each row execute function private.reject_store_id_change();

revoke all on table public.storefront_sessions from public, anon, authenticated;
revoke all on table public.storefront_events from public, anon, authenticated;

create or replace function private.event_series(
  target_store uuid,
  range_start timestamptz,
  bucket_count integer,
  bucket_unit text,
  event_name text,
  aggregate_mode text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(coalesce(bucket.total, 0) order by slot.n), '[]'::jsonb)
  from generate_series(0, bucket_count - 1) as slot(n)
  left join (
    select
      (
        case
          when bucket_unit = 'hour' then extract(hour from event.occurred_at at time zone 'Asia/Jerusalem')
          else (
        date_trunc('day', event.occurred_at at time zone 'Asia/Jerusalem')::date
        - (range_start at time zone 'Asia/Jerusalem')::date
      )
        end
      )::int as n,
      case
        when aggregate_mode = 'sum' then coalesce(sum(event.amount), 0)
        else count(*)::numeric
      end as total
    from public.storefront_events as event
    where event.store_id = target_store
      and event.name = event_series.event_name
      and event.occurred_at >= range_start
      and event.occurred_at < range_start + (
        case when bucket_unit = 'hour' then bucket_count * interval '1 hour' else bucket_count * interval '1 day' end
      )
    group by 1
  ) as bucket on bucket.n = slot.n;
$$;

revoke all on function private.event_series(uuid, timestamptz, integer, text, text, text) from public, anon, authenticated;

create or replace function public.record_storefront_event(
  tracking_key text,
  hostname text,
  visitor_key text,
  event_name text,
  path text,
  country text default '',
  city text default '',
  amount numeric default null
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

  insert into public.storefront_sessions as session (store_id, visitor_key, hostname, country, city, landing_path)
  values (found_store, clean_visitor, clean_host, clean_country, clean_city, clean_path)
  on conflict on constraint storefront_sessions_store_id_visitor_key_key do update
  set
    last_seen_at = now(),
    hostname = excluded.hostname,
    country = case when excluded.country <> '' then excluded.country else session.country end,
    city = case when excluded.city <> '' then excluded.city else session.city end,
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

revoke all on function public.record_storefront_event(text, text, text, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.record_storefront_event(text, text, text, text, text, text, text, numeric) to anon, authenticated;

create or replace function public.store_traffic_snapshot(target_store uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  today_start timestamptz;
  yesterday_start timestamptz;
  tomorrow_start timestamptz;
  day_window_start timestamptz;
  previous_window_start timestamptz;
begin
  if not (
    private.has_store_permission(target_store, 'analytics.read', false)
    or private.is_platform_operator('platform.stores.read')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  today_start := (date_trunc('day', now() at time zone 'Asia/Jerusalem')) at time zone 'Asia/Jerusalem';
  yesterday_start := today_start - interval '1 day';
  tomorrow_start := today_start + interval '1 day';
  day_window_start := today_start - interval '29 days';
  previous_window_start := day_window_start - interval '30 days';

  return jsonb_build_object(
    'now', jsonb_build_object(
      'visitors', (
        select count(*)::int from public.storefront_sessions as session
        where session.store_id = target_store and session.last_seen_at >= now() - interval '5 minutes'
      ),
      'visits', (
        select count(*)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'page_view' and event.occurred_at >= now() - interval '5 minutes'
      ),
      'orders', (
        select count(*)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase' and event.occurred_at >= now() - interval '5 minutes'
      ),
      'sales', (
        select coalesce(sum(event.amount), 0) from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase' and event.occurred_at >= now() - interval '5 minutes'
      ),
      'carts', (
        select count(*)::int from public.storefront_sessions as session
        where session.store_id = target_store
          and session.converted_at is null
          and session.last_seen_at >= now() - interval '30 minutes'
          and exists (
            select 1 from public.storefront_events as event
            where event.store_id = session.store_id
              and event.session_id = session.id
              and event.name = 'add_to_cart'
              and event.occurred_at >= now() - interval '30 minutes'
          )
      ),
      'checkouts', (
        select count(*)::int from public.storefront_sessions as session
        where session.store_id = target_store
          and session.converted_at is null
          and session.last_seen_at >= now() - interval '30 minutes'
          and exists (
            select 1 from public.storefront_events as event
            where event.store_id = session.store_id
              and event.session_id = session.id
              and event.name = 'begin_checkout'
              and event.occurred_at >= now() - interval '30 minutes'
          )
      ),
      'purchased', (
        select count(distinct event.session_id)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase' and event.occurred_at >= now() - interval '30 minutes'
      ),
      'newVisitors', (
        select count(*)::int from public.storefront_sessions as session
        where session.store_id = target_store
          and session.last_seen_at >= now() - interval '5 minutes'
          and session.started_at >= today_start
      ),
      'returningVisitors', (
        select count(*)::int from public.storefront_sessions as session
        where session.store_id = target_store
          and session.last_seen_at >= now() - interval '5 minutes'
          and session.started_at < today_start
      ),
      'locations', coalesce((
        select jsonb_agg(jsonb_build_object('label', place.label, 'count', place.total) order by place.total desc)
        from (
          select coalesce(nullif(session.city, ''), nullif(session.country, ''), 'לא ידוע') as label, count(*)::int as total
          from public.storefront_sessions as session
          where session.store_id = target_store and session.last_seen_at >= now() - interval '5 minutes'
          group by 1
          order by total desc
          limit 8
        ) as place
      ), '[]'::jsonb)
    ),
    'today', jsonb_build_object(
      'visits', (
        select count(*)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'page_view'
          and event.occurred_at >= today_start and event.occurred_at < tomorrow_start
      ),
      'orders', (
        select count(*)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase'
          and event.occurred_at >= today_start and event.occurred_at < tomorrow_start
      ),
      'sales', (
        select coalesce(sum(event.amount), 0) from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase'
          and event.occurred_at >= today_start and event.occurred_at < tomorrow_start
      ),
      'carts', (
        select count(distinct event.session_id)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'add_to_cart'
          and event.occurred_at >= today_start and event.occurred_at < tomorrow_start
      ),
      'checkouts', (
        select count(distinct event.session_id)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'begin_checkout'
          and event.occurred_at >= today_start and event.occurred_at < tomorrow_start
      ),
      'visitsByHour', private.event_series(target_store, today_start, 24, 'hour', 'page_view', 'count'),
      'ordersByHour', private.event_series(target_store, today_start, 24, 'hour', 'purchase', 'count'),
      'salesByHour', private.event_series(target_store, today_start, 24, 'hour', 'purchase', 'sum'),
      'locations', coalesce((
        select jsonb_agg(jsonb_build_object('label', place.label, 'count', place.total) order by place.total desc)
        from (
          select coalesce(nullif(session.city, ''), nullif(session.country, ''), 'לא ידוע') as label, count(*)::int as total
          from public.storefront_sessions as session
          where session.store_id = target_store and session.last_seen_at >= today_start
          group by 1
          order by total desc
          limit 8
        ) as place
      ), '[]'::jsonb)
    ),
    'yesterday', jsonb_build_object(
      'visits', (
        select count(*)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'page_view'
          and event.occurred_at >= yesterday_start and event.occurred_at < today_start
      ),
      'orders', (
        select count(*)::int from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase'
          and event.occurred_at >= yesterday_start and event.occurred_at < today_start
      ),
      'sales', (
        select coalesce(sum(event.amount), 0) from public.storefront_events as event
        where event.store_id = target_store and event.name = 'purchase'
          and event.occurred_at >= yesterday_start and event.occurred_at < today_start
      ),
      'visitsByHour', private.event_series(target_store, yesterday_start, 24, 'hour', 'page_view', 'count'),
      'ordersByHour', private.event_series(target_store, yesterday_start, 24, 'hour', 'purchase', 'count'),
      'salesByHour', private.event_series(target_store, yesterday_start, 24, 'hour', 'purchase', 'sum')
    ),
    'days', jsonb_build_object(
      'sales', private.event_series(target_store, day_window_start, 30, 'day', 'purchase', 'sum'),
      'orders', private.event_series(target_store, day_window_start, 30, 'day', 'purchase', 'count'),
      'visits', private.event_series(target_store, day_window_start, 30, 'day', 'page_view', 'count'),
      'previousSales', private.event_series(target_store, previous_window_start, 30, 'day', 'purchase', 'sum'),
      'previousOrders', private.event_series(target_store, previous_window_start, 30, 'day', 'purchase', 'count'),
      'previousVisits', private.event_series(target_store, previous_window_start, 30, 'day', 'page_view', 'count')
    )
  );
end;
$$;

revoke all on function public.store_traffic_snapshot(uuid) from public, anon;
grant execute on function public.store_traffic_snapshot(uuid) to authenticated;

create or replace function public.attach_store_domain(
  target_store uuid,
  site_host text,
  site_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_host text;
  store_environment text;
  verified timestamptz;
begin
  if not private.is_platform_operator('platform.domains.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if site_kind not in ('preview', 'primary') then
    raise exception 'סוג דומיין לא תקין' using errcode = '22023';
  end if;

  clean_host := private.clean_hostname(site_host);

  select environment into store_environment
  from public.stores
  where id = target_store and status = 'active';

  if store_environment is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.store_domains as domain
    where domain.hostname = clean_host
      and not (domain.store_id = target_store and domain.kind = site_kind)
  ) then
    raise exception 'הדומיין כבר תפוס' using errcode = '23505';
  end if;

  if site_kind = 'preview' and exists (
    select 1 from public.store_domains as domain
    where domain.store_id = target_store and domain.kind = 'primary'
  ) then
    select domain.verified_at - interval '1 second'
    into verified
    from public.store_domains as domain
    where domain.store_id = target_store and domain.kind = 'primary';
  else
    verified := now();
  end if;

  update public.store_domains as domain
  set hostname = clean_host, verified_at = verified
  where domain.store_id = target_store
    and domain.kind = site_kind;

  if not found then
    insert into public.store_domains (store_id, hostname, environment, verified_at, kind)
    values (target_store, clean_host, store_environment, verified, site_kind);
  end if;

  return jsonb_build_object('hostname', clean_host, 'kind', site_kind);
end;
$$;

revoke all on function public.attach_store_domain(uuid, text, text) from public, anon;
grant execute on function public.attach_store_domain(uuid, text, text) to authenticated;

create or replace function public.create_store(store_name text, store_environment text default 'development')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if store_environment not in ('production', 'development') then
    raise exception 'invalid environment';
  end if;

  insert into public.stores (name, environment)
  values (store_name, store_environment)
  returning id into new_id;

  insert into public.store_settings (store_id, display_name)
  values (new_id, store_name);

  insert into private.store_tracking_keys (store_id, tracking_key)
  values (new_id, encode(extensions.gen_random_bytes(24), 'hex'));

  perform private.copy_builtin_roles(new_id);
  return new_id;
end;
$$;

drop function public.create_platform_store(text, text, text, text, text);

create function public.create_platform_store(
  store_name text,
  owner_name text,
  owner_email text,
  owner_password text,
  site_host text,
  primary_host text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_store uuid;
  new_user uuid := gen_random_uuid();
  owner_role uuid;
  clean_host text;
  clean_primary text;
  clean_email text;
  preview_verified timestamptz := now();
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if store_name is null or length(btrim(store_name)) < 2 then
    raise exception 'חסר שם חנות' using errcode = '22023';
  end if;
  if owner_name is null or length(btrim(owner_name)) < 2 then
    raise exception 'חסר שם הבעלים' using errcode = '22023';
  end if;

  clean_email := lower(btrim(owner_email));
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'האימייל לא תקין' using errcode = '22023';
  end if;
  if owner_password is null or char_length(owner_password) < 8 then
    raise exception 'הסיסמה צריכה 8 תווים לפחות' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean_email) then
    raise exception 'האימייל כבר בשימוש' using errcode = '23505';
  end if;

  clean_host := private.clean_hostname(site_host);
  if exists (select 1 from public.store_domains as domain where domain.hostname = clean_host) then
    raise exception 'הדומיין כבר תפוס' using errcode = '23505';
  end if;

  if btrim(coalesce(primary_host, '')) <> '' then
    clean_primary := private.clean_hostname(primary_host);
    if clean_primary = clean_host or exists (
      select 1 from public.store_domains as domain where domain.hostname = clean_primary
    ) then
      raise exception 'הדומיין כבר תפוס' using errcode = '23505';
    end if;
    preview_verified := now() - interval '1 second';
  end if;

  new_store := public.create_store(btrim(store_name), 'development');

  insert into public.store_domains (store_id, hostname, environment, verified_at, kind)
  values (new_store, clean_host, 'development', preview_verified, 'preview');

  if clean_primary is not null then
    insert into public.store_domains (store_id, hostname, environment, verified_at, kind)
    values (new_store, clean_primary, 'development', now(), 'primary');
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user,
    'authenticated',
    'authenticated',
    clean_email,
    extensions.crypt(owner_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', btrim(owner_name)),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_user,
    jsonb_build_object('sub', new_user::text, 'email', clean_email, 'email_verified', true),
    'email',
    new_user::text,
    now(),
    now()
  );

  select id into owner_role
  from public.roles
  where store_id = new_store and key = 'owner';

  insert into public.store_members (store_id, user_id, role_id, display_name, status)
  values (new_store, new_user, owner_role, btrim(owner_name), 'active');

  return jsonb_build_object('id', new_store, 'hostname', clean_host, 'email', clean_email);
end;
$$;

revoke all on function public.create_platform_store(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_platform_store(text, text, text, text, text, text) to authenticated;

create or replace function public.list_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_operator('platform.stores.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(payload order by store_name)
      from (
        select
          s.name as store_name,
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'status', s.status,
            'environment', s.environment,
            'displayName', ss.display_name,
            'hostname', coalesce(sd.primary_host, sd.preview_host),
            'previewHost', sd.preview_host,
            'primaryHost', sd.primary_host,
            'trackingKey', keys.tracking_key,
            'domainVerified', sd.preview_host is not null or sd.primary_host is not null,
            'modules', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', module.module_id,
                'enabled', module.enabled
              ) order by module.module_id)
              from public.store_modules module
              where module.store_id = s.id
            ), '[]'::jsonb),
            'members', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', person.display_name,
                'email', person.email,
                'role', person.role_name,
                'roleKey', person.role_key,
                'status', person.status
              ) order by person.role_key, person.display_name)
              from (
                select
                  member.display_name,
                  account.email,
                  role.name as role_name,
                  role.key as role_key,
                  member.status
                from public.store_members member
                join public.roles role
                  on role.store_id = member.store_id
                  and role.id = member.role_id
                join auth.users account on account.id = member.user_id
                where member.store_id = s.id
              ) person
            ), '[]'::jsonb)
          ) as payload
        from public.stores s
        left join public.store_settings ss on ss.store_id = s.id
        left join private.store_tracking_keys keys on keys.store_id = s.id
        left join lateral (
          select
            max(domain.hostname) filter (where domain.kind = 'preview') as preview_host,
            max(domain.hostname) filter (where domain.kind = 'primary') as primary_host
          from public.store_domains domain
          where domain.store_id = s.id
        ) sd on true
      ) store_row
    ),
    '[]'::jsonb
  );
end;
$$;
