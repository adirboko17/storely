create or replace function public.read_store_orders(
  token_hash text,
  updated_since timestamptz,
  after_id uuid,
  page_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  cursor_time timestamptz := coalesce(updated_since, '-infinity'::timestamptz);
  cursor_id uuid := coalesce(after_id, '00000000-0000-0000-0000-000000000000'::uuid);
  bounded integer := least(greatest(coalesce(page_limit, 50), 1), 100);
  rows jsonb;
  extra boolean := false;
begin
  if token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select access_key.store_id
  into found_store
  from public.order_read_keys as access_key
  where access_key.token_hash = read_store_orders.token_hash
    and access_key.revoked_at is null;

  if found_store is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  update public.order_read_keys
  set last_used_at = now()
  where order_read_keys.token_hash = read_store_orders.token_hash
    and order_read_keys.revoked_at is null;

  with page as materialized (
    select sale.id, sale.updated_at
    from public.orders as sale
    where sale.store_id = found_store
      and sale.order_number is not null
      and (sale.updated_at, sale.id) > (cursor_time, cursor_id)
    order by sale.updated_at, sale.id
    limit bounded + 1
  ),
  chosen as (
    select page.id
    from page
    order by page.updated_at, page.id
    limit bounded
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sale.id,
    'number', sale.order_number,
    'createdAt', sale.created_at,
    'updatedAt', sale.updated_at,
    'paymentStatus', sale.financial_status,
    'fulfillmentStatus', sale.fulfillment_status,
    'customerStatus', sale.customer_status,
    'currency', coalesce(settings.currency, 'ILS'),
    'total', sale.total,
    'discountCode', coalesce(sale.discount_code, ''),
    'discountAmount', coalesce(sale.discount_amount, 0),
    'shippingName', coalesce(sale.shipping_name, ''),
    'shippingAmount', coalesce(sale.shipping_amount, 0),
    'refunded', coalesce(sale.refunded, 0),
    'note', coalesce(sale.note, ''),
    'tags', coalesce(to_jsonb(sale.tags), '[]'::jsonb),
    'carrier', coalesce(sale.carrier, ''),
    'tracking', coalesce(sale.tracking, ''),
    'customer', jsonb_build_object(
      'name', coalesce(customer.name, ''),
      'email', coalesce(customer.email, ''),
      'phone', coalesce(customer.phone, '')
    ),
    'address', jsonb_build_object(
      'street', coalesce(address.street, ''),
      'city', coalesce(address.city, ''),
      'zip', coalesce(address.zip, '')
    ),
    'checkout', case
      when sale.checkout_recorded then jsonb_build_object(
        'pregnancyWeek', sale.pregnancy_week,
        'babyBirthDate', sale.baby_birth_date,
        'heard', sale.heard_about,
        'heardDetail', sale.heard_detail,
        'marketingConsent', sale.marketing_consent
      )
      else private.checkout_from_address(coalesce(address.street, ''))
        || jsonb_build_object('marketingConsent', sale.marketing_consent)
    end,
    'items', coalesce(items.lines, '[]'::jsonb)
  ) order by sale.updated_at, sale.id), '[]'::jsonb),
  (select count(*) > bounded from page)
  into rows, extra
  from chosen
  join public.orders as sale
    on sale.store_id = found_store
   and sale.id = chosen.id
  left join public.store_settings as settings
    on settings.store_id = sale.store_id
  left join public.customers as customer
    on customer.store_id = sale.store_id
   and customer.id = sale.customer_id
  left join lateral (
    select addr.street, addr.city, addr.zip
    from public.customer_addresses as addr
    where addr.store_id = sale.store_id
      and addr.customer_id = sale.customer_id
    limit 1
  ) as address on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'title', item.title,
      'variant', coalesce(variant_row.title, ''),
      'sku', coalesce(variant_row.sku, ''),
      'quantity', item.quantity,
      'unitPrice', item.unit_price
    ) order by item.id) as lines
    from public.order_items as item
    left join public.product_variants as variant_row
      on variant_row.store_id = item.store_id
     and variant_row.id = item.variant_id
    where item.store_id = sale.store_id
      and item.order_id = sale.id
  ) as items on true;

  return jsonb_build_object('ok', true, 'orders', coalesce(rows, '[]'::jsonb), 'hasMore', coalesce(extra, false));
end;
$$;

revoke all on function public.read_store_orders(text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.read_store_orders(text, timestamptz, uuid, integer) to service_role;
