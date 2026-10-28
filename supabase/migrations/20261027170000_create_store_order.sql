-- A signed-in merchant creates an order from the admin: a customer, catalog
-- products and custom lines, a discount, and shipping. Prices for catalog
-- lines come from the store, so the browser cannot undercharge them.

create or replace function public.search_store_customers(target_store uuid, query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  raw text := left(btrim(coalesce(query, '')), 80);
  needle text := replace(replace(replace(left(btrim(coalesce(query, '')), 80), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', found.id,
      'name', found.name,
      'email', coalesce(found.email, ''),
      'phone', found.phone,
      'street', found.street,
      'city', found.city,
      'zip', found.zip
    ) order by found.created_at desc, found.id desc)
    from (
      select
        customer.id,
        customer.name,
        customer.email,
        customer.phone,
        customer.created_at,
        coalesce(addr.street, '') as street,
        coalesce(addr.city, '') as city,
        coalesce(addr.zip, '') as zip
      from public.customers as customer
      left join lateral (
        select address.street, address.city, address.zip
        from public.customer_addresses as address
        where address.store_id = customer.store_id
          and address.customer_id = customer.id
        order by address.id
        limit 1
      ) as addr on true
      where customer.store_id = target_store
        and (
          raw = ''
          or customer.name ilike '%' || needle || '%' escape '\'
          or coalesce(customer.email, '') ilike '%' || needle || '%' escape '\'
          or customer.phone ilike '%' || needle || '%' escape '\'
        )
      order by customer.created_at desc, customer.id desc
      limit 8
    ) as found
  ), '[]'::jsonb);
end;
$$;

create or replace function public.create_store_order(target_store uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_payment text;
  discount_amount numeric(12, 2);
  shipping_amount numeric(12, 2);
  shipping_label text;
  note_text text;
  tag_list text[];
  wanted_customer uuid;
  customer_name text;
  customer_email text;
  customer_phone text;
  customer_street text;
  customer_city text;
  customer_zip text;
  line jsonb;
  hold jsonb;
  holds jsonb := '[]'::jsonb;
  grouped jsonb := '[]'::jsonb;
  ready jsonb := '[]'::jsonb;
  line_count integer;
  quantity integer;
  unit_price numeric(12, 2);
  line_title text;
  variant_title text;
  picked_variant uuid;
  catalog_price numeric(12, 2);
  product_uuid uuid;
  subtotal numeric(12, 2) := 0;
  order_total numeric(12, 2);
  next_number integer;
  saved_order uuid;
  taken integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'reason', 'הבקשה לא תקינה');
  end if;

  perform 1 from public.stores as store where store.id = target_store for update;

  clean_payment := case when payload->>'payment' = 'paid' then 'paid' else 'pending' end;

  if coalesce(payload->>'discount', '0') !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok', false, 'reason', 'ההנחה לא תקינה');
  end if;
  discount_amount := round((payload->>'discount')::numeric, 2);

  if coalesce(payload->>'shipping', '0') !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok', false, 'reason', 'סכום המשלוח לא תקין');
  end if;
  shipping_amount := round((payload->>'shipping')::numeric, 2);
  shipping_label := left(btrim(coalesce(payload->>'shippingName', '')), 80);

  note_text := left(btrim(coalesce(payload->>'note', '')), 2000);

  select coalesce(array_agg(tag), '{}')
  into tag_list
  from (
    select left(btrim(value), 40) as tag
    from jsonb_array_elements_text(case when jsonb_typeof(payload->'tags') = 'array' then payload->'tags' else '[]'::jsonb end) as value
    where btrim(value) <> ''
    limit 12
  ) as tags;

  line_count := case when jsonb_typeof(payload->'lines') = 'array' then jsonb_array_length(payload->'lines') else 0 end;
  if line_count < 1 or line_count > 40 then
    return jsonb_build_object('ok', false, 'reason', 'צריך לפחות מוצר אחד');
  end if;

  wanted_customer := null;
  if coalesce(payload->>'customerId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select customer.id
    into wanted_customer
    from public.customers as customer
    where customer.store_id = target_store
      and customer.id = (payload->>'customerId')::uuid;
    if wanted_customer is null then
      return jsonb_build_object('ok', false, 'reason', 'הלקוח לא נמצא');
    end if;
  end if;

  customer_name := left(btrim(coalesce(payload#>>'{customer,name}', '')), 120);
  customer_email := lower(left(btrim(coalesce(payload#>>'{customer,email}', '')), 180));
  customer_phone := left(btrim(coalesce(payload#>>'{customer,phone}', '')), 40);
  customer_street := left(btrim(coalesce(payload#>>'{customer,street}', '')), 160);
  customer_city := left(btrim(coalesce(payload#>>'{customer,city}', '')), 80);
  customer_zip := left(btrim(coalesce(payload#>>'{customer,zip}', '')), 20);

  if wanted_customer is null and customer_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'צריך לבחור לקוח או לרשום שם');
  end if;

  for line in select value from jsonb_array_elements(payload->'lines') as value
  loop
    if coalesce(line->>'quantity', '') !~ '^[0-9]+$' then
      return jsonb_build_object('ok', false, 'reason', 'כמות לא תקינה');
    end if;
    quantity := (line->>'quantity')::integer;
    if quantity < 1 or quantity > 999 then
      return jsonb_build_object('ok', false, 'reason', 'כמות לא תקינה');
    end if;

    picked_variant := null;
    line_title := null;
    variant_title := '';
    catalog_price := null;

    if coalesce(line->>'productId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      product_uuid := (line->>'productId')::uuid;
      select variant.id, product.title, coalesce(variant.price, product.price), coalesce(variant.title, '')
      into picked_variant, line_title, catalog_price, variant_title
      from public.products as product
      left join public.product_variants as variant
        on variant.store_id = product.store_id
       and variant.product_id = product.id
      where product.store_id = target_store
        and product.id = product_uuid
      order by variant.position, variant.id
      limit 1;

      if line_title is null or btrim(line_title) = '' or catalog_price is null then
        return jsonb_build_object('ok', false, 'reason', 'מוצר לא נמצא');
      end if;
      if variant_title <> '' and variant_title <> line_title and variant_title <> 'Default Title' then
        line_title := left(line_title || ' — ' || variant_title, 180);
      end if;
      unit_price := round(catalog_price, 2);
      if picked_variant is not null then
        holds := holds || jsonb_build_array(jsonb_build_object(
          'variantId', picked_variant,
          'quantity', quantity,
          'title', line_title
        ));
      end if;
    else
      line_title := left(btrim(coalesce(line->>'title', '')), 180);
      if line_title = '' then
        return jsonb_build_object('ok', false, 'reason', 'לפריט מותאם צריך שם');
      end if;
      if coalesce(line->>'unitPrice', '') !~ '^[0-9]+(\.[0-9]+)?$' then
        return jsonb_build_object('ok', false, 'reason', 'מחיר לא תקין');
      end if;
      unit_price := round((line->>'unitPrice')::numeric, 2);
    end if;

    if unit_price < 0 or unit_price > 1000000 then
      return jsonb_build_object('ok', false, 'reason', 'מחיר לא תקין');
    end if;

    subtotal := subtotal + round(unit_price * quantity, 2);
    ready := ready || jsonb_build_array(jsonb_build_object(
      'variantId', picked_variant,
      'title', line_title,
      'quantity', quantity,
      'unitPrice', unit_price
    ));
  end loop;

  if subtotal > 9999999 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום גבוה מדי');
  end if;
  if discount_amount > subtotal then
    discount_amount := subtotal;
  end if;
  order_total := round(subtotal - discount_amount + shipping_amount, 2);
  if shipping_label = '' then
    shipping_label := case
      when shipping_amount = 0 and subtotal - discount_amount >= 250 then 'משלוח חינם'
      when shipping_amount = 0 then 'ללא משלוח'
      else 'משלוח'
    end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'variantId', part.variant_id,
    'quantity', part.quantity,
    'title', part.title
  )), '[]'::jsonb)
  into grouped
  from (
    select
      (item->>'variantId')::uuid as variant_id,
      sum((item->>'quantity')::integer) as quantity,
      max(item->>'title') as title
    from jsonb_array_elements(holds) as item
    group by 1
  ) as part;

  for hold in select value from jsonb_array_elements(grouped) as value
  loop
    taken := null;
    select inventory.available
    into taken
    from public.inventory_items as inventory
    where inventory.store_id = target_store
      and inventory.variant_id = (hold->>'variantId')::uuid
    for update;
    if found and taken < (hold->>'quantity')::integer then
      return jsonb_build_object('ok', false, 'reason', 'אין מספיק מלאי: ' || coalesce(hold->>'title', 'מוצר'));
    end if;
  end loop;

  if wanted_customer is null and customer_email <> '' then
    select customer.id
    into wanted_customer
    from public.customers as customer
    where customer.store_id = target_store
      and lower(coalesce(customer.email, '')) = customer_email
    limit 1;
  end if;

  if wanted_customer is null then
    insert into public.customers (store_id, name, email, phone)
    values (target_store, customer_name, nullif(customer_email, ''), customer_phone)
    returning id into wanted_customer;
    insert into public.customer_addresses (store_id, customer_id, street, city, zip)
    values (target_store, wanted_customer, customer_street, customer_city, customer_zip);
  elsif customer_street <> '' or customer_city <> '' or customer_zip <> '' then
    update public.customer_addresses as addr
    set street = customer_street,
        city = customer_city,
        zip = customer_zip
    where addr.store_id = target_store
      and addr.customer_id = wanted_customer;
    if not found then
      insert into public.customer_addresses (store_id, customer_id, street, city, zip)
      values (target_store, wanted_customer, customer_street, customer_city, customer_zip);
    end if;
  end if;

  if customer_phone <> '' then
    update public.customers as customer
    set phone = customer_phone
    where customer.store_id = target_store
      and customer.id = wanted_customer
      and customer.phone = '';
  end if;

  for hold in select value from jsonb_array_elements(grouped) as value
  loop
    taken := null;
    update public.inventory_items as inventory
    set available = inventory.available - (hold->>'quantity')::integer
    where inventory.store_id = target_store
      and inventory.variant_id = (hold->>'variantId')::uuid
      and inventory.available >= (hold->>'quantity')::integer
    returning inventory.available into taken;
    if taken is null and exists (
      select 1
      from public.inventory_items as inventory
      where inventory.store_id = target_store
        and inventory.variant_id = (hold->>'variantId')::uuid
    ) then
      raise exception 'אין מספיק מלאי' using errcode = 'P0001';
    end if;
  end loop;

  select coalesce(max(sale.order_number), 1000) + 1
  into next_number
  from public.orders as sale
  where sale.store_id = target_store;

  insert into public.orders (
    store_id, customer_id, financial_status, fulfillment_status, customer_status, total,
    order_number, channel, note, tags, discount_code, discount_amount, shipping_name, shipping_amount, timeline
  )
  values (
    target_store,
    wanted_customer,
    clean_payment,
    'unfulfilled',
    'received',
    order_total,
    next_number,
    'הזמנה ידנית',
    note_text,
    tag_list,
    '',
    discount_amount,
    shipping_label,
    shipping_amount,
    jsonb_build_array(jsonb_build_object('text', 'ההזמנה נוצרה ידנית', 'at', now()))
  )
  returning id into saved_order;

  insert into public.order_items (store_id, order_id, variant_id, title, quantity, unit_price)
  select
    target_store,
    saved_order,
    nullif(item.line->>'variantId', '')::uuid,
    item.line->>'title',
    (item.line->>'quantity')::integer,
    (item.line->>'unitPrice')::numeric
  from jsonb_array_elements(ready) as item(line);

  insert into public.payments (store_id, order_id, amount, status)
  values (target_store, saved_order, order_total, clean_payment);

  insert into public.shipments (store_id, order_id, status)
  values (target_store, saved_order, 'unfulfilled');

  return jsonb_build_object('ok', true, 'orderNumber', next_number, 'total', order_total);
end;
$$;

revoke all on function public.search_store_customers(uuid, text) from public, anon;
revoke all on function public.create_store_order(uuid, jsonb) from public, anon;
grant execute on function public.search_store_customers(uuid, text) to authenticated;
grant execute on function public.create_store_order(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
