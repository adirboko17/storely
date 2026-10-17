alter table public.orders
  add column if not exists customer_status text not null default 'received';

update public.orders as sale
set customer_status = case sale.fulfillment_status
  when 'progress' then 'progress'
  when 'onhold' then 'hold'
  when 'fulfilled' then 'sent'
  when 'partial' then 'progress'
  else 'received'
end
where sale.customer_status = 'received'
  and sale.fulfillment_status in ('progress', 'onhold', 'fulfilled', 'partial');

alter table public.orders
  drop constraint if exists orders_customer_status_check;

alter table public.orders
  add constraint orders_customer_status_check
  check (customer_status in ('received', 'progress', 'hold', 'sent', 'transit', 'delivered'));

create or replace function public.update_store_order(target_store uuid, order_number integer, patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  next_pay text := patch->>'pay';
  next_fulfillment text := patch->>'fulfillment';
  next_customer text := patch->>'customer_status';
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if next_pay is not null and next_pay not in ('paid', 'pending', 'partially_refunded', 'refunded') then
    raise exception 'סטטוס תשלום לא תקין' using errcode = '22023';
  end if;
  if next_fulfillment is not null and next_fulfillment not in ('unfulfilled', 'fulfilled', 'partial', 'onhold', 'progress') then
    raise exception 'סטטוס משלוח לא תקין' using errcode = '22023';
  end if;
  if next_customer is not null and next_customer not in ('received', 'progress', 'hold', 'sent', 'transit', 'delivered') then
    raise exception 'סטטוס ללקוח לא תקין' using errcode = '22023';
  end if;

  update public.orders as sale
  set financial_status = coalesce(next_pay, sale.financial_status),
      fulfillment_status = coalesce(next_fulfillment, sale.fulfillment_status),
      customer_status = coalesce(next_customer, sale.customer_status),
      refunded = case when patch ? 'refunded' then greatest((patch->>'refunded')::numeric, 0) else sale.refunded end,
      carrier = case when patch ? 'carrier' then coalesce(patch->>'carrier', '') else sale.carrier end,
      tracking = case when patch ? 'tracking' then coalesce(patch->>'tracking', '') else sale.tracking end,
      timeline = case
        when nullif(patch->>'comment', '') is not null then sale.timeline || jsonb_build_array(jsonb_build_object('text', patch->>'comment', 'at', now()))
        else sale.timeline
      end
  where sale.store_id = target_store
    and sale.order_number = update_store_order.order_number
  returning sale.id into saved_id;

  if saved_id is null then
    raise exception 'ההזמנה לא נמצאה' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_store_order(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_store_order(uuid, integer, jsonb) to authenticated;

create or replace function public.customer_order_statuses(
  target_store uuid,
  customer_phone text,
  customer_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted_phone text := right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 9);
  wanted_email text := lower(btrim(coalesce(customer_email, '')));
begin
  if length(wanted_phone) < 9 or wanted_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from public.stores as store where store.id = target_store) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'number', sale_row.order_number,
      'status', sale_row.customer_status,
      'total', sale_row.total,
      'title', sale_row.title,
      'at', sale_row.created_at
    ) order by sale_row.created_at desc)
    from (
      select sale.order_number, sale.customer_status, sale.total, sale.created_at,
        coalesce((
          select item.title
          from public.order_items as item
          where item.store_id = sale.store_id
            and item.order_id = sale.id
          order by item.id
          limit 1
        ), '') as title
      from public.orders as sale
      join public.customers as customer
        on customer.store_id = sale.store_id
       and customer.id = sale.customer_id
      where sale.store_id = target_store
        and sale.order_number is not null
        and lower(coalesce(customer.email, '')) = wanted_email
        and right(regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'), 9) = wanted_phone
      order by sale.created_at desc
      limit 30
    ) as sale_row
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.customer_order_statuses(uuid, text, text) from public, anon, authenticated;
grant execute on function public.customer_order_statuses(uuid, text, text) to service_role;

do $$
declare
  src text;
  needle text := '''fulfillment'', sale.fulfillment_status,';
  patched text := '''fulfillment'', sale.fulfillment_status,' || E'\n          ''customerStatus'', sale.customer_status,';
begin
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  if src not like '%''customerStatus'', sale.customer_status%' then
    if position(needle in src) = 0 then
      raise exception 'fulfillment field missing from admin snapshot';
    end if;
    execute replace(src, needle, patched);
  end if;
end $$;
