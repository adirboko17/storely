-- A merchant builds a cart in the app and either sends a checkout link
-- or records a cash sale. The link is an ordinary checkout draft, so the
-- storefront recovery page can charge it. Payment is detected when that
-- draft is recovered, or when a matching online order arrives afterwards.

alter table public.checkout_drafts
  add column if not exists order_id uuid;

create or replace function private.sale_line_key(lines jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('quantity', grouped.quantity, 'variant', grouped.variant_id) order by grouped.variant_id)
    from (
      select (item->>'variantId')::uuid as variant_id, sum((item->>'quantity')::integer) as quantity
      from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) as item
      where coalesce(item->>'variantId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and coalesce(item->>'quantity', '') ~ '^[0-9]+$'
      group by 1
    ) as grouped
  ), '[]'::jsonb);
$$;

revoke all on function private.sale_line_key(jsonb) from public, anon, authenticated;

create or replace function public.store_sale_catalog(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object('ok', true, 'products', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', product.id,
      'title', product.title,
      'image', (
        select public.product_media_public_url(media.path)
        from public.product_media as media
        where media.store_id = product.store_id
          and media.product_id = product.id
        order by media.position, media.id
        limit 1
      ),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', variant_row.id,
          'title', coalesce(variant_row.title, ''),
          'price', coalesce(variant_row.price, product.price),
          'stock', coalesce(inventory.available, 0)
        ) order by variant_row.position, variant_row.id)
        from public.product_variants as variant_row
        left join public.inventory_items as inventory
          on inventory.store_id = variant_row.store_id
         and inventory.variant_id = variant_row.id
        where variant_row.store_id = product.store_id
          and variant_row.product_id = product.id
      ), '[]'::jsonb)
    ) order by product.position, product.created_at)
    from public.products as product
    where product.store_id = target_store
      and product.status = 'active'
  ), '[]'::jsonb));
end;
$$;

create or replace function public.create_store_payment_link(target_store uuid, sale_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart jsonb;
  saved_id uuid;
  visitor text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  cart := private.storefront_cart(target_store, sale_lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;

  visitor := 'sale' || replace(gen_random_uuid()::text, '-', '');
  insert into public.checkout_drafts (
    store_id, visitor_key, lines, subtotal, shipping_amount, total
  )
  values (
    target_store,
    visitor,
    cart->'lines',
    (cart->>'subtotal')::numeric,
    0,
    (cart->>'subtotal')::numeric
  )
  returning id into saved_id;

  return jsonb_build_object(
    'ok', true,
    'id', saved_id,
    'subtotal', (cart->>'subtotal')::numeric,
    'total', (cart->>'subtotal')::numeric,
    'lines', cart->'lines'
  );
end;
$$;

create or replace function public.store_payment_link_status(target_store uuid, checkout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft_row public.checkout_drafts%rowtype;
  wanted jsonb;
  matched_id uuid;
  matched_number integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select draft.*
  into draft_row
  from public.checkout_drafts as draft
  where draft.store_id = target_store
    and draft.id = checkout_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'הקישור לא נמצא');
  end if;

  if draft_row.order_id is not null then
    select sale.order_number
    into matched_number
    from public.orders as sale
    where sale.store_id = target_store
      and sale.id = draft_row.order_id;
    return jsonb_build_object('ok', true, 'recovered', true, 'orderNumber', matched_number);
  end if;

  wanted := private.sale_line_key(draft_row.lines);
  select sale.id, sale.order_number
  into matched_id, matched_number
  from public.orders as sale
  where sale.store_id = target_store
    and sale.channel = 'חנות אונליין'
    and sale.financial_status = 'paid'
    and sale.created_at >= draft_row.updated_at - interval '1 minute'
    and not exists (
      select 1
      from public.checkout_drafts as other
      where other.store_id = target_store
        and other.order_id = sale.id
    )
    and private.sale_line_key((
      select coalesce(jsonb_agg(jsonb_build_object(
        'variantId', item.variant_id,
        'quantity', item.quantity
      )), '[]'::jsonb)
      from public.order_items as item
      where item.store_id = sale.store_id
        and item.order_id = sale.id
        and item.variant_id is not null
    )) = wanted
  order by sale.created_at
  limit 1;

  if matched_id is not null then
    update public.checkout_drafts as draft
    set recovered = true,
        order_id = matched_id
    where draft.store_id = target_store
      and draft.id = checkout_id
      and draft.order_id is null;
    return jsonb_build_object('ok', true, 'recovered', true, 'orderNumber', matched_number);
  end if;

  return jsonb_build_object('ok', true, 'recovered', draft_row.recovered, 'orderNumber', null);
end;
$$;

create or replace function public.place_store_cash_sale(target_store uuid, sale_lines jsonb, custom_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart jsonb;
  line jsonb;
  taken integer;
  saved_order uuid;
  next_number integer;
  extra numeric(12, 2) := round(coalesce(custom_amount, 0), 2);
  subtotal numeric(12, 2) := 0;
  total numeric(12, 2);
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extra < 0 or extra > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום לא תקין');
  end if;
  if jsonb_typeof(sale_lines) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
  end if;

  if jsonb_array_length(sale_lines) > 0 then
    cart := private.storefront_cart(target_store, sale_lines);
    if coalesce(cart->>'ok', 'false') <> 'true' then
      return cart;
    end if;
    subtotal := (cart->>'subtotal')::numeric;
  elsif extra = 0 then
    return jsonb_build_object('ok', false, 'reason', 'אין מה לגבות');
  else
    cart := jsonb_build_object('lines', '[]'::jsonb);
  end if;

  total := subtotal + extra;
  perform 1 from public.stores as store where store.id = target_store for update;

  for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
  loop
    taken := null;
    update public.inventory_items as inventory
    set available = inventory.available - (line->>'quantity')::integer
    where inventory.store_id = target_store
      and inventory.variant_id = (line->>'variantId')::uuid
      and inventory.available >= (line->>'quantity')::integer
    returning inventory.available into taken;
    if taken is null then
      raise exception 'המלאי לא מספיק' using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(max(sale.order_number), 1000) + 1
  into next_number
  from public.orders as sale
  where sale.store_id = target_store;

  insert into public.orders (
    store_id, financial_status, fulfillment_status, customer_status, total, order_number, channel, note, shipping_amount
  )
  values (
    target_store, 'paid', 'fulfilled', 'delivered', total, next_number, 'מכירה מהירה', 'מכירה מהירה במזומן', 0
  )
  returning id into saved_order;

  insert into public.order_items (store_id, order_id, variant_id, title, quantity, unit_price)
  select
    target_store,
    saved_order,
    (line.line->>'variantId')::uuid,
    line.line->>'title',
    (line.line->>'quantity')::integer,
    (line.line->>'unitPrice')::numeric
  from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as line(line);

  if extra > 0 then
    insert into public.order_items (store_id, order_id, title, quantity, unit_price)
    values (target_store, saved_order, 'סכום חופשי', 1, extra);
  end if;

  insert into public.payments (store_id, order_id, amount, status)
  values (target_store, saved_order, total, 'paid');

  insert into public.shipments (store_id, order_id, status)
  values (target_store, saved_order, 'fulfilled');

  return jsonb_build_object('ok', true, 'orderNumber', next_number, 'total', total);
end;
$$;

revoke all on function public.store_sale_catalog(uuid) from public, anon;
revoke all on function public.create_store_payment_link(uuid, jsonb) from public, anon;
revoke all on function public.store_payment_link_status(uuid, uuid) from public, anon;
revoke all on function public.place_store_cash_sale(uuid, jsonb, numeric) from public, anon;
grant execute on function public.store_sale_catalog(uuid) to authenticated;
grant execute on function public.create_store_payment_link(uuid, jsonb) to authenticated;
grant execute on function public.store_payment_link_status(uuid, uuid) to authenticated;
grant execute on function public.place_store_cash_sale(uuid, jsonb, numeric) to authenticated;
