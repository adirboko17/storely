-- Charge a quantity bundle at its pack price. Loose units stay at the variant price.

create or replace function private.storefront_cart(target_store uuid, lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  line jsonb;
  variant uuid;
  qty integer;
  unit_price numeric(12, 2);
  available integer;
  product_id uuid;
  product_title text;
  variant_title text;
  variant_sku text;
  priced jsonb := '[]'::jsonb;
  priced_line jsonb;
  subtotal numeric(12, 2) := 0;
  quantity integer := 0;
  reserved jsonb := '{}'::jsonb;
  held integer;
  bundle_qty integer;
  bundle_label text;
  pack_price numeric(12, 2);
  pack_count integer;
  line_total numeric(12, 2);
  is_bundle boolean;
begin
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 30 then
    return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
  end if;

  for line in select value from jsonb_array_elements(lines) as value
  loop
    begin
      variant := (line->>'variantId')::uuid;
      qty := (line->>'quantity')::integer;
    exception
      when others then
        return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
    end;
    if qty is null or qty < 1 or qty > 99 then
      return jsonb_build_object('ok', false, 'reason', 'כמות לא תקינה');
    end if;

    select
      coalesce(variant_row.price, product.price),
      inventory.available,
      product.id,
      product.title,
      coalesce(variant_row.title, ''),
      coalesce(variant_row.sku, '')
    into unit_price, available, product_id, product_title, variant_title, variant_sku
    from public.product_variants as variant_row
    join public.products as product
      on product.store_id = variant_row.store_id
     and product.id = variant_row.product_id
    left join public.inventory_items as inventory
      on inventory.store_id = variant_row.store_id
     and inventory.variant_id = variant_row.id
    where variant_row.store_id = target_store
      and variant_row.id = variant
      and product.status = 'active';

    if product_id is null or unit_price is null or unit_price < 0 then
      return jsonb_build_object('ok', false, 'reason', 'מוצר לא זמין');
    end if;
    held := coalesce((reserved->>variant::text)::integer, 0);
    if coalesce(available, 0) < held + qty then
      return jsonb_build_object('ok', false, 'reason', 'המלאי לא מספיק');
    end if;
    reserved := reserved || jsonb_build_object(variant::text, held + qty);

    is_bundle := false;
    pack_price := null;
    pack_count := null;
    bundle_label := '';
    bundle_qty := null;
    if lower(btrim(coalesce(line->>'bundle', ''))) in ('true', 't', '1', 'yes')
      and coalesce(line->>'bundleQty', '') ~ '^[1-9][0-9]*$' then
      bundle_qty := (line->>'bundleQty')::integer;
      if bundle_qty > 0 and qty % bundle_qty = 0 then
        select round((bundle->>'price')::numeric, 2), left(btrim(coalesce(bundle->>'label', '')), 80)
        into pack_price, bundle_label
        from public.products as product
        cross join lateral jsonb_array_elements(coalesce(product.merch->'bundles', '[]'::jsonb)) as bundle
        where product.store_id = target_store
          and product.id = product_id
          and (bundle->>'qty') ~ '^[1-9][0-9]*$'
          and (bundle->>'qty')::integer = bundle_qty
          and (bundle->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
        limit 1;
        if pack_price is not null then
          is_bundle := true;
          pack_count := qty / bundle_qty;
        end if;
      end if;
    end if;

    if not is_bundle then
      select round((bundle->>'price')::numeric, 2), left(btrim(coalesce(bundle->>'label', '')), 80)
      into pack_price, bundle_label
      from public.products as product
      cross join lateral jsonb_array_elements(coalesce(product.merch->'bundles', '[]'::jsonb)) as bundle
      where product.store_id = target_store
        and product.id = product_id
        and (bundle->>'qty') ~ '^[1-9][0-9]*$'
        and (bundle->>'qty')::integer = qty
        and (bundle->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
      limit 1;
      if pack_price is not null then
        is_bundle := true;
        pack_count := 1;
      end if;
    end if;

    if is_bundle then
      line_total := round(pack_price * pack_count, 2);
      if line_total > round(unit_price * qty, 2) then
        is_bundle := false;
        pack_price := null;
        pack_count := null;
        line_total := round(unit_price * qty, 2);
      elsif bundle_label <> '' and position(bundle_label in product_title) = 0 then
        product_title := product_title || ' · ' || bundle_label;
      end if;
    else
      line_total := round(unit_price * qty, 2);
      pack_price := null;
      pack_count := null;
    end if;

    priced_line := jsonb_build_object(
      'variantId', variant,
      'productId', product_id,
      'title', product_title,
      'variant', variant_title,
      'sku', variant_sku,
      'unitPrice', unit_price,
      'quantity', qty,
      'lineTotal', line_total,
      'bundle', is_bundle or private.line_bought_as_bundle(target_store, line || jsonb_build_object('productId', product_id, 'quantity', qty))
    );
    if is_bundle then
      priced_line := priced_line || jsonb_build_object('packQty', pack_count, 'packPrice', pack_price);
    end if;
    priced := priced || jsonb_build_array(priced_line);
    subtotal := subtotal + line_total;
    quantity := quantity + qty;
  end loop;

  return jsonb_build_object('ok', true, 'subtotal', subtotal, 'quantity', quantity, 'lines', priced);
end;
$function$;

revoke all on function private.storefront_cart(uuid, jsonb) from public, anon, authenticated;

do $patch$
declare
  src text;
  priced text := '((line->>''unitPrice'')::numeric * (line->>''quantity'')::integer)';
  charged text := 'coalesce(nullif(line->>''lineTotal'', '''')::numeric, (line->>''unitPrice'')::numeric * (line->>''quantity'')::integer)';
begin
  src := pg_get_functiondef('private.discount_for_cart(uuid, text, jsonb, text)'::regprocedure);
  if position('lineTotal' in src) > 0 then
    return;
  end if;
  if position(priced in src) = 0 then
    raise exception 'discount_for_cart line total changed';
  end if;
  src := replace(src, priced, charged);
  execute src;
end
$patch$;

do $patch$
declare
  src text;
  qty_sql text := '(line.line->>''quantity'')::integer';
  price_sql text := '(line.line->>''unitPrice'')::numeric';
  pack_qty text := $sql$
    case
      when coalesce(line.line->>'bundle', '') = 'true'
        and coalesce(line.line->>'packQty', '') ~ '^[1-9][0-9]*$'
        and coalesce(line.line->>'packPrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (line.line->>'packQty')::integer
      else (line.line->>'quantity')::integer
    end$sql$;
  pack_price text := $sql$
    case
      when coalesce(line.line->>'bundle', '') = 'true'
        and coalesce(line.line->>'packQty', '') ~ '^[1-9][0-9]*$'
        and coalesce(line.line->>'packPrice', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (line.line->>'packPrice')::numeric
      else (line.line->>'unitPrice')::numeric
    end$sql$;
begin
  src := pg_get_functiondef('public.place_storefront_order(text, text, text, jsonb, text, text, text, text, text, text, text, text, text, text)'::regprocedure);
  if position('packQty' in src) > 0 then
    return;
  end if;
  if position(qty_sql in src) = 0 or position(price_sql in src) = 0 then
    raise exception 'place_storefront_order item price changed';
  end if;
  src := replace(src, qty_sql, pack_qty);
  src := replace(src, price_sql, pack_price);
  execute src;
end
$patch$;
