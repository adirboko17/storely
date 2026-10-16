-- Campaigns stay on the mock provider. Nothing in this migration sends email or SMS.

alter table public.marketing_campaigns
  add column if not exists provider text not null default 'mock';

alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_provider_check;
alter table public.marketing_campaigns
  add constraint marketing_campaigns_provider_check
  check (provider in ('mock'));

create or replace function private.guard_mock_campaign_send()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider = 'mock' and new.status in ('sending', 'sent') then
    raise exception 'a mock campaign cannot be marked as sent' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_mock_campaign_send() from public, anon, authenticated;

drop trigger if exists marketing_campaigns_block_mock_send on public.marketing_campaigns;
create trigger marketing_campaigns_block_mock_send
before insert or update on public.marketing_campaigns
for each row execute function private.guard_mock_campaign_send();

create or replace function private.guard_mock_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider in ('mock', '') and new.status in ('sending', 'sent', 'delivered') then
    raise exception 'a mock delivery cannot be marked as sent' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_mock_delivery() from public, anon, authenticated;

drop trigger if exists marketing_deliveries_block_mock_send on public.marketing_deliveries;
create trigger marketing_deliveries_block_mock_send
before insert or update on public.marketing_deliveries
for each row execute function private.guard_mock_delivery();

create table if not exists public.marketing_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  automation_id uuid,
  campaign_id uuid,
  event_name text not null,
  recipient text not null default '',
  dedupe_key text not null default '',
  status text not null default 'completed',
  would_send boolean not null default false,
  suppressed boolean not null default false,
  duplicate boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, automation_id) references public.marketing_automations (store_id, id) on delete set null,
  foreign key (store_id, campaign_id) references public.marketing_campaigns (store_id, id) on delete set null,
  check (status in ('completed', 'duplicate', 'skipped')),
  check (jsonb_typeof(summary) = 'object')
);

create unique index if not exists marketing_simulation_runs_dedupe_idx
  on public.marketing_simulation_runs (store_id, dedupe_key)
  where dedupe_key <> '';

create index if not exists marketing_simulation_runs_created_idx
  on public.marketing_simulation_runs (store_id, created_at desc);

create table if not exists public.marketing_simulation_steps (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  run_id uuid not null,
  position integer not null,
  step_type text not null,
  outcome text not null,
  detail jsonb not null default '{}'::jsonb,
  unique (store_id, id),
  foreign key (store_id, run_id) references public.marketing_simulation_runs (store_id, id) on delete cascade,
  check (position >= 0),
  check (outcome in ('yes', 'no', 'a', 'b', 'mail', 'phone', 'wait', 'would_send', 'suppressed', 'skipped', 'end')),
  check (jsonb_typeof(detail) = 'object')
);

create index if not exists marketing_simulation_steps_run_idx
  on public.marketing_simulation_steps (store_id, run_id, position);

do $$
declare
  rel text;
begin
  foreach rel in array array['marketing_simulation_runs', 'marketing_simulation_steps']
  loop
    execute format('alter table public.%I enable row level security', rel);
    execute format('alter table public.%I force row level security', rel);
    execute format('drop trigger if exists %I on public.%I', rel || '_lock_store', rel);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.reject_store_id_change()',
      rel || '_lock_store', rel
    );
    execute format('revoke all on table public.%I from public, anon', rel);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_select', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_insert', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_update', rel);
    execute format('drop policy if exists %I on public.%I', rel || '_delete', rel);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.can_read_marketing(store_id)))',
      rel || '_select', rel
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.can_write_marketing(store_id)))',
      rel || '_insert', rel
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.can_write_marketing(store_id))) with check ((select private.can_write_marketing(store_id)))',
      rel || '_update', rel
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.can_write_marketing(store_id)))',
      rel || '_delete', rel
    );
  end loop;
end $$;

create or replace function private.marketing_delivery_reason(
  target_store uuid,
  channel text,
  address text,
  purpose text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text;
  allowed boolean;
  reason text;
begin
  normalized := case
    when channel = 'email' then lower(btrim(coalesce(address, '')))
    else btrim(coalesce(address, ''))
  end;
  if normalized = '' then
    return jsonb_build_object('allowed', false, 'reason', 'no_address');
  end if;
  allowed := private.marketing_send_allowed(target_store, channel, normalized, purpose);
  if allowed then
    return jsonb_build_object('allowed', true, 'reason', 'allowed');
  end if;
  select blocked.reason into reason
  from public.marketing_suppressions as blocked
  where blocked.store_id = target_store
    and blocked.channel = marketing_delivery_reason.channel
    and blocked.address = normalized
  limit 1;
  return jsonb_build_object('allowed', false, 'reason', coalesce(reason, 'suppressed'));
end;
$$;

revoke all on function private.marketing_delivery_reason(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.marketing_delivery_decision(
  target_store uuid,
  channel text,
  address text,
  purpose text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_marketing(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.marketing_delivery_reason(target_store, channel, address, purpose);
end;
$$;

revoke all on function public.marketing_delivery_decision(uuid, text, text, text) from public, anon;
grant execute on function public.marketing_delivery_decision(uuid, text, text, text) to authenticated;

create or replace function public.marketing_audience(target_store uuid, definition jsonb)
returns table (
  customer_id uuid,
  name text,
  email text,
  consent text,
  allowed boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  audience_key text := coalesce(definition->>'key', 'subscribed');
  lookback integer := case
    when coalesce(definition->>'lookbackDays', '') ~ '^[0-9]+$' then (definition->>'lookbackDays')::integer
    else 0
  end;
begin
  if not private.can_read_marketing(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with chosen as (
    select
      customer.id,
      customer.name,
      lower(btrim(coalesce(customer.email, ''))) as email_address,
      customer.email_consent_status,
      customer.created_at,
      (
        select count(*)
        from public.orders as placed
        where placed.store_id = customer.store_id
          and placed.customer_id = customer.id
      ) as order_count
    from public.customers as customer
    where customer.store_id = target_store
      and btrim(coalesce(customer.email, '')) <> ''
  )
  select
    chosen.id,
    chosen.name,
    chosen.email_address,
    chosen.email_consent_status,
    private.marketing_send_allowed(target_store, 'email', chosen.email_address, 'marketing'),
    case
      when private.marketing_send_allowed(target_store, 'email', chosen.email_address, 'marketing') then 'allowed'
      else coalesce((
        select blocked.reason
        from public.marketing_suppressions as blocked
        where blocked.store_id = target_store
          and blocked.channel = 'email'
          and blocked.address = chosen.email_address
        limit 1
      ), 'suppressed')
    end
  from chosen
  where case audience_key
    when 'all' then true
    when 'fresh' then lookback = 0 or chosen.created_at >= now() - make_interval(days => lookback)
    when 'repeat' then chosen.order_count > 2
    else chosen.email_consent_status = 'subscribed'
  end;
end;
$$;

revoke all on function public.marketing_audience(uuid, jsonb) from public, anon;
grant execute on function public.marketing_audience(uuid, jsonb) to authenticated;

create or replace function public.record_marketing_simulation(target_store uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  flow_legacy integer;
  automation uuid;
  campaign uuid;
  event_name text;
  recipient text;
  dedupe_key text;
  existing uuid;
  run_id uuid;
  item jsonb;
  position integer := 0;
  outcome text;
  address text;
  decision jsonb;
  would_send boolean := false;
  suppressed boolean := false;
  steps jsonb := '[]'::jsonb;
begin
  if not private.can_write_marketing(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  event_name := btrim(coalesce(payload->>'eventName', ''));
  recipient := lower(btrim(coalesce(payload->>'recipient', '')));
  dedupe_key := btrim(coalesce(payload->>'dedupeKey', ''));
  if event_name = '' then
    raise exception 'missing simulation event' using errcode = '22023';
  end if;

  if coalesce(payload->>'flowLegacyId', '') ~ '^[0-9]+$' then
    flow_legacy := (payload->>'flowLegacyId')::integer;
    select automations.id into automation
    from public.marketing_automations as automations
    where automations.store_id = target_store
      and automations.legacy_id = flow_legacy;
  end if;

  if coalesce(payload->>'campaignId', '') ~* '^[0-9a-f-]{36}$' then
    campaign := (payload->>'campaignId')::uuid;
    if not exists (
      select 1 from public.marketing_campaigns as saved
      where saved.store_id = target_store and saved.id = campaign
    ) then
      campaign := null;
    end if;
  end if;

  if dedupe_key <> '' then
    select runs.id into existing
    from public.marketing_simulation_runs as runs
    where runs.store_id = target_store
      and runs.dedupe_key = dedupe_key;
    if existing is not null then
      return jsonb_build_object('runId', existing, 'duplicate', true, 'wouldSend', false, 'suppressed', false);
    end if;
  end if;

  for item in select value from jsonb_array_elements(coalesce(payload->'steps', '[]'::jsonb)) loop
    outcome := coalesce(item->>'outcome', 'skipped');
    if outcome not in ('yes', 'no', 'a', 'b', 'mail', 'phone', 'wait', 'would_send', 'suppressed', 'skipped', 'end') then
      outcome := 'skipped';
    end if;
    if outcome = 'would_send' then
      address := lower(btrim(coalesce(item->'detail'->>'address', recipient)));
      decision := private.marketing_delivery_reason(target_store, case when item->>'stepType' = 'sms' then 'sms' else 'email' end, address, 'marketing');
      if coalesce(decision->>'allowed', 'false') <> 'true' then
        outcome := 'suppressed';
        item := jsonb_set(item, '{detail,reason}', to_jsonb(coalesce(decision->>'reason', 'suppressed')), true);
      end if;
    end if;
    item := jsonb_set(item, '{outcome}', to_jsonb(outcome), true);
    item := jsonb_set(item, '{detail,dispatched}', 'false'::jsonb, true);
    if outcome = 'would_send' then would_send := true; end if;
    if outcome = 'suppressed' then suppressed := true; end if;
    steps := steps || jsonb_build_array(item);
  end loop;

  insert into public.marketing_simulation_runs (
    store_id, automation_id, campaign_id, event_name, recipient, dedupe_key, status, would_send, suppressed, summary
  )
  values (
    target_store, automation, campaign, event_name, recipient, dedupe_key, 'completed', would_send, suppressed,
    jsonb_build_object('provider', 'mock', 'dispatched', false)
  )
  returning id into run_id;

  for item in select value from jsonb_array_elements(steps) loop
    insert into public.marketing_simulation_steps (store_id, run_id, position, step_type, outcome, detail)
    values (
      target_store,
      run_id,
      position,
      coalesce(item->>'stepType', 'step'),
      item->>'outcome',
      coalesce(item->'detail', '{}'::jsonb)
    );
    position := position + 1;
  end loop;

  return jsonb_build_object('runId', run_id, 'duplicate', false, 'wouldSend', would_send, 'suppressed', suppressed);
end;
$$;

revoke all on function public.record_marketing_simulation(uuid, jsonb) from public, anon;
grant execute on function public.record_marketing_simulation(uuid, jsonb) to authenticated;
