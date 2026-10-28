-- The orders screen reads one page at a time instead of the whole list.
-- store_admin_snapshot still returns every order for the mobile app.

create index if not exists orders_page_idx
  on public.orders (store_id, created_at desc, id desc)
  where order_number is not null;

create or replace function public.store_admin_orders_page(target_store uuid, page_index integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_page integer;
  page_size constant integer := 50;
  total_count integer;
  rows jsonb;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  bounded_page := least(greatest(coalesce(page_index, 0), 0), 100000);

  select count(*)
  into total_count
  from public.orders as sale
  where sale.store_id = target_store
    and sale.order_number is not null;

  with page as materialized (
    select sale.id
    from public.orders as sale
    where sale.store_id = target_store
      and sale.order_number is not null
    order by sale.created_at desc, sale.id desc
    limit page_size
    offset bounded_page * page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sale.id,
    'number', sale.order_number,
    'createdAt', sale.created_at,
    'customerId', sale.customer_id,
    'customerName', coalesce(customer.name, ''),
    'channel', sale.channel,
    'pay', sale.financial_status,
    'fulfillment', sale.fulfillment_status,
    'customerStatus', sale.customer_status,
    'total', sale.total,
    'note', sale.note,
    'tags', sale.tags,
    'discountCode', sale.discount_code,
    'discountAmount', sale.discount_amount,
    'shippingName', sale.shipping_name,
    'shippingAmount', sale.shipping_amount,
    'refunded', sale.refunded,
    'carrier', sale.carrier,
    'tracking', sale.tracking,
    'timeline', sale.timeline,
    'lines', coalesce(items.lines, '[]'::jsonb)
  ) order by sale.created_at desc, sale.id desc), '[]'::jsonb)
  into rows
  from page
  join public.orders as sale
    on sale.store_id = target_store
   and sale.id = page.id
  left join public.customers as customer
    on customer.store_id = sale.store_id
   and customer.id = sale.customer_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'productId', variant_row.product_id,
      'title', item.title,
      'quantity', item.quantity,
      'unitPrice', item.unit_price,
      'variant', coalesce(variant_row.title, ''),
      'sku', coalesce(variant_row.sku, '')
    ) order by item.id) as lines
    from public.order_items as item
    left join public.product_variants as variant_row
      on variant_row.store_id = item.store_id
     and variant_row.id = item.variant_id
    where item.store_id = sale.store_id
      and item.order_id = sale.id
  ) as items on true;

  if rows is null then
    rows := '[]'::jsonb;
  end if;

  return jsonb_build_object('total', total_count, 'orders', rows);
end;
$$;

revoke all on function public.store_admin_orders_page(uuid, integer) from public, anon;
grant execute on function public.store_admin_orders_page(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
