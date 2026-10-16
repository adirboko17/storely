-- Email marketing foundation.
-- The admin UI keeps writing store_settings.marketing. That JSON stays the source
-- of truth until a later cutover. A trigger projects it into the tables below.
-- Re-running the projection does not duplicate rows: messages and automations
-- keep the ids already stored in the JSON.
-- Nothing in this migration sends email or SMS.

create or replace function private.can_read_marketing(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_store is not null and (
    private.has_store_permission(target_store, 'marketing.read', false)
    or private.is_platform_operator('platform.stores.read')
    or private.is_platform_operator('platform.stores.create')
  );
$$;

create or replace function private.can_write_marketing(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_marketing(target_store);
$$;

revoke all on function private.can_read_marketing(uuid) from public, anon;
revoke all on function private.can_write_marketing(uuid) from public, anon;
grant execute on function private.can_read_marketing(uuid) to authenticated;
grant execute on function private.can_write_marketing(uuid) to authenticated;

create or replace function private.marketing_stable_id(target_store uuid, kind text, legacy_key text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select (
    substr(hashed.hash, 1, 8) || '-' ||
    substr(hashed.hash, 9, 4) || '-' ||
    '4' || substr(hashed.hash, 14, 3) || '-' ||
    '8' || substr(hashed.hash, 18, 3) || '-' ||
    substr(hashed.hash, 21, 12)
  )::uuid
  from (
    select encode(extensions.digest(target_store::text || ':' || kind || ':' || legacy_key, 'sha256'), 'hex') as hash
  ) as hashed;
$$;

revoke all on function private.marketing_stable_id(uuid, text, text) from public, anon, authenticated;

alter table public.customers
  add column if not exists email_consent_status text not null default 'unknown',
  add column if not exists email_consent_at timestamptz,
  add column if not exists email_consent_source text not null default '',
  add column if not exists sms_consent_status text not null default 'unknown',
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_source text not null default '';

alter table public.customers drop constraint if exists customers_email_consent_status_check;
alter table public.customers
  add constraint customers_email_consent_status_check
  check (email_consent_status in ('unknown', 'subscribed', 'unsubscribed'));

alter table public.customers drop constraint if exists customers_sms_consent_status_check;
alter table public.customers
  add constraint customers_sms_consent_status_check
  check (sms_consent_status in ('unknown', 'subscribed', 'unsubscribed'));

create index if not exists customers_email_consent_idx
  on public.customers (store_id, email_consent_status);

comment on column public.customers.email_consent_status is
  'unknown means no recorded marketing choice. An email address alone is not consent.';

update public.customers
set email_consent_status = 'subscribed',
    email_consent_at = coalesce(email_consent_at, created_at),
    email_consent_source = case when email_consent_source = '' then 'legacy_customer_flag' else email_consent_source end
where subscribed = true
  and email_consent_status = 'unknown';

update public.customers
set sms_consent_status = 'subscribed',
    sms_consent_at = coalesce(sms_consent_at, created_at),
    sms_consent_source = case when sms_consent_source = '' then 'legacy_customer_flag' else sms_consent_source end
where sms = true
  and sms_consent_status = 'unknown';

create table public.marketing_messages (
  id uuid primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  legacy_key text not null,
  channel text not null,
  name text not null,
  subject text not null default '',
  preview_text text not null default '',
  body_text text not null default '',
  blocks jsonb not null default '[]'::jsonb,
  origin text not null default 'json',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, legacy_key),
  check (channel in ('email', 'sms')),
  check (origin in ('json', 'app')),
  check (legacy_key <> ''),
  check (jsonb_typeof(blocks) = 'array')
);

create index marketing_messages_channel_idx on public.marketing_messages (store_id, channel, updated_at desc);

create table public.marketing_segments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  kind text not null,
  definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, name),
  check (kind in ('dynamic', 'static')),
  check (btrim(name) <> ''),
  check (jsonb_typeof(definition) = 'object')
);

create table public.marketing_segment_members (
  store_id uuid not null,
  segment_id uuid not null,
  customer_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (store_id, segment_id, customer_id),
  foreign key (store_id, segment_id) references public.marketing_segments (store_id, id) on delete cascade,
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete cascade
);

create index marketing_segment_members_customer_idx
  on public.marketing_segment_members (store_id, customer_id);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  purpose text not null default 'marketing',
  message_id uuid,
  segment_id uuid,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, message_id) references public.marketing_messages (store_id, id) on delete set null,
  foreign key (store_id, segment_id) references public.marketing_segments (store_id, id) on delete set null,
  check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  check (purpose in ('marketing', 'transactional')),
  check (btrim(name) <> '')
);

create index marketing_campaigns_status_idx on public.marketing_campaigns (store_id, status, created_at desc);

create table public.marketing_automations (
  id uuid primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  legacy_id integer not null,
  name text not null,
  trigger_label text not null default '',
  lookback_days integer,
  enabled boolean not null default false,
  stats jsonb,
  origin text not null default 'json',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, legacy_id),
  check (origin in ('json', 'app')),
  check (lookback_days is null or lookback_days >= 0),
  check (stats is null or jsonb_typeof(stats) = 'array')
);

create index marketing_automations_enabled_idx on public.marketing_automations (store_id, enabled);

create table public.marketing_automation_steps (
  id uuid primary key,
  store_id uuid not null,
  automation_id uuid not null,
  parent_step_id uuid,
  branch text,
  position integer not null,
  step_type text not null,
  message_id uuid,
  config jsonb not null default '{}'::jsonb,
  legacy_path text not null,
  unique (store_id, id),
  unique (store_id, automation_id, legacy_path),
  foreign key (store_id, automation_id) references public.marketing_automations (store_id, id) on delete cascade,
  foreign key (store_id, parent_step_id) references public.marketing_automation_steps (store_id, id) on delete cascade,
  foreign key (store_id, message_id) references public.marketing_messages (store_id, id) on delete set null,
  check (position >= 0),
  check (step_type in ('wait', 'cond', 'ab', 'both', 'email', 'sms', 'end')),
  check (branch is null or branch in ('yes', 'no', 'a', 'b', 'mail', 'phone')),
  check (jsonb_typeof(config) = 'object')
);

create index marketing_automation_steps_parent_idx
  on public.marketing_automation_steps (store_id, automation_id, parent_step_id, position);

create table public.marketing_automation_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  automation_id uuid not null,
  customer_id uuid,
  status text not null default 'pending',
  dedupe_key text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, automation_id) references public.marketing_automations (store_id, id) on delete cascade,
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null,
  check (status in ('pending', 'running', 'waiting', 'completed', 'cancelled', 'failed'))
);

create unique index marketing_automation_runs_dedupe_idx
  on public.marketing_automation_runs (store_id, dedupe_key)
  where dedupe_key <> '';

create index marketing_automation_runs_status_idx
  on public.marketing_automation_runs (store_id, automation_id, status, created_at desc);

create table public.marketing_automation_step_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  run_id uuid not null,
  step_id uuid not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text not null default '',
  unique (store_id, id),
  unique (store_id, run_id, step_id),
  foreign key (store_id, run_id) references public.marketing_automation_runs (store_id, id) on delete cascade,
  foreign key (store_id, step_id) references public.marketing_automation_steps (store_id, id) on delete cascade,
  check (status in ('pending', 'waiting', 'running', 'completed', 'skipped', 'failed')),
  check (attempts >= 0)
);

create index marketing_automation_step_runs_due_idx
  on public.marketing_automation_step_runs (store_id, scheduled_at)
  where status in ('pending', 'waiting');

create table public.marketing_activity_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  customer_id uuid,
  visitor_key text not null default '',
  name text not null,
  source text not null default '',
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null,
  check (btrim(name) <> ''),
  check (jsonb_typeof(properties) = 'object')
);

create index marketing_activity_events_name_idx
  on public.marketing_activity_events (store_id, name, occurred_at desc);

create index marketing_activity_events_customer_idx
  on public.marketing_activity_events (store_id, customer_id, occurred_at desc)
  where customer_id is not null;

create table public.marketing_deliveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  channel text not null,
  purpose text not null,
  status text not null default 'queued',
  to_address text not null,
  message_id uuid,
  campaign_id uuid,
  step_run_id uuid,
  customer_id uuid,
  provider text not null default '',
  provider_message_id text not null default '',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  last_error text not null default '',
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  unique (store_id, id),
  foreign key (store_id, message_id) references public.marketing_messages (store_id, id) on delete set null,
  foreign key (store_id, campaign_id) references public.marketing_campaigns (store_id, id) on delete set null,
  foreign key (store_id, step_run_id) references public.marketing_automation_step_runs (store_id, id) on delete set null,
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null,
  check (channel in ('email', 'sms')),
  check (purpose in ('marketing', 'transactional')),
  check (status in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'suppressed', 'skipped')),
  check (btrim(to_address) <> ''),
  check (attempts >= 0)
);

create index marketing_deliveries_queue_idx
  on public.marketing_deliveries (store_id, next_attempt_at)
  where status in ('queued', 'sending');

create index marketing_deliveries_customer_idx
  on public.marketing_deliveries (store_id, customer_id, queued_at desc);

create table public.marketing_delivery_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  delivery_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (store_id, id),
  foreign key (store_id, delivery_id) references public.marketing_deliveries (store_id, id) on delete cascade,
  check (event_type in ('accepted', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'unsubscribed')),
  check (jsonb_typeof(metadata) = 'object')
);

create index marketing_delivery_events_delivery_idx
  on public.marketing_delivery_events (store_id, delivery_id, occurred_at desc);

create table public.marketing_consent_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  customer_id uuid,
  channel text not null,
  status text not null,
  source text not null default '',
  address text not null default '',
  occurred_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, customer_id) references public.customers (store_id, id) on delete set null,
  check (channel in ('email', 'sms')),
  check (status in ('subscribed', 'unsubscribed'))
);

create index marketing_consent_events_customer_idx
  on public.marketing_consent_events (store_id, customer_id, occurred_at desc);

create table public.marketing_suppressions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  channel text not null,
  address text not null,
  reason text not null,
  source text not null default '',
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, channel, address),
  check (channel in ('email', 'sms')),
  check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  check (address <> '')
);

create index marketing_suppressions_address_idx
  on public.marketing_suppressions (store_id, channel, address);

create table public.marketing_sender_identities (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  purpose text not null,
  from_email text not null default '',
  from_name text not null default '',
  reply_to text not null default '',
  domain_name text not null default '',
  domain_status text not null default 'unknown',
  spf_status text not null default 'unknown',
  dkim_status text not null default 'unknown',
  dmarc_status text not null default 'unknown',
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, purpose),
  check (purpose in ('marketing', 'transactional')),
  check (domain_status in ('unknown', 'pending', 'verified', 'failed')),
  check (spf_status in ('unknown', 'missing', 'valid', 'invalid')),
  check (dkim_status in ('unknown', 'missing', 'valid', 'invalid')),
  check (dmarc_status in ('unknown', 'missing', 'valid', 'invalid'))
);

comment on table public.marketing_sender_identities is
  'From-address and domain status per store. Provider secrets stay in private.store_messaging.';

comment on table public.marketing_deliveries is
  'Outbox and delivery log. Queued rows are the send queue. No worker sends them in this migration.';

comment on table public.marketing_messages is
  'Projection of emails and SMS stored in store_settings.marketing. legacy_key is the editor id.';

do $$
declare
  rel text;
begin
  foreach rel in array array[
    'marketing_messages',
    'marketing_segments',
    'marketing_segment_members',
    'marketing_campaigns',
    'marketing_automations',
    'marketing_automation_steps',
    'marketing_automation_runs',
    'marketing_automation_step_runs',
    'marketing_activity_events',
    'marketing_deliveries',
    'marketing_delivery_events',
    'marketing_consent_events',
    'marketing_suppressions',
    'marketing_sender_identities'
  ]
  loop
    execute format('alter table public.%I enable row level security', rel);
    execute format('alter table public.%I force row level security', rel);
    execute format('drop trigger if exists %I on public.%I', rel || '_lock_store', rel);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.reject_store_id_change()',
      rel || '_lock_store',
      rel
    );
    execute format('revoke all on table public.%I from public, anon', rel);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_select', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_insert', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_update', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_delete', rel);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.can_read_marketing(store_id)))',
      rel || '_select',
      rel
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.can_write_marketing(store_id)))',
      rel || '_insert',
      rel
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.can_write_marketing(store_id))) with check ((select private.can_write_marketing(store_id)))',
      rel || '_update',
      rel
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.can_write_marketing(store_id)))',
      rel || '_delete',
      rel
    );
  end loop;
end $$;

create or replace function private.marketing_send_allowed(
  target_store uuid,
  channel text,
  address text,
  purpose text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_store is not null
    and channel in ('email', 'sms')
    and purpose in ('marketing', 'transactional')
    and btrim(coalesce(address, '')) <> ''
    and not exists (
      select 1
      from public.marketing_suppressions as blocked
      where blocked.store_id = target_store
        and blocked.channel = marketing_send_allowed.channel
        and blocked.address = case
          when marketing_send_allowed.channel = 'email' then lower(btrim(address))
          else btrim(address)
        end
        and (
          purpose = 'marketing'
          or blocked.reason in ('bounce', 'complaint')
        )
    );
$$;

revoke all on function private.marketing_send_allowed(uuid, text, text, text) from public, anon, authenticated;

comment on function private.marketing_send_allowed(uuid, text, text, text) is
  'Marketing mail is blocked by every suppression. Transactional mail is blocked only by bounce or complaint.';

create or replace function private.sync_customer_marketing_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.subscribed and new.email_consent_status = 'unknown' then
      new.email_consent_status := 'subscribed';
      new.email_consent_at := coalesce(new.email_consent_at, now());
      if new.email_consent_source = '' then
        new.email_consent_source := 'customer_flag';
      end if;
    end if;
    if new.sms and new.sms_consent_status = 'unknown' then
      new.sms_consent_status := 'subscribed';
      new.sms_consent_at := coalesce(new.sms_consent_at, now());
      if new.sms_consent_source = '' then
        new.sms_consent_source := 'customer_flag';
      end if;
    end if;
    return new;
  end if;

  if new.subscribed is distinct from old.subscribed
     and new.email_consent_status is not distinct from old.email_consent_status then
    if new.subscribed then
      new.email_consent_status := 'subscribed';
      new.email_consent_at := now();
      new.email_consent_source := 'admin_customer_flag';
    elsif old.subscribed or old.email_consent_status = 'subscribed' then
      new.email_consent_status := 'unsubscribed';
      new.email_consent_at := now();
      new.email_consent_source := 'admin_customer_flag';
    end if;
  elsif new.email_consent_status is distinct from old.email_consent_status then
    new.subscribed := new.email_consent_status = 'subscribed';
    new.email_consent_at := coalesce(new.email_consent_at, now());
  end if;

  if new.sms is distinct from old.sms
     and new.sms_consent_status is not distinct from old.sms_consent_status then
    if new.sms then
      new.sms_consent_status := 'subscribed';
      new.sms_consent_at := now();
      new.sms_consent_source := 'admin_customer_flag';
    elsif old.sms or old.sms_consent_status = 'subscribed' then
      new.sms_consent_status := 'unsubscribed';
      new.sms_consent_at := now();
      new.sms_consent_source := 'admin_customer_flag';
    end if;
  elsif new.sms_consent_status is distinct from old.sms_consent_status then
    new.sms := new.sms_consent_status = 'subscribed';
    new.sms_consent_at := coalesce(new.sms_consent_at, now());
  end if;

  return new;
end;
$$;

create or replace function private.record_customer_marketing_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_address text := lower(btrim(coalesce(new.email, '')));
  phone_address text := btrim(coalesce(new.phone, ''));
begin
  if tg_op = 'INSERT' or new.email_consent_status is distinct from old.email_consent_status then
    if new.email_consent_status in ('subscribed', 'unsubscribed') then
      insert into public.marketing_consent_events (store_id, customer_id, channel, status, source, address)
      values (new.store_id, new.id, 'email', new.email_consent_status, new.email_consent_source, email_address);
    end if;
    if new.email_consent_status = 'unsubscribed' and email_address <> '' then
      insert into public.marketing_suppressions (store_id, channel, address, reason, source)
      values (new.store_id, 'email', email_address, 'unsubscribe', new.email_consent_source)
      on conflict (store_id, channel, address) do nothing;
    elsif new.email_consent_status = 'subscribed' and email_address <> '' then
      delete from public.marketing_suppressions as blocked
      where blocked.store_id = new.store_id
        and blocked.channel = 'email'
        and blocked.address = email_address
        and blocked.reason = 'unsubscribe';
    end if;
  end if;

  if tg_op = 'INSERT' or new.sms_consent_status is distinct from old.sms_consent_status then
    if new.sms_consent_status in ('subscribed', 'unsubscribed') then
      insert into public.marketing_consent_events (store_id, customer_id, channel, status, source, address)
      values (new.store_id, new.id, 'sms', new.sms_consent_status, new.sms_consent_source, phone_address);
    end if;
    if new.sms_consent_status = 'unsubscribed' and phone_address <> '' then
      insert into public.marketing_suppressions (store_id, channel, address, reason, source)
      values (new.store_id, 'sms', phone_address, 'unsubscribe', new.sms_consent_source)
      on conflict (store_id, channel, address) do nothing;
    elsif new.sms_consent_status = 'subscribed' and phone_address <> '' then
      delete from public.marketing_suppressions as blocked
      where blocked.store_id = new.store_id
        and blocked.channel = 'sms'
        and blocked.address = phone_address
        and blocked.reason = 'unsubscribe';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_customer_marketing_consent() from public, anon, authenticated;
revoke all on function private.record_customer_marketing_consent() from public, anon, authenticated;

drop trigger if exists customers_sync_marketing_consent on public.customers;
create trigger customers_sync_marketing_consent
before insert or update on public.customers
for each row execute function private.sync_customer_marketing_consent();

drop trigger if exists customers_record_marketing_consent on public.customers;
create trigger customers_record_marketing_consent
after insert or update on public.customers
for each row execute function private.record_customer_marketing_consent();

insert into public.marketing_consent_events (store_id, customer_id, channel, status, source, address, occurred_at)
select
  customer.store_id,
  customer.id,
  'email',
  'subscribed',
  'legacy_customer_flag',
  lower(btrim(coalesce(customer.email, ''))),
  coalesce(customer.email_consent_at, customer.created_at)
from public.customers as customer
where customer.email_consent_status = 'subscribed'
  and customer.email_consent_source = 'legacy_customer_flag'
  and not exists (
    select 1
    from public.marketing_consent_events as event
    where event.store_id = customer.store_id
      and event.customer_id = customer.id
      and event.channel = 'email'
      and event.source = 'legacy_customer_flag'
  );

insert into public.marketing_consent_events (store_id, customer_id, channel, status, source, address, occurred_at)
select
  customer.store_id,
  customer.id,
  'sms',
  'subscribed',
  'legacy_customer_flag',
  btrim(coalesce(customer.phone, '')),
  coalesce(customer.sms_consent_at, customer.created_at)
from public.customers as customer
where customer.sms_consent_status = 'subscribed'
  and customer.sms_consent_source = 'legacy_customer_flag'
  and not exists (
    select 1
    from public.marketing_consent_events as event
    where event.store_id = customer.store_id
      and event.customer_id = customer.id
      and event.channel = 'sms'
      and event.source = 'legacy_customer_flag'
  );

create or replace function private.project_sender_identity(target_store uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved private.store_messaging%rowtype;
begin
  select * into saved from private.store_messaging where store_id = target_store;
  if not found or saved.resend_from_email = '' then
    update public.marketing_sender_identities as identity
    set from_email = '',
        from_name = '',
        domain_name = '',
        updated_at = now()
    where identity.store_id = target_store;
    return;
  end if;

  insert into public.marketing_sender_identities (store_id, purpose, from_email, from_name, domain_name)
  values (
    target_store,
    'marketing',
    saved.resend_from_email,
    saved.resend_from_name,
    split_part(saved.resend_from_email, '@', 2)
  )
  on conflict (store_id, purpose) do update
  set from_email = excluded.from_email,
      from_name = excluded.from_name,
      domain_name = excluded.domain_name,
      updated_at = now();

  if saved.email_login then
    insert into public.marketing_sender_identities (store_id, purpose, from_email, from_name, domain_name)
    values (
      target_store,
      'transactional',
      saved.resend_from_email,
      saved.resend_from_name,
      split_part(saved.resend_from_email, '@', 2)
    )
    on conflict (store_id, purpose) do update
    set from_email = excluded.from_email,
        from_name = excluded.from_name,
        domain_name = excluded.domain_name,
        updated_at = now();
  else
    delete from public.marketing_sender_identities as identity
    where identity.store_id = target_store
      and identity.purpose = 'transactional';
  end if;
end;
$$;

revoke all on function private.project_sender_identity(uuid) from public, anon, authenticated;

create or replace function private.project_store_messaging_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.project_sender_identity(new.store_id);
  return new;
end;
$$;

revoke all on function private.project_store_messaging_sender() from public, anon, authenticated;

drop trigger if exists store_messaging_project_sender on private.store_messaging;
create trigger store_messaging_project_sender
after insert or update of resend_from_email, resend_from_name, email_login
on private.store_messaging
for each row execute function private.project_store_messaging_sender();

do $$
declare
  target_store uuid;
begin
  for target_store in select messaging.store_id from private.store_messaging as messaging loop
    perform private.project_sender_identity(target_store);
  end loop;
end $$;

create or replace function private.import_marketing_steps(
  target_store uuid,
  automation_id uuid,
  flow_legacy_id integer,
  steps jsonb,
  parent_id uuid,
  branch text,
  path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  item jsonb;
  ordinal integer := 0;
  step_type text;
  step_path text;
  step_id uuid;
  legacy_message text;
  linked_message uuid;
  config jsonb;
begin
  if jsonb_typeof(steps) is distinct from 'array' then
    return;
  end if;

  for item in select value from jsonb_array_elements(steps) loop
    step_type := coalesce(item->>'type', '');
    step_path := case when path = '' then ordinal::text else path || '/' || ordinal::text end;
    if step_type in ('wait', 'cond', 'ab', 'both', 'email', 'sms', 'end') then
      step_id := private.marketing_stable_id(target_store, 'step', flow_legacy_id::text || ':' || step_path);
      config := coalesce(item, '{}'::jsonb) - 'yes' - 'no' - 'a' - 'b' - 'mail' - 'phone';
      if jsonb_typeof(config) is distinct from 'object' then
        config := '{}'::jsonb;
      end if;
      legacy_message := case step_type
        when 'email' then nullif(item->>'emailId', '')
        when 'sms' then nullif(item->>'smsId', '')
        else null
      end;
      linked_message := null;
      if legacy_message is not null then
        select message.id into linked_message
        from public.marketing_messages as message
        where message.store_id = target_store
          and message.legacy_key = legacy_message;
      end if;

      insert into public.marketing_automation_steps (
        id, store_id, automation_id, parent_step_id, branch, position, step_type, message_id, config, legacy_path
      )
      values (
        step_id, target_store, automation_id, parent_id, branch, ordinal, step_type, linked_message, config, step_path
      )
      on conflict (id) do update
      set parent_step_id = excluded.parent_step_id,
          branch = excluded.branch,
          position = excluded.position,
          step_type = excluded.step_type,
          message_id = excluded.message_id,
          config = excluded.config,
          legacy_path = excluded.legacy_path;

      if step_type = 'cond' then
        perform private.import_marketing_steps(target_store, automation_id, flow_legacy_id, item->'yes', step_id, 'yes', step_path || '/yes');
        perform private.import_marketing_steps(target_store, automation_id, flow_legacy_id, item->'no', step_id, 'no', step_path || '/no');
      elsif step_type = 'ab' then
        perform private.import_marketing_steps(target_store, automation_id, flow_legacy_id, item->'a', step_id, 'a', step_path || '/a');
        perform private.import_marketing_steps(target_store, automation_id, flow_legacy_id, item->'b', step_id, 'b', step_path || '/b');
      elsif step_type = 'both' then
        perform private.import_marketing_steps(target_store, automation_id, flow_legacy_id, item->'mail', step_id, 'mail', step_path || '/mail');
        perform private.import_marketing_steps(target_store, automation_id, flow_legacy_id, item->'phone', step_id, 'phone', step_path || '/phone');
      end if;
    end if;
    ordinal := ordinal + 1;
  end loop;
end;
$$;

revoke all on function private.import_marketing_steps(uuid, uuid, integer, jsonb, uuid, text, text) from public, anon, authenticated;

create or replace function private.import_marketing_channel(
  target_store uuid,
  payload jsonb,
  channel text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  message_key text;
  message_id uuid;
  kept text[] := '{}';
begin
  if jsonb_typeof(payload) is distinct from 'array' then
    return;
  end if;

  for item in select value from jsonb_array_elements(payload) loop
    message_key := btrim(coalesce(item->>'id', ''));
    if message_key = '' or coalesce(item->>'name', '') = '' then
      continue;
    end if;
    if message_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (
         select 1 from public.marketing_messages as message
         where message.id = message_key::uuid
           and message.store_id <> target_store
       ) then
      message_id := message_key::uuid;
    else
      message_id := private.marketing_stable_id(target_store, channel, message_key);
    end if;

    insert into public.marketing_messages (
      id, store_id, legacy_key, channel, name, subject, preview_text, body_text, blocks, origin
    )
    values (
      message_id,
      target_store,
      message_key,
      channel,
      item->>'name',
      coalesce(item->>'subject', ''),
      coalesce(item->>'preview', ''),
      left(coalesce(item->>'text', ''), 250),
      case when jsonb_typeof(item->'blocks') = 'array' then item->'blocks' else '[]'::jsonb end,
      'json'
    )
    on conflict (store_id, legacy_key) do update
    set name = excluded.name,
        channel = excluded.channel,
        subject = excluded.subject,
        preview_text = excluded.preview_text,
        body_text = excluded.body_text,
        blocks = excluded.blocks,
        origin = 'json',
        updated_at = now();

    kept := kept || message_key;
  end loop;

  delete from public.marketing_messages as message
  where message.store_id = target_store
    and message.channel = import_marketing_channel.channel
    and message.origin = 'json'
    and not (message.legacy_key = any (kept))
    and not exists (
      select 1 from public.marketing_automation_steps as step
      where step.store_id = message.store_id and step.message_id = message.id
    )
    and not exists (
      select 1 from public.marketing_campaigns as campaign
      where campaign.store_id = message.store_id and campaign.message_id = message.id
    )
    and not exists (
      select 1 from public.marketing_deliveries as delivery
      where delivery.store_id = message.store_id and delivery.message_id = message.id
    );
end;
$$;

revoke all on function private.import_marketing_channel(uuid, jsonb, text) from public, anon, authenticated;

create or replace function private.import_store_marketing(target_store uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  flow jsonb;
  legacy_id integer;
  automation_id uuid;
  kept integer[] := '{}';
  has_runs boolean;
  lookback integer;
begin
  if payload is null or jsonb_typeof(payload) is distinct from 'object' then
    payload := '{}'::jsonb;
  end if;

  if payload ? 'emails' then
    perform private.import_marketing_channel(target_store, payload->'emails', 'email');
  end if;
  if payload ? 'sms' then
    perform private.import_marketing_channel(target_store, payload->'sms', 'sms');
  end if;

  if payload ? 'flows' and jsonb_typeof(payload->'flows') = 'array' then
    for flow in select value from jsonb_array_elements(payload->'flows') loop
      if coalesce(flow->>'id', '') !~ '^[0-9]+$' or coalesce(flow->>'name', '') = '' then
        continue;
      end if;
      legacy_id := (flow->>'id')::integer;
      automation_id := private.marketing_stable_id(target_store, 'automation', legacy_id::text);
      lookback := case when coalesce(flow->>'lookback', '') ~ '^[0-9]+$' then (flow->>'lookback')::integer else null end;
      insert into public.marketing_automations (
        id, store_id, legacy_id, name, trigger_label, lookback_days, enabled, stats, origin
      )
      values (
        automation_id,
        target_store,
        legacy_id,
        flow->>'name',
        coalesce(flow->>'trigger', ''),
        lookback,
        coalesce(flow->>'on', 'false') = 'true',
        case when jsonb_typeof(flow->'stats') = 'array' then flow->'stats' else null end,
        'json'
      )
      on conflict on constraint marketing_automations_store_id_legacy_id_key do update
      set name = excluded.name,
          trigger_label = excluded.trigger_label,
          lookback_days = excluded.lookback_days,
          enabled = excluded.enabled,
          stats = excluded.stats,
          origin = 'json',
          updated_at = now();

      select exists (
        select 1
        from public.marketing_automation_runs as run
        where run.store_id = target_store
          and run.automation_id = automation_id
      ) into has_runs;

      if not has_runs then
        delete from public.marketing_automation_steps as step
        where step.store_id = target_store
          and step.automation_id = automation_id;
        perform private.import_marketing_steps(target_store, automation_id, legacy_id, flow->'steps', null, null, '');
      end if;
      kept := kept || legacy_id;
    end loop;

    delete from public.marketing_automations as automation
    where automation.store_id = target_store
      and automation.origin = 'json'
      and not (automation.legacy_id = any (kept))
      and not exists (
        select 1
        from public.marketing_automation_runs as run
        where run.store_id = automation.store_id
          and run.automation_id = automation.id
      );
  end if;

  if payload ? 'emails' then
    perform private.import_marketing_channel(target_store, payload->'emails', 'email');
  end if;
  if payload ? 'sms' then
    perform private.import_marketing_channel(target_store, payload->'sms', 'sms');
  end if;

  return jsonb_build_object(
    'messages', (select count(*) from public.marketing_messages where store_id = target_store),
    'automations', (select count(*) from public.marketing_automations where store_id = target_store),
    'steps', (
      select count(*)
      from public.marketing_automation_steps as step
      join public.marketing_automations as automation
        on automation.store_id = step.store_id
       and automation.id = step.automation_id
      where step.store_id = target_store
    )
  );
end;
$$;

revoke all on function private.import_store_marketing(uuid, jsonb) from public, anon, authenticated;

create or replace function public.import_store_marketing(target_store uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  if not private.can_write_marketing(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select settings.marketing into payload
  from public.store_settings as settings
  where settings.store_id = target_store;
  return private.import_store_marketing(target_store, coalesce(payload, '{}'::jsonb));
end;
$$;

revoke all on function public.import_store_marketing(uuid) from public, anon;
grant execute on function public.import_store_marketing(uuid) to authenticated;

create or replace function private.guard_marketing_json()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.marketing is distinct from old.marketing
     and (select auth.uid()) is not null
     and not private.can_write_marketing(new.store_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.project_marketing_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.marketing is distinct from old.marketing then
    perform private.import_store_marketing(new.store_id, coalesce(new.marketing, '{}'::jsonb));
  end if;
  return new;
end;
$$;

revoke all on function private.guard_marketing_json() from public, anon, authenticated;
revoke all on function private.project_marketing_settings() from public, anon, authenticated;

drop trigger if exists store_settings_guard_marketing on public.store_settings;
create trigger store_settings_guard_marketing
before update of marketing on public.store_settings
for each row execute function private.guard_marketing_json();

drop trigger if exists store_settings_project_marketing on public.store_settings;
create trigger store_settings_project_marketing
after insert or update of marketing on public.store_settings
for each row execute function private.project_marketing_settings();

select private.import_store_marketing(settings.store_id, settings.marketing)
from public.store_settings as settings
where settings.marketing ? 'emails'
   or settings.marketing ? 'sms'
   or settings.marketing ? 'flows';

do $$
declare
  src text;
  marketing_line text := '''marketing'', coalesce(settings.marketing, ''{}''::jsonb)';
  guarded_line text := '''marketing'', case when private.can_read_marketing(target_store) then coalesce(settings.marketing, ''{}''::jsonb) else ''{}''::jsonb end';
  settings_check text := 'if jsonb_typeof(sections) <> ''object'' then
    raise exception ''הגדרות לא תקינות'' using errcode = ''22023'';
  end if;';
  settings_guard text := 'if jsonb_typeof(sections) <> ''object'' then
    raise exception ''הגדרות לא תקינות'' using errcode = ''22023'';
  end if;
  if sections ? ''marketing'' and not private.can_write_marketing(target_store) then
    raise exception ''forbidden'' using errcode = ''42501'';
  end if;';
begin
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  if src not like '%private.can_read_marketing(target_store)%' then
    if position(marketing_line in src) = 0 then
      raise exception 'store_admin_snapshot marketing field was not found';
    end if;
    src := replace(src, marketing_line, guarded_line);
    execute src;
  end if;

  src := pg_get_functiondef('public.save_store_sections(uuid, jsonb)'::regprocedure);
  if src not like '%sections ? ''marketing'' and not private.can_write_marketing(target_store)%' then
    if position(settings_check in src) = 0 then
      raise exception 'save_store_sections validation block was not found';
    end if;
    src := replace(src, settings_check, settings_guard);
    execute src;
  end if;
end $$;

do $$
declare
  rel text;
  missing text;
begin
  foreach rel in array array[
    'marketing_messages',
    'marketing_campaigns',
    'marketing_automations',
    'marketing_automation_steps',
    'marketing_automation_runs',
    'marketing_deliveries',
    'marketing_consent_events',
    'marketing_suppressions',
    'marketing_sender_identities'
  ]
  loop
    select rel into missing
    where not exists (
      select 1
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = rel
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    );
    if missing is not null then
      raise exception 'marketing table % is missing forced RLS', rel;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'import_store_marketing'
  ) then
    raise exception 'import_store_marketing was not created';
  end if;
end $$;
