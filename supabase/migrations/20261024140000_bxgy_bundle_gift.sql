-- A buy-X-get-Y offer can opt in to bundle purchases, and checkout can name the missing gift.

alter table public.discounts
  add column if not exists comb_bundle boolean not null default false;

create or replace function private.line_bought_as_bundle(target_store uuid, line jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  product_id uuid;
  qty integer;
  unit_price numeric;
  pack_price numeric;
begin
  if lower(btrim(coalesce(line->>'bundle', ''))) in ('true', 't', '1', 'yes') then
    return true;
  end if;
  begin
    product_id := nullif(line->>'productId', '')::uuid;
    qty := (line->>'quantity')::integer;
    unit_price := coalesce(nullif(line->>'unitPrice', ''), nullif(line->>'price', ''))::numeric;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      return false;
  end;
  if product_id is null or qty is null or qty < 1 or unit_price is null then
    return false;
  end if;
  if coalesce(line->>'bundleQty', '') ~ '^[1-9][0-9]*$' and (line->>'bundleQty')::integer = qty then
    return true;
  end if;
  select (bundle->>'price')::numeric
  into pack_price
  from public.products as product
  cross join lateral jsonb_array_elements(coalesce(product.merch->'bundles', '[]'::jsonb)) as bundle
  where product.store_id = target_store
    and product.id = product_id
    and (bundle->>'qty') ~ '^[1-9][0-9]*$'
    and (bundle->>'qty')::integer = qty
    and (bundle->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
  limit 1;
  if pack_price is null then
    return false;
  end if;
  return abs(unit_price * qty - pack_price) < 0.05
    or abs(unit_price - (pack_price / qty)) < 0.05;
end;
$function$;

revoke all on function private.line_bought_as_bundle(uuid, jsonb) from public, anon, authenticated;

create or replace function private.bxgy_discount_amount(
  target_store uuid,
  mode text,
  buy_qty text,
  get_qty text,
  buy_coll text,
  get_coll text,
  buy_ids text[],
  get_ids text[],
  cart jsonb,
  allow_bundle boolean
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  need_buy integer := greatest(coalesce(nullif(regexp_replace(coalesce(buy_qty, ''), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  need_get integer := greatest(coalesce(nullif(regexp_replace(coalesce(get_qty, ''), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  buy_have integer := 0;
  counted integer := 0;
  cheapest numeric;
  prices numeric[] := '{}'::numeric[];
  shared boolean[] := '{}'::boolean[];
  line jsonb;
  line_product uuid;
  line_price numeric;
  line_qty integer;
  parsed boolean;
  is_buy boolean;
  is_get boolean;
  i integer;
  amount numeric := 0;
begin
  if mode = 'qty'
    and cardinality(coalesce(buy_ids, '{}'::text[])) = 0
    and cardinality(coalesce(get_ids, '{}'::text[])) = 0
    and btrim(coalesce(buy_coll, '')) = '' then
    for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
    loop
      parsed := true;
      begin
        line_product := (line->>'productId')::uuid;
        line_price := (line->>'unitPrice')::numeric;
        line_qty := (line->>'quantity')::integer;
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          parsed := false;
      end;
      if not parsed or line_price is null or line_qty is null or line_qty < 1 or line_price < 0 then
        continue;
      end if;
      if not allow_bundle and private.line_bought_as_bundle(target_store, line) then
        continue;
      end if;
      counted := counted + line_qty;
      if cheapest is null or line_price < cheapest then
        cheapest := line_price;
      end if;
    end loop;
    amount := least(coalesce(cheapest, 0) * need_get, coalesce((cart->>'subtotal')::numeric, 0));
    if counted < need_buy then
      amount := 0;
    end if;
    return greatest(coalesce(amount, 0), 0);
  end if;

  for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
  loop
    parsed := true;
    begin
      line_product := (line->>'productId')::uuid;
      line_price := (line->>'unitPrice')::numeric;
      line_qty := (line->>'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        parsed := false;
    end;
    if not parsed or line_product is null or line_price is null or line_qty is null or line_qty < 1 or line_price < 0 then
      continue;
    end if;
    is_buy := private.bxgy_scope_matches(target_store, line_product, mode, buy_coll, buy_ids);
    is_get := private.bxgy_scope_matches(target_store, line_product, mode, get_coll, get_ids);
    if is_buy and not allow_bundle and private.line_bought_as_bundle(target_store, line) then
      is_buy := false;
    end if;
    if is_buy then
      buy_have := buy_have + line_qty;
    end if;
    if is_get then
      for i in 1..line_qty loop
        prices := array_append(prices, line_price);
        shared := array_append(shared, is_buy);
      end loop;
    end if;
  end loop;

  if buy_have < need_buy or cardinality(prices) = 0 then
    return 0;
  end if;

  select coalesce(sum(picked.price), 0)
  into amount
  from (
    select candidate.price
    from (
      select unit.price
      from unnest(prices, shared) as unit(price, shared_unit)
      where not unit.shared_unit
      union all
      (
        select unit.price
        from unnest(prices, shared) as unit(price, shared_unit)
        where unit.shared_unit
        order by unit.price
        limit greatest(buy_have - need_buy, 0)
      )
    ) as candidate
    order by candidate.price
    limit need_get
  ) as picked;

  return least(greatest(coalesce(amount, 0), 0), coalesce((cart->>'subtotal')::numeric, 0));
end;
$function$;

revoke all on function private.bxgy_discount_amount(uuid, text, text, text, text, text, text[], text[], jsonb, boolean) from public, anon, authenticated;

create or replace function private.bxgy_gift_offer(
  target_store uuid,
  kind text,
  mode text,
  buy_qty text,
  get_qty text,
  buy_coll text,
  get_coll text,
  buy_ids text[],
  get_ids text[],
  allow_bundle boolean,
  cart jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  empty jsonb := jsonb_build_object('addGift', false, 'giftProductId', null, 'giftVariantId', null, 'giftTitle', null, 'giftQuantity', 0, 'bundleBlocked', false);
  need_buy integer := greatest(coalesce(nullif(regexp_replace(coalesce(buy_qty, ''), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  need_get integer := greatest(coalesce(nullif(regexp_replace(coalesce(get_qty, ''), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  buy_have integer := 0;
  raw_buy integer := 0;
  gift_have integer := 0;
  missing integer := 0;
  gift_product uuid;
  gift_variant uuid;
  found_variant uuid;
  gift_title text;
  line jsonb;
  line_product uuid;
  line_qty integer;
  parsed boolean;
  is_buy boolean;
  bundle_blocked boolean := false;
begin
  if kind <> 'bxgy' then
    return empty;
  end if;
  begin
    if mode = 'qty' and cardinality(coalesce(buy_ids, '{}'::text[])) = 1 then
      gift_product := buy_ids[1]::uuid;
    elsif mode in ('pair', 'cats') and cardinality(coalesce(get_ids, '{}'::text[])) = 1 then
      gift_product := get_ids[1]::uuid;
    else
      return empty;
    end if;
  exception
    when invalid_text_representation then
      return empty;
  end;

  for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
  loop
    parsed := true;
    begin
      line_product := (line->>'productId')::uuid;
      line_qty := (line->>'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        parsed := false;
    end;
    if not parsed or line_product is null or line_qty is null or line_qty < 1 then
      continue;
    end if;
    is_buy := private.bxgy_scope_matches(target_store, line_product, mode, buy_coll, buy_ids);
    if is_buy then
      raw_buy := raw_buy + line_qty;
      if allow_bundle or not private.line_bought_as_bundle(target_store, line) then
        buy_have := buy_have + line_qty;
      end if;
    end if;
    if line_product = gift_product and private.bxgy_scope_matches(target_store, line_product, mode, get_coll, get_ids) then
      gift_have := gift_have + line_qty;
      if gift_variant is null and coalesce(line->>'variantId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        gift_variant := (line->>'variantId')::uuid;
      end if;
    end if;
  end loop;

  bundle_blocked := not coalesce(allow_bundle, false) and raw_buy >= need_buy and buy_have < need_buy;
  if mode = 'qty' then
    if buy_have >= need_buy and buy_have < need_buy + need_get then
      missing := need_buy + need_get - buy_have;
    end if;
  elsif buy_have >= need_buy and gift_have < need_get then
    missing := need_get - gift_have;
  end if;
  if missing < 1 or bundle_blocked then
    return jsonb_build_object('addGift', false, 'giftProductId', null, 'giftVariantId', null, 'giftTitle', null, 'giftQuantity', 0, 'bundleBlocked', bundle_blocked);
  end if;

  if gift_variant is not null then
    select variant.id, product.title
    into found_variant, gift_title
    from public.product_variants as variant
    join public.products as product on product.store_id = variant.store_id and product.id = variant.product_id
    where variant.store_id = target_store
      and variant.id = gift_variant
      and product.id = gift_product
      and product.status = 'active';
  end if;
  if found_variant is null then
    select variant.id, product.title
    into found_variant, gift_title
    from public.product_variants as variant
    join public.products as product on product.store_id = variant.store_id and product.id = variant.product_id
    left join public.inventory_items as inventory on inventory.store_id = variant.store_id and inventory.variant_id = variant.id
    where variant.store_id = target_store
      and product.id = gift_product
      and product.status = 'active'
    order by (coalesce(inventory.available, 0) >= missing) desc, variant.position nulls last, variant.id
    limit 1;
  end if;
  if found_variant is null then
    return jsonb_build_object('addGift', false, 'giftProductId', null, 'giftVariantId', null, 'giftTitle', null, 'giftQuantity', 0, 'bundleBlocked', false);
  end if;

  return jsonb_build_object(
    'addGift', true,
    'giftProductId', gift_product,
    'giftVariantId', found_variant,
    'giftTitle', gift_title,
    'giftQuantity', missing,
    'bundleBlocked', false
  );
end;
$function$;

revoke all on function private.bxgy_gift_offer(uuid, text, text, text, text, text, text, text[], text[], boolean, jsonb) from public, anon, authenticated;

do $patch$
declare
  src text;
  amount_call text;
begin
  src := pg_get_functiondef('private.discount_for_cart(uuid, text, jsonb, text)'::regprocedure);
  if position('candidate.bx_get_ids, cart, candidate.comb_bundle' in src) = 0 then
    amount_call := 'candidate.bx_buy_ids, candidate.bx_get_ids, cart';
    if position(amount_call in src) = 0 then
      raise exception 'discount_for_cart is missing the bxgy amount call';
    end if;
    src := replace(src, amount_call, 'candidate.bx_buy_ids, candidate.bx_get_ids, cart, candidate.comb_bundle');
    src := replace(src, 'chosen.bx_buy_ids, chosen.bx_get_ids, cart', 'chosen.bx_buy_ids, chosen.bx_get_ids, cart, chosen.comb_bundle');
  end if;
  if position('bxgy_gift_offer' in src) = 0 then
    if position(E'''title'', chosen.title\n  );' in src) = 0 then
      raise exception 'discount_for_cart success return changed';
    end if;
    src := replace(
      src,
      E'''title'', chosen.title\n  );',
      E'''title'', chosen.title\n  ) || private.bxgy_gift_offer(target_store, chosen.kind, chosen.bx_mode, chosen.bx_buy, chosen.bx_get, chosen.bx_coll, chosen.bx_get_coll, chosen.bx_buy_ids, chosen.bx_get_ids, chosen.comb_bundle, cart);'
    );
  end if;
  execute src;
end
$patch$;

drop function if exists private.bxgy_discount_amount(uuid, text, text, text, text, text, text[], text[], jsonb);

do $patch$
declare
  src text;
  marker text := '''unitPrice'', unit_price, ''quantity'', qty));';
begin
  src := pg_get_functiondef('private.storefront_cart(uuid, jsonb)'::regprocedure);
  if position('line_bought_as_bundle' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 then
    raise exception 'storefront_cart line shape changed';
  end if;
  src := replace(
    src,
    marker,
    '''unitPrice'', unit_price, ''quantity'', qty, ''bundle'', private.line_bought_as_bundle(target_store, line || jsonb_build_object(''productId'', product_id, ''quantity'', qty))));'
  );
  execute src;
end
$patch$;

do $patch$
declare
  src text;
  marker text := '''lines'', cart->''lines'',' || E'\n    ''shippingRates'', private.shipping_rates(found_store)\n  );';
begin
  src := pg_get_functiondef('public.quote_storefront(text, text, text, jsonb, text, text, text)'::regprocedure);
  if position('''addGift''' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 then
    raise exception 'quote_storefront return changed';
  end if;
  src := replace(
    src,
    marker,
    '''lines'', cart->''lines'',' || E'\n    ''shippingRates'', private.shipping_rates(found_store),\n    ''addGift'', coalesce(discount->>''addGift'', ''false'') = ''true'',\n    ''giftProductId'', nullif(discount->>''giftProductId'', ''''),\n    ''giftVariantId'', nullif(discount->>''giftVariantId'', ''''),\n    ''giftTitle'', nullif(discount->>''giftTitle'', ''''),\n    ''giftQuantity'', coalesce((discount->>''giftQuantity'')::integer, 0),\n    ''bundleBlocked'', coalesce(discount->>''bundleBlocked'', ''false'') = ''true''\n  );'
  );
  execute src;
end
$patch$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.save_store_discount(uuid, jsonb)'::regprocedure);
  if position('comb_bundle' in src) = 0 then
    if position('block_gift = coalesce(discount->>''blockGift'', ''false'') = ''true'',' in src) = 0
      or position('coalesce(discount->>''blockGift'', ''false'') = ''true'',' || E'\n      clean_applies,' in src) = 0
      or position('block_gift, applies' in src) = 0 then
      raise exception 'save_store_discount combination fields changed';
    end if;
    src := replace(
      src,
      'block_gift = coalesce(discount->>''blockGift'', ''false'') = ''true'',',
      'block_gift = coalesce(discount->>''blockGift'', ''false'') = ''true'',' || E'\n        comb_bundle = coalesce(discount->>''combBundle'', ''false'') = ''true'','
    );
    src := replace(
      src,
      'coalesce(discount->>''blockGift'', ''false'') = ''true'',' || E'\n      clean_applies,',
      'coalesce(discount->>''blockGift'', ''false'') = ''true'',' || E'\n      coalesce(discount->>''combBundle'', ''false'') = ''true'',' || E'\n      clean_applies,'
    );
    src := replace(src, 'block_gift, applies', 'block_gift, comb_bundle, applies');
    execute src;
  end if;
end
$patch$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  if position('''combBundle'', discount.comb_bundle' in src) = 0 then
    if position('''blockGift'', discount.block_gift' in src) = 0 then
      raise exception 'admin snapshot is missing the gift combination';
    end if;
    src := replace(
      src,
      '''blockGift'', discount.block_gift',
      '''blockGift'', discount.block_gift, ''combBundle'', discount.comb_bundle'
    );
    execute src;
  end if;
end
$patch$;
