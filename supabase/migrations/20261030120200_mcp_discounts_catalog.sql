-- Discounts, reviews, bundles, media, inventory, and product SEO for MCP.

create or replace function private.mcp_discount_payload(discount_row public.discounts)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', discount_row.id,
    'code', discount_row.code,
    'kind', discount_row.kind,
    'valueType', discount_row.value_type,
    'value', discount_row.amount,
    'method', discount_row.method,
    'eligibility', discount_row.eligibility,
    'segment', discount_row.segment,
    'minType', discount_row.min_type,
    'minValue', discount_row.min_value,
    'once', discount_row.once_per_customer,
    'limit', discount_row.usage_limit is not null,
    'limitN', coalesce(discount_row.usage_limit, 0),
    'start', discount_row.starts_on,
    'hasEnd', discount_row.ends_on is not null,
    'end', discount_row.ends_on,
    'combProduct', discount_row.comb_product,
    'combOrder', discount_row.comb_order,
    'combShip', discount_row.comb_ship,
    'blockGift', discount_row.block_gift,
    'applies', discount_row.applies,
    'collections', to_jsonb(discount_row.collection_titles),
    'bxMode', discount_row.bx_mode,
    'bxBuy', discount_row.bx_buy,
    'bxGet', discount_row.bx_get,
    'bxColl', discount_row.bx_coll,
    'bxGetColl', discount_row.bx_get_coll,
    'bxBuyIds', to_jsonb(discount_row.bx_buy_ids),
    'bxGetIds', to_jsonb(discount_row.bx_get_ids)
  );
$$;

revoke all on function private.mcp_discount_payload(public.discounts) from public, anon, authenticated;

create or replace function private.mcp_discounts(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  permission text;
  existing public.discounts%rowtype;
  payload jsonb;
  saved uuid;
  listed jsonb;
  wanted_kind text;
  wanted_value numeric;
  product_ids jsonb;
begin
  permission := case
    when tool_name in ('list_promotions') then 'discounts.read'
    when tool_name in ('create_discount', 'create_promotion') then 'discounts.create'
    when tool_name = 'deactivate_discount' then 'discounts.update'
    else 'discounts.update'
  end;
  denied := private.mcp_denied(target_store, permission);
  if denied is not null then
    return denied;
  end if;

  if tool_name = 'list_promotions' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', row.id,
      'code', row.code,
      'kind', row.kind,
      'method', row.method,
      'valueType', row.value_type,
      'value', row.amount,
      'status', row.status,
      'bxMode', row.bx_mode
    ) order by row.code), '[]'::jsonb)
    into listed
    from public.discounts as row
    where row.store_id = target_store
      and (row.kind = 'bxgy' or row.method = 'auto');
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('promotions', listed));
  end if;

  if tool_name in ('update_discount', 'update_promotion', 'deactivate_discount') then
    select row.*
    into existing
    from public.discounts as row
    where row.store_id = target_store
      and (
        (private.mcp_uuid(args, 'id') is not null and row.id = private.mcp_uuid(args, 'id'))
        or (btrim(coalesce(args->>'code', '')) <> '' and lower(row.code) = lower(btrim(args->>'code')))
      )
    limit 1;
    if existing.id is null then
      return jsonb_build_object('ok', false, 'error', 'ההנחה לא נמצאה');
    end if;
    payload := private.mcp_discount_payload(existing);
  else
    payload := jsonb_build_object(
      'code', '', 'kind', 'order', 'valueType', 'pct', 'value', 0, 'method', 'code',
      'eligibility', 'all', 'segment', '', 'minType', 'none', 'minValue', 0,
      'once', false, 'limit', false, 'limitN', 0, 'hasEnd', false,
      'combProduct', false, 'combOrder', false, 'combShip', false, 'blockGift', false,
      'applies', 'all', 'collections', '[]'::jsonb, 'bxMode', 'qty', 'bxBuy', '2', 'bxGet', '1',
      'bxColl', '', 'bxGetColl', '', 'bxBuyIds', '[]'::jsonb, 'bxGetIds', '[]'::jsonb
    );
  end if;

  if tool_name = 'deactivate_discount' then
    if not private.mcp_confirmed(args) then
      return jsonb_build_object('ok', false, 'error', 'צריך לאשר את ההשבתה עם confirm');
    end if;
    payload := payload || jsonb_build_object('hasEnd', true, 'end', to_char((current_date - 1), 'YYYY-MM-DD'));
  else
    if args ? 'code' then payload := payload || jsonb_build_object('code', left(btrim(args->>'code'), 40)); end if;
    if args ? 'kind' then payload := payload || jsonb_build_object('kind', args->>'kind'); end if;
    if args ? 'valueType' then payload := payload || jsonb_build_object('valueType', args->>'valueType'); end if;
    if args ? 'value' then payload := payload || jsonb_build_object('value', args->'value'); end if;
    if args ? 'method' then payload := payload || jsonb_build_object('method', args->>'method'); end if;
    if args ? 'minType' then payload := payload || jsonb_build_object('minType', args->>'minType'); end if;
    if args ? 'minValue' then payload := payload || jsonb_build_object('minValue', args->'minValue'); end if;
    if args ? 'once' and jsonb_typeof(args->'once') = 'boolean' then payload := payload || jsonb_build_object('once', args->'once'); end if;
    if args ? 'limit' and jsonb_typeof(args->'limit') = 'boolean' then payload := payload || jsonb_build_object('limit', args->'limit'); end if;
    if args ? 'limitN' then payload := payload || jsonb_build_object('limitN', args->'limitN'); end if;
    if args ? 'start' then payload := payload || jsonb_build_object('start', args->>'start'); end if;
    if args ? 'end' then
      payload := payload || jsonb_build_object('end', args->>'end', 'hasEnd', btrim(coalesce(args->>'end', '')) <> '');
    end if;
    if args ? 'applies' then payload := payload || jsonb_build_object('applies', args->>'applies'); end if;
    if args ? 'bxMode' then payload := payload || jsonb_build_object('bxMode', args->>'bxMode'); end if;
    if args ? 'bxBuy' then payload := payload || jsonb_build_object('bxBuy', args->>'bxBuy'); end if;
    if args ? 'bxGet' then payload := payload || jsonb_build_object('bxGet', args->>'bxGet'); end if;
    if args ? 'bxColl' then payload := payload || jsonb_build_object('bxColl', args->>'bxColl'); end if;
    if args ? 'bxGetColl' then payload := payload || jsonb_build_object('bxGetColl', args->>'bxGetColl'); end if;
    if jsonb_typeof(args->'bxBuyIds') = 'array' then payload := payload || jsonb_build_object('bxBuyIds', args->'bxBuyIds'); end if;
    if jsonb_typeof(args->'bxGetIds') = 'array' then payload := payload || jsonb_build_object('bxGetIds', args->'bxGetIds'); end if;
    if jsonb_typeof(args->'productIds') = 'array' then
      payload := payload || jsonb_build_object('applies', 'prods', 'collections', args->'productIds');
    elsif jsonb_typeof(args->'collectionTitles') = 'array' then
      payload := payload || jsonb_build_object('collections', args->'collectionTitles');
    end if;
    if tool_name = 'create_promotion' and not args ? 'kind' and coalesce(payload->>'method', '') <> 'auto' then
      payload := payload || jsonb_build_object('kind', 'bxgy');
    end if;
    if tool_name = 'create_promotion' and args->>'method' = 'auto' then
      payload := payload || jsonb_build_object('method', 'auto');
    end if;
  end if;

  wanted_kind := coalesce(payload->>'kind', 'order');
  wanted_value := coalesce(private.mcp_num(payload, 'value'), 0);
  if payload->>'valueType' = 'pct' and (wanted_value < 0 or wanted_value > 100) then
    return jsonb_build_object('ok', false, 'error', 'אחוז הנחה צריך להיות בין 0 ל-100');
  end if;
  if payload->>'valueType' = 'fixed' and (wanted_value < 0 or wanted_value > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'סכום הנחה לא תקין');
  end if;
  if wanted_kind not in ('order', 'product', 'ship', 'bxgy') then
    return jsonb_build_object('ok', false, 'error', 'סוג הנחה לא תקין');
  end if;
  if tool_name in ('create_discount', 'update_discount') and btrim(coalesce(payload->>'code', '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'חסר קוד הנחה');
  end if;

  product_ids := payload->'collections';
  if payload->>'applies' = 'prods' and jsonb_typeof(product_ids) = 'array' and jsonb_array_length(product_ids) = 0 then
    return jsonb_build_object('ok', false, 'error', 'יש לבחור מוצר');
  end if;

  saved := public.save_store_discount(target_store, payload);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', saved,
    'code', payload->>'code',
    'kind', payload->>'kind',
    'status', case when coalesce(payload->>'hasEnd', 'false') = 'true' and nullif(payload->>'end', '')::date < current_date then 'expired' else 'saved' end
  ));
end;
$$;

revoke all on function private.mcp_discounts(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_reviews(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  review_id uuid;
  product_id uuid;
  order_number integer;
  stars integer;
  clean_body text;
  person text;
  found_order uuid;
  existing public.product_reviews%rowtype;
  next_status text;
  decision text;
  listed jsonb;
  status_filter text;
begin
  denied := private.mcp_denied(target_store, case when tool_name in ('list_reviews', 'get_review') then 'products.read' else 'products.update' end);
  if denied is not null then
    return denied;
  end if;

  if tool_name = 'list_reviews' then
    status_filter := btrim(coalesce(args->>'status', ''));
    if status_filter <> '' and status_filter not in ('pending', 'published', 'rejected') then
      return jsonb_build_object('ok', false, 'error', 'סטטוס ביקורת לא תקין');
    end if;
    select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into listed
    from (
      select review.created_at,
        jsonb_build_object(
          'id', review.id,
          'productId', review.product_id,
          'productTitle', product.title,
          'orderNumber', sale.order_number,
          'name', review.customer_name,
          'body', review.body,
          'rating', review.rating,
          'status', review.status,
          'createdAt', review.created_at
        ) as payload
      from public.product_reviews as review
      join public.products as product
        on product.store_id = review.store_id
       and product.id = review.product_id
      join public.orders as sale
        on sale.store_id = review.store_id
       and sale.id = review.order_id
      where review.store_id = target_store
        and (status_filter = '' or review.status = status_filter)
      order by review.created_at desc
      limit 100
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('reviews', listed));
  end if;

  if tool_name = 'get_review' then
    review_id := private.mcp_uuid(args, 'id');
    if review_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה ביקורת');
    end if;
    select jsonb_build_object(
      'id', review.id,
      'productId', review.product_id,
      'productTitle', product.title,
      'orderNumber', sale.order_number,
      'name', review.customer_name,
      'body', review.body,
      'rating', review.rating,
      'status', review.status,
      'createdAt', review.created_at
    )
    into listed
    from public.product_reviews as review
    join public.products as product
      on product.store_id = review.store_id and product.id = review.product_id
    join public.orders as sale
      on sale.store_id = review.store_id and sale.id = review.order_id
    where review.store_id = target_store
      and review.id = review_id;
    if listed is null then
      return jsonb_build_object('ok', false, 'error', 'הביקורת לא נמצאה');
    end if;
    return jsonb_build_object('ok', true, 'data', listed);
  end if;

  if tool_name = 'moderate_review' then
    review_id := private.mcp_uuid(args, 'id');
    decision := btrim(coalesce(args->>'decision', ''));
    if review_id is null or decision not in ('approve', 'reject') then
      return jsonb_build_object('ok', false, 'error', 'צריך מזהה ביקורת והחלטה approve או reject');
    end if;
    listed := public.decide_store_product_review(target_store, review_id, decision);
    if coalesce(listed->>'ok', 'false') <> 'true' then
      return jsonb_build_object('ok', false, 'error', coalesce(listed->>'error', listed->>'reason', 'הביקורת לא עודכנה'));
    end if;
    return jsonb_build_object('ok', true, 'data', listed);
  end if;

  if tool_name = 'create_review' then
    product_id := private.mcp_uuid(args, 'productId');
    order_number := trunc(private.mcp_num(args, 'orderNumber'))::integer;
    stars := trunc(private.mcp_num(args, 'rating'))::integer;
    if product_id is null or order_number is null or stars is null or stars < 1 or stars > 5 then
      return jsonb_build_object('ok', false, 'error', 'צריך מספר הזמנה, מוצר ודירוג מ-1 עד 5');
    end if;
    clean_body := private.clean_copy(coalesce(args->>'body', ''), 1000);
    if clean_body = '' then
      clean_body := 'ביקורת ללא טקסט';
    end if;
    select sale.id, left(btrim(regexp_replace(coalesce(customer.name, ''), '[[:cntrl:]]', '', 'g')), 80)
    into found_order, person
    from public.orders as sale
    join public.customers as customer
      on customer.store_id = sale.store_id
     and customer.id = sale.customer_id
    where sale.store_id = target_store
      and sale.order_number = order_number
      and sale.customer_status = 'delivered'
      and exists (
        select 1
        from public.order_items as item
        join public.product_variants as variant
          on variant.store_id = item.store_id
         and variant.id = item.variant_id
        where item.store_id = sale.store_id
          and item.order_id = sale.id
          and variant.product_id = product_id
      );
    if found_order is null then
      return jsonb_build_object('ok', false, 'error', 'אפשר לכתוב ביקורת רק על מוצר מהזמנה שנמסרה');
    end if;
    if person is null or person = '' then
      person := 'לקוחה';
    end if;
    select review.*
    into existing
    from public.product_reviews as review
    where review.store_id = target_store
      and review.order_id = found_order
      and review.product_id = product_id;
    if existing.id is not null and existing.status = 'published' then
      perform private.sync_product_review(target_store, existing.product_id, existing.customer_name, existing.body, existing.rating, false);
    end if;
    next_status := case when stars < 4 then 'pending' else 'published' end;
    insert into public.product_reviews as review (
      store_id, product_id, order_id, customer_name, body, rating, status
    ) values (
      target_store, product_id, found_order, person, clean_body, stars, next_status
    )
    on conflict (store_id, order_id, product_id) do update
    set customer_name = excluded.customer_name,
        body = excluded.body,
        rating = excluded.rating,
        status = excluded.status,
        updated_at = now()
    returning review.id into review_id;
    if next_status = 'published' then
      perform private.sync_product_review(target_store, product_id, person, clean_body, stars, true);
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'id', review_id,
      'status', next_status,
      'name', person,
      'orderNumber', order_number
    ));
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
end;
$$;

revoke all on function private.mcp_reviews(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_clean_bundles(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  item jsonb;
  qty integer;
  price numeric;
  seen integer[] := '{}';
begin
  if jsonb_typeof(raw) <> 'array' then
    raise exception 'רשימת מארזים לא תקינה' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(raw) loop
    exit when jsonb_array_length(result) >= 12;
    if jsonb_typeof(item) <> 'object' then
      continue;
    end if;
    qty := trunc(private.mcp_num(item, 'qty'))::integer;
    price := private.mcp_num(item, 'price');
    if qty is null or qty < 1 or qty > 99 or price is null or price < 0 or price > 1000000 then
      continue;
    end if;
    if qty = any(seen) then
      continue;
    end if;
    seen := seen || qty;
    result := result || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'qty', qty,
      'price', round(price, 2),
      'label', coalesce(nullif(left(btrim(regexp_replace(coalesce(item->>'label', ''), '[[:cntrl:]]', '', 'g')), 80), ''), 'קנה ' || qty::text),
      'tag', nullif(left(btrim(regexp_replace(coalesce(item->>'tag', ''), '[[:cntrl:]]', '', 'g')), 24), ''),
      'image', case
        when coalesce(item->>'image', '') ~* '^https://[a-z0-9.-]+/storage/v1/object/public/product-media/[a-z0-9._/-]+\.(jpe?g|png|webp|gif|avif)$'
          then left(split_part(item->>'image', '?', 1), 500)
        else null
      end
    )));
  end loop;
  return result;
end;
$$;

revoke all on function private.mcp_clean_bundles(jsonb) from public, anon, authenticated;

create or replace function private.mcp_catalog(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  product_id uuid;
  current_merch jsonb;
  bundles jsonb;
  listed jsonb;
  media_paths text[];
  next_url text;
  removed text;
  item_id uuid;
  current_stock integer;
  next_stock integer;
  delta integer;
  entry jsonb;
  changed integer := 0;
  seo_title text;
  seo_description text;
  next_handle text;
  previous_handle text;
  origin text;
begin
  if tool_name = 'get_design_schema' then
    if private.mcp_denied(target_store, 'products.read') is not null
      and private.mcp_denied(target_store, 'marketing.read') is not null
      and private.mcp_denied(target_store, 'settings.manage') is not null
    then
      return coalesce(
        private.mcp_denied(target_store, 'products.read'),
        jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות')
      );
    end if;
  else
    denied := private.mcp_denied(
      target_store,
      case
        when tool_name in ('list_bundles', 'list_media', 'get_inventory') then 'products.read'
        else 'products.update'
      end
    );
    if denied is not null then
      return denied;
    end if;
  end if;

  if tool_name = 'get_design_schema' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'direction', 'rtl',
      'brandColors', 7,
      'popupLayouts', jsonb_build_array('modal', 'bar', 'corner'),
      'popupTriggers', jsonb_build_array('immediate', 'delay', 'scroll', 'exit'),
      'popupFrequencies', jsonb_build_array('always', 'session', 'day', 'once'),
      'popupDevices', jsonb_build_array('all', 'desktop', 'mobile'),
      'popupBlocks', jsonb_build_array('heading', 'text', 'image', 'logo', 'button', 'field', 'spacer', 'row'),
      'fieldTypes', jsonb_build_array('text', 'email', 'tel', 'textarea'),
      'note', 'אין ספריית תבניות נפרדת. עיצוב פופאפ נשמר על הפופאפ עצמו, וצבעי המותג נשמרים בשבעת הצבעים של החנות.'
    ));
  end if;

  if tool_name = 'list_bundles' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', product.id,
      'title', product.title,
      'bundles', product.merch->'bundles'
    ) order by product.title), '[]'::jsonb)
    into listed
    from public.products as product
    where product.store_id = target_store
      and jsonb_typeof(product.merch->'bundles') = 'array'
      and jsonb_array_length(product.merch->'bundles') > 0;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('bundles', listed));
  end if;

  if tool_name in ('create_bundle', 'update_bundle') then
    product_id := private.mcp_uuid(args, 'productId');
    if product_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה מוצר');
    end if;
    select product.merch
    into current_merch
    from public.products as product
    where product.store_id = target_store
      and product.id = product_id
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'המוצר לא נמצא');
    end if;
    bundles := private.mcp_clean_bundles(args->'bundles');
    if jsonb_typeof(current_merch) is distinct from 'object' then
      current_merch := '{}'::jsonb;
    end if;
    update public.products as product
    set merch = jsonb_set(current_merch, '{bundles}', bundles, true),
        updated_at = now()
    where product.store_id = target_store
      and product.id = product_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('productId', product_id, 'bundles', bundles));
  end if;

  if tool_name = 'list_media' then
    select substring(settings.logo_url from '^https://[^/]+')
    into origin
    from public.store_settings as settings
    where settings.store_id = target_store;
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', media.product_id,
      'productTitle', product.title,
      'path', media.path,
      'url', case
        when media.path ~* '^https://' then media.path
        when origin is not null then origin || '/storage/v1/object/public/product-media/' || media.path
        else media.path
      end,
      'position', media.position
    ) order by product.title, media.position), '[]'::jsonb)
    into listed
    from public.product_media as media
    join public.products as product
      on product.store_id = media.store_id
     and product.id = media.product_id
    where media.store_id = target_store;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('media', listed));
  end if;

  if tool_name = 'import_media' or tool_name = 'delete_media' then
    product_id := private.mcp_uuid(args, 'productId');
    if product_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה מוצר');
    end if;
    select coalesce(array_agg(media.path order by media.position), '{}')
    into media_paths
    from public.product_media as media
    where media.store_id = target_store
      and media.product_id = product_id;
    if tool_name = 'delete_media' then
      if not private.mcp_confirmed(args) then
        return jsonb_build_object('ok', false, 'error', 'צריך לאשר את המחיקה עם confirm');
      end if;
      removed := btrim(coalesce(args->>'path', args->>'url', ''));
      if removed = '' then
        return jsonb_build_object('ok', false, 'error', 'חסר נתיב מדיה');
      end if;
      media_paths := array(select path from unnest(coalesce(media_paths, '{}'::text[])) as path where path is distinct from removed);
    else
      next_url := left(btrim(coalesce(args->>'url', '')), 2000);
      if next_url !~* '^https://[^[:space:]]+$' then
        return jsonb_build_object('ok', false, 'error', 'אפשר לשייך רק כתובת https קיימת');
      end if;
      if media_paths is null or not (next_url = any(media_paths)) then
        media_paths := coalesce(media_paths, '{}'::text[]) || next_url;
      end if;
    end if;
    perform public.save_store_product_media(target_store, product_id, media_paths);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('productId', product_id, 'count', coalesce(array_length(media_paths, 1), 0)));
  end if;

  if tool_name = 'get_inventory' then
    select coalesce(jsonb_agg(item.payload order by item.title), '[]'::jsonb)
    into listed
    from (
      select product.title,
        jsonb_build_object(
          'productId', product.id,
          'title', product.title,
          'variant', variant.title,
          'sku', variant.sku,
          'stock', inventory.available
        ) as payload
      from public.products as product
      join public.product_variants as variant
        on variant.store_id = product.store_id
       and variant.product_id = product.id
      join public.inventory_items as inventory
        on inventory.store_id = variant.store_id
       and inventory.variant_id = variant.id
      where product.store_id = target_store
        and (
          btrim(coalesce(args->>'query', '')) = ''
          or position(lower(btrim(args->>'query')) in lower(product.title)) > 0
          or position(lower(btrim(args->>'query')) in lower(coalesce(variant.sku, ''))) > 0
        )
      order by product.title, variant.position
      limit 50
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('inventory', listed));
  end if;

  if tool_name = 'adjust_inventory' or tool_name = 'bulk_update_inventory' then
    if tool_name = 'adjust_inventory' then
      args := jsonb_build_object('items', jsonb_build_array(args));
    end if;
    if jsonb_typeof(args->'items') <> 'array' or jsonb_array_length(args->'items') = 0 or jsonb_array_length(args->'items') > 20 then
      return jsonb_build_object('ok', false, 'error', 'אפשר לעדכן בין מוצר אחד ל-20 מוצרים');
    end if;
    for entry in select value from jsonb_array_elements(args->'items') loop
      product_id := private.mcp_uuid(entry, 'productId');
      if product_id is null then
        raise exception 'חסר מזהה מוצר' using errcode = '22023';
      end if;
      select inventory.id, inventory.available
      into item_id, current_stock
      from public.inventory_items as inventory
      join public.product_variants as variant
        on variant.store_id = inventory.store_id
       and variant.id = inventory.variant_id
      where inventory.store_id = target_store
        and variant.product_id = product_id
      order by variant.position, variant.id
      limit 1
      for update;
      if item_id is null then
        raise exception 'לא נמצא מלאי למוצר' using errcode = 'P0002';
      end if;
      if entry ? 'stock' then
        next_stock := least(greatest(coalesce(trunc(private.mcp_num(entry, 'stock'))::integer, 0), 0), 1000000);
      elsif entry ? 'delta' then
        delta := trunc(private.mcp_num(entry, 'delta'))::integer;
        if delta is null then
          raise exception 'שינוי מלאי לא תקין' using errcode = '22023';
        end if;
        next_stock := least(greatest(current_stock + delta, 0), 1000000);
      else
        raise exception 'צריך stock או delta' using errcode = '22023';
      end if;
      update public.inventory_items as inventory
      set available = next_stock
      where inventory.store_id = target_store
        and inventory.id = item_id;
      insert into public.inventory_movements (store_id, inventory_item_id, quantity, reason)
      values (target_store, item_id, next_stock - current_stock, 'mcp');
      changed := changed + 1;
      item_id := null;
    end loop;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('updated', changed));
  end if;

  if tool_name = 'update_seo' and private.mcp_uuid(args, 'productId') is not null then
    product_id := private.mcp_uuid(args, 'productId');
    select product.merch, product.handle
    into current_merch, previous_handle
    from public.products as product
    where product.store_id = target_store
      and product.id = product_id
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'המוצר לא נמצא');
    end if;
    if jsonb_typeof(current_merch) is distinct from 'object' then
      current_merch := '{}'::jsonb;
    end if;
    seo_title := left(btrim(regexp_replace(coalesce(args->>'seoTitle', current_merch #>> '{seo,title}', ''), '[[:cntrl:]]', '', 'g')), 70);
    seo_description := left(btrim(regexp_replace(coalesce(args->>'seoDescription', current_merch #>> '{seo,description}', ''), '[[:cntrl:]]', '', 'g')), 160);
    next_handle := previous_handle;
    if args ? 'handle' then
      next_handle := nullif(left(lower(btrim(regexp_replace(coalesce(args->>'handle', ''), '[[:cntrl:][:space:]/]+', '', 'g'))), 80), '');
    end if;
    if next_handle is not null and exists (
      select 1 from public.products as other
      where other.store_id = target_store
        and other.handle = next_handle
        and other.id <> product_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'הכתובת כבר בשימוש');
    end if;
    update public.products as product
    set merch = jsonb_set(current_merch, '{seo}', jsonb_build_object('title', seo_title, 'description', seo_description), true),
        handle = coalesce(next_handle, previous_handle),
        updated_at = now()
    where product.store_id = target_store
      and product.id = product_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'productId', product_id,
      'seoTitle', seo_title,
      'seoDescription', seo_description,
      'handle', coalesce(next_handle, previous_handle)
    ));
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
end;
$$;

revoke all on function private.mcp_catalog(uuid, text, jsonb) from public, anon, authenticated;
