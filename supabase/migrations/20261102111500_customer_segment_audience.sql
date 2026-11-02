-- Saved customer segments are marketing_segments whose definition.source is customers.
-- The audience preview has to apply those spend, order, and subscription rules.

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
