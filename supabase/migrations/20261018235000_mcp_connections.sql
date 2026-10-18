-- Personal MCP keys. The raw token is never stored. The HTTP handler
-- hashes it and calls mcp_invoke as service_role, which then acts as the
-- member who created the key.

create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint mcp_connections_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint mcp_connections_hash_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint mcp_connections_prefix_len check (char_length(token_prefix) between 8 and 16)
);

create unique index mcp_connections_hash_key on public.mcp_connections (token_hash);
create index mcp_connections_owner_idx
  on public.mcp_connections (store_id, user_id)
  where revoked_at is null;

alter table public.mcp_connections enable row level security;
revoke all on table public.mcp_connections from public, anon, authenticated;

create or replace function private.mcp_num(payload jsonb, key text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  raw text;
begin
  if payload is null or payload->key is null or jsonb_typeof(payload->key) = 'null' then
    return null;
  end if;
  item := payload->key;
  if jsonb_typeof(item) = 'number' then
    return item::text::numeric;
  end if;
  if jsonb_typeof(item) = 'string' then
    raw := btrim(item #>> '{}');
    if raw ~ '^-?[0-9]+(\.[0-9]+)?$' then
      return raw::numeric;
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.mcp_num(jsonb, text) from public, anon, authenticated;

create or replace function private.mcp_uuid(payload jsonb, key text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text;
begin
  if payload is null or jsonb_typeof(payload->key) <> 'string' then
    return null;
  end if;
  raw := btrim(payload->>key);
  if raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return raw::uuid;
  end if;
  return null;
end;
$$;

revoke all on function private.mcp_uuid(jsonb, text) from public, anon, authenticated;

create or replace function private.mcp_settings_allowed(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.current_store_access(target_store)->>'settings')::boolean, false);
$$;

revoke all on function private.mcp_settings_allowed(uuid) from public, anon, authenticated;

create or replace function public.create_my_mcp_connection(
  target_store uuid,
  connection_name text,
  token_hash text,
  token_prefix text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  saved_at timestamptz;
  clean_name text := btrim(coalesce(connection_name, ''));
begin
  if auth.uid() is null or not private.mcp_settings_allowed(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception 'השם צריך להיות בין תו אחד ל-80' using errcode = '22023';
  end if;
  if token_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(token_prefix, '')) < 8 then
    raise exception 'מפתח לא תקין' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.mcp_connections as connection
    where connection.store_id = target_store
      and connection.user_id = auth.uid()
      and connection.revoked_at is null
  ) >= 8 then
    raise exception 'אפשר עד 8 חיבורים פעילים' using errcode = '22023';
  end if;

  insert into public.mcp_connections (store_id, user_id, name, token_hash, token_prefix)
  values (target_store, auth.uid(), clean_name, create_my_mcp_connection.token_hash, left(create_my_mcp_connection.token_prefix, 16))
  returning id, created_at into saved_id, saved_at;

  return jsonb_build_object(
    'id', saved_id,
    'name', clean_name,
    'tokenPrefix', left(token_prefix, 16),
    'createdAt', saved_at
  );
end;
$$;

create or replace function public.list_my_mcp_connections(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.mcp_settings_allowed(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', connection.id,
        'name', connection.name,
        'tokenPrefix', connection.token_prefix,
        'createdAt', connection.created_at,
        'lastUsedAt', connection.last_used_at
      )
      order by connection.created_at desc
    )
    from public.mcp_connections as connection
    where connection.store_id = target_store
      and connection.user_id = auth.uid()
      and connection.revoked_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.revoke_my_mcp_connection(target_store uuid, connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_id uuid;
begin
  if auth.uid() is null or not private.mcp_settings_allowed(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.mcp_connections as connection
  set revoked_at = now()
  where connection.id = connection_id
    and connection.store_id = target_store
    and connection.user_id = auth.uid()
    and connection.revoked_at is null
  returning connection.id into updated_id;

  if updated_id is null then
    raise exception 'החיבור לא נמצא' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_my_mcp_connection(uuid, text, text, text) from public, anon;
revoke all on function public.list_my_mcp_connections(uuid) from public, anon;
revoke all on function public.revoke_my_mcp_connection(uuid, uuid) from public, anon;
grant execute on function public.create_my_mcp_connection(uuid, text, text, text) to authenticated;
grant execute on function public.list_my_mcp_connections(uuid) to authenticated;
grant execute on function public.revoke_my_mcp_connection(uuid, uuid) to authenticated;

create or replace function public.mcp_invoke(token_hash text, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conn public.mcp_connections%rowtype;
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

  if not private.can_manage_store(conn.store_id) then
    return jsonb_build_object('ok', false, 'error', 'המשתמש כבר לא יכול לנהל את החנות');
  end if;

  update public.mcp_connections as connection
  set last_used_at = now()
  where connection.id = conn.id
    and (connection.last_used_at is null or connection.last_used_at < now() - interval '1 minute');

  args := coalesce(args, '{}'::jsonb);

  if tool_name in (
    'store_summary', 'list_products', 'get_product', 'update_product',
    'list_customers', 'update_customer', 'list_discounts'
  ) then
    snapshot := public.store_admin_snapshot(conn.store_id);
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
      conn.store_id,
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
      conn.store_id,
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
      conn.store_id,
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

revoke all on function public.mcp_invoke(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_invoke(text, text, jsonb) to service_role;
