-- A manager can change the products, discount, shipping, note, and tags
-- on an existing order. Catalog prices already charged stay as they were.
-- Stock moves by the difference, and only for products that track inventory.

create or replace function public.edit_store_order(target_store uuid, order_number integer, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.orders%rowtype;
  discount_amount numeric(12, 2);
  shipping_amount numeric(12, 2);
  shipping_label text;
  note_text text;
  tag_list text[];
  line jsonb;
  holds jsonb := '[]'::jsonb;
  ready jsonb := '[]'::jsonb;
  used_ids jsonb := '[]'::jsonb;
  diffs jsonb := '[]'::jsonb;
  change jsonb;
  line_count integer;
  quantity integer;
  unit_price numeric(12, 2);
  line_title text;
  variant_title text;
  picked_variant uuid;
  existing_id uuid;
  catalog_price numeric(12, 2);
  product_uuid uuid;
  subtotal numeric(12, 2) := 0;
  order_total numeric(12, 2);
  taken integer;
  delta integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'reason', 'הבקשה לא תקינה');
  end if;

  select sale.*
  into saved
  from public.orders as sale
  where sale.store_id = target_store
    and sale.order_number = edit_store_order.order_number
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא נמצאה');
  end if;

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
    existing_id := null;
    line_title := null;
    variant_title := '';
    catalog_price := null;
    unit_price := null;

    if coalesce(line->>'productId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      product_uuid := (line->>'productId')::uuid;

      select item.id, item.variant_id, item.unit_price, item.title
      into existing_id, picked_variant, unit_price, line_title
      from public.order_items as item
      join public.product_variants as variant
        on variant.store_id = item.store_id
       and variant.id = item.variant_id
      where item.store_id = target_store
        and item.order_id = saved.id
        and variant.product_id = product_uuid
        and not (used_ids ? item.id::text)
      order by item.id
      limit 1;

      if existing_id is not null then
        used_ids := used_ids || jsonb_build_array(existing_id::text);
      else
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
      end if;

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

    if unit_price is null or unit_price < 0 or unit_price > 1000000 then
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
  if order_total + 0.001 < coalesce(saved.refunded, 0) then
    return jsonb_build_object('ok', false, 'reason', 'הסכום נמוך ממה שכבר זוכה');
  end if;
  if shipping_label = '' then
    shipping_label := case
      when shipping_amount = 0 and subtotal - discount_amount >= 250 then 'משלוח חינם'
      when shipping_amount = 0 then 'ללא משלוח'
      else 'משלוח'
    end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'variantId', parts.variant_id,
    'delta', parts.delta,
    'title', parts.title
  ) order by parts.variant_id), '[]'::jsonb)
  into diffs
  from (
    select raw.variant_id, sum(raw.qty)::integer as delta, max(raw.title) as title
    from (
      select
        (item->>'variantId')::uuid as variant_id,
        (item->>'quantity')::integer as qty,
        item->>'title' as title
      from jsonb_array_elements(holds) as item
      union all
      select item.variant_id, -item.quantity, item.title
      from public.order_items as item
      where item.store_id = target_store
        and item.order_id = saved.id
        and item.variant_id is not null
    ) as raw
    group by raw.variant_id
    having sum(raw.qty) <> 0
  ) as parts;

  for change in select value from jsonb_array_elements(diffs) as value
  loop
    delta := (change->>'delta')::integer;
    if delta > 0 and private.variant_tracks_inventory(target_store, (change->>'variantId')::uuid) then
      select inventory.available
      into taken
      from public.inventory_items as inventory
      where inventory.store_id = target_store
        and inventory.variant_id = (change->>'variantId')::uuid
      for update;
      if found and taken < delta then
        return jsonb_build_object('ok', false, 'reason', 'אין מספיק מלאי: ' || coalesce(change->>'title', 'מוצר'));
      end if;
    elsif delta < 0 and private.variant_tracks_inventory(target_store, (change->>'variantId')::uuid) then
      perform 1
      from public.inventory_items as inventory
      where inventory.store_id = target_store
        and inventory.variant_id = (change->>'variantId')::uuid
      for update;
    end if;
  end loop;

  for change in select value from jsonb_array_elements(diffs) as value
  loop
    delta := (change->>'delta')::integer;
    if private.variant_tracks_inventory(target_store, (change->>'variantId')::uuid) then
      if delta > 0 then
        taken := null;
        update public.inventory_items as inventory
        set available = inventory.available - delta
        where inventory.store_id = target_store
          and inventory.variant_id = (change->>'variantId')::uuid
          and inventory.available >= delta
        returning inventory.available into taken;
        if taken is null and exists (
          select 1
          from public.inventory_items as inventory
          where inventory.store_id = target_store
            and inventory.variant_id = (change->>'variantId')::uuid
        ) then
          raise exception 'אין מספיק מלאי' using errcode = 'P0001';
        end if;
      else
        update public.inventory_items as inventory
        set available = inventory.available - delta
        where inventory.store_id = target_store
          and inventory.variant_id = (change->>'variantId')::uuid;
      end if;
    end if;
  end loop;

  delete from public.order_items as item
  where item.store_id = target_store
    and item.order_id = saved.id;

  insert into public.order_items (store_id, order_id, variant_id, title, quantity, unit_price)
  select
    target_store,
    saved.id,
    nullif(item.line->>'variantId', '')::uuid,
    item.line->>'title',
    (item.line->>'quantity')::integer,
    (item.line->>'unitPrice')::numeric
  from jsonb_array_elements(ready) as item(line);

  update public.orders as sale
  set total = order_total,
      note = note_text,
      tags = tag_list,
      discount_amount = discount_amount,
      shipping_name = shipping_label,
      shipping_amount = shipping_amount,
      financial_status = case
        when sale.financial_status in ('refunded', 'partially_refunded') and coalesce(sale.refunded, 0) >= order_total - 0.009 then 'refunded'
        when sale.financial_status in ('refunded', 'partially_refunded') then 'partially_refunded'
        else sale.financial_status
      end,
      timeline = sale.timeline || jsonb_build_array(jsonb_build_object('text', 'ההזמנה נערכה', 'at', now()))
  where sale.store_id = target_store
    and sale.id = saved.id;

  if saved.financial_status = 'pending' then
    update public.payments as card
    set amount = order_total
    where card.store_id = target_store
      and card.order_id = saved.id
      and card.status = 'pending';
  end if;

  return jsonb_build_object('ok', true, 'orderNumber', saved.order_number, 'total', order_total);
end;
$$;

revoke all on function public.edit_store_order(uuid, integer, jsonb) from public, anon;
grant execute on function public.edit_store_order(uuid, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';
