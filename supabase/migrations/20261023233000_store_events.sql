-- Events for one store. The public read is a separate function from the product catalog.
-- anon can execute the read and the registration calls. anon has no table privileges.
-- Zoom links stay on the row and in the confirmation mail. They are not in the public payload.

create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

revoke all on function extensions.http(extensions.http_request) from public, anon, authenticated;
revoke all on function extensions.http_post(character varying, character varying, character varying) from public, anon, authenticated;
revoke all on function extensions.http_post(character varying, jsonb) from public, anon, authenticated;
revoke all on function extensions.http_get(character varying) from public, anon, authenticated;
revoke all on function extensions.http_get(character varying, jsonb) from public, anon, authenticated;

create or replace function private.can_read_content(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_store is not null and (
    private.has_store_permission(target_store, 'content.read', false)
    or private.is_platform_operator('platform.stores.read')
    or private.is_platform_operator('platform.stores.create')
  );
$$;

create or replace function private.can_write_content(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_store is not null and (
    private.has_store_permission(target_store, 'content.update', true)
    or private.is_platform_operator('platform.stores.read')
    or private.is_platform_operator('platform.stores.create')
  );
$$;

revoke all on function private.can_read_content(uuid) from public, anon;
revoke all on function private.can_write_content(uuid) from public, anon;
grant execute on function private.can_read_content(uuid) to authenticated;
grant execute on function private.can_write_content(uuid) to authenticated;

create or replace function private.event_phone_key(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when digits = '' then ''
    when digits like '972%' and length(digits) >= 11 then '0' || substr(digits, 4)
    else digits
  end
  from (
    select regexp_replace(coalesce(value, ''), '\D', '', 'g') as digits
  ) as cleaned;
$$;

create or replace function private.event_xml(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(replace(replace(coalesce(value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&apos;');
$$;

revoke all on function private.event_phone_key(text) from public, anon, authenticated;
revoke all on function private.event_xml(text) from public, anon, authenticated;

create table public.store_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  slug text not null,
  title text not null,
  short text not null default '',
  body jsonb not null default '[]'::jsonb,
  event_date date not null,
  starts_at time not null,
  ends_at time not null,
  online boolean not null default true,
  address text,
  price integer not null default 0,
  status text not null default 'draft',
  image text,
  zoom_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, slug),
  check (status in ('draft', 'open', 'full', 'ended', 'cancelled')),
  check (price >= 0 and price <= 1000000),
  check (char_length(title) between 1 and 120),
  check (char_length(short) <= 280),
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  check (ends_at > starts_at),
  check (online = (address is null)),
  check (online or zoom_url is null),
  check (image is null or image ~ '^https://[^[:space:]]+$'),
  check (zoom_url is null or zoom_url ~ '^https://[^[:space:]]+$'),
  check (jsonb_typeof(body) = 'array')
);

create index store_events_when_idx on public.store_events (store_id, event_date, starts_at);

comment on table public.store_events is
  'Workshops edited in the admin. Drafts stay private. zoom_url is never returned by store_public_events.';

comment on column public.store_events.zoom_url is
  'Online meeting link. Stored for the admin and for the confirmation mail only.';

create table public.store_event_registrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  event_id uuid not null,
  customer_id uuid,
  order_id uuid,
  full_name text not null,
  phone text not null,
  phone_key text not null default '',
  email text not null,
  stage text not null,
  due_date date,
  pregnancy_week integer,
  baby_birth_date date,
  terms_accepted boolean not null,
  marketing_consent boolean not null default false,
  payment_status text not null,
  source text not null default 'site',
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, event_id) references public.store_events (store_id, id) on delete cascade,
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null,
  foreign key (store_id, order_id) references public.orders (store_id, id) on delete set null,
  check (char_length(btrim(full_name)) between 2 and 120),
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  check (char_length(phone_key) between 9 and 15),
  check (stage in ('pregnant', 'gave_birth')),
  check (pregnancy_week is null or pregnancy_week between 4 and 42),
  check (
    (stage = 'pregnant' and baby_birth_date is null and (due_date is not null or pregnancy_week is not null))
    or (stage = 'gave_birth' and baby_birth_date is not null and due_date is null and pregnancy_week is null)
  ),
  check (terms_accepted),
  check (payment_status in ('pending', 'free', 'paid')),
  check (source in ('site', 'admin')),
  check (payment_status <> 'pending' or confirmed_at is null)
);

create unique index store_event_registrations_email_idx
  on public.store_event_registrations (store_id, event_id, email);

create unique index store_event_registrations_phone_idx
  on public.store_event_registrations (store_id, event_id, phone_key);

create index store_event_registrations_event_idx
  on public.store_event_registrations (store_id, event_id, created_at desc);

comment on table public.store_event_registrations is
  'Event signups. No anon table access. A free open event confirms on insert. A paid event stays pending until payment succeeds.';

create table public.store_event_notices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  registration_id uuid not null,
  kind text not null,
  channel text not null,
  status text not null,
  attempts integer not null default 1,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (registration_id, kind, channel),
  foreign key (store_id, registration_id) references public.store_event_registrations (store_id, id) on delete cascade,
  check (kind in ('confirm', 'day', 'hour')),
  check (channel in ('email', 'sms')),
  check (status in ('sent', 'failed')),
  check (attempts >= 1)
);

create index store_event_notices_registration_idx
  on public.store_event_notices (store_id, registration_id);

comment on table public.store_event_notices is
  'Confirmation and reminder attempts. The message body is not stored, so a zoom link is not copied here.';

alter table public.store_events enable row level security;
alter table public.store_events force row level security;
alter table public.store_event_registrations enable row level security;
alter table public.store_event_registrations force row level security;
alter table public.store_event_notices enable row level security;
alter table public.store_event_notices force row level security;

create trigger store_events_lock_store
  before update on public.store_events
  for each row execute function private.reject_store_id_change();

create trigger store_event_registrations_lock_store
  before update on public.store_event_registrations
  for each row execute function private.reject_store_id_change();

create trigger store_event_notices_lock_store
  before update on public.store_event_notices
  for each row execute function private.reject_store_id_change();

revoke all on table public.store_events from public, anon, authenticated;
revoke all on table public.store_event_registrations from public, anon, authenticated;
revoke all on table public.store_event_notices from public, anon, authenticated;

grant select, insert, update, delete on table public.store_events to authenticated;
grant select, insert, update, delete on table public.store_event_registrations to authenticated;
grant select on table public.store_event_notices to authenticated;

create policy store_events_select on public.store_events
  for select to authenticated
  using ((select private.can_read_content(store_id)));

create policy store_events_insert on public.store_events
  for insert to authenticated
  with check ((select private.can_write_content(store_id)));

create policy store_events_update on public.store_events
  for update to authenticated
  using ((select private.can_write_content(store_id)))
  with check ((select private.can_write_content(store_id)));

create policy store_events_delete on public.store_events
  for delete to authenticated
  using ((select private.can_write_content(store_id)));

create policy store_event_registrations_select on public.store_event_registrations
  for select to authenticated
  using ((select private.can_read_content(store_id)));

create policy store_event_registrations_insert on public.store_event_registrations
  for insert to authenticated
  with check ((select private.can_write_content(store_id)));

create policy store_event_registrations_update on public.store_event_registrations
  for update to authenticated
  using ((select private.can_write_content(store_id)))
  with check ((select private.can_write_content(store_id)));

create policy store_event_registrations_delete on public.store_event_registrations
  for delete to authenticated
  using ((select private.can_write_content(store_id)));

create policy store_event_notices_select on public.store_event_notices
  for select to authenticated
  using ((select private.can_read_content(store_id)));

create or replace function private.prepare_store_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  paragraph text;
  next_body jsonb := '[]'::jsonb;
begin
  new.slug := lower(btrim(coalesce(new.slug, '')));
  new.title := btrim(coalesce(new.title, ''));
  new.short := btrim(coalesce(new.short, ''));
  new.address := nullif(btrim(coalesce(new.address, '')), '');
  new.zoom_url := nullif(btrim(coalesce(new.zoom_url, '')), '');
  new.image := nullif(btrim(coalesce(new.image, '')), '');
  new.updated_at := pg_catalog.now();

  if new.online then
    new.address := null;
  else
    new.zoom_url := null;
  end if;

  if char_length(new.title) < 1 or char_length(new.title) > 120 then
    raise exception 'השם צריך להיות עד 120 תווים' using errcode = '22023';
  end if;
  if char_length(new.short) > 280 then
    raise exception 'התיאור הקצר צריך להיות עד 280 תווים' using errcode = '22023';
  end if;
  if new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'הכתובת יכולה להכיל אותיות לטיניות, מספרים ומקף' using errcode = '22023';
  end if;
  if new.status not in ('draft', 'open', 'full', 'ended', 'cancelled') then
    raise exception 'סטטוס לא תקין' using errcode = '22023';
  end if;
  if new.ends_at <= new.starts_at then
    raise exception 'שעת הסיום צריכה להיות אחרי שעת ההתחלה' using errcode = '22023';
  end if;
  if not new.online and new.address is null then
    raise exception 'למפגש פרונטלי צריך כתובת' using errcode = '22023';
  end if;
  if new.price < 0 then
    raise exception 'המחיר לא יכול להיות שלילי' using errcode = '22023';
  end if;
  if new.image is not null and new.image !~ '^https://' then
    raise exception 'התמונה צריכה להיות כתובת https' using errcode = '22023';
  end if;
  if new.zoom_url is not null and new.zoom_url !~ '^https://' then
    raise exception 'קישור הזום צריך להתחיל ב-https' using errcode = '22023';
  end if;
  if new.body is null or jsonb_typeof(new.body) <> 'array' then
    raise exception 'התיאור המלא הוא רשימת פסקאות' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(new.body) as value
  loop
    if jsonb_typeof(item) <> 'string' then
      raise exception 'התיאור המלא הוא טקסט בלי HTML' using errcode = '22023';
    end if;
    paragraph := btrim(item #>> '{}');
    if paragraph = '' then
      continue;
    end if;
    if position('<' in paragraph) > 0 or position('>' in paragraph) > 0 then
      raise exception 'התיאור המלא הוא טקסט בלי HTML' using errcode = '22023';
    end if;
    if char_length(paragraph) > 2000 then
      raise exception 'פסקה ארוכה מדי' using errcode = '22023';
    end if;
    next_body := next_body || jsonb_build_array(paragraph);
  end loop;
  if jsonb_array_length(next_body) > 40 then
    raise exception 'יותר מדי פסקאות' using errcode = '22023';
  end if;
  new.body := next_body;
  return new;
end;
$$;

create trigger store_events_prepare
  before insert or update on public.store_events
  for each row execute function private.prepare_store_event();

create or replace function private.event_registration_problem(
  full_name text,
  email text,
  phone_key text,
  stage text,
  due_date date,
  pregnancy_week integer,
  baby_birth_date date,
  terms_accepted boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(btrim(coalesce(full_name, ''))) < 2 or char_length(btrim(full_name)) > 120 then
    return 'צריך שם מלא';
  end if;
  if lower(btrim(coalesce(email, ''))) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'מייל לא תקין';
  end if;
  if char_length(coalesce(phone_key, '')) < 9 or char_length(phone_key) > 15 then
    return 'טלפון לא תקין';
  end if;
  if coalesce(terms_accepted, false) is not true then
    return 'צריך לאשר את התנאים';
  end if;
  if stage = 'pregnant' then
    if baby_birth_date is not null then
      return 'בהריון לא ממלאים תאריך לידה של תינוק';
    end if;
    if due_date is null and pregnancy_week is null then
      return 'צריך תאריך לידה משוער או שבוע הריון';
    end if;
    if pregnancy_week is not null and (pregnancy_week < 4 or pregnancy_week > 42) then
      return 'שבוע ההריון צריך להיות בין 4 ל-42';
    end if;
    return null;
  end if;
  if stage = 'gave_birth' then
    if due_date is not null or pregnancy_week is not null then
      return 'אחרי לידה ממלאים את תאריך הלידה של התינוק';
    end if;
    if baby_birth_date is null then
      return 'צריך את תאריך הלידה של התינוק';
    end if;
    return null;
  end if;
  return 'צריך לבחור בהריון או ילדתי';
end;
$$;

create or replace function private.match_store_customer(target_store uuid, email_key text, phone_key text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select customer.id
  from public.customers as customer
  where customer.store_id = target_store
    and (
      (email_key <> '' and lower(btrim(coalesce(customer.email, ''))) = email_key)
      or (phone_key <> '' and private.event_phone_key(customer.phone) = phone_key)
    )
  order by
    (
      email_key <> ''
      and lower(btrim(coalesce(customer.email, ''))) = email_key
      and phone_key <> ''
      and private.event_phone_key(customer.phone) = phone_key
    ) desc,
    (email_key <> '' and lower(btrim(coalesce(customer.email, ''))) = email_key) desc,
    customer.created_at desc
  limit 1;
$$;

create or replace function private.grant_event_consent(
  target_store uuid,
  target_customer uuid,
  email_key text,
  phone_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed uuid;
begin
  update public.customers as customer
  set subscribed = true,
      email_consent_status = 'subscribed',
      email_consent_at = coalesce(customer.email_consent_at, pg_catalog.now()),
      email_consent_source = case when customer.email_consent_source = '' then 'event' else customer.email_consent_source end
  where customer.store_id = target_store
    and customer.id = target_customer
    and customer.email_consent_status is distinct from 'subscribed'
  returning customer.id into changed;

  if changed is not null then
    insert into public.marketing_consent_events (store_id, customer_id, channel, status, source, address)
    values (target_store, target_customer, 'email', 'subscribed', 'event', email_key);
  end if;

  if phone_key = '' then
    return;
  end if;

  changed := null;
  update public.customers as customer
  set sms = true,
      sms_consent_status = 'subscribed',
      sms_consent_at = coalesce(customer.sms_consent_at, pg_catalog.now()),
      sms_consent_source = case when customer.sms_consent_source = '' then 'event' else customer.sms_consent_source end
  where customer.store_id = target_store
    and customer.id = target_customer
    and customer.sms_consent_status is distinct from 'subscribed'
  returning customer.id into changed;

  if changed is not null then
    insert into public.marketing_consent_events (store_id, customer_id, channel, status, source, address)
    values (target_store, target_customer, 'sms', 'subscribed', 'event', phone_key);
  end if;
end;
$$;

create or replace function private.prepare_event_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  problem text;
  event_price integer;
begin
  new.full_name := btrim(coalesce(new.full_name, ''));
  new.email := lower(btrim(coalesce(new.email, '')));
  new.phone := btrim(coalesce(new.phone, ''));
  new.phone_key := private.event_phone_key(new.phone);
  new.marketing_consent := coalesce(new.marketing_consent, false);

  problem := private.event_registration_problem(
    new.full_name, new.email, new.phone_key, new.stage, new.due_date, new.pregnancy_week, new.baby_birth_date, new.terms_accepted
  );
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;

  select event.price
  into event_price
  from public.store_events as event
  where event.store_id = new.store_id
    and event.id = new.event_id;
  if event_price is null then
    raise exception 'האירוע לא נמצא' using errcode = '22023';
  end if;

  if new.source = 'admin' and new.payment_status = 'pending' then
    new.payment_status := case when event_price = 0 then 'free' else 'paid' end;
  end if;
  if new.payment_status in ('free', 'paid') then
    new.confirmed_at := coalesce(new.confirmed_at, pg_catalog.now());
  else
    new.confirmed_at := null;
  end if;

  new.customer_id := coalesce(new.customer_id, private.match_store_customer(new.store_id, new.email, new.phone_key));
  if new.customer_id is null and new.source = 'admin' then
    insert into public.customers (store_id, name, email, phone, subscribed, sms)
    values (new.store_id, new.full_name, new.email, new.phone, new.marketing_consent, new.marketing_consent and new.phone_key <> '')
    returning id into new.customer_id;
  end if;

  if new.marketing_consent and new.customer_id is not null then
    perform private.grant_event_consent(new.store_id, new.customer_id, new.email, new.phone_key);
  end if;
  return new;
end;
$$;

create trigger store_event_registrations_prepare
  before insert or update of full_name, phone, email, stage, due_date, pregnancy_week, baby_birth_date, terms_accepted, marketing_consent, payment_status, source
  on public.store_event_registrations
  for each row execute function private.prepare_event_registration();

revoke all on function private.prepare_store_event() from public, anon, authenticated;
revoke all on function private.event_registration_problem(text, text, text, text, date, integer, date, boolean) from public, anon, authenticated;
revoke all on function private.match_store_customer(uuid, text, text) from public, anon, authenticated;
revoke all on function private.grant_event_consent(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.prepare_event_registration() from public, anon, authenticated;

create or replace function private.event_notice_text(
  kind text,
  person_name text,
  title text,
  event_date date,
  starts_at time,
  ends_at time,
  online boolean,
  address text,
  zoom_url text,
  paid boolean
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  when_line text := to_char(event_date, 'DD.MM.YYYY') || ' בשעה ' || to_char(starts_at, 'HH24:MI') || ' עד ' || to_char(ends_at, 'HH24:MI');
  place_line text;
  opening text;
begin
  if online then
    place_line := case
      when coalesce(btrim(zoom_url), '') = '' then 'המפגש בזום. הקישור יישלח כשיתעדכן.'
      else 'קישור הזום: ' || btrim(zoom_url)
    end;
  else
    place_line := 'הכתובת: ' || coalesce(btrim(address), '');
  end if;
  opening := case kind
    when 'day' then 'תזכורת: מחר ' || title || '.'
    when 'hour' then 'תזכורת: בעוד שעה מתחיל ' || title || '.'
    else 'שלום ' || person_name || ', ההרשמה ל' || title || ' אושרה.'
  end;
  if kind = 'confirm' and paid then
    opening := opening || ' התשלום התקבל.';
  end if;
  return opening || E'\n' || when_line || E'\n' || place_line;
end;
$$;

create or replace function private.record_event_notice(
  target_store uuid,
  target_registration uuid,
  kind text,
  channel text,
  succeeded boolean,
  detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.store_event_notices as notice (store_id, registration_id, kind, channel, status, attempts, last_error)
  values (
    target_store,
    target_registration,
    kind,
    channel,
    case when succeeded then 'sent' else 'failed' end,
    1,
    left(coalesce(detail, ''), 180)
  )
  on conflict (registration_id, kind, channel) do update
  set status = case when succeeded then 'sent' else 'failed' end,
      attempts = notice.attempts + 1,
      last_error = left(coalesce(detail, ''), 180);
end;
$$;

create or replace function private.deliver_event_notice(target_registration uuid, kind text, channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup public.store_event_registrations%rowtype;
  event public.store_events%rowtype;
  starts timestamptz;
  prior_status text;
  prior_attempts integer;
  api_key text;
  from_email text;
  from_name text;
  sms_user text;
  sms_password text;
  sms_from text;
  body text;
  payload text;
  http_status integer := 0;
  http_body text := '';
  soap text;
begin
  select *
  into signup
  from public.store_event_registrations as registration
  where registration.id = target_registration;
  if not found or signup.payment_status not in ('free', 'paid') then
    return;
  end if;

  select notice.status, notice.attempts
  into prior_status, prior_attempts
  from public.store_event_notices as notice
  where notice.registration_id = signup.id
    and notice.kind = deliver_event_notice.kind
    and notice.channel = deliver_event_notice.channel;
  if prior_status = 'sent' or coalesce(prior_attempts, 0) >= 3 then
    return;
  end if;

  select *
  into event
  from public.store_events as saved
  where saved.store_id = signup.store_id
    and saved.id = signup.event_id;
  if not found then
    return;
  end if;
  if deliver_event_notice.kind <> 'confirm' and event.status in ('draft', 'cancelled') then
    return;
  end if;

  starts := (event.event_date + event.starts_at) at time zone 'Asia/Jerusalem';
  if deliver_event_notice.kind = 'day' then
    if signup.confirmed_at >= starts - interval '1 day' then
      return;
    end if;
    if pg_catalog.now() < starts - interval '1 day' or pg_catalog.now() >= starts - interval '1 hour' then
      return;
    end if;
  elsif deliver_event_notice.kind = 'hour' then
    if signup.confirmed_at >= starts - interval '1 hour' then
      return;
    end if;
    if pg_catalog.now() < starts - interval '1 hour' or pg_catalog.now() >= starts then
      return;
    end if;
  end if;

  if deliver_event_notice.channel = 'sms' and deliver_event_notice.kind = 'confirm' then
    return;
  end if;

  select saved.resend_api_key, saved.resend_from_email, saved.resend_from_name,
         saved.pulseem_user, saved.pulseem_password, saved.pulseem_from
  into api_key, from_email, from_name, sms_user, sms_password, sms_from
  from private.store_messaging as saved
  where saved.store_id = signup.store_id;

  body := private.event_notice_text(
    deliver_event_notice.kind,
    signup.full_name,
    event.title,
    event.event_date,
    event.starts_at,
    event.ends_at,
    event.online,
    event.address,
    event.zoom_url,
    signup.payment_status = 'paid'
  );

  if deliver_event_notice.channel = 'email' then
    if coalesce(api_key, '') = '' or coalesce(from_email, '') = '' then
      return;
    end if;
    payload := jsonb_build_object(
      'from', case
        when btrim(coalesce(from_name, '')) = '' then from_email
        else replace(replace(from_name, '<', ''), '>', '') || ' <' || from_email || '>'
      end,
      'to', jsonb_build_array(signup.email),
      'subject', case deliver_event_notice.kind
        when 'day' then 'תזכורת למחר: ' || event.title
        when 'hour' then 'תזכורת לעוד שעה: ' || event.title
        else 'אישור הרשמה: ' || event.title
      end,
      'text', body
    )::text;
    begin
      perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '12');
      select response.status, left(coalesce(response.content, ''), 180)
      into http_status, http_body
      from extensions.http((
        'POST'::extensions.http_method,
        'https://api.resend.com/emails'::varchar,
        array[
          extensions.http_header('Authorization', 'Bearer ' || api_key),
          extensions.http_header('Content-Type', 'application/json')
        ]::extensions.http_header[],
        'application/json'::varchar,
        payload::varchar
      )::extensions.http_request) as response;
    exception when others then
      http_status := 0;
      http_body := left(sqlerrm, 180);
    end;
    perform private.record_event_notice(signup.store_id, signup.id, deliver_event_notice.kind, 'email', http_status between 200 and 299, http_body);
    return;
  end if;

  if coalesce(sms_user, '') = '' or coalesce(sms_password, '') = '' or coalesce(sms_from, '') = '' then
    return;
  end if;

  soap :=
    '<?xml version="1.0" encoding="utf-8"?>'
    || '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
    || '<soap:Body><SendSingleSMS xmlns="http://tempuri.org/">'
    || '<userID>' || private.event_xml(sms_user) || '</userID>'
    || '<password>' || private.event_xml(sms_password) || '</password>'
    || '<fromNumber>' || private.event_xml(sms_from) || '</fromNumber>'
    || '<toNumber>' || private.event_xml(signup.phone_key) || '</toNumber>'
    || '<reference>' || private.event_xml(signup.id::text) || '</reference>'
    || '<text>' || private.event_xml(left(body, 480)) || '</text>'
    || '<delayDeliveryMinutes>0</delayDeliveryMinutes>'
    || '</SendSingleSMS></soap:Body></soap:Envelope>';
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '12');
    select response.status, left(coalesce(response.content, ''), 180)
    into http_status, http_body
    from extensions.http((
      'POST'::extensions.http_method,
      'https://www.pulseemapi.com:9999/pulseemsendservices.asmx'::varchar,
      array[
        extensions.http_header('Content-Type', 'text/xml; charset=utf-8'),
        extensions.http_header('SOAPAction', 'http://tempuri.org/SendSingleSMS')
      ]::extensions.http_header[],
      'text/xml; charset=utf-8'::varchar,
      soap::varchar
    )::extensions.http_request) as response;
  exception when others then
    http_status := 0;
    http_body := left(sqlerrm, 180);
  end;
  perform private.record_event_notice(
    signup.store_id,
    signup.id,
    deliver_event_notice.kind,
    'sms',
    http_status between 200 and 299 and http_body like '%>Success<%',
    case when http_body like '%>Success<%' then '' else http_body end
  );
end;
$$;

create or replace function private.dispatch_event_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job record;
begin
  if not pg_catalog.pg_try_advisory_lock(pg_catalog.hashtext('store-event-reminders')) then
    return;
  end if;

  begin
    for job in
      select registration.id as registration_id, due.kind, due.channel
      from public.store_event_registrations as registration
      join public.store_events as event
        on event.store_id = registration.store_id
       and event.id = registration.event_id
      cross join lateral (
        select 'confirm'::text as kind, 'email'::text as channel
        where registration.confirmed_at > pg_catalog.now() - interval '2 days'
        union all
        select 'day', 'email'
        where registration.confirmed_at < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 day'
          and pg_catalog.now() >= ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 day'
          and pg_catalog.now() < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 hour'
          and event.status not in ('draft', 'cancelled')
        union all
        select 'hour', 'email'
        where registration.confirmed_at < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 hour'
          and pg_catalog.now() >= ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 hour'
          and pg_catalog.now() < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem')
          and event.status not in ('draft', 'cancelled')
        union all
        select 'day', 'sms'
        where registration.confirmed_at < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 day'
          and pg_catalog.now() >= ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 day'
          and pg_catalog.now() < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 hour'
          and event.status not in ('draft', 'cancelled')
        union all
        select 'hour', 'sms'
        where registration.confirmed_at < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 hour'
          and pg_catalog.now() >= ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem') - interval '1 hour'
          and pg_catalog.now() < ((event.event_date + event.starts_at) at time zone 'Asia/Jerusalem')
          and event.status not in ('draft', 'cancelled')
      ) as due
      where registration.payment_status in ('free', 'paid')
        and not exists (
          select 1
          from public.store_event_notices as notice
          where notice.registration_id = registration.id
            and notice.kind = due.kind
            and notice.channel = due.channel
            and (notice.status = 'sent' or notice.attempts >= 3)
        )
      limit 40
    loop
      perform private.deliver_event_notice(job.registration_id, job.kind, job.channel);
    end loop;
    perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('store-event-reminders'));
  exception when others then
    perform pg_catalog.pg_advisory_unlock(pg_catalog.hashtext('store-event-reminders'));
    raise;
  end;
end;
$$;

create or replace function private.queue_event_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.source = 'site' and new.payment_status in ('free', 'paid') then
    perform private.deliver_event_notice(new.id, 'confirm', 'email');
  elsif tg_op = 'UPDATE' and old.payment_status is distinct from 'paid' and new.payment_status = 'paid' then
    perform private.deliver_event_notice(new.id, 'confirm', 'email');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create trigger store_event_registrations_confirm
  after insert or update of payment_status on public.store_event_registrations
  for each row execute function private.queue_event_confirmation();

revoke all on function private.event_notice_text(text, text, text, date, time, time, boolean, text, text, boolean) from public, anon, authenticated;
revoke all on function private.record_event_notice(uuid, uuid, text, text, boolean, text) from public, anon, authenticated;
revoke all on function private.deliver_event_notice(uuid, text, text) from public, anon, authenticated;
revoke all on function private.dispatch_event_reminders() from public, anon, authenticated;
revoke all on function private.queue_event_confirmation() from public, anon, authenticated;

do $cron$
declare
  existing bigint;
begin
  select jobid into existing from cron.job where jobname = 'store-event-reminders';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;
  perform cron.schedule('store-event-reminders', '*/5 * * * *', 'select private.dispatch_event_reminders()');
end
$cron$;

create or replace function public.store_public_events(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.stores as store
    where store.id = target_store
      and store.status = 'active'
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'slug', event.slug,
        'title', event.title,
        'short', event.short,
        'body', event.body,
        'date', to_char(event.event_date, 'YYYY-MM-DD'),
        'from', to_char(event.starts_at, 'HH24:MI'),
        'to', to_char(event.ends_at, 'HH24:MI'),
        'online', event.online,
        'address', case when event.online then null else event.address end,
        'price', event.price,
        'status', event.status,
        'image', case when event.image ~ '^https://' then event.image else null end
      )
      order by event.event_date, event.starts_at, event.slug
    )
    from public.store_events as event
    where event.store_id = target_store
      and event.status in ('open', 'full', 'ended', 'cancelled')
  ), '[]'::jsonb);
end;
$$;

comment on function public.store_public_events(uuid) is
  'Public events for one active store. Drafts and zoom links are omitted. Empty when the store is missing, inactive, or has nothing to publish.';

revoke all on function public.store_public_events(uuid) from public, anon, authenticated;
grant execute on function public.store_public_events(uuid) to anon, authenticated;

create or replace function public.register_store_event(
  target_store uuid,
  event_slug text,
  full_name text,
  phone text,
  email text,
  stage text,
  due_date date default null,
  pregnancy_week integer default null,
  baby_birth_date date default null,
  terms_accepted boolean default false,
  marketing_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event public.store_events%rowtype;
  problem text;
  normalized_phone text := private.event_phone_key(phone);
  normalized_email text := lower(btrim(coalesce(email, '')));
  saved_id uuid;
  saved_payment text;
begin
  if not exists (
    select 1 from public.stores as store
    where store.id = target_store and store.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'האירוע לא נמצא');
  end if;

  select *
  into event
  from public.store_events as saved
  where saved.store_id = target_store
    and saved.slug = lower(btrim(coalesce(event_slug, '')))
    and saved.status <> 'draft';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'האירוע לא נמצא');
  end if;
  if event.status = 'full' then
    return jsonb_build_object('ok', false, 'reason', 'האירוע מלא');
  end if;
  if event.status = 'ended' then
    return jsonb_build_object('ok', false, 'reason', 'האירוע הסתיים');
  end if;
  if event.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'האירוע בוטל');
  end if;
  if event.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'האירוע לא נמצא');
  end if;

  problem := private.event_registration_problem(
    full_name, normalized_email, normalized_phone, stage, due_date, pregnancy_week, baby_birth_date, terms_accepted
  );
  if problem is not null then
    return jsonb_build_object('ok', false, 'reason', problem);
  end if;

  select registration.id, registration.payment_status
  into saved_id, saved_payment
  from public.store_event_registrations as registration
  where registration.store_id = target_store
    and registration.event_id = event.id
    and (registration.email = normalized_email or registration.phone_key = normalized_phone)
  limit 1;
  if found then
    if saved_payment = 'pending' then
      return jsonb_build_object('ok', true, 'registrationId', saved_id, 'pending', true, 'price', event.price);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'כבר נרשמת לאירוע הזה');
  end if;

  insert into public.store_event_registrations (
    store_id, event_id, full_name, phone, email, stage, due_date, pregnancy_week, baby_birth_date,
    terms_accepted, marketing_consent, payment_status, source
  )
  values (
    target_store, event.id, full_name, phone, normalized_email, stage, due_date, pregnancy_week, baby_birth_date,
    true, coalesce(marketing_consent, false),
    case when event.price = 0 then 'free' else 'pending' end,
    'site'
  )
  returning id, payment_status into saved_id, saved_payment;

  return jsonb_build_object(
    'ok', true,
    'registrationId', saved_id,
    'pending', saved_payment = 'pending',
    'price', event.price
  );
exception
  when unique_violation then
    select registration.id, registration.payment_status
    into saved_id, saved_payment
    from public.store_event_registrations as registration
    where registration.store_id = target_store
      and registration.event_id = event.id
      and (registration.email = normalized_email or registration.phone_key = normalized_phone)
    limit 1;
    if saved_payment = 'pending' then
      return jsonb_build_object('ok', true, 'registrationId', saved_id, 'pending', true, 'price', event.price);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'כבר נרשמת לאירוע הזה');
end;
$$;

comment on function public.register_store_event(uuid, text, text, text, text, text, date, integer, date, boolean, boolean) is
  'Public signup. A free open event is confirmed here. A paid event stays pending and does not send mail until confirm_store_event_payment.';

create or replace function public.confirm_store_event_payment(target_store uuid, registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signup public.store_event_registrations%rowtype;
  event public.store_events%rowtype;
  saved_order uuid;
  next_number integer;
  existing_number integer;
begin
  if not exists (
    select 1 from public.stores as store
    where store.id = target_store and store.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'ההרשמה לא נמצאה');
  end if;

  select *
  into signup
  from public.store_event_registrations as registration
  where registration.store_id = target_store
    and registration.id = registration_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ההרשמה לא נמצאה');
  end if;

  if signup.payment_status = 'paid' and signup.order_id is not null then
    select sale.order_number
    into existing_number
    from public.orders as sale
    where sale.store_id = target_store
      and sale.id = signup.order_id;
    return jsonb_build_object('ok', true, 'orderNumber', existing_number);
  end if;
  if signup.payment_status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'ההרשמה כבר סגורה');
  end if;

  select *
  into event
  from public.store_events as saved
  where saved.store_id = target_store
    and saved.id = signup.event_id;
  if not found or event.price <= 0 or event.status not in ('open', 'full') then
    return jsonb_build_object('ok', false, 'reason', 'אי אפשר לסגור את ההרשמה לאירוע הזה');
  end if;

  perform 1 from public.stores as store where store.id = target_store for update;

  signup.customer_id := coalesce(signup.customer_id, private.match_store_customer(target_store, signup.email, signup.phone_key));
  if signup.customer_id is null then
    insert into public.customers (store_id, name, email, phone)
    values (target_store, signup.full_name, signup.email, signup.phone)
    returning id into signup.customer_id;
  end if;
  if signup.marketing_consent then
    perform private.grant_event_consent(target_store, signup.customer_id, signup.email, signup.phone_key);
  end if;

  select coalesce(max(sale.order_number), 1000) + 1
  into next_number
  from public.orders as sale
  where sale.store_id = target_store;

  insert into public.orders (
    store_id, customer_id, financial_status, fulfillment_status, customer_status, total, order_number, channel, note
  )
  values (
    target_store, signup.customer_id, 'paid', 'unfulfilled', 'received', event.price, next_number, 'אירוע',
    'הרשמה לאירוע ' || event.title
  )
  returning id into saved_order;

  insert into public.order_items (store_id, order_id, title, quantity, unit_price)
  values (target_store, saved_order, event.title, 1, event.price);

  insert into public.payments (store_id, order_id, amount, status)
  values (target_store, saved_order, event.price, 'paid');

  insert into public.shipments (store_id, order_id, status)
  values (target_store, saved_order, 'unfulfilled');

  update public.store_event_registrations as registration
  set payment_status = 'paid',
      order_id = saved_order,
      customer_id = signup.customer_id,
      confirmed_at = pg_catalog.now()
  where registration.store_id = target_store
    and registration.id = signup.id;

  return jsonb_build_object('ok', true, 'orderNumber', next_number);
end;
$$;

comment on function public.confirm_store_event_payment(uuid, uuid) is
  'Closes a pending paid registration after the storefront payment succeeds. Creates the store order and sends the store confirmation mail.';

revoke all on function public.register_store_event(uuid, text, text, text, text, text, date, integer, date, boolean, boolean) from public, anon, authenticated;
revoke all on function public.confirm_store_event_payment(uuid, uuid) from public, anon, authenticated;
grant execute on function public.register_store_event(uuid, text, text, text, text, text, date, integer, date, boolean, boolean) to anon, authenticated;
grant execute on function public.confirm_store_event_payment(uuid, uuid) to anon, authenticated;
