-- OAuth sessions call the same tools as API keys, as the signed-in member.

create or replace function private.mcp_dispatch(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  existing jsonb;
  saved uuid;
  product_id uuid;
  customer_id uuid;
  title text;
  product_status text;
  price numeric;
  compare_at numeric;
  cost numeric;
  stock integer;
  tags text[];
  query text;
  lim integer;
  off integer;
  total integer;
  filtered jsonb;
begin
  if target_store is null or not private.can_manage_store(target_store) then
    return jsonb_build_object('ok', false, 'error', 'המשתמש כבר לא יכול לנהל את החנות');
  end if;

  args := coalesce(args, '{}'::jsonb);

  if tool_name in (
    'store_summary', 'list_products', 'get_product', 'update_product',
    'list_customers', 'update_customer', 'list_discounts'
  ) then
    snapshot := public.store_admin_snapshot(target_store);
  end if;

  if tool_name = 'store_summary' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'name', snapshot->>'name',
      'hostname', snapshot->>'hostname',
      'products', jsonb_array_length(coalesce(snapshot->'products', '[]'::jsonb)),
      'customers', jsonb_array_length(coalesce(snapshot->'customers', '[]'::jsonb)),
      'discounts', jsonb_array_length(coalesce(snapshot->'discounts', '[]'::jsonb))
    ));
  end if;

  if tool_name = 'list_products' then
    query := lower(btrim(coalesce(args->>'query', '')));
    product_status := btrim(coalesce(args->>'status', ''));
    lim := least(greatest(coalesce(trunc(private.mcp_num(args, 'limit'))::integer, 30), 1), 100);
    off := least(greatest(coalesce(trunc(private.mcp_num(args, 'offset'))::integer, 0), 0), 10000);
    with rows as (
      select item, row_number() over () as ord
      from jsonb_array_elements(coalesce(snapshot->'products', '[]'::jsonb)) as item
      where (query = '' or position(query in lower(coalesce(item->>'title', ''))) > 0
          or position(query in lower(coalesce(item->>'sku', ''))) > 0)
        and (product_status = '' or item->>'status' = product_status)
    )
    select
      count(*)::integer,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id', item->>'id',
          'title', item->>'title',
          'status', item->>'status',
          'price', item->'price',
          'sku', item->>'sku',
          'stock', item->'stock',
          'category', item->>'category'
        )
        order by ord
      ) filter (where ord > off and ord <= off + lim), '[]'::jsonb)
    into total, filtered
    from rows;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('total', total, 'products', filtered));
  end if;

  if tool_name = 'get_product' then
    product_id := private.mcp_uuid(args, 'id');
    title := btrim(coalesce(args->>'title', ''));
    if product_id is null and title = '' then
      return jsonb_build_object('ok', false, 'error', 'צריך מזהה מוצר או שם מדויק');
    end if;
    select jsonb_agg(item)
    into filtered
    from jsonb_array_elements(coalesce(snapshot->'products', '[]'::jsonb)) as item
    where (product_id is not null and item->>'id' = product_id::text)
       or (product_id is null and lower(btrim(item->>'title')) = lower(title));
    if filtered is null or jsonb_array_length(filtered) = 0 then
      return jsonb_build_object('ok', false, 'error', 'המוצר לא נמצא');
    end if;
    if jsonb_array_length(filtered) > 1 then
      return jsonb_build_object('ok', false, 'error', 'נמצאו כמה מוצרים עם אותו שם. השתמשו במזהה.', 'matches', filtered);
    end if;
    return jsonb_build_object('ok', true, 'data', filtered->0);
  end if;

  if tool_name = 'list_customers' then
    query := lower(btrim(coalesce(args->>'query', '')));
    lim := least(greatest(coalesce(trunc(private.mcp_num(args, 'limit'))::integer, 30), 1), 100);
    select coalesce(jsonb_agg(item), '[]'::jsonb)
    into filtered
    from (
      select item
      from jsonb_array_elements(coalesce(snapshot->'customers', '[]'::jsonb)) as item
      where query = ''
        or position(query in lower(coalesce(item->>'name', ''))) > 0
        or position(query in lower(coalesce(item->>'email', ''))) > 0
        or position(query in coalesce(item->>'phone', '')) > 0
      limit lim
    ) as matched;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('customers', filtered));
  end if;

  if tool_name = 'list_discounts' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'discounts', coalesce(snapshot->'discounts', '[]'::jsonb)
    ));
  end if;

  if tool_name in ('create_product', 'update_product') then
    if tool_name = 'update_product' then
      product_id := private.mcp_uuid(args, 'id');
      if product_id is null then
        return jsonb_build_object('ok', false, 'error', 'חסר מזהה מוצר');
      end if;
      select item
      into existing
      from jsonb_array_elements(coalesce(snapshot->'products', '[]'::jsonb)) as item
      where item->>'id' = product_id::text
      limit 1;
      if existing is null then
        return jsonb_build_object('ok', false, 'error', 'המוצר לא נמצא');
      end if;
    else
      product_id := null;
      existing := '{}'::jsonb;
    end if;

    title := btrim(coalesce(nullif(args->>'title', ''), existing->>'title', ''));
    product_status := btrim(coalesce(nullif(args->>'status', ''), existing->>'status', 'draft'));
    price := coalesce(private.mcp_num(args, 'price'), private.mcp_num(existing, 'price'));
    compare_at := case when args ? 'compareAt' then private.mcp_num(args, 'compareAt') else private.mcp_num(existing, 'compareAt') end;
    cost := coalesce(
      case when args ? 'cost' then private.mcp_num(args, 'cost') else private.mcp_num(existing, 'cost') end,
      0
    );
    stock := least(greatest(coalesce(
      trunc(case when args ? 'stock' then private.mcp_num(args, 'stock') else private.mcp_num(existing, 'stock') end)::integer,
      0
    ), 0), 1000000);
    if price is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מחיר');
    end if;

    select coalesce(array_agg(left(btrim(item), 40)), '{}')
    into tags
    from (
      select item
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(args->'tags') = 'array' then args->'tags'
          when jsonb_typeof(existing->'tags') = 'array' then existing->'tags'
          else '[]'::jsonb
        end
      ) as item
      where btrim(item) <> ''
      limit 30
    ) as limited(item);

    saved := public.save_store_product(
      target_store,
      product_id,
      left(title, 200),
      product_status,
      price,
      compare_at,
      cost,
      left(btrim(coalesce(nullif(args->>'vendor', ''), existing->>'vendor', '')), 120),
      left(btrim(coalesce(nullif(args->>'category', ''), existing->>'category', '')), 120),
      left(coalesce(nullif(args->>'description', ''), existing->>'description', ''), 20000),
      tags,
      left(btrim(coalesce(nullif(args->>'sku', ''), existing->>'sku', '')), 80),
      left(btrim(coalesce(nullif(args->>'barcode', ''), existing->>'barcode', '')), 80),
      stock,
      left(btrim(coalesce(nullif(args->>'variant', ''), existing->>'variant', '')), 120)
    );
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'id', saved,
      'title', left(title, 200),
      'status', product_status,
      'price', price,
      'stock', stock
    ));
  end if;

  if tool_name = 'delete_products' then
    if jsonb_typeof(args->'ids') <> 'array' or jsonb_array_length(args->'ids') = 0 then
      return jsonb_build_object('ok', false, 'error', 'צריך רשימת מזהי מוצרים');
    end if;
    if jsonb_array_length(args->'ids') > 20 then
      return jsonb_build_object('ok', false, 'error', 'אפשר למחוק עד 20 מוצרים בקריאה');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(args->'ids') as item
      where private.mcp_uuid(jsonb_build_object('id', item), 'id') is null
    ) then
      return jsonb_build_object('ok', false, 'error', 'אחד ממזהי המוצרים לא תקין');
    end if;
    perform public.delete_store_products(
      target_store,
      array(
        select private.mcp_uuid(jsonb_build_object('id', item), 'id')
        from jsonb_array_elements(args->'ids') as item
      )
    );
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('deleted', jsonb_array_length(args->'ids')));
  end if;

  if tool_name in ('create_customer', 'update_customer') then
    if tool_name = 'update_customer' then
      customer_id := private.mcp_uuid(args, 'id');
      if customer_id is null then
        return jsonb_build_object('ok', false, 'error', 'חסר מזהה לקוח');
      end if;
      select item
      into existing
      from jsonb_array_elements(coalesce(snapshot->'customers', '[]'::jsonb)) as item
      where item->>'id' = customer_id::text
      limit 1;
      if existing is null then
        return jsonb_build_object('ok', false, 'error', 'הלקוח לא נמצא');
      end if;
    else
      customer_id := null;
      existing := '{}'::jsonb;
    end if;

    saved := public.save_store_customer(
      target_store,
      customer_id,
      left(btrim(coalesce(nullif(args->>'name', ''), existing->>'name', '')), 160),
      left(btrim(coalesce(nullif(args->>'email', ''), existing->>'email', '')), 200),
      left(btrim(coalesce(nullif(args->>'phone', ''), existing->>'phone', '')), 40),
      left(btrim(coalesce(nullif(args->>'street', ''), existing->>'street', '')), 160),
      left(btrim(coalesce(nullif(args->>'city', ''), existing->>'city', '')), 80),
      left(btrim(coalesce(nullif(args->>'zip', ''), existing->>'zip', '')), 20)
    );
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', saved));
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
exception
  when others then
    if sqlstate in ('22023', '42501') then
      return jsonb_build_object('ok', false, 'error', sqlerrm);
    end if;
    raise;
end;
$$;

revoke all on function private.mcp_dispatch(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.mcp_invoke(token_hash text, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conn public.mcp_connections%rowtype;
begin
  if token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select connection.*
  into conn
  from public.mcp_connections as connection
  where connection.token_hash = mcp_invoke.token_hash
    and connection.revoked_at is null;

  if conn.id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  perform set_config('request.jwt.claim.sub', conn.user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', conn.user_id, 'role', 'authenticated')::text,
    true
  );

  update public.mcp_connections as connection
  set last_used_at = now()
  where connection.id = conn.id
    and (connection.last_used_at is null or connection.last_used_at < now() - interval '1 minute');

  return private.mcp_dispatch(conn.store_id, tool_name, args);
end;
$$;

revoke all on function public.mcp_invoke(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_invoke(text, text, jsonb) to service_role;

create or replace function public.mcp_call(tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select member.store_id
  into target_store
  from public.store_members as member
  where member.user_id = auth.uid()
    and member.status = 'active'
  order by member.created_at
  limit 1;

  if target_store is null then
    return jsonb_build_object('ok', false, 'error', 'לא נמצאה חנות פעילה למשתמש הזה');
  end if;

  return private.mcp_dispatch(target_store, tool_name, args);
end;
$$;

revoke all on function public.mcp_call(text, jsonb) from public, anon;
grant execute on function public.mcp_call(text, jsonb) to authenticated;
