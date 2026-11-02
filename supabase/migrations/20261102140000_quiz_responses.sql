-- Quiz submissions. The storefront server calls submit_store_quiz.
-- Rows are not inserted by the browser. A quiz segment matches women who gave every chosen answer and agreed to updates.

create table if not exists public.store_quiz_responses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  email text not null,
  name text not null default '',
  phone text not null default '',
  answers jsonb not null,
  marketing_consent boolean not null default false,
  customer_id uuid references public.customers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, email),
  check (jsonb_typeof(answers) = 'array'),
  check (octet_length(answers::text) <= 8000),
  check (octet_length(email) <= 200)
);

comment on table public.store_quiz_responses is
  'One row per email. A later quiz submit replaces the answers. Consent is kept once it is given.';

create index if not exists store_quiz_responses_store_idx
  on public.store_quiz_responses (store_id, updated_at desc);

alter table public.store_quiz_responses enable row level security;
alter table public.store_quiz_responses force row level security;

drop trigger if exists store_quiz_responses_lock_store on public.store_quiz_responses;
create trigger store_quiz_responses_lock_store
  before update on public.store_quiz_responses
  for each row execute function private.reject_store_id_change();

revoke all on table public.store_quiz_responses from public, anon;
grant select on table public.store_quiz_responses to authenticated;

drop policy if exists store_quiz_responses_select on public.store_quiz_responses;
create policy store_quiz_responses_select on public.store_quiz_responses
  for select to authenticated
  using ((select private.can_read_marketing(store_id)));

create or replace function public.submit_store_quiz(
  tracking_key text,
  hostname text,
  email text,
  person_name text,
  phone text,
  answers jsonb,
  marketing_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  found_store uuid;
  email_key text := lower(btrim(coalesce(email, '')));
  clean_name text := left(btrim(coalesce(person_name, '')), 80);
  phone_key text := left(btrim(coalesce(phone, '')), 40);
  consent_flag boolean := coalesce(marketing_consent, false);
  quiz_flow jsonb;
  clean_answers jsonb := '[]'::jsonb;
  answer_item jsonb;
  question_id text;
  choice_id text;
  question_row jsonb;
  seen_questions text := '';
  recent_count integer;
  response_id uuid;
  remembered_id uuid;
  consented boolean;
begin
  if email_key !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or octet_length(email_key) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'האימייל לא תקין');
  end if;
  if jsonb_typeof(answers) is distinct from 'array'
    or jsonb_array_length(answers) < 1
    or jsonb_array_length(answers) > 12
    or octet_length(answers::text) > 8000 then
    return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;
  select quiz.flow into quiz_flow
  from public.store_quizzes as quiz
  where quiz.store_id = found_store;
  for answer_item in select value from jsonb_array_elements(answers) loop
    if jsonb_typeof(answer_item) is distinct from 'object' then
      return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
    end if;
    question_id := answer_item->>'questionId';
    choice_id := answer_item->>'choiceId';
    if question_id !~ '^[A-Za-z0-9_-]{1,40}$' or choice_id !~ '^[A-Za-z0-9_-]{1,40}$' then
      return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
    end if;
    if position(('|' || question_id || '|') in seen_questions) > 0 then
      continue;
    end if;
    question_row := null;
    if quiz_flow is not null then
      select item into question_row
      from jsonb_array_elements(coalesce(quiz_flow->'questions', '[]'::jsonb)) as item
      where item->>'id' = question_id
      limit 1;
      if question_row is not null and not exists (
        select 1
        from jsonb_array_elements(coalesce(question_row->'choices', '[]'::jsonb)) as choice
        where choice->>'id' = choice_id
      ) then
        return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
      end if;
    end if;
    seen_questions := seen_questions || '|' || question_id || '|';
    clean_answers := clean_answers || jsonb_build_array(jsonb_build_object('questionId', question_id, 'choiceId', choice_id));
    if jsonb_array_length(clean_answers) >= 12 then
      exit;
    end if;
  end loop;
  if jsonb_array_length(clean_answers) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
  end if;
  select count(*) into recent_count
  from public.store_quiz_responses as response
  where response.store_id = found_store
    and response.updated_at > now() - interval '1 minute';
  if recent_count >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'נסו שוב בעוד רגע');
  end if;
  insert into public.store_quiz_responses (store_id, email, name, phone, answers, marketing_consent)
  values (found_store, email_key, clean_name, phone_key, clean_answers, consent_flag)
  on conflict (store_id, email) do update
  set name = excluded.name,
      phone = excluded.phone,
      answers = excluded.answers,
      marketing_consent = public.store_quiz_responses.marketing_consent or excluded.marketing_consent,
      updated_at = now()
  returning id, marketing_consent into response_id, consented;
  if consented then
    perform private.popup_subscribe(found_store, email_key, clean_name);
    select customer.id into remembered_id
    from public.customers as customer
    where customer.store_id = found_store
      and lower(customer.email) = email_key
    order by customer.created_at
    limit 1;
    if remembered_id is not null and phone_key <> '' then
      update public.customers as customer
      set phone = phone_key
      where customer.store_id = found_store
        and customer.id = remembered_id
        and btrim(coalesce(customer.phone, '')) = '';
    end if;
    update public.store_quiz_responses as response
    set customer_id = remembered_id
    where response.id = response_id
      and response.store_id = found_store;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_store_quiz(text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_store_quiz(text, text, text, text, text, jsonb, boolean) to anon, authenticated;

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
  source text := coalesce(definition->>'source', '');
  lookback integer := case
    when coalesce(definition->>'lookbackDays', '') ~ '^[0-9]+$' then (definition->>'lookbackDays')::integer
    else 0
  end;
  min_orders integer := case
    when coalesce(definition->>'minOrders', '') ~ '^[0-9]+$' then (definition->>'minOrders')::integer
    else 0
  end;
  min_spent numeric := case
    when coalesce(definition->>'minSpent', '') ~ '^[0-9]+(\.[0-9]+)?$' then (definition->>'minSpent')::numeric
    else 0
  end;
  subscribed_only boolean := coalesce(definition->>'subscribedOnly', '') in ('true', 't', '1');
  quiz_answers jsonb := case
    when jsonb_typeof(definition->'answers') = 'array' then definition->'answers'
    else '[]'::jsonb
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
      customer.subscribed,
      customer.created_at,
      (
        select count(*)
        from public.orders as placed
        where placed.store_id = customer.store_id
          and placed.customer_id = customer.id
      ) as order_count,
      (
        select coalesce(sum(placed.total), 0)
        from public.orders as placed
        where placed.store_id = customer.store_id
          and placed.customer_id = customer.id
      ) as spent
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
  where case
    when source = 'quiz' then
      jsonb_array_length(quiz_answers) > 0
      and exists (
        select 1
        from public.store_quiz_responses as response
        where response.store_id = target_store
          and response.email = chosen.email_address
          and response.marketing_consent
          and exists (
            select 1
            from jsonb_array_elements(coalesce(response.answers, '[]'::jsonb)) as given
            where given->>'questionId' = quiz_answers->0->>'questionId'
              and exists (
                select 1
                from jsonb_array_elements(quiz_answers) as wanted
                where wanted->>'questionId' = given->>'questionId'
                  and wanted->>'choiceId' = given->>'choiceId'
              )
          )
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(response.answers, '[]'::jsonb)) as given
            where exists (
              select 1
              from jsonb_array_elements(quiz_answers) as ruled
              where ruled->>'questionId' = given->>'questionId'
            )
            and not exists (
              select 1
              from jsonb_array_elements(quiz_answers) as wanted
              where wanted->>'questionId' = given->>'questionId'
                and wanted->>'choiceId' = given->>'choiceId'
            )
          )
      )
    when source = 'customers' then
      chosen.order_count >= min_orders
      and chosen.spent >= min_spent
      and (not subscribed_only or chosen.subscribed)
    when audience_key = 'all' then true
    when audience_key = 'fresh' then lookback = 0 or chosen.created_at >= now() - make_interval(days => lookback)
    when audience_key = 'repeat' then chosen.order_count > 2
    else chosen.email_consent_status = 'subscribed'
  end;
end;
$$;

revoke all on function public.marketing_audience(uuid, jsonb) from public, anon;
grant execute on function public.marketing_audience(uuid, jsonb) to authenticated;
