-- Checkout, shipping, analytics, store settings, marketing, and the MCP router.

create or replace function private.mcp_period(args jsonb, out from_at timestamptz, out to_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  from_text text := btrim(coalesce(args->>'from', ''));
  to_text text := btrim(coalesce(args->>'to', ''));
begin
  if from_text = '' then
    from_at := date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem' - interval '30 days';
  elsif from_text ~ '^\d{4}-\d{2}-\d{2}$' then
    from_at := (from_text::date::timestamp) at time zone 'Asia/Jerusalem';
  else
    raise exception 'תאריך התחלה לא תקין' using errcode = '22023';
  end if;
  if to_text = '' then
    to_at := date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem' + interval '1 day';
  elsif to_text ~ '^\d{4}-\d{2}-\d{2}$' then
    to_at := ((to_text::date + 1)::timestamp) at time zone 'Asia/Jerusalem';
  else
    raise exception 'תאריך סיום לא תקין' using errcode = '22023';
  end if;
  if to_at <= from_at or to_at - from_at > interval '366 days' then
    raise exception 'טווח התאריכים צריך להיות עד שנה' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.mcp_period(jsonb) from public, anon, authenticated;

create or replace function private.mcp_commerce(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  shipping jsonb;
  profiles jsonb;
  profile jsonb;
  zones jsonb;
  zone jsonb;
  rates jsonb;
  new_rates jsonb;
  profile_name text;
  zone_name text;
  rate_name text;
  country text;
  price numeric;
  profile_ord integer;
  zone_ord integer;
  replaced boolean := false;
  rate_item jsonb;
  from_at timestamptz;
  to_at timestamptz;
  listed jsonb;
  orders_count integer;
  revenue numeric;
  refunded integer;
  customers_count integer;
  returning_count integer;
  cart_id uuid;
  warning text := null;
  next_name text;
  next_currency text;
  next_language text;
  contact jsonb;
  report text;
begin
  if tool_name = 'export_report' then
    report := btrim(coalesce(args->>'report', ''));
    tool_name := case report
      when 'sales' then 'get_sales_analytics'
      when 'products' then 'get_product_analytics'
      when 'customers' then 'get_customer_analytics'
      when 'funnel' then 'get_conversion_funnel'
      else ''
    end;
    if tool_name = '' then
      return jsonb_build_object('ok', false, 'error', 'דוח לא מוכר. האפשרויות הן sales, products, customers, funnel');
    end if;
  end if;

  if tool_name in ('get_sales_analytics', 'get_product_analytics', 'get_customer_analytics', 'get_conversion_funnel', 'get_seo_audit') then
    denied := private.mcp_denied(target_store, case when tool_name = 'get_seo_audit' then 'content.read' else 'analytics.read' end);
    if denied is not null and tool_name = 'get_seo_audit' then
      denied := private.mcp_denied(target_store, 'products.read');
    end if;
    if denied is not null then
      return denied;
    end if;
  elsif tool_name in ('list_abandoned_carts', 'get_abandoned_cart', 'list_shipments') then
    denied := private.mcp_denied(target_store, 'orders.read');
    if denied is not null then
      return denied;
    end if;
  else
    denied := private.mcp_denied(target_store, 'settings.manage');
    if denied is not null then
      return denied;
    end if;
  end if;

  if tool_name in ('get_sales_analytics', 'get_product_analytics', 'get_customer_analytics', 'get_conversion_funnel') then
    select period.from_at, period.to_at
    into from_at, to_at
    from private.mcp_period(args) as period;
  end if;

  if tool_name = 'get_sales_analytics' then
    select count(*)::integer, coalesce(sum(sale.total), 0), count(*) filter (where sale.financial_status in ('refunded', 'partially_refunded'))::integer
    into orders_count, revenue, refunded
    from public.orders as sale
    where sale.store_id = target_store
      and sale.created_at >= from_at
      and sale.created_at < to_at;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'from', from_at, 'to', to_at, 'orders', orders_count, 'revenue', revenue,
      'averageOrder', case when orders_count = 0 then 0 else round(revenue / orders_count, 2) end,
      'refundedOrders', refunded
    ));
  end if;

  if tool_name = 'get_product_analytics' then
    select coalesce(jsonb_agg(item.payload), '[]'::jsonb)
    into listed
    from (
      select jsonb_build_object(
        'title', line.title,
        'units', sum(line.quantity),
        'revenue', round(sum(line.quantity * line.unit_price), 2)
      ) as payload
      from public.order_items as line
      join public.orders as sale
        on sale.store_id = line.store_id
       and sale.id = line.order_id
      where line.store_id = target_store
        and sale.created_at >= from_at
        and sale.created_at < to_at
      group by line.title
      order by sum(line.quantity * line.unit_price) desc
      limit 20
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('from', from_at, 'to', to_at, 'products', listed));
  end if;

  if tool_name = 'get_customer_analytics' then
    with period as (
      select sale.customer_id, count(*)::integer as orders, sum(sale.total) as revenue
      from public.orders as sale
      where sale.store_id = target_store
        and sale.created_at >= from_at
        and sale.created_at < to_at
        and sale.customer_id is not null
      group by sale.customer_id
    ), prior as (
      select distinct sale.customer_id
      from public.orders as sale
      where sale.store_id = target_store
        and sale.created_at < from_at
        and sale.customer_id is not null
    )
    select count(*)::integer,
      count(*) filter (where period.customer_id in (select prior.customer_id from prior))::integer,
      coalesce(sum(period.revenue), 0)
    into customers_count, returning_count, revenue
    from period;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'from', from_at,
      'to', to_at,
      'customers', customers_count,
      'returning', returning_count,
      'new', customers_count - returning_count,
      'revenue', revenue,
      'averageOrder', case when customers_count = 0 then 0 else round(revenue / customers_count, 2) end
    ));
  end if;

  if tool_name = 'get_conversion_funnel' then
    select jsonb_build_object(
      'from', from_at,
      'to', to_at,
      'sessions', (
        select count(*) from public.storefront_sessions as session
        where session.store_id = target_store
          and session.started_at >= from_at
          and session.started_at < to_at
      ),
      'events', coalesce((
        select jsonb_object_agg(event.name, event.total)
        from (
          select hit.name, count(distinct hit.session_id)::integer as total
          from public.storefront_events as hit
          where hit.store_id = target_store
            and hit.occurred_at >= from_at
            and hit.occurred_at < to_at
          group by hit.name
        ) as event
      ), '{}'::jsonb)
    )
    into listed;
    return jsonb_build_object('ok', true, 'data', listed);
  end if;

  if tool_name = 'get_seo_audit' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'productsMissingSeo', coalesce((
        select jsonb_agg(jsonb_build_object('id', product.id, 'title', product.title))
        from (
          select product.id, product.title
          from public.products as product
          where product.store_id = target_store
            and product.status = 'active'
            and btrim(coalesce(product.merch #>> '{seo,title}', '')) = ''
          order by product.title
          limit 30
        ) as product
      ), '[]'::jsonb),
      'articlesMissingSeo', coalesce((
        select jsonb_agg(jsonb_build_object('id', post.post->'id', 'title', post.post->>'title'))
        from (
          select item as post
          from public.store_settings as settings
          cross join lateral jsonb_array_elements(coalesce(settings.posts, '[]'::jsonb)) as item
          where settings.store_id = target_store
            and btrim(coalesce(item->>'seoTitle', '')) = ''
          limit 30
        ) as post
      ), '[]'::jsonb),
      'redirects', 'החנות לא שומרת הפניות 301',
      'canonical', 'אין שדה canonical נפרד. כתובת המוצר היא handle.'
    ));
  end if;

  if tool_name = 'list_abandoned_carts' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', draft.id,
      'name', draft.name,
      'total', draft.total,
      'updatedAt', draft.updated_at,
      'reminded', draft.reminded
    ) order by draft.updated_at desc), '[]'::jsonb)
    into listed
    from (
      select draft.id, draft.name, draft.total, draft.updated_at, draft.reminded
      from public.checkout_drafts as draft
      where draft.store_id = target_store
        and draft.recovered = false
      order by draft.updated_at desc
      limit 50
    ) as draft;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('carts', listed));
  end if;

  if tool_name = 'get_abandoned_cart' then
    cart_id := private.mcp_uuid(args, 'id');
    if cart_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה עגלה');
    end if;
    select jsonb_build_object(
      'id', draft.id, 'name', draft.name, 'email', draft.email, 'phone', draft.phone,
      'street', draft.street, 'city', draft.city, 'zip', draft.zip,
      'lines', draft.lines, 'subtotal', draft.subtotal, 'shippingAmount', draft.shipping_amount,
      'total', draft.total, 'reminded', draft.reminded, 'updatedAt', draft.updated_at
    )
    into listed
    from public.checkout_drafts as draft
    where draft.store_id = target_store
      and draft.id = cart_id
      and draft.recovered = false;
    if listed is null then
      return jsonb_build_object('ok', false, 'error', 'העגלה לא נמצאה');
    end if;
    return jsonb_build_object('ok', true, 'data', listed);
  end if;

  if tool_name = 'list_shipments' then
    select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into listed
    from (
      select sale.created_at,
        jsonb_build_object(
          'orderNumber', sale.order_number,
          'fulfillment', sale.fulfillment_status,
          'customerStatus', sale.customer_status,
          'carrier', sale.carrier,
          'tracking', sale.tracking
        ) as payload
      from public.orders as sale
      where sale.store_id = target_store
        and (sale.fulfillment_status <> 'unfulfilled' or sale.tracking <> '' or sale.carrier <> '')
      order by sale.created_at desc
      limit 50
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('shipments', listed));
  end if;

  select settings.shipping
  into shipping
  from public.store_settings as settings
  where settings.store_id = target_store
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'החנות לא נמצאה');
  end if;
  if jsonb_typeof(shipping) is distinct from 'object' then
    shipping := '{}'::jsonb;
  end if;

  if tool_name = 'get_checkout_settings' or tool_name = 'get_store_settings' then
    listed := jsonb_build_object(
      'currency', (select settings.currency from public.store_settings as settings where settings.store_id = target_store),
      'language', (select settings.language from public.store_settings as settings where settings.store_id = target_store),
      'name', (select settings.display_name from public.store_settings as settings where settings.store_id = target_store),
      'logoUrl', (select settings.logo_url from public.store_settings as settings where settings.store_id = target_store),
      'brandColors', (select settings.brand_colors from public.store_settings as settings where settings.store_id = target_store),
      'freeShippingSubtotal', 250,
      'freeShippingEditable', false,
      'estimates', coalesce(shipping->'estimates', 'false'::jsonb),
      'localDelivery', coalesce(shipping->'localDelivery', 'false'::jsonb),
      'pickup', coalesce(shipping->'pickup', 'false'::jsonb),
      'contact', coalesce(shipping->'contact', '{}'::jsonb),
      'domains', coalesce((
        select jsonb_agg(jsonb_build_object(
          'hostname', domain.hostname,
          'verified', domain.verified_at is not null,
          'environment', domain.environment
        ) order by domain.hostname)
        from public.store_domains as domain
        where domain.store_id = target_store
      ), '[]'::jsonb)
    );
    if tool_name = 'get_checkout_settings' then
      listed := listed || jsonb_build_object('shippingRates', private.shipping_rates(target_store));
    end if;
    return jsonb_build_object('ok', true, 'data', listed);
  end if;

  if tool_name = 'list_shipping_methods' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'profiles', coalesce(shipping->'profiles', '[]'::jsonb),
      'rates', private.shipping_rates(target_store)
    ));
  end if;

  if tool_name in ('update_checkout_settings', 'update_cart_rules') then
    if args ? 'freeShippingThreshold' or args ? 'freeShippingSubtotal' then
      warning := 'סף המשלוח החינם קבוע על 250 ולא השתנה';
    end if;
    if args ? 'estimates' and jsonb_typeof(args->'estimates') = 'boolean' then
      shipping := shipping || jsonb_build_object('estimates', args->'estimates');
    end if;
    if args ? 'localDelivery' and jsonb_typeof(args->'localDelivery') = 'boolean' then
      shipping := shipping || jsonb_build_object('localDelivery', args->'localDelivery');
    end if;
    if args ? 'pickup' and jsonb_typeof(args->'pickup') = 'boolean' then
      shipping := shipping || jsonb_build_object('pickup', args->'pickup');
    end if;
    if jsonb_typeof(args->'contact') = 'object' or args ? 'email' or args ? 'phone' or args ? 'city' then
      contact := coalesce(shipping->'contact', '{}'::jsonb);
      if jsonb_typeof(contact) is distinct from 'object' then
        contact := '{}'::jsonb;
      end if;
      if jsonb_typeof(args->'contact') = 'object' then
        contact := contact || args->'contact';
      end if;
      if args ? 'email' then contact := contact || jsonb_build_object('email', left(btrim(coalesce(args->>'email', '')), 200)); end if;
      if args ? 'phone' then contact := contact || jsonb_build_object('phone', left(btrim(coalesce(args->>'phone', '')), 40)); end if;
      if args ? 'city' then contact := contact || jsonb_build_object('city', left(btrim(coalesce(args->>'city', '')), 80)); end if;
      shipping := shipping || jsonb_build_object('contact', contact);
    end if;
    if warning is not null and shipping = (select settings.shipping from public.store_settings as settings where settings.store_id = target_store) then
      return jsonb_build_object('ok', false, 'error', warning);
    end if;
    perform public.save_store_sections(target_store, jsonb_build_object('shipping', shipping));
    return jsonb_build_object('ok', true, 'data', jsonb_strip_nulls(jsonb_build_object('saved', true, 'warning', warning)));
  end if;

  if tool_name = 'upsert_shipping_method' then
    rate_name := left(btrim(coalesce(args->>'name', '')), 80);
    price := private.mcp_num(args, 'price');
    zone_name := left(btrim(coalesce(nullif(args->>'zoneName', ''), 'ישראל')), 80);
    country := left(btrim(coalesce(nullif(args->>'country', ''), 'ישראל')), 80);
    profile_name := left(btrim(coalesce(args->>'profileName', '')), 80);
    if rate_name = '' or price is null or price < 0 or price > 100000 then
      return jsonb_build_object('ok', false, 'error', 'צריך שם שיטת משלוח ומחיר');
    end if;
    profiles := shipping->'profiles';
    if jsonb_typeof(profiles) <> 'array' then
      profiles := '[]'::jsonb;
    end if;
    select item, ord
    into profile, profile_ord
    from jsonb_array_elements(profiles) with ordinality as raw(item, ord)
    where profile_name = '' or item->>'name' = profile_name
    order by ord
    limit 1;
    if profile is null then
      profile := jsonb_build_object(
        'id', 'profile-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
        'name', coalesce(nullif(profile_name, ''), 'פרופיל כללי'),
        'location', null,
        'zones', '[]'::jsonb
      );
      profile_ord := null;
    end if;
    zones := profile->'zones';
    if jsonb_typeof(zones) <> 'array' then
      zones := '[]'::jsonb;
    end if;
    select item, ord
    into zone, zone_ord
    from jsonb_array_elements(zones) with ordinality as raw(item, ord)
    where item->>'name' = zone_name
    order by ord
    limit 1;
    if zone is null then
      zone := jsonb_build_object(
        'id', 'zone-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
        'name', zone_name,
        'country', country,
        'rates', '[]'::jsonb
      );
      zone_ord := null;
    end if;
    rates := zone->'rates';
    if jsonb_typeof(rates) <> 'array' then
      rates := '[]'::jsonb;
    end if;
    new_rates := '[]'::jsonb;
    for rate_item in select value from jsonb_array_elements(rates) loop
      if not replaced and rate_item->>'name' = rate_name then
        new_rates := new_rates || jsonb_build_array(jsonb_build_object(
          'id', coalesce(rate_item->>'id', 'rate-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
          'name', rate_name,
          'price', trim(to_char(round(price, 2), 'FM999999990.00'))
        ));
        replaced := true;
      else
        new_rates := new_rates || jsonb_build_array(rate_item);
      end if;
    end loop;
    if not replaced then
      if jsonb_array_length(new_rates) >= 20 then
        return jsonb_build_object('ok', false, 'error', 'יותר מדי תעריפים באזור');
      end if;
      new_rates := new_rates || jsonb_build_array(jsonb_build_object(
        'id', 'rate-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
        'name', rate_name,
        'price', trim(to_char(round(price, 2), 'FM999999990.00'))
      ));
    end if;
    zone := zone || jsonb_build_object('rates', new_rates, 'country', coalesce(nullif(zone->>'country', ''), country));
    if zone_ord is null then
      zones := zones || jsonb_build_array(zone);
    else
      select coalesce(jsonb_agg(case when raw.ord = zone_ord then zone else raw.item end order by raw.ord), '[]'::jsonb)
      into zones
      from jsonb_array_elements(zones) with ordinality as raw(item, ord);
    end if;
    profile := profile || jsonb_build_object('zones', zones);
    if profile_ord is null then
      profiles := profiles || jsonb_build_array(profile);
    else
      select coalesce(jsonb_agg(case when raw.ord = profile_ord then profile else raw.item end order by raw.ord), '[]'::jsonb)
      into profiles
      from jsonb_array_elements(profiles) with ordinality as raw(item, ord);
    end if;
    shipping := shipping || jsonb_build_object('profiles', profiles);
    perform public.save_store_sections(target_store, jsonb_build_object('shipping', shipping));
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('name', rate_name, 'price', round(price, 2), 'zone', zone_name));
  end if;

  if tool_name = 'update_store_settings' then
    if args ? 'name' then
      next_name := left(btrim(coalesce(args->>'name', '')), 80);
      if next_name = '' then
        return jsonb_build_object('ok', false, 'error', 'חסר שם לחנות');
      end if;
      update public.store_settings as settings
      set display_name = next_name
      where settings.store_id = target_store;
      update public.stores as store
      set name = next_name
      where store.id = target_store;
    end if;
    if args ? 'currency' then
      next_currency := upper(btrim(coalesce(args->>'currency', '')));
      if next_currency not in ('ILS', 'USD', 'EUR') then
        return jsonb_build_object('ok', false, 'error', 'מטבע יכול להיות ILS, USD או EUR');
      end if;
      update public.store_settings as settings
      set currency = next_currency
      where settings.store_id = target_store;
    end if;
    if args ? 'language' then
      next_language := lower(btrim(coalesce(args->>'language', '')));
      if next_language not in ('he', 'en') then
        return jsonb_build_object('ok', false, 'error', 'שפה יכולה להיות he או en');
      end if;
      update public.store_settings as settings
      set language = next_language
      where settings.store_id = target_store;
    end if;
    if args ? 'email' or args ? 'phone' or args ? 'city' or jsonb_typeof(args->'contact') = 'object' then
      return private.mcp_commerce(target_store, 'update_checkout_settings', args);
    end if;
    if not args ? 'name' and not args ? 'currency' and not args ? 'language' then
      return jsonb_build_object('ok', false, 'error', 'אין מה לעדכן');
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('saved', true));
  end if;

  if tool_name = 'list_admin_roles' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'roles', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', role.id,
          'key', role.key,
          'name', role.name,
          'builtIn', role.built_in,
          'permissions', coalesce((
            select jsonb_agg(permission.permission_key order by permission.permission_key)
            from public.role_permissions as permission
            where permission.store_id = role.store_id
              and permission.role_id = role.id
          ), '[]'::jsonb)
        ) order by role.name)
        from public.roles as role
        where role.store_id = target_store
      ), '[]'::jsonb),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', member.user_id,
          'name', member.display_name,
          'email', coalesce(account.email, ''),
          'role', role.name,
          'roleKey', role.key,
          'status', member.status
        ) order by member.created_at)
        from public.store_members as member
        join public.roles as role
          on role.store_id = member.store_id
         and role.id = member.role_id
        left join auth.users as account on account.id = member.user_id
        where member.store_id = target_store
      ), '[]'::jsonb)
    ));
  end if;

  if tool_name = 'get_audit_log' then
    select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into listed
    from (
      select log.created_at,
        jsonb_build_object(
          'id', log.id,
          'action', log.action,
          'entityType', log.entity_type,
          'entityId', log.entity_id,
          'createdAt', log.created_at
        ) as payload
      from public.audit_logs as log
      where log.store_id = target_store
      order by log.created_at desc
      limit 50
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'entries', listed,
      'note', 'היומן מחזיר רק רשומות שנשמרו. אין שחזור גרסאות.'
    ));
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
end;
$$;

revoke all on function private.mcp_commerce(uuid, text, jsonb) from public, anon, authenticated;
