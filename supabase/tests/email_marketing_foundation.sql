-- Runs after the migrations, inside a transaction that is rolled back.
-- Proves projection, idempotency, consent, suppression, and the marketing permission split.

begin;

create table if not exists test_auth (uid uuid);
truncate test_auth;
insert into test_auth (uid) values (null);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select uid from test_auth;
$$;

do $$
declare
  store_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  staff_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  marketer_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  staff_role uuid;
  marketer_role uuid;
  email_id uuid := '11111111-1111-4111-8111-111111111111';
  payload jsonb;
  projected jsonb;
  again jsonb;
  snapshot jsonb;
  message_id uuid;
  automation_id uuid;
  step_message uuid;
  event_count integer;
  allowed boolean;
begin
  insert into auth.users (id, email) values
    (staff_id, 'staff@example.test'),
    (marketer_id, 'marketer@example.test');

  insert into public.stores (id, name, status, environment)
  values (store_id, 'Marketing Test', 'active', 'development');

  insert into public.roles (id, store_id, key, name, built_in)
  values
    (gen_random_uuid(), store_id, 'staff', 'צוות', true),
    (gen_random_uuid(), store_id, 'marketer', 'שיווק', false);
  select id into staff_role from public.roles where store_id = store_id and key = 'staff';
  select id into marketer_role from public.roles where store_id = store_id and key = 'marketer';
  insert into public.role_permissions (store_id, role_id, permission_key)
  values
    (store_id, staff_role, 'orders.read'),
    (store_id, marketer_role, 'marketing.read');
  insert into public.store_members (store_id, user_id, role_id, display_name, status)
  values
    (store_id, staff_id, staff_role, 'Staff', 'active'),
    (store_id, marketer_id, marketer_role, 'Marketer', 'active');

  payload := jsonb_build_object(
    'emails', jsonb_build_array(jsonb_build_object(
      'id', email_id,
      'name', 'Welcome',
      'subject', 'שלום {first_name}',
      'preview', 'preview',
      'blocks', jsonb_build_array(jsonb_build_object('id', 'block-1', 'type', 'text', 'text', 'היי'))
    )),
    'sms', jsonb_build_array(jsonb_build_object(
      'id', 'sms-1',
      'name', 'Short',
      'text', 'היי {first_name}'
    )),
    'flows', jsonb_build_array(jsonb_build_object(
      'id', 7,
      'name', 'עגלה נטושה',
      'trigger', 'הלקוח נטש עגלה',
      'lookback', 7,
      'on', false,
      'stats', null,
      'steps', jsonb_build_array(
        jsonb_build_object('type', 'wait', 'value', '1', 'unit', 'שעות'),
        jsonb_build_object(
          'type', 'cond',
          'match', 'all',
          'rules', jsonb_build_array(jsonb_build_object('field', 'subscribed', 'op', 'is', 'value', 'yes')),
          'yes', jsonb_build_array(jsonb_build_object('type', 'email', 'emailId', email_id)),
          'no', jsonb_build_array(jsonb_build_object('type', 'end'))
        )
      )
    )),
    'connected', jsonb_build_object('meta', jsonb_build_object('id', '123'))
  );

  insert into public.store_settings (store_id, display_name, marketing)
  values (store_id, 'Marketing Test', payload);

  select id into message_id
  from public.marketing_messages
  where store_id = store_id and legacy_key = email_id::text;
  if message_id is distinct from email_id then
    raise exception 'email id was not preserved: %', message_id;
  end if;

  select id into automation_id
  from public.marketing_automations
  where store_id = store_id and legacy_id = 7;
  if automation_id is null then
    raise exception 'automation was not projected';
  end if;

  select step.message_id into step_message
  from public.marketing_automation_steps as step
  where step.store_id = store_id
    and step.automation_id = automation_id
    and step.step_type = 'email';
  if step_message is distinct from email_id then
    raise exception 'email step is not linked to the preserved message';
  end if;

  if (select count(*) from public.marketing_automation_steps where store_id = store_id) <> 4 then
    raise exception 'expected 4 steps, got %', (select count(*) from public.marketing_automation_steps where store_id = store_id);
  end if;

  projected := private.import_store_marketing(store_id, payload);
  again := private.import_store_marketing(store_id, payload);
  if projected <> again then
    raise exception 'import is not idempotent: % vs %', projected, again;
  end if;
  if (select count(*) from public.marketing_messages where store_id = store_id) <> 2 then
    raise exception 'message count changed after the second import';
  end if;

  update public.store_settings
  set marketing = payload #- '{flows,0}';
  if exists (select 1 from public.marketing_automations where store_id = store_id) then
    raise exception 'removed flow was not deleted';
  end if;
  update public.store_settings set marketing = payload;

  insert into public.customers (store_id, name, email, phone, subscribed)
  values (store_id, 'No Consent', 'quiet@example.test', '0500000000', false);
  if (select email_consent_status from public.customers where email = 'quiet@example.test') <> 'unknown' then
    raise exception 'a customer with an email was treated as consented';
  end if;
  if exists (
    select 1 from public.marketing_consent_events as event
    join public.customers as customer on customer.id = event.customer_id
    where customer.email = 'quiet@example.test'
  ) then
    raise exception 'unknown consent wrote a history row';
  end if;

  insert into public.customers (store_id, name, email, phone, subscribed)
  values (store_id, 'Opt In', 'optin@example.test', '0500000001', true);
  select count(*) into event_count
  from public.marketing_consent_events as event
  join public.customers as customer on customer.id = event.customer_id
  where customer.email = 'optin@example.test' and event.channel = 'email';
  if event_count <> 1 then
    raise exception 'expected one subscribe event, got %', event_count;
  end if;

  update public.customers set name = 'Opt In Renamed' where email = 'optin@example.test';
  select count(*) into event_count
  from public.marketing_consent_events as event
  join public.customers as customer on customer.id = event.customer_id
  where customer.email = 'optin@example.test' and event.channel = 'email';
  if event_count <> 1 then
    raise exception 'renaming a customer duplicated consent history';
  end if;

  update public.customers set subscribed = false where email = 'optin@example.test';
  if not exists (
    select 1 from public.marketing_suppressions
    where store_id = store_id and channel = 'email' and address = 'optin@example.test' and reason = 'unsubscribe'
  ) then
    raise exception 'unsubscribe did not suppress the address';
  end if;
  if private.marketing_send_allowed(store_id, 'email', 'OptIn@example.test', 'marketing') then
    raise exception 'marketing mail was allowed after unsubscribe';
  end if;
  if not private.marketing_send_allowed(store_id, 'email', 'OptIn@example.test', 'transactional') then
    raise exception 'transactional mail was blocked by unsubscribe';
  end if;

  update public.customers set subscribed = true where email = 'optin@example.test';
  if exists (
    select 1 from public.marketing_suppressions
    where store_id = store_id and channel = 'email' and address = 'optin@example.test' and reason = 'unsubscribe'
  ) then
    raise exception 'resubscribe left an unsubscribe suppression';
  end if;

  insert into public.marketing_suppressions (store_id, channel, address, reason, source)
  values (store_id, 'email', 'optin@example.test', 'bounce', 'test')
  on conflict (store_id, channel, address) do update set reason = 'bounce';
  update public.customers set subscribed = true where email = 'optin@example.test';
  if private.marketing_send_allowed(store_id, 'email', 'optin@example.test', 'marketing') then
    raise exception 'marketing mail was allowed after a bounce';
  end if;
  if private.marketing_send_allowed(store_id, 'email', 'optin@example.test', 'transactional') then
    raise exception 'transactional mail was allowed after a bounce';
  end if;

  update test_auth set uid = staff_id;
  begin
    perform public.save_store_sections(store_id, jsonb_build_object('marketing', '{}'::jsonb));
    raise exception 'staff was allowed to write marketing';
  exception
    when sqlstate '42501' then
      null;
  end;
  perform public.save_store_sections(store_id, jsonb_build_object('policies', jsonb_build_object('return', 'ok')));
  snapshot := public.store_admin_snapshot(store_id);
  if snapshot->'marketing' <> '{}'::jsonb then
    raise exception 'staff snapshot leaked marketing json';
  end if;
  if snapshot->'policies'->>'return' is distinct from 'ok' then
    raise exception 'staff lost commerce settings access';
  end if;

  update test_auth set uid = marketer_id;
  snapshot := public.store_admin_snapshot(store_id);
  if snapshot->'marketing'->'emails'->0->>'id' is distinct from email_id::text then
    raise exception 'marketer could not read marketing json';
  end if;
end $$;

grant select on test_auth to authenticated;
update test_auth set uid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local role authenticated;
do $$
begin
  if (select count(*) from public.marketing_messages) <> 0 then
    raise exception 'staff could read marketing messages through RLS';
  end if;
end $$;
reset role;

update test_auth set uid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set local role authenticated;
do $$
begin
  if (select count(*) from public.marketing_messages where store_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'marketer could not read marketing messages through RLS';
  end if;
end $$;
reset role;

rollback;
