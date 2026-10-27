-- Quick sale can charge a merchant price, a free amount, and a shipping
-- amount the merchant chose. The checkout quote uses that draft so the
-- website charges the same total, including when the cart would otherwise
-- get free shipping over 250.

create or replace function private.priced_sale_cart(target_store uuid, sale_lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cart jsonb;
  rebuilt jsonb := '[]'::jsonb;
  line jsonb;
  asked numeric;
  subtotal numeric(12, 2) := 0;
  line_total numeric(12, 2);
begin
  if jsonb_typeof(sale_lines) is distinct from 'array' or jsonb_array_length(sale_lines) > 30 then
    return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
  end if;
  if jsonb_array_length(sale_lines) = 0 then
    return jsonb_build_object('ok', true, 'lines', '[]'::jsonb, 'subtotal', 0);
  end if;

  cart := private.storefront_cart(target_store, sale_lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;

  for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
  loop
    asked := null;
    select round((item->>'unitPrice')::numeric, 2)
    into asked
    from jsonb_array_elements(sale_lines) as item
    where item->>'variantId' = line->>'variantId'
      and coalesce(item->>'unitPrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
    limit 1;

    if asked is null then
      asked := round(coalesce((line->>'unitPrice')::numeric, 0), 2);
    end if;
    if asked <= 0 or asked > 1000000 then
      return jsonb_build_object('ok', false, 'reason', 'מחיר לא תקין');
    end if;
    line_total := round(asked * (line->>'quantity')::numeric, 2);
    subtotal := subtotal + line_total;
    rebuilt := rebuilt || jsonb_build_array(
      line || jsonb_build_object('unitPrice', asked, 'lineTotal', line_total)
    );
  end loop;

  if subtotal > 9999999 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום גבוה מדי');
  end if;

  return jsonb_build_object('ok', true, 'lines', rebuilt, 'subtotal', subtotal);
end;
$$;

create or replace function private.apply_sale_prices(target_store uuid, cart jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  draft_row public.checkout_drafts%rowtype;
  wanted jsonb;
  rebuilt jsonb := '[]'::jsonb;
  line jsonb;
  priced numeric;
  custom_extra numeric(12, 2) := 0;
  subtotal numeric(12, 2) := 0;
  line_total numeric(12, 2);
begin
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;

  wanted := private.sale_line_key(cart->'lines');
  if wanted = '[]'::jsonb then
    return cart;
  end if;

  select draft.*
  into draft_row
  from public.checkout_drafts as draft
  where draft.store_id = target_store
    and draft.visitor_key ~ '^sale[0-9a-f]{32}$'
    and draft.recovered = false
    and draft.order_id is null
    and private.sale_line_key(draft.lines) = wanted
  order by draft.updated_at desc
  limit 1;

  if not found then
    return cart;
  end if;

  select coalesce(sum(round((item->>'unitPrice')::numeric * greatest((item->>'quantity')::numeric, 1), 2)), 0)
  into custom_extra
  from jsonb_array_elements(coalesce(draft_row.lines, '[]'::jsonb)) as item
  where coalesce(item->>'variantId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and coalesce(item->>'unitPrice', '') ~ '^[0-9]+(\.[0-9]+)?$';

  for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
  loop
    priced := null;
    select round((item->>'unitPrice')::numeric, 2)
    into priced
    from jsonb_array_elements(coalesce(draft_row.lines, '[]'::jsonb)) as item
    where item->>'variantId' = line->>'variantId'
      and coalesce(item->>'unitPrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
    limit 1;

    if priced is null then
      priced := round(coalesce((line->>'unitPrice')::numeric, 0), 2);
    end if;
    line_total := round(priced * (line->>'quantity')::numeric, 2);
    subtotal := subtotal + line_total;
    rebuilt := rebuilt || jsonb_build_array(
      line || jsonb_build_object('unitPrice', priced, 'lineTotal', line_total)
    );
  end loop;

  return cart || jsonb_build_object(
    'lines', rebuilt,
    'subtotal', subtotal,
    'saleLocked', true,
    'saleShipping', round(coalesce(draft_row.shipping_amount, 0), 2),
    'saleCustom', round(coalesce(custom_extra, 0), 2)
  );
end;
$$;

revoke all on function private.priced_sale_cart(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.apply_sale_prices(uuid, jsonb) from public, anon, authenticated;

drop function if exists public.create_store_payment_link(uuid, jsonb);

create function public.create_store_payment_link(
  target_store uuid,
  sale_lines jsonb,
  custom_amount numeric default 0,
  shipping_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cart jsonb;
  saved_id uuid;
  visitor text;
  extra numeric(12, 2) := round(coalesce(custom_amount, 0), 2);
  ship numeric(12, 2) := round(coalesce(shipping_amount, 0), 2);
  goods numeric(12, 2);
  stored jsonb;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extra < 0 or extra > 1000000 or ship < 0 or ship > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום לא תקין');
  end if;

  cart := private.priced_sale_cart(target_store, sale_lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;
  if coalesce((cart->>'subtotal')::numeric, 0) = 0 and extra = 0 then
    return jsonb_build_object('ok', false, 'reason', 'אין מה לגבות');
  end if;

  stored := coalesce(cart->'lines', '[]'::jsonb);
  if extra > 0 then
    stored := stored || jsonb_build_array(jsonb_build_object(
      'title', 'סכום חופשי',
      'quantity', 1,
      'unitPrice', extra,
      'lineTotal', extra
    ));
  end if;
  goods := round(coalesce((cart->>'subtotal')::numeric, 0) + extra, 2);

  visitor := 'sale' || replace(gen_random_uuid()::text, '-', '');
  insert into public.checkout_drafts (
    store_id, visitor_key, lines, subtotal, shipping_amount, total
  )
  values (
    target_store,
    visitor,
    stored,
    goods,
    ship,
    round(goods + ship, 2)
  )
  returning id into saved_id;

  return jsonb_build_object(
    'ok', true,
    'id', saved_id,
    'subtotal', goods,
    'shipping', ship,
    'total', round(goods + ship, 2),
    'lines', stored
  );
end;
$$;

drop function if exists public.place_store_cash_sale(uuid, jsonb, numeric);

create function public.place_store_cash_sale(
  target_store uuid,
  sale_lines jsonb,
  custom_amount numeric default 0,
  shipping_amount numeric default 0
)
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
  ship numeric(12, 2) := round(coalesce(shipping_amount, 0), 2);
  subtotal numeric(12, 2) := 0;
  total numeric(12, 2);
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if extra < 0 or extra > 1000000 or ship < 0 or ship > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום לא תקין');
  end if;

  cart := private.priced_sale_cart(target_store, sale_lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;
  subtotal := coalesce((cart->>'subtotal')::numeric, 0);
  if subtotal = 0 and extra = 0 then
    return jsonb_build_object('ok', false, 'reason', 'אין מה לגבות');
  end if;

  total := round(subtotal + extra + ship, 2);
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
    store_id, financial_status, fulfillment_status, customer_status, total, order_number, channel, note, shipping_amount, shipping_name
  )
  values (
    target_store, 'paid', 'fulfilled', 'delivered', total, next_number, 'מכירה מהירה', 'מכירה מהירה במזומן', ship,
    case when ship = 0 then 'משלוח חינם' else 'משלוח' end
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

revoke all on function public.create_store_payment_link(uuid, jsonb, numeric, numeric) from public, anon;
revoke all on function public.place_store_cash_sale(uuid, jsonb, numeric, numeric) from public, anon;
grant execute on function public.create_store_payment_link(uuid, jsonb, numeric, numeric) to authenticated;
grant execute on function public.place_store_cash_sale(uuid, jsonb, numeric, numeric) to authenticated;

do $patch$
declare
  src text;
  cart_check text := $sql$cart := private.storefront_cart(found_store, lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;$sql$;
  ship_block text := $sql$ship := private.shipping_price(found_store, shipping_name);
  if ship is null then
    return jsonb_build_object('ok', false, 'reason', 'אפשרות המשלוח לא קיימת');
  end if;
  if coalesce(discount->>'freeShipping', 'false') = 'true' or coalesce((cart->>'subtotal')::numeric, 0) >= 250 then
    ship := 0;
  end if;
  merchandise := greatest((cart->>'subtotal')::numeric - (discount->>'amount')::numeric, 0);$sql$;
  locked_ship text := $sql$if coalesce(cart->>'saleLocked', 'false') = 'true' then
    ship := round(coalesce((cart->>'saleShipping')::numeric, 0), 2);
  else
    ship := private.shipping_price(found_store, shipping_name);
    if ship is null then
      return jsonb_build_object('ok', false, 'reason', 'אפשרות המשלוח לא קיימת');
    end if;
    if coalesce(discount->>'freeShipping', 'false') = 'true' or coalesce((cart->>'subtotal')::numeric, 0) >= 250 then
      ship := 0;
    end if;
  end if;
  merchandise := greatest((cart->>'subtotal')::numeric - (discount->>'amount')::numeric, 0) + coalesce((cart->>'saleCustom')::numeric, 0);$sql$;
  quote_head text := $sql$'ok', true,
    'currency', coalesce(store_currency, 'ILS'),$sql$;
  quote_locked text := $sql$'ok', true,
    'saleLocked', coalesce(cart->>'saleLocked', 'false') = 'true',
    'saleCustom', coalesce((cart->>'saleCustom')::numeric, 0),
    'currency', coalesce(store_currency, 'ILS'),$sql$;
begin
  cart_check := replace(cart_check, chr(13), '');
  ship_block := replace(ship_block, chr(13), '');
  locked_ship := replace(locked_ship, chr(13), '');
  quote_head := replace(quote_head, chr(13), '');
  quote_locked := replace(quote_locked, chr(13), '');
  src := pg_get_functiondef('public.quote_storefront(text,text,text,jsonb,text,text,text)'::regprocedure);
  if position('apply_sale_prices' in src) > 0 then
    return;
  end if;
  if position(cart_check in src) = 0 or position(ship_block in src) = 0 or position(quote_head in src) = 0 then
    raise exception 'quote_storefront sale hook moved';
  end if;
  src := replace(src, cart_check, cart_check || E'\n  cart := private.apply_sale_prices(found_store, cart);');
  src := replace(src, ship_block, locked_ship);
  src := replace(src, quote_head, quote_locked);
  execute src;
end
$patch$;

do $patch$
declare
  src text;
  marker text := 'insert into public.payments (store_id, order_id, amount, status) values (found_store, saved_order, (quote->>''total'')::numeric, payment_status);';
  replacement text := $sql$if coalesce((quote->>'saleCustom')::numeric, 0) > 0 then
    insert into public.order_items (store_id, order_id, title, quantity, unit_price)
    values (found_store, saved_order, 'סכום חופשי', 1, (quote->>'saleCustom')::numeric);
  end if;
  update public.checkout_drafts as draft
  set recovered = true,
      order_id = saved_order
  where draft.id = (
    select candidate.id
    from public.checkout_drafts as candidate
    where candidate.store_id = found_store
      and candidate.visitor_key ~ '^sale[0-9a-f]{32}$'
      and candidate.recovered = false
      and candidate.order_id is null
      and private.sale_line_key(candidate.lines) = private.sale_line_key(lines)
    order by candidate.updated_at desc
    limit 1
  );
  insert into public.payments (store_id, order_id, amount, status) values (found_store, saved_order, (quote->>'total')::numeric, payment_status);$sql$;
begin
  marker := replace(marker, chr(13), '');
  replacement := replace(replacement, chr(13), '');
  src := pg_get_functiondef('public.place_storefront_order(text,text,text,jsonb,text,text,text,text,text,text,text,text,text,text)'::regprocedure);
  if position('saleCustom' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 then
    raise exception 'place_storefront_order payment insert moved';
  end if;
  src := replace(src, marker, replacement);
  execute src;
end
$patch$;

notify pgrst, 'reload schema';
