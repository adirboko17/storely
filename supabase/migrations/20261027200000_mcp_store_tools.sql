-- MCP stays a closed tool list. The store id comes from the key or the
-- signed-in member, never from the model. Each tool checks the same
-- permission the admin role already uses, then calls an existing store
-- function. There is no SQL tool and no generic settings write.

create or replace function private.mcp_allowed(target_store uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_operator('platform.stores.read')
    or private.has_store_permission(target_store, permission_key, false);
$$;

revoke all on function private.mcp_allowed(uuid, text) from public, anon, authenticated;

create or replace function private.mcp_confirmed(args jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(coalesce(args, '{}'::jsonb)->'confirm') = 'boolean'
    and (args->'confirm') = 'true'::jsonb;
$$;

revoke all on function private.mcp_confirmed(jsonb) from public, anon, authenticated;

create or replace function private.mcp_tool_gate(target_store uuid, tool_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  permission text;
begin
  if tool_name = 'store_summary' then
    if private.mcp_allowed(target_store, 'products.read')
      or private.mcp_allowed(target_store, 'customers.read')
      or private.mcp_allowed(target_store, 'orders.read')
      or private.mcp_allowed(target_store, 'content.read')
      or private.mcp_allowed(target_store, 'discounts.read')
      or private.mcp_allowed(target_store, 'settings.manage')
    then
      return 'ok';
    end if;
    return 'denied';
  end if;

  permission := case tool_name
    when 'list_products' then 'products.read'
    when 'get_product' then 'products.read'
    when 'create_product' then 'products.create'
    when 'update_product' then 'products.update'
    when 'delete_products' then 'products.delete'
    when 'list_customers' then 'customers.read'
    when 'create_customer' then 'customers.create'
    when 'update_customer' then 'customers.update'
    when 'list_discounts' then 'discounts.read'
    when 'list_posts' then 'content.read'
    when 'get_post' then 'content.read'
    when 'create_post' then 'content.update'
    when 'update_post' then 'content.update'
    when 'delete_post' then 'content.update'
    when 'list_collections' then 'products.read'
    when 'get_collection' then 'products.read'
    when 'create_collection' then 'products.create'
    when 'update_collection' then 'products.update'
    when 'list_orders' then 'orders.read'
    when 'get_order' then 'orders.read'
    when 'create_order' then 'orders.create'
    when 'update_order' then 'orders.update'
    when 'delete_order' then 'orders.update'
    when 'list_policies' then 'settings.manage'
    when 'get_policy' then 'settings.manage'
    when 'update_policy' then 'settings.manage'
    when 'get_storefront' then 'settings.manage'
    when 'update_logo' then 'settings.manage'
    when 'update_brand_colors' then 'settings.manage'
    else null
  end;

  if permission is null then
    return 'unknown';
  end if;
  if private.mcp_allowed(target_store, permission) then
    return 'ok';
  end if;
  return 'denied';
end;
$$;

revoke all on function private.mcp_tool_gate(uuid, text) from public, anon, authenticated;

create or replace function private.mcp_policy_items(policies jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  source jsonb := case
    when jsonb_typeof(policies) = 'object' and jsonb_typeof(policies->'items') = 'array' then policies->'items'
    else '[]'::jsonb
  end;
  items jsonb := '[]'::jsonb;
  customs jsonb := '[]'::jsonb;
  policy_item jsonb;
  kind text;
  kinds text[] := array['return', 'privacy', 'terms', 'shipping', 'contact', 'legal', 'purchase'];
  titles text[] := array[
    'מדיניות החזרות והחזרים',
    'מדיניות פרטיות',
    'תנאי שימוש',
    'מדיניות משלוחים',
    'פרטי יצירת קשר',
    'הודעה משפטית',
    'מדיניות ביטול אפשרויות רכישה'
  ];
  index integer;
begin
  if jsonb_typeof(policies) is distinct from 'object' then
    policies := '{}'::jsonb;
  end if;

  for index in 1..7 loop
    kind := kinds[index];
    policy_item := null;
    select item
    into policy_item
    from jsonb_array_elements(source) as item
    where item->>'kind' = kind
    limit 1;
    if policy_item is null then
      policy_item := jsonb_build_object(
        'id', kind,
        'kind', kind,
        'title', titles[index],
        'body', case when jsonb_typeof(policies->kind) = 'string' then policies->>kind else '' end,
        'footer', true,
        'cart', 'hidden',
        'checkout', 'link'
      );
    end if;
    items := items || jsonb_build_array(policy_item);
  end loop;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into customs
  from jsonb_array_elements(source) as item
  where item->>'kind' = 'custom'
    and btrim(coalesce(item->>'id', '')) <> '';

  return items || customs;
end;
$$;

revoke all on function private.mcp_policy_items(jsonb) from public, anon, authenticated;

create or replace function private.mcp_posts(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  posts jsonb;
  current_post jsonb;
  matches jsonb;
  built jsonb;
  next_id integer;
  post_id integer;
  title text;
  query text;
  lim integer;
  off integer;
  total integer;
  listed jsonb;
  image text;
  video text;
  tone text;
  product_ref text;
  tags jsonb;
  focus numeric;
  zoom numeric;
begin
  if private.mcp_tool_gate(target_store, tool_name) <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות');
  end if;

  if tool_name in ('create_post', 'update_post', 'delete_post') then
    select settings.posts
    into posts
    from public.store_settings as settings
    where settings.store_id = target_store
    for update;
  else
    select settings.posts
    into posts
    from public.store_settings as settings
    where settings.store_id = target_store;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'החנות לא נמצאה');
  end if;
  if posts is null then
    posts := '[]'::jsonb;
  end if;
  if jsonb_typeof(posts) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'מאמרים לא תקינים');
  end if;

  if tool_name = 'list_posts' then
    query := lower(btrim(coalesce(args->>'query', '')));
    lim := least(greatest(coalesce(trunc(private.mcp_num(args, 'limit'))::integer, 30), 1), 100);
    off := least(greatest(coalesce(trunc(private.mcp_num(args, 'offset'))::integer, 0), 0), 10000);
    with rows as (
      select item, row_number() over () as ord
      from jsonb_array_elements(posts) as item
      where query = '' or position(query in lower(coalesce(item->>'title', ''))) > 0
    )
    select
      count(*)::integer,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id', item->'id',
          'title', item->>'title',
          'visible', coalesce(item->'visible', 'true'::jsonb),
          'blog', item->>'blog',
          'updated', item->>'updated'
        )
        order by ord
      ) filter (where ord > off and ord <= off + lim), '[]'::jsonb)
    into total, listed
    from rows;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('total', total, 'posts', listed));
  end if;

  if tool_name = 'get_post' then
    post_id := trunc(private.mcp_num(args, 'id'))::integer;
    title := btrim(coalesce(args->>'title', ''));
    if post_id is null and title = '' then
      return jsonb_build_object('ok', false, 'error', 'צריך מזהה מאמר או שם מדויק');
    end if;
    select jsonb_agg(item)
    into matches
    from jsonb_array_elements(posts) as item
    where (post_id is not null and trunc(private.mcp_num(item, 'id')) = post_id)
       or (post_id is null and lower(btrim(coalesce(item->>'title', ''))) = lower(title));
    if matches is null or jsonb_array_length(matches) = 0 then
      return jsonb_build_object('ok', false, 'error', 'המאמר לא נמצא');
    end if;
    if jsonb_array_length(matches) > 1 then
      return jsonb_build_object('ok', false, 'error', 'נמצאו כמה מאמרים עם אותו שם. השתמשו במזהה.', 'matches', matches);
    end if;
    return jsonb_build_object('ok', true, 'data', matches->0);
  end if;

  if tool_name = 'delete_post' then
    if not private.mcp_confirmed(args) then
      return jsonb_build_object('ok', false, 'error', 'צריך לאשר את המחיקה עם confirm');
    end if;
    post_id := trunc(private.mcp_num(args, 'id'))::integer;
    if post_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה מאמר');
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(posts) as item
      where trunc(private.mcp_num(item, 'id')) = post_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'המאמר לא נמצא');
    end if;
    select coalesce(jsonb_agg(raw.item order by raw.ord), '[]'::jsonb)
    into listed
    from jsonb_array_elements(posts) with ordinality as raw(item, ord)
    where trunc(private.mcp_num(raw.item, 'id')) is distinct from post_id;
    posts := listed;
    perform public.save_store_sections(target_store, jsonb_build_object('posts', posts));
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('deleted', post_id));
  end if;

  if tool_name = 'update_post' then
    post_id := trunc(private.mcp_num(args, 'id'))::integer;
    if post_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה מאמר');
    end if;
    select item
    into current_post
    from jsonb_array_elements(posts) as item
    where trunc(private.mcp_num(item, 'id')) = post_id
    limit 1;
    if current_post is null then
      return jsonb_build_object('ok', false, 'error', 'המאמר לא נמצא');
    end if;
  else
    current_post := '{}'::jsonb;
    if jsonb_array_length(posts) >= 500 then
      return jsonb_build_object('ok', false, 'error', 'אפשר עד 500 מאמרים');
    end if;
    select coalesce(max(trunc(private.mcp_num(item, 'id'))), 0)::integer + 1
    into next_id
    from jsonb_array_elements(posts) as item;
  end if;

  if tool_name = 'create_post' or args ? 'title' then
    title := left(btrim(coalesce(args->>'title', '')), 200);
    if title = '' then
      return jsonb_build_object('ok', false, 'error', 'חסר שם למאמר');
    end if;
  end if;

  if args ? 'image' then
    image := left(btrim(coalesce(args->>'image', '')), 2000);
    if image <> '' and image !~ '^https://[^[:space:]]+$' then
      return jsonb_build_object('ok', false, 'error', 'תמונה צריכה להיות כתובת https');
    end if;
  end if;
  if args ? 'video' then
    video := left(btrim(coalesce(args->>'video', '')), 2000);
    if video <> '' and video !~ '^https://[^[:space:]]+$' then
      return jsonb_build_object('ok', false, 'error', 'סרטון צריך להיות כתובת https');
    end if;
  end if;
  if args ? 'tone' and btrim(coalesce(args->>'tone', '')) <> '' and btrim(args->>'tone') !~ '^#[0-9a-fA-F]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'צבע לא תקין');
  end if;
  if args ? 'visible' and jsonb_typeof(args->'visible') <> 'boolean' then
    return jsonb_build_object('ok', false, 'error', 'visible צריך להיות true או false');
  end if;
  if args ? 'productId' then
    product_ref := btrim(coalesce(args->>'productId', ''));
    if product_ref <> '' and (
      private.mcp_uuid(jsonb_build_object('id', product_ref), 'id') is null
      or not exists (
        select 1 from public.products as product
        where product.store_id = target_store
          and product.id = product_ref::uuid
      )
    ) then
      return jsonb_build_object('ok', false, 'error', 'המוצר לא נמצא');
    end if;
  end if;
  if args ? 'tags' then
    if jsonb_typeof(args->'tags') <> 'array' or exists (
      select 1 from jsonb_array_elements(args->'tags') as item where jsonb_typeof(item) <> 'string'
    ) then
      return jsonb_build_object('ok', false, 'error', 'תגיות לא תקינות');
    end if;
    select coalesce(jsonb_agg(to_jsonb(left(btrim(item), 40)) order by ord), '[]'::jsonb)
    into tags
    from (
      select item, ord
      from jsonb_array_elements_text(args->'tags') with ordinality as raw(item, ord)
      where btrim(item) <> ''
      order by ord
      limit 20
    ) as limited;
  end if;

  if args ? 'imageX' or args ? 'imageY' or args ? 'imageScale' then
    if args ? 'imageX' then
      focus := private.mcp_num(args, 'imageX');
      if focus is null then
        return jsonb_build_object('ok', false, 'error', 'מיקום תמונה לא תקין');
      end if;
    end if;
    if args ? 'imageY' then
      focus := private.mcp_num(args, 'imageY');
      if focus is null then
        return jsonb_build_object('ok', false, 'error', 'מיקום תמונה לא תקין');
      end if;
    end if;
    if args ? 'imageScale' then
      zoom := private.mcp_num(args, 'imageScale');
      if zoom is null or zoom <= 0 then
        return jsonb_build_object('ok', false, 'error', 'זום תמונה לא תקין');
      end if;
    end if;
  end if;

  if tool_name = 'create_post' then
    built := jsonb_build_object(
      'id', next_id,
      'title', title,
      'excerpt', left(btrim(coalesce(args->>'excerpt', '')), 500),
      'body', left(coalesce(args->>'body', ''), 50000),
      'author', left(btrim(coalesce(args->>'author', '')), 80),
      'updated', coalesce(nullif(left(btrim(coalesce(args->>'updated', '')), 40), ''), to_char(now() at time zone 'Asia/Jerusalem', 'DD.MM.YYYY')),
      'productId', coalesce(product_ref, ''),
      'productNote', left(btrim(coalesce(args->>'productNote', '')), 500),
      'blog', coalesce(nullif(left(btrim(coalesce(args->>'blog', '')), 80), ''), 'חדשות'),
      'visible', case when args ? 'visible' then args->'visible' else 'false'::jsonb end,
      'tags', coalesce(tags, '[]'::jsonb),
      'tone', coalesce(nullif(lower(btrim(coalesce(args->>'tone', ''))), ''), '#e4e0d8'),
      'image', coalesce(image, ''),
      'imageX', case when args ? 'imageX' then to_jsonb(least(greatest(trunc(private.mcp_num(args, 'imageX'))::integer, 0), 100)) else '50'::jsonb end,
      'imageY', case when args ? 'imageY' then to_jsonb(least(greatest(trunc(private.mcp_num(args, 'imageY'))::integer, 0), 100)) else '50'::jsonb end,
      'imageScale', case when args ? 'imageScale' then to_jsonb(least(round(private.mcp_num(args, 'imageScale'), 2), 3)) else '1'::jsonb end,
      'video', coalesce(video, ''),
      'seoTitle', left(btrim(coalesce(args->>'seoTitle', '')), 160),
      'seoDescription', left(btrim(coalesce(args->>'seoDescription', '')), 320),
      'handle', left(btrim(coalesce(args->>'handle', '')), 80),
      'template', coalesce(nullif(left(btrim(coalesce(args->>'template', '')), 80), ''), 'פוסט בלוג ברירת מחדל')
    );
    posts := jsonb_build_array(built) || posts;
  else
    built := current_post;
    if args ? 'title' then
      built := built || jsonb_build_object('title', title);
    end if;
    if args ? 'excerpt' then
      built := built || jsonb_build_object('excerpt', left(btrim(coalesce(args->>'excerpt', '')), 500));
    end if;
    if args ? 'body' then
      built := built || jsonb_build_object('body', left(coalesce(args->>'body', ''), 50000));
    end if;
    if args ? 'author' then
      built := built || jsonb_build_object('author', left(btrim(coalesce(args->>'author', '')), 80));
    end if;
    if args ? 'updated' then
      built := built || jsonb_build_object('updated', left(btrim(coalesce(args->>'updated', '')), 40));
    end if;
    if args ? 'productId' then
      built := built || jsonb_build_object('productId', product_ref);
    end if;
    if args ? 'productNote' then
      built := built || jsonb_build_object('productNote', left(btrim(coalesce(args->>'productNote', '')), 500));
    end if;
    if args ? 'blog' then
      built := built || jsonb_build_object('blog', left(btrim(coalesce(args->>'blog', '')), 80));
    end if;
    if args ? 'visible' then
      built := built || jsonb_build_object('visible', args->'visible');
    end if;
    if args ? 'tags' then
      built := built || jsonb_build_object('tags', tags);
    end if;
    if args ? 'tone' then
      tone := lower(btrim(coalesce(args->>'tone', '')));
      built := built || jsonb_build_object('tone', case when tone = '' then '#e4e0d8' else tone end);
    end if;
    if args ? 'image' then
      built := built || jsonb_build_object('image', image);
    end if;
    if args ? 'imageX' then
      built := built || jsonb_build_object('imageX', least(greatest(trunc(private.mcp_num(args, 'imageX'))::integer, 0), 100));
    end if;
    if args ? 'imageY' then
      built := built || jsonb_build_object('imageY', least(greatest(trunc(private.mcp_num(args, 'imageY'))::integer, 0), 100));
    end if;
    if args ? 'imageScale' then
      built := built || jsonb_build_object('imageScale', least(round(private.mcp_num(args, 'imageScale'), 2), 3));
    end if;
    if args ? 'video' then
      built := built || jsonb_build_object('video', video);
    end if;
    if args ? 'seoTitle' then
      built := built || jsonb_build_object('seoTitle', left(btrim(coalesce(args->>'seoTitle', '')), 160));
    end if;
    if args ? 'seoDescription' then
      built := built || jsonb_build_object('seoDescription', left(btrim(coalesce(args->>'seoDescription', '')), 320));
    end if;
    if args ? 'handle' then
      built := built || jsonb_build_object('handle', left(btrim(coalesce(args->>'handle', '')), 80));
    end if;
    if args ? 'template' then
      built := built || jsonb_build_object('template', left(btrim(coalesce(args->>'template', '')), 80));
    end if;
    if built = current_post then
      return jsonb_build_object('ok', false, 'error', 'אין מה לעדכן');
    end if;
    select coalesce(jsonb_agg(case when trunc(private.mcp_num(raw.item, 'id')) = post_id then built else raw.item end order by raw.ord), '[]'::jsonb)
    into listed
    from jsonb_array_elements(posts) with ordinality as raw(item, ord);
    posts := listed;
  end if;

  perform public.save_store_sections(target_store, jsonb_build_object('posts', posts));
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', built->'id',
    'title', built->>'title',
    'visible', built->'visible'
  ));
end;
$$;

revoke all on function private.mcp_posts(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_collections(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  collection_title text;
  collection_id uuid;
  description text;
  conditions jsonb;
  image text;
  hidden boolean;
  exclude_stock boolean;
  manual_sort boolean;
  product_ids jsonb;
  saved uuid;
  query text;
  lim integer;
  off integer;
  total integer;
  listed jsonb;
  found_count integer;
begin
  if private.mcp_tool_gate(target_store, tool_name) <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות');
  end if;

  if tool_name = 'list_collections' then
    query := lower(btrim(coalesce(args->>'query', '')));
    lim := least(greatest(coalesce(trunc(private.mcp_num(args, 'limit'))::integer, 30), 1), 100);
    off := least(greatest(coalesce(trunc(private.mcp_num(args, 'offset'))::integer, 0), 0), 10000);
    with rows as (
      select
        collection.title,
        collection.hidden,
        (
          select count(*)
          from public.collection_products as link
          where link.store_id = collection.store_id
            and link.collection_id = collection.id
        ) as product_count,
        row_number() over (order by collection.position, collection.title) as ord
      from public.collections as collection
      where collection.store_id = target_store
        and (query = '' or position(query in lower(collection.title)) > 0)
    )
    select
      count(*)::integer,
      coalesce(jsonb_agg(
        jsonb_build_object('title', rows.title, 'hidden', rows.hidden, 'productCount', rows.product_count)
        order by rows.ord
      ) filter (where rows.ord > off and rows.ord <= off + lim), '[]'::jsonb)
    into total, listed
    from rows;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('total', total, 'collections', listed));
  end if;

  collection_title := left(btrim(coalesce(args->>'title', '')), 120);
  if collection_title = '' then
    return jsonb_build_object('ok', false, 'error', 'חסר שם קטגוריה');
  end if;

  select count(*)::integer, min(collection.id::text)::uuid
  into found_count, collection_id
  from public.collections as collection
  where collection.store_id = target_store
    and collection.title = collection_title;

  if tool_name = 'get_collection' then
    if found_count = 0 then
      return jsonb_build_object('ok', false, 'error', 'הקטגוריה לא נמצאה');
    end if;
    if found_count > 1 then
      return jsonb_build_object('ok', false, 'error', 'נמצאו כמה קטגוריות עם אותו שם');
    end if;
    select jsonb_build_object(
      'title', collection.title,
      'description', collection.description,
      'hidden', collection.hidden,
      'excludeOutOfStock', collection.exclude_out_of_stock,
      'manualSort', collection.manual_sort,
      'image', collection.image,
      'productIds', coalesce((
        select jsonb_agg(link.product_id order by link.position)
        from public.collection_products as link
        where link.store_id = collection.store_id
          and link.collection_id = collection.id
      ), '[]'::jsonb)
    )
    into listed
    from public.collections as collection
    where collection.id = collection_id;
    return jsonb_build_object('ok', true, 'data', listed);
  end if;

  if tool_name = 'create_collection' and found_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'קטגוריה בשם הזה כבר קיימת');
  end if;
  if tool_name = 'update_collection' and found_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'הקטגוריה לא נמצאה');
  end if;
  if tool_name = 'update_collection' and found_count > 1 then
    return jsonb_build_object('ok', false, 'error', 'נמצאו כמה קטגוריות עם אותו שם');
  end if;

  if tool_name = 'update_collection' then
    select collection.description, collection.conditions, collection.image, collection.hidden,
      collection.exclude_out_of_stock, collection.manual_sort
    into description, conditions, image, hidden, exclude_stock, manual_sort
    from public.collections as collection
    where collection.id = collection_id;
    select coalesce(jsonb_agg(link.product_id::text order by link.position), '[]'::jsonb)
    into product_ids
    from public.collection_products as link
    where link.store_id = target_store
      and link.collection_id = collection_id;
  else
    description := '';
    conditions := '[]'::jsonb;
    image := '';
    hidden := false;
    exclude_stock := false;
    manual_sort := false;
    product_ids := '[]'::jsonb;
  end if;

  if args ? 'description' then
    description := left(coalesce(args->>'description', ''), 8000);
  end if;
  if args ? 'image' then
    image := left(btrim(coalesce(args->>'image', '')), 2000);
    if image <> '' and image !~ '^https://[^[:space:]]+$' then
      return jsonb_build_object('ok', false, 'error', 'תמונה צריכה להיות כתובת https');
    end if;
  end if;
  if args ? 'hidden' then
    if jsonb_typeof(args->'hidden') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'hidden צריך להיות true או false');
    end if;
    hidden := (args->>'hidden') = 'true';
  end if;
  if args ? 'excludeOutOfStock' then
    if jsonb_typeof(args->'excludeOutOfStock') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'excludeOutOfStock צריך להיות true או false');
    end if;
    exclude_stock := (args->>'excludeOutOfStock') = 'true';
  end if;
  if args ? 'manualSort' then
    if jsonb_typeof(args->'manualSort') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'manualSort צריך להיות true או false');
    end if;
    manual_sort := (args->>'manualSort') = 'true';
  end if;
  if args ? 'productIds' then
    if jsonb_typeof(args->'productIds') <> 'array' or jsonb_array_length(args->'productIds') > 500 then
      return jsonb_build_object('ok', false, 'error', 'רשימת המוצרים לא תקינה');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(args->'productIds') as item
      where jsonb_typeof(item) <> 'string'
        or private.mcp_uuid(jsonb_build_object('id', item), 'id') is null
        or not exists (
          select 1
          from public.products as product
          where product.store_id = target_store
            and product.id = private.mcp_uuid(jsonb_build_object('id', item), 'id')
        )
    ) then
      return jsonb_build_object('ok', false, 'error', 'מוצר לא נמצא בחנות');
    end if;
    select coalesce(jsonb_agg(product_id order by ord), '[]'::jsonb)
    into product_ids
    from (
      select product_id, min(ord) as ord
      from jsonb_array_elements_text(args->'productIds') with ordinality as raw(product_id, ord)
      group by product_id
    ) as unique_ids;
  end if;

  saved := public.save_store_collection(target_store, jsonb_build_object(
    'title', collection_title,
    'description', coalesce(description, ''),
    'productIds', coalesce(product_ids, '[]'::jsonb),
    'conditions', coalesce(conditions, '[]'::jsonb),
    'excludeOutOfStock', exclude_stock,
    'image', coalesce(image, ''),
    'hidden', hidden,
    'manualSort', manual_sort
  ));
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', saved, 'title', collection_title, 'hidden', hidden));
end;
$$;

revoke all on function private.mcp_collections(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_orders(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  query text;
  lim integer;
  off integer;
  total integer;
  listed jsonb;
  order_id uuid;
  order_number integer;
  matches integer;
  pay text;
  fulfillment text;
  customer_status text;
  patch jsonb := '{}'::jsonb;
  refunded numeric;
  payment text;
  discount numeric;
  shipping numeric;
  lines jsonb := '[]'::jsonb;
  line jsonb;
  quantity integer;
  payload jsonb;
  created jsonb;
  customer_id uuid;
begin
  if private.mcp_tool_gate(target_store, tool_name) <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות');
  end if;

  if tool_name in ('list_orders', 'get_order') then
    snapshot := public.store_admin_slice(target_store, 'orders')->'orders';
    if snapshot is null or jsonb_typeof(snapshot) <> 'array' then
      snapshot := '[]'::jsonb;
    end if;
  end if;

  if tool_name = 'list_orders' then
    query := lower(btrim(coalesce(args->>'query', '')));
    lim := least(greatest(coalesce(trunc(private.mcp_num(args, 'limit'))::integer, 30), 1), 100);
    off := least(greatest(coalesce(trunc(private.mcp_num(args, 'offset'))::integer, 0), 0), 10000);
    with rows as (
      select item, row_number() over () as ord
      from jsonb_array_elements(snapshot) as item
      where query = ''
        or position(query in lower(coalesce(item->>'customerName', ''))) > 0
        or position(query in coalesce(item->>'number', '')) > 0
    )
    select
      count(*)::integer,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id', item->>'id',
          'number', item->'number',
          'createdAt', item->>'createdAt',
          'customerName', item->>'customerName',
          'pay', item->>'pay',
          'fulfillment', item->>'fulfillment',
          'customerStatus', item->>'customerStatus',
          'total', item->'total'
        )
        order by ord
      ) filter (where ord > off and ord <= off + lim), '[]'::jsonb)
    into total, listed
    from rows;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('total', total, 'orders', listed));
  end if;

  if tool_name = 'get_order' then
    order_id := private.mcp_uuid(args, 'id');
    order_number := trunc(private.mcp_num(args, 'number'))::integer;
    if order_id is null and order_number is null then
      return jsonb_build_object('ok', false, 'error', 'צריך מספר הזמנה או מזהה');
    end if;
    select jsonb_agg(item)
    into listed
    from jsonb_array_elements(snapshot) as item
    where (order_id is not null and item->>'id' = order_id::text)
       or (order_id is null and trunc(private.mcp_num(item, 'number')) = order_number);
    if listed is null or jsonb_array_length(listed) = 0 then
      return jsonb_build_object('ok', false, 'error', 'ההזמנה לא נמצאה');
    end if;
    if jsonb_array_length(listed) > 1 then
      return jsonb_build_object('ok', false, 'error', 'נמצאו כמה הזמנות. השתמשו במזהה.');
    end if;
    return jsonb_build_object('ok', true, 'data', listed->0);
  end if;

  if tool_name in ('update_order', 'delete_order') then
    order_id := private.mcp_uuid(args, 'id');
    order_number := trunc(private.mcp_num(args, 'number'))::integer;
    if order_id is null and order_number is null then
      return jsonb_build_object('ok', false, 'error', 'צריך מספר הזמנה או מזהה');
    end if;
    select count(*)::integer, min(sale.id::text)::uuid, min(sale.order_number)
    into matches, order_id, order_number
    from public.orders as sale
    where sale.store_id = target_store
      and (private.mcp_uuid(args, 'id') is null or sale.id = private.mcp_uuid(args, 'id'))
      and (trunc(private.mcp_num(args, 'number')) is null or sale.order_number = trunc(private.mcp_num(args, 'number'))::integer);
    if matches = 0 then
      return jsonb_build_object('ok', false, 'error', 'ההזמנה לא נמצאה');
    end if;
    if matches > 1 then
      return jsonb_build_object('ok', false, 'error', 'נמצאו כמה הזמנות. השתמשו במזהה.');
    end if;
  end if;

  if tool_name = 'delete_order' then
    if not private.mcp_confirmed(args) then
      return jsonb_build_object('ok', false, 'error', 'צריך לאשר את המחיקה עם confirm');
    end if;
    perform public.delete_store_order(target_store, order_id);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('deleted', order_number));
  end if;

  if tool_name = 'update_order' then
    if args ? 'pay' then
      pay := btrim(coalesce(args->>'pay', ''));
      if pay not in ('paid', 'pending', 'partially_refunded', 'refunded') then
        return jsonb_build_object('ok', false, 'error', 'סטטוס תשלום לא תקין');
      end if;
      patch := patch || jsonb_build_object('pay', pay);
    end if;
    if args ? 'fulfillment' then
      fulfillment := btrim(coalesce(args->>'fulfillment', ''));
      if fulfillment not in ('unfulfilled', 'fulfilled', 'partial', 'onhold', 'progress') then
        return jsonb_build_object('ok', false, 'error', 'סטטוס משלוח לא תקין');
      end if;
      patch := patch || jsonb_build_object('fulfillment', fulfillment);
    end if;
    if args ? 'customerStatus' then
      customer_status := btrim(coalesce(args->>'customerStatus', ''));
      if customer_status not in ('received', 'progress', 'hold', 'sent', 'transit', 'delivered') then
        return jsonb_build_object('ok', false, 'error', 'סטטוס ללקוח לא תקין');
      end if;
      patch := patch || jsonb_build_object('customer_status', customer_status);
    end if;
    if args ? 'carrier' then
      patch := patch || jsonb_build_object('carrier', left(btrim(coalesce(args->>'carrier', '')), 120));
    end if;
    if args ? 'tracking' then
      patch := patch || jsonb_build_object('tracking', left(btrim(coalesce(args->>'tracking', '')), 120));
    end if;
    if args ? 'comment' then
      if btrim(coalesce(args->>'comment', '')) = '' then
        return jsonb_build_object('ok', false, 'error', 'ההערה ריקה');
      end if;
      patch := patch || jsonb_build_object('comment', left(btrim(args->>'comment'), 500));
    end if;
    if args ? 'refunded' then
      refunded := private.mcp_num(args, 'refunded');
      if refunded is null or refunded < 0 or refunded > 1000000 then
        return jsonb_build_object('ok', false, 'error', 'סכום החזר לא תקין');
      end if;
      patch := patch || jsonb_build_object('refunded', refunded);
    end if;
    if patch = '{}'::jsonb then
      return jsonb_build_object('ok', false, 'error', 'אין מה לעדכן');
    end if;
    if (
      pay in ('refunded', 'partially_refunded')
      or args ? 'refunded'
    ) and not private.mcp_confirmed(args) then
      return jsonb_build_object('ok', false, 'error', 'צריך לאשר החזר כספי עם confirm');
    end if;
    perform public.update_store_order(target_store, order_number, patch);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('number', order_number));
  end if;

  if jsonb_typeof(args->'lines') <> 'array'
    or jsonb_array_length(args->'lines') < 1
    or jsonb_array_length(args->'lines') > 40
  then
    return jsonb_build_object('ok', false, 'error', 'צריך בין מוצר אחד ל-40');
  end if;

  for line in select value from jsonb_array_elements(args->'lines') as value
  loop
    if private.mcp_uuid(line, 'productId') is null then
      return jsonb_build_object('ok', false, 'error', 'אפשר להוסיף רק מוצרים מהקטלוג');
    end if;
    quantity := trunc(private.mcp_num(line, 'quantity'))::integer;
    if quantity is null or quantity < 1 or quantity > 999 then
      return jsonb_build_object('ok', false, 'error', 'כמות לא תקינה');
    end if;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'productId', btrim(line->>'productId'),
      'quantity', quantity
    ));
  end loop;

  payment := coalesce(nullif(btrim(coalesce(args->>'payment', '')), ''), 'pending');
  if payment not in ('pending', 'paid') then
    return jsonb_build_object('ok', false, 'error', 'סטטוס תשלום לא תקין');
  end if;
  if (args ? 'discount' and private.mcp_num(args, 'discount') is null)
    or (args ? 'shipping' and private.mcp_num(args, 'shipping') is null)
  then
    return jsonb_build_object('ok', false, 'error', 'סכום לא תקין');
  end if;
  discount := coalesce(private.mcp_num(args, 'discount'), 0);
  shipping := coalesce(private.mcp_num(args, 'shipping'), 0);
  if discount < 0 or discount > 1000000 or shipping < 0 or shipping > 1000000 then
    return jsonb_build_object('ok', false, 'error', 'סכום לא תקין');
  end if;
  if (payment = 'paid' or discount > 0) and not private.mcp_confirmed(args) then
    return jsonb_build_object('ok', false, 'error', 'צריך לאשר הנחה או סימון הזמנה כשולמה עם confirm');
  end if;

  customer_id := private.mcp_uuid(args, 'customerId');
  if customer_id is null and btrim(coalesce(args->>'name', '')) = '' then
    return jsonb_build_object('ok', false, 'error', 'צריך לבחור לקוח או לרשום שם');
  end if;
  if args ? 'customerId' and customer_id is null then
    return jsonb_build_object('ok', false, 'error', 'מזהה לקוח לא תקין');
  end if;

  payload := jsonb_build_object(
    'payment', payment,
    'discount', discount,
    'shipping', shipping,
    'shippingName', left(btrim(coalesce(args->>'shippingName', '')), 80),
    'note', left(btrim(coalesce(args->>'note', '')), 2000),
    'lines', lines,
    'customer', jsonb_build_object(
      'name', left(btrim(coalesce(args->>'name', '')), 120),
      'email', left(btrim(coalesce(args->>'email', '')), 180),
      'phone', left(btrim(coalesce(args->>'phone', '')), 40),
      'street', left(btrim(coalesce(args->>'street', '')), 160),
      'city', left(btrim(coalesce(args->>'city', '')), 80),
      'zip', left(btrim(coalesce(args->>'zip', '')), 20)
    )
  );
  if customer_id is not null then
    payload := payload || jsonb_build_object('customerId', customer_id);
  end if;

  created := public.create_store_order(target_store, payload);
  if coalesce(created->>'ok', '') <> 'true' then
    return jsonb_build_object('ok', false, 'error', coalesce(created->>'reason', 'ההזמנה לא נוצרה'));
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'orderNumber', created->'orderNumber',
    'total', created->'total'
  ));
end;
$$;

revoke all on function private.mcp_orders(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_site(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  policies jsonb;
  items jsonb;
  kind text;
  title text;
  body text;
  logo text;
  colors jsonb;
  saved jsonb;
  name text;
begin
  if private.mcp_tool_gate(target_store, tool_name) <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות');
  end if;

  if tool_name = 'get_storefront' then
    select settings.display_name, settings.logo_url, settings.brand_colors
    into name, logo, colors
    from public.store_settings as settings
    where settings.store_id = target_store;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'החנות לא נמצאה');
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'name', coalesce(name, ''),
      'logoUrl', coalesce(logo, ''),
      'colors', coalesce(colors, '[]'::jsonb)
    ));
  end if;

  if tool_name = 'update_logo' then
    if not args ? 'logoUrl' or jsonb_typeof(args->'logoUrl') <> 'string' then
      return jsonb_build_object('ok', false, 'error', 'חסרה כתובת לוגו');
    end if;
    logo := left(btrim(args->>'logoUrl'), 2000);
    if logo <> '' and logo !~ '^https://[^[:space:]]+$' then
      return jsonb_build_object('ok', false, 'error', 'לוגו צריך להיות כתובת https, או ריק כדי להסיר');
    end if;
    perform public.save_store_logo(target_store, logo);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('logoUrl', logo));
  end if;

  if tool_name = 'update_brand_colors' then
    colors := args->'colors';
    if jsonb_typeof(colors) <> 'array' or jsonb_array_length(colors) < 1 or jsonb_array_length(colors) > 24 then
      return jsonb_build_object('ok', false, 'error', 'צריך בין צבע אחד ל-24 צבעים');
    end if;
    if exists (
      select 1
      from jsonb_array_elements(colors) as item
      where jsonb_typeof(item) <> 'string'
        or btrim(item #>> '{}') !~ '^#[0-9a-fA-F]{6}$'
    ) then
      return jsonb_build_object('ok', false, 'error', 'צבע לא תקין');
    end if;
    select coalesce(jsonb_agg(lower(item) order by ord), '[]'::jsonb)
    into colors
    from jsonb_array_elements_text(args->'colors') with ordinality as raw(item, ord);
    perform public.save_store_brand_colors(target_store, colors);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('colors', colors));
  end if;

  if tool_name = 'update_policy' then
    select settings.policies
    into policies
    from public.store_settings as settings
    where settings.store_id = target_store
    for update;
  else
    select settings.policies
    into policies
    from public.store_settings as settings
    where settings.store_id = target_store;
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'החנות לא נמצאה');
  end if;
  items := private.mcp_policy_items(policies);

  if tool_name = 'list_policies' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'policies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', item->>'kind',
          'id', item->>'id',
          'title', item->>'title',
          'hasBody', btrim(coalesce(item->>'body', '')) <> ''
        ) order by ord)
        from jsonb_array_elements(items) with ordinality as raw(item, ord)
      ), '[]'::jsonb)
    ));
  end if;

  kind := btrim(coalesce(args->>'kind', ''));
  if kind not in ('return', 'privacy', 'terms', 'shipping', 'contact', 'legal', 'purchase') then
    return jsonb_build_object('ok', false, 'error', 'אפשר לעדכן רק מדיניות קיימת');
  end if;

  if tool_name = 'get_policy' then
    select item
    into saved
    from jsonb_array_elements(items) as item
    where item->>'kind' = kind
    limit 1;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'kind', saved->>'kind',
      'id', saved->>'id',
      'title', saved->>'title',
      'body', coalesce(saved->>'body', '')
    ));
  end if;

  if not args ? 'title' and not args ? 'body' then
    return jsonb_build_object('ok', false, 'error', 'אין מה לעדכן');
  end if;
  if args ? 'title' then
    title := left(btrim(coalesce(args->>'title', '')), 120);
    if title = '' then
      return jsonb_build_object('ok', false, 'error', 'חסר שם למדיניות');
    end if;
  end if;
  if args ? 'body' then
    body := left(coalesce(args->>'body', ''), 50000);
  end if;

  select raw.item
  into saved
  from jsonb_array_elements(items) with ordinality as raw(item, ord)
  where raw.item->>'kind' = kind
  limit 1;
  if saved is null then
    return jsonb_build_object('ok', false, 'error', 'אפשר לעדכן רק מדיניות קיימת');
  end if;

  if args ? 'title' then
    saved := saved || jsonb_build_object('title', title);
  else
    title := saved->>'title';
  end if;
  if args ? 'body' then
    saved := saved || jsonb_build_object('body', body);
  else
    body := coalesce(saved->>'body', '');
  end if;

  select coalesce(jsonb_agg(case when item->>'kind' = kind then saved else item end order by ord), '[]'::jsonb)
  into items
  from jsonb_array_elements(items) with ordinality as raw(item, ord);

  policies := case when jsonb_typeof(policies) = 'object' then policies else '{}'::jsonb end;
  policies := policies || jsonb_build_object('version', 2, 'items', items);
  policies := jsonb_set(policies, array[kind], to_jsonb(body));
  perform public.save_store_sections(target_store, jsonb_build_object('policies', policies));
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('kind', kind, 'title', title));
end;
$$;

revoke all on function private.mcp_site(uuid, text, jsonb) from public, anon, authenticated;

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
  gate text;
begin
  if target_store is null or not private.can_manage_store(target_store) then
    return jsonb_build_object('ok', false, 'error', 'המשתמש כבר לא יכול לנהל את החנות');
  end if;

  args := coalesce(args, '{}'::jsonb);
  gate := private.mcp_tool_gate(target_store, tool_name);
  if gate = 'unknown' then
    return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
  end if;
  if gate <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות');
  end if;

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
    if not private.mcp_confirmed(args) then
      return jsonb_build_object('ok', false, 'error', 'צריך לאשר את המחיקה עם confirm');
    end if;
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

  if tool_name in ('list_posts', 'get_post', 'create_post', 'update_post', 'delete_post') then
    return private.mcp_posts(target_store, tool_name, args);
  end if;

  if tool_name in ('list_collections', 'get_collection', 'create_collection', 'update_collection') then
    return private.mcp_collections(target_store, tool_name, args);
  end if;

  if tool_name in ('list_orders', 'get_order', 'create_order', 'update_order', 'delete_order') then
    return private.mcp_orders(target_store, tool_name, args);
  end if;

  if tool_name in ('list_policies', 'get_policy', 'update_policy', 'get_storefront', 'update_logo', 'update_brand_colors') then
    return private.mcp_site(target_store, tool_name, args);
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
exception
  when others then
    if sqlstate in ('22023', '42501', 'P0001', 'P0002') then
      return jsonb_build_object('ok', false, 'error', sqlerrm);
    end if;
    raise;
end;
$$;

drop function if exists private.mcp_dispatch_catalog(uuid, text, jsonb);
