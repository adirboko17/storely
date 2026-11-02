-- Several answers on the same quiz question mean any one of them.
-- A later question only filters women who actually reached it.

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
