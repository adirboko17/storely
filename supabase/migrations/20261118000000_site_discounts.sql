-- An automatic or coupon discount can show on the website. An automatic one
-- becomes the product price in the catalog and in the cart, so the card, the
-- product page, the cart and the charge all agree. A coupon one shows its
-- price with the code. Another discount stacks on the sale price only when it
-- combines with product discounts; otherwise the better of the two applies
-- and the total never goes above the shown price.

alter table public.discounts
  add column if not exists show_on_site boolean not null default false,
  add column if not exists badge_text text not null default '';

create or replace function private.discount_can_show(discount public.discounts)
returns boolean
language sql
stable
set search_path = ''
as $$
  select discount.kind in ('order', 'product')
    and discount.value_type = 'pct'
    and discount.amount > 0
    and discount.amount < 100
    and discount.min_type = 'none'
    and discount.eligibility = 'all'
    and (discount.method = 'code' or (discount.usage_limit is null and not discount.once_per_customer));
$$;

create or replace function private.site_discounts(target_store uuid)
returns setof public.discounts
language sql
stable
security definer
set search_path = ''
as $$
  select discount.*
  from public.discounts as discount
  where discount.store_id = target_store
    and discount.show_on_site
    and discount.status = 'active'
    and (discount.starts_on is null or discount.starts_on <= current_date)
    and (discount.ends_on is null or discount.ends_on >= current_date)
    and (discount.usage_limit is null or discount.uses < discount.usage_limit)
    and private.discount_can_show(discount);
$$;

create or replace function private.is_gift_product(target_store uuid, target_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.products as product
    where product.store_id = target_store
      and product.id = target_product
      and (
        btrim(product.category) = 'כרטיסי מתנה'
        or exists (
          select 1
          from unnest(coalesce(product.tags, '{}'::text[])) as tag(tag)
          where tag.tag like chr(1) || 'gift:%'
        )
      )
  );
$$;

create or replace function private.site_discount_covers(target_store uuid, discount public.discounts, target_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (discount.kind = 'product' and discount.applies in ('colls', 'subs', 'prods'))
    or private.discount_covers_product(target_store, target_product, discount.applies, discount.collection_titles);
$$;

create or replace function private.site_sale_for(target_store uuid, target_product uuid)
returns public.discounts
language sql
stable
security definer
set search_path = ''
as $$
  select discount.*
  from private.site_discounts(target_store) as discount
  where discount.method = 'auto'
    and not private.is_gift_product(target_store, target_product)
    and private.site_discount_covers(target_store, discount, target_product)
  order by discount.amount desc, discount.ends_on nulls last, discount.id
  limit 1;
$$;

create or replace function private.site_price(target_store uuid, target_product uuid, list_price numeric, coupon uuid default null)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sale public.discounts;
  offer public.discounts;
  price numeric(12, 2);
begin
  if list_price is null or list_price <= 0 or private.is_gift_product(target_store, target_product) then
    return list_price;
  end if;
  price := round(list_price, 2);
  sale := private.site_sale_for(target_store, target_product);
  if sale.id is not null then
    price := round(list_price * (100 - sale.amount) / 100, 2);
  end if;
  if coupon is not null then
    select discount.* into offer
    from public.discounts as discount
    where discount.store_id = target_store
      and discount.id = coupon;
    if offer.id is not null and private.site_discount_covers(target_store, offer, target_product) then
      if sale.id is not null and offer.comb_product then
        price := round(price * (100 - offer.amount) / 100, 2);
      else
        price := least(price, round(list_price * (100 - offer.amount) / 100, 2));
      end if;
    end if;
  end if;
  return price;
end;
$$;

create or replace function private.site_badge(discount public.discounts)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(discount.badge_text), ''),
    trim_scale(discount.amount)::text || '% הנחה'
      || case when discount.method = 'code' then ' בקוד ' || coalesce(discount.code, '') else '' end
  );
$$;

create or replace function private.site_offer_prices(target_store uuid, target_product uuid, coupon uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'variants', coalesce((
      select jsonb_object_agg(
        variant_row.id::text,
        private.site_price(target_store, product.id, coalesce(variant_row.price, product.price), coupon)
      )
      from public.product_variants as variant_row
      where variant_row.store_id = product.store_id
        and variant_row.product_id = product.id
    ), '{}'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qty', (bundle->>'qty')::integer,
        'price', private.site_price(target_store, product.id, round((bundle->>'price')::numeric, 2), coupon)
      ))
      from jsonb_array_elements(coalesce(product.merch->'bundles', '[]'::jsonb)) as bundle
      where (bundle->>'qty') ~ '^[1-9][0-9]*$'
        and (bundle->>'price') ~ '^[0-9]+(\.[0-9]+)?$'
    ), '[]'::jsonb)
  )
  from public.products as product
  where product.store_id = target_store
    and product.id = target_product;
$$;

create or replace function private.product_site_offer(target_store uuid, target_product uuid, list_price numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sale public.discounts;
  candidate public.discounts;
  best_code public.discounts;
  sale_price numeric(12, 2);
  best_price numeric(12, 2);
  coded numeric(12, 2);
  result jsonb := '{}'::jsonb;
begin
  if list_price is null or list_price <= 0 or private.is_gift_product(target_store, target_product) then
    return result;
  end if;
  sale := private.site_sale_for(target_store, target_product);
  sale_price := private.site_price(target_store, target_product, list_price);
  if sale.id is not null and sale_price < list_price then
    result := result || jsonb_build_object('sale', jsonb_build_object(
      'title', sale.title,
      'percent', sale.amount,
      'badge', private.site_badge(sale),
      'endsOn', sale.ends_on,
      'was', round(list_price, 2),
      'price', sale_price
    ) || private.site_offer_prices(target_store, target_product));
  end if;

  best_price := sale_price;
  for candidate in
    select discount.*
    from private.site_discounts(target_store) as discount
    where discount.method = 'code'
      and private.site_discount_covers(target_store, discount, target_product)
    order by discount.amount desc, discount.id
  loop
    coded := private.site_price(target_store, target_product, list_price, candidate.id);
    if coded < best_price then
      best_price := coded;
      best_code := candidate;
    end if;
  end loop;
  if best_code.id is not null then
    result := result || jsonb_build_object('code', jsonb_build_object(
      'code', best_code.code,
      'percent', best_code.amount,
      'badge', private.site_badge(best_code),
      'endsOn', best_code.ends_on,
      'price', best_price
    ) || private.site_offer_prices(target_store, target_product, best_code.id));
  end if;
  return result;
end;
$$;

create or replace function private.site_sale_cart(target_store uuid, list_cart jsonb, coupon uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  line jsonb;
  priced jsonb := '[]'::jsonb;
  product uuid;
  unit numeric(12, 2);
  pack numeric(12, 2);
  line_total numeric(12, 2);
  subtotal numeric(12, 2) := 0;
begin
  for line in select value from jsonb_array_elements(coalesce(list_cart->'lines', '[]'::jsonb)) as value
  loop
    product := nullif(line->>'productId', '')::uuid;
    unit := private.site_price(target_store, product, (line->>'unitPrice')::numeric, coupon);
    if coalesce(line->>'packPrice', '') ~ '^[0-9]+(\.[0-9]+)?$' and coalesce(line->>'packQty', '') ~ '^[1-9][0-9]*$' then
      pack := private.site_price(target_store, product, (line->>'packPrice')::numeric, coupon);
      line_total := round(pack * (line->>'packQty')::integer, 2);
      line := line || jsonb_build_object('packPrice', pack);
    else
      line_total := round(unit * (line->>'quantity')::integer, 2);
    end if;
    priced := priced || jsonb_build_array(line || jsonb_build_object('unitPrice', unit, 'lineTotal', line_total));
    subtotal := subtotal + line_total;
  end loop;
  return list_cart || jsonb_build_object(
    'lines', priced,
    'subtotal', subtotal,
    'listLines', coalesce(list_cart->'lines', '[]'::jsonb),
    'listSubtotal', coalesce((list_cart->>'subtotal')::numeric, 0)
  );
end;
$$;

do $rename$
begin
  if to_regprocedure('private.storefront_cart_list(uuid,jsonb)') is null then
    alter function private.storefront_cart(uuid, jsonb) rename to storefront_cart_list;
  end if;
  if to_regprocedure('private.discount_for_list_cart(uuid,text,jsonb,text)') is null then
    alter function private.discount_for_cart(uuid, text, jsonb, text) rename to discount_for_list_cart;
  end if;
end
$rename$;

create or replace function private.storefront_cart(target_store uuid, lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cart jsonb := private.storefront_cart_list(target_store, lines);
begin
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;
  return private.site_sale_cart(target_store, cart);
end;
$$;

-- Quick sale and payment links keep the price the merchant typed.
do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('private.priced_sale_cart(uuid,jsonb)'::regprocedure);
  if position('storefront_cart_list' in src) = 0 then
    if position('private.storefront_cart(target_store, sale_lines)' in src) = 0 then
      raise exception 'priced_sale_cart cart call moved';
    end if;
    execute replace(src, 'private.storefront_cart(target_store, sale_lines)', 'private.storefront_cart_list(target_store, sale_lines)');
  end if;
end
$patch$;

create or replace function private.discount_for_list_cart(target_store uuid, raw_code text, cart jsonb, customer_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := lower(btrim(coalesce(raw_code, '')));
  subtotal numeric(12, 2) := coalesce((cart->>'subtotal')::numeric, 0);
  quantity integer := coalesce((cart->>'quantity')::integer, 0);
  skip_site boolean := coalesce(cart->>'skipSite', 'false') = 'true';
  chosen public.discounts%rowtype;
  candidate public.discounts%rowtype;
  best_amount numeric(12, 2) := -1;
  eligible numeric(12, 2);
  line jsonb;
  amount numeric(12, 2);
  free_shipping boolean;
  line_product uuid;
  gift_on boolean := private.checkout_has_gift(target_store, cart);
begin
  if wanted <> '' then
    select discount.*
    into chosen
    from public.discounts as discount
    where discount.store_id = target_store
      and lower(coalesce(discount.code, '')) = wanted
      and discount.status = 'active'
      and (discount.starts_on is null or discount.starts_on <= current_date)
      and (discount.ends_on is null or discount.ends_on >= current_date)
      and (discount.usage_limit is null or discount.uses < discount.usage_limit)
    limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'הקוד לא תקף');
    end if;
  else
    for candidate in
      select discount.*
      from public.discounts as discount
      where discount.store_id = target_store
        and discount.method = 'auto'
        and discount.status = 'active'
        and (discount.starts_on is null or discount.starts_on <= current_date)
        and (discount.ends_on is null or discount.ends_on >= current_date)
        and (discount.usage_limit is null or discount.uses < discount.usage_limit)
        and not (skip_site and discount.show_on_site and private.discount_can_show(discount))
    loop
      if candidate.block_gift and gift_on then
        continue;
      end if;
      eligible := subtotal;
      if candidate.kind = 'product' and candidate.applies in ('colls', 'subs', 'prods') then
        eligible := 0;
        for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
        loop
          line_product := (line->>'productId')::uuid;
          if private.discount_covers_product(target_store, line_product, candidate.applies, candidate.collection_titles) then
            eligible := eligible + coalesce(nullif(line->>'lineTotal', '')::numeric, (line->>'unitPrice')::numeric * (line->>'quantity')::integer);
          end if;
        end loop;
      end if;
      if candidate.min_type = 'amount' and subtotal < candidate.min_value then
        continue;
      end if;
      if candidate.min_type = 'qty' and quantity < candidate.min_value then
        continue;
      end if;
      if candidate.kind = 'ship' then
        amount := 0;
      elsif candidate.kind = 'bxgy' then
        amount := private.bxgy_discount_amount(
          target_store, candidate.bx_mode, candidate.bx_buy, candidate.bx_get,
          candidate.bx_coll, candidate.bx_get_coll, candidate.bx_buy_ids, candidate.bx_get_ids, cart, candidate.comb_bundle
        );
      elsif candidate.value_type = 'pct' then
        amount := round(eligible * candidate.amount / 100, 2);
      else
        amount := least(candidate.amount, eligible);
      end if;
      if amount > best_amount or (candidate.kind = 'ship' and best_amount < 0) then
        best_amount := amount;
        chosen := candidate;
      end if;
    end loop;
    if chosen.id is null then
      return jsonb_build_object('ok', true, 'code', '', 'amount', 0, 'freeShipping', false, 'title', '');
    end if;
  end if;

  if chosen.block_gift and gift_on then
    return jsonb_build_object('ok', false, 'reason', 'ההנחה לא משתלבת עם כרטיס מתנה');
  end if;

  if chosen.once_per_customer and btrim(coalesce(customer_email, '')) <> '' and exists (
    select 1
    from public.orders as sale
    join public.customers as customer
      on customer.store_id = sale.store_id
     and customer.id = sale.customer_id
    where sale.store_id = target_store
      and lower(coalesce(customer.email, '')) = lower(btrim(customer_email))
      and lower(sale.discount_code) = lower(coalesce(chosen.code, ''))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'הקוד כבר נוצל');
  end if;

  if chosen.min_type = 'amount' and subtotal < chosen.min_value then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא עומדת במינימום');
  end if;
  if chosen.min_type = 'qty' and quantity < chosen.min_value then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא עומדת במינימום');
  end if;

  eligible := subtotal;
  if chosen.kind = 'product' and chosen.applies in ('colls', 'subs', 'prods') then
    eligible := 0;
    for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
    loop
      line_product := (line->>'productId')::uuid;
      if private.discount_covers_product(target_store, line_product, chosen.applies, chosen.collection_titles) then
        eligible := eligible + coalesce(nullif(line->>'lineTotal', '')::numeric, (line->>'unitPrice')::numeric * (line->>'quantity')::integer);
      end if;
    end loop;
  end if;

  free_shipping := chosen.kind = 'ship';
  if chosen.kind = 'ship' then
    amount := 0;
  elsif chosen.kind = 'bxgy' then
    amount := private.bxgy_discount_amount(
      target_store, chosen.bx_mode, chosen.bx_buy, chosen.bx_get,
      chosen.bx_coll, chosen.bx_get_coll, chosen.bx_buy_ids, chosen.bx_get_ids, cart, chosen.comb_bundle
    );
  elsif chosen.value_type = 'pct' then
    amount := round(eligible * chosen.amount / 100, 2);
  else
    amount := least(chosen.amount, eligible);
  end if;
  if amount < 0 then
    amount := 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', coalesce(chosen.code, ''),
    'amount', amount,
    'freeShipping', free_shipping,
    'title', chosen.title
  ) || private.bxgy_gift_offer(target_store, chosen.kind, chosen.bx_mode, chosen.bx_buy, chosen.bx_get, chosen.bx_coll, chosen.bx_get_coll, chosen.bx_buy_ids, chosen.bx_get_ids, chosen.comb_bundle, cart);
end;
$$;

-- The cart already carries the sale prices, so the amount returned here is
-- what comes off on top of them.
create or replace function private.discount_for_cart(target_store uuid, raw_code text, cart jsonb, customer_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := lower(btrim(coalesce(raw_code, '')));
  list_cart jsonb;
  sale_cart jsonb;
  sale_amount numeric(12, 2);
  offer public.discounts;
  result jsonb;
  coded jsonb;
  extra numeric(12, 2);
  nothing jsonb := jsonb_build_object('ok', true, 'code', '', 'amount', 0, 'freeShipping', false, 'title', '');
begin
  if not (cart ? 'listLines') or coalesce(cart->>'saleLocked', 'false') = 'true' then
    return private.discount_for_list_cart(target_store, raw_code, cart, customer_email);
  end if;

  list_cart := (cart - 'listLines' - 'listSubtotal') || jsonb_build_object(
    'lines', cart->'listLines',
    'subtotal', cart->'listSubtotal',
    'skipSite', true
  );
  sale_cart := (cart - 'listLines' - 'listSubtotal') || jsonb_build_object('skipSite', true);
  sale_amount := greatest(coalesce((cart->>'listSubtotal')::numeric, 0) - coalesce((cart->>'subtotal')::numeric, 0), 0);

  if wanted <> '' and exists (
    select 1
    from private.site_discounts(target_store) as discount
    where discount.method = 'auto'
      and lower(coalesce(discount.code, '')) = wanted
  ) then
    wanted := '';
  end if;

  if wanted = '' then
    result := private.discount_for_list_cart(target_store, '', list_cart, customer_email);
    if coalesce(result->>'ok', 'false') <> 'true' or coalesce(result->>'code', '') = '' or sale_amount = 0 then
      return result;
    end if;
    select discount.* into offer
    from public.discounts as discount
    where discount.store_id = target_store
      and discount.method = 'auto'
      and lower(coalesce(discount.code, '')) = lower(result->>'code')
    limit 1;
    if offer.comb_product then
      return private.discount_for_list_cart(target_store, offer.code, sale_cart, customer_email);
    end if;
    if (result->>'amount')::numeric > sale_amount then
      return result || jsonb_build_object('amount', (result->>'amount')::numeric - sale_amount);
    end if;
    return nothing;
  end if;

  result := private.discount_for_list_cart(target_store, raw_code, list_cart, customer_email);
  if coalesce(result->>'ok', 'false') <> 'true' then
    return result;
  end if;
  select discount.* into offer
  from private.site_discounts(target_store) as discount
  where discount.method = 'code'
    and lower(coalesce(discount.code, '')) = wanted
  limit 1;
  if offer.id is not null then
    coded := private.site_sale_cart(target_store, list_cart - 'skipSite', offer.id);
    extra := coalesce((cart->>'subtotal')::numeric, 0) - coalesce((coded->>'subtotal')::numeric, 0);
    if extra <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'המחיר באתר כבר נמוך יותר מהקוד הזה');
    end if;
    return jsonb_build_object('ok', true, 'code', coalesce(offer.code, ''), 'amount', extra, 'freeShipping', false, 'title', offer.title);
  end if;

  if sale_amount = 0 then
    return result;
  end if;
  select discount.* into offer
  from public.discounts as discount
  where discount.store_id = target_store
    and lower(coalesce(discount.code, '')) = wanted
  limit 1;
  if offer.comb_product then
    return private.discount_for_list_cart(target_store, raw_code, sale_cart, customer_email);
  end if;
  if (result->>'amount')::numeric > sale_amount then
    return result || jsonb_build_object('amount', (result->>'amount')::numeric - sale_amount);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'הקוד לא משתלב עם המבצע באתר, והמבצע משתלם יותר');
end;
$$;

create or replace function public.store_public_catalog(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  store_name text;
  store_host text;
begin
  select coalesce(settings.display_name, store.name)
  into store_name
  from public.stores as store
  left join public.store_settings as settings on settings.store_id = store.id
  where store.id = target_store
    and store.status = 'active';

  if not found then
    return null;
  end if;

  select domain.hostname
  into store_host
  from public.store_domains as domain
  where domain.store_id = target_store
  order by domain.verified_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'name', coalesce(store_name, ''),
    'hostname', coalesce(store_host, ''),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', catalog_row.id,
          'title', catalog_row.title,
          'handle', catalog_row.handle,
          'description', catalog_row.description,
          'merch', coalesce(catalog_row.merch, '{}'::jsonb),
          'vendor', catalog_row.vendor,
          'category', catalog_row.category,
          'price', catalog_row.price,
          'compareAt', catalog_row.compare_at,
          'sale', catalog_row.offer->'sale',
          'codeOffer', catalog_row.offer->'code',
          'tags', catalog_row.tags,
          'tracked', catalog_row.tracked,
          'stock', catalog_row.stock,
          'variants', catalog_row.variants,
          'options', coalesce(catalog_row.merch->'options', '[]'::jsonb),
          'media', catalog_row.media
        )
        order by catalog_row.position, catalog_row.created_at
      )
      from (
        select
          product.position,
          product.created_at,
          product.id,
          product.title,
          product.handle,
          product.description,
          product.merch,
          product.vendor,
          product.category,
          product.price,
          product.compare_at,
          private.product_site_offer(target_store, product.id, product.price) as offer,
          product.tags,
          product.track_inventory as tracked,
          coalesce((
            select sum(inventory.available)
            from public.product_variants as stock_variant
            join public.inventory_items as inventory
              on inventory.store_id = stock_variant.store_id
             and inventory.variant_id = stock_variant.id
            where stock_variant.store_id = product.store_id
              and stock_variant.product_id = product.id
          ), 0) as stock,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', variant_row.id,
                'title', variant_row.title,
                'sku', variant_row.sku,
                'selected', coalesce(variant_row.selected, '{}'::jsonb),
                'image', variant_row.image,
                'price', variant_row.price,
                'position', variant_row.position,
                'stock', coalesce((
                  select inventory.available
                  from public.inventory_items as inventory
                  where inventory.store_id = variant_row.store_id
                    and inventory.variant_id = variant_row.id
                ), 0),
                'tracked', product.track_inventory
              )
              order by variant_row.position, variant_row.id
            )
            from public.product_variants as variant_row
            where variant_row.store_id = product.store_id
              and variant_row.product_id = product.id
          ), '[]'::jsonb) as variants,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', media.id,
                'path', public.product_media_public_url(media.path),
                'position', media.position
              )
              order by media.position, media.id
            )
            from public.product_media as media
            where media.store_id = product.store_id
              and media.product_id = product.id
          ), '[]'::jsonb) as media
        from public.products as product
        where product.store_id = target_store
          and product.status = 'active'
      ) as catalog_row
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', collection.id,
          'title', collection.title,
          'description', collection.description,
          'manualSort', collection.manual_sort,
          'productIds', coalesce((
            select jsonb_agg(picked.product_id order by picked.ord)
            from (
              select link.product_id, link.position::bigint as ord
              from public.collection_products as link
              where link.store_id = collection.store_id
                and link.collection_id = collection.id
              union all
              select listed.id, 1000000 + listed.ord
              from (
                select product.id, row_number() over (order by product.created_at, product.id) as ord
                from public.products as product
                where product.store_id = collection.store_id
                  and product.status = 'active'
                  and btrim(product.category) <> ''
                  and btrim(product.category) = btrim(collection.title)
                  and not exists (
                    select 1
                    from public.collection_products as linked
                    where linked.store_id = product.store_id
                      and linked.collection_id = collection.id
                      and linked.product_id = product.id
                  )
              ) as listed
            ) as picked
          ), '[]'::jsonb),
          'subcategories', coalesce((
            select jsonb_agg(name order by name)
            from (
              select distinct btrim(rule.value->>'value') as name
              from jsonb_array_elements(coalesce(collection.conditions, '[]'::jsonb)) as rule(value)
              where rule.value->>'field' = 'subcategory'
                and btrim(coalesce(rule.value->>'value', '')) <> ''
            ) as names
          ), '[]'::jsonb)
        )
        order by collection.position, collection.title
      )
      from public.collections as collection
      where collection.store_id = target_store
        and collection.hidden = false
    ), '[]'::jsonb)
  );
end;
$function$;

-- Saving keeps show_on_site only on a discount the website can show.
do $patch$
declare
  src text;
  marker text := E'  return saved_id;\nend;';
  replacement text := $sql$  update public.discounts as saved
  set badge_text = left(btrim(coalesce(discount->>'badgeText', '')), 40),
      show_on_site = coalesce(discount->>'showOnSite', 'false') = 'true'
  where saved.store_id = target_store
    and saved.id = saved_id;
  update public.discounts as saved
  set show_on_site = false
  where saved.store_id = target_store
    and saved.id = saved_id
    and saved.show_on_site
    and not private.discount_can_show(saved);

  return saved_id;
end;$sql$;
begin
  replacement := replace(replacement, chr(13), '');
  src := replace(pg_get_functiondef('public.save_store_discount(uuid,jsonb)'::regprocedure), chr(13), '');
  if position('show_on_site' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 then
    raise exception 'save_store_discount return moved';
  end if;
  execute replace(src, marker, replacement);
end
$patch$;

do $patch$
declare
  src text;
  marker text := $sql$'combProduct', discount.comb_product,$sql$;
  replacement text := $sql$'showOnSite', discount.show_on_site,
        'badgeText', discount.badge_text,
        'combProduct', discount.comb_product,$sql$;
begin
  src := pg_get_functiondef('public.store_admin_slice(uuid,text)'::regprocedure);
  if position('showOnSite' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 then
    raise exception 'store_admin_slice discount fields moved';
  end if;
  execute replace(src, marker, replacement);
end
$patch$;

revoke all on function private.discount_can_show(public.discounts) from public, anon, authenticated;
revoke all on function private.site_discounts(uuid) from public, anon, authenticated;
revoke all on function private.is_gift_product(uuid, uuid) from public, anon, authenticated;
revoke all on function private.site_discount_covers(uuid, public.discounts, uuid) from public, anon, authenticated;
revoke all on function private.site_sale_for(uuid, uuid) from public, anon, authenticated;
revoke all on function private.site_price(uuid, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function private.site_badge(public.discounts) from public, anon, authenticated;
revoke all on function private.site_offer_prices(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.product_site_offer(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function private.site_sale_cart(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.storefront_cart(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.discount_for_list_cart(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function private.discount_for_cart(uuid, text, jsonb, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
