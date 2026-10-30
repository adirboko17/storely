-- Real product and logo files for the MCP, plus graphics the popup can display.

create table if not exists public.design_assets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  bucket text not null,
  path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null,
  width integer not null,
  height integer not null,
  category text not null,
  created_at timestamptz not null default now(),
  constraint design_assets_store_pair unique (store_id, id),
  constraint design_assets_bucket_check check (bucket in ('email-media', 'product-media')),
  constraint design_assets_category_check check (category in ('popup', 'banner', 'product', 'general')),
  constraint design_assets_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint design_assets_size_check check (byte_size > 0 and byte_size <= 4194304),
  constraint design_assets_dimension_check check (width between 1 and 8000 and height between 1 and 8000),
  constraint design_assets_path_check check (position('..' in path) = 0 and position(chr(92) in path) = 0 and split_part(path, '/', 1) = store_id::text)
);

create index if not exists design_assets_store_created_idx
  on public.design_assets (store_id, created_at desc);

alter table public.design_assets enable row level security;
alter table public.design_assets force row level security;
revoke all on table public.design_assets from public, anon, authenticated;

create or replace function private.mcp_owned_media(target_store uuid, raw text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  value text := left(btrim(coalesce(raw, '')), 500);
  host text := 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/';
  rest text;
  media_bucket text;
  object_path text;
begin
  if value = '' then
    return null;
  end if;
  if left(value, length(host)) = host then
    rest := split_part(substring(value from length(host) + 1), '?', 1);
    media_bucket := split_part(rest, '/', 1);
    object_path := substring(rest from length(media_bucket) + 2);
    if media_bucket not in ('product-media', 'email-media')
      or split_part(object_path, '/', 1) is distinct from target_store::text
      or position('..' in object_path) > 0
      or position(chr(92) in object_path) > 0
      or object_path !~ '^[A-Za-z0-9._/-]+$'
    then
      raise exception 'אין גישה לקובץ של חנות אחרת' using errcode = '42501';
    end if;
    return jsonb_build_object('bucket', media_bucket, 'path', object_path, 'publicUrl', host || media_bucket || '/' || object_path);
  end if;
  if left(value, 8) <> 'https://' and left(value, 7) <> 'http://'
    and split_part(value, '/', 1) = target_store::text
    and position('..' in value) = 0
    and position(chr(92) in value) = 0
    and value ~ '^[A-Za-z0-9._/-]+$'
  then
    return jsonb_build_object('bucket', 'product-media', 'path', value, 'publicUrl', host || 'product-media/' || value);
  end if;
  if left(value, 8) = 'https://' and value !~ '[[:space:]]' then
    return jsonb_build_object('external', true, 'publicUrl', value);
  end if;
  raise exception 'נתיב מדיה לא תקין' using errcode = '22023';
end;
$$;

revoke all on function private.mcp_owned_media(uuid, text) from public, anon, authenticated;

create or replace function private.mcp_bind_popup_blocks(target_store uuid, blocks jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  bound jsonb := '[]'::jsonb;
  item jsonb;
  column_item jsonb;
  child jsonb;
  columns jsonb;
  column_blocks jsonb;
  owned jsonb;
  asset_id uuid;
  media_bucket text;
  object_path text;
begin
  if jsonb_typeof(blocks) <> 'array' then
    raise exception 'בלוקים לא תקינים' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if jsonb_typeof(item) <> 'object' then
      bound := bound || jsonb_build_array(item);
      continue;
    end if;
    if item->>'type' = 'row' and jsonb_typeof(item->'columns') = 'array' then
      columns := '[]'::jsonb;
      for column_item in select value from jsonb_array_elements(item->'columns') loop
        column_blocks := '[]'::jsonb;
        if jsonb_typeof(column_item) = 'object' and jsonb_typeof(column_item->'blocks') = 'array' then
          for child in select value from jsonb_array_elements(column_item->'blocks') loop
            column_blocks := column_blocks || jsonb_build_array(private.mcp_bind_popup_block(target_store, child));
          end loop;
          column_item := column_item || jsonb_build_object('blocks', column_blocks);
        end if;
        columns := columns || jsonb_build_array(column_item);
      end loop;
      item := item || jsonb_build_object('columns', columns);
    elsif item->>'type' in ('image', 'logo') then
      item := private.mcp_bind_popup_block(target_store, item);
    end if;
    bound := bound || jsonb_build_array(item);
  end loop;
  return bound;
end;
$$;

revoke all on function private.mcp_bind_popup_blocks(uuid, jsonb) from public, anon, authenticated;

create or replace function private.mcp_bind_popup_block(target_store uuid, item jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  asset_id uuid;
  media_bucket text;
  object_path text;
  owned jsonb;
begin
  if jsonb_typeof(item) <> 'object' or item->>'type' not in ('image', 'logo') then
    return item;
  end if;
  asset_id := private.mcp_uuid(item, 'assetId');
  if asset_id is not null then
    select asset.bucket, asset.path
    into media_bucket, object_path
    from public.design_assets as asset
    where asset.store_id = target_store
      and asset.id = asset_id;
    if media_bucket is null then
      raise exception 'הנכס לא נמצא בחנות' using errcode = 'P0002';
    end if;
    return (item - 'assetId') || jsonb_build_object(
      'src', 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/' || media_bucket || '/' || object_path
    );
  end if;
  if btrim(coalesce(item->>'src', '')) = '' then
    return item;
  end if;
  owned := private.mcp_owned_media(target_store, item->>'src');
  if owned is null then
    return item;
  end if;
  return item || jsonb_build_object('src', owned->>'publicUrl');
end;
$$;

revoke all on function private.mcp_bind_popup_block(uuid, jsonb) from public, anon, authenticated;

create or replace function private.mcp_product_still(target_store uuid, wanted_id uuid, image_index integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  product_title text;
  object_path text;
  image_at integer;
begin
  select product.title
  into product_title
  from public.products as product
  where product.store_id = target_store
    and product.id = wanted_id;
  if product_title is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'המוצר לא נמצא');
  end if;
  select media.path, media.position
  into object_path, image_at
  from public.product_media as media
  where media.store_id = target_store
    and media.product_id = wanted_id
    and lower(media.path) !~ '\.(mp4|mov|webm)$'
  order by media.position, media.id
  offset image_index
  limit 1;
  if object_path is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'אין תמונה במקום הזה');
  end if;
  if split_part(object_path, '/', 1) is distinct from target_store::text then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION', 'error', 'הקובץ לא שייך לחנות הזו');
  end if;
  return jsonb_build_object(
    'ok', true,
    'file', jsonb_build_object(
      'bucket', 'product-media',
      'path', object_path,
      'publicUrl', 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/product-media/' || object_path,
      'productId', wanted_id,
      'title', product_title,
      'imageIndex', image_index,
      'role', 'product'
    )
  );
end;
$$;

revoke all on function private.mcp_product_still(uuid, uuid, integer) from public, anon, authenticated;

create or replace function private.mcp_media(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  denied jsonb;
  wanted_id uuid;
  image_index integer;
  size_name text;
  files jsonb := '[]'::jsonb;
  errors jsonb := '[]'::jsonb;
  entry jsonb;
  found jsonb;
  brand_name text;
  logo text;
  colors jsonb;
  owned jsonb;
  asset_id uuid;
  category text;
  mime_type text;
  extension text;
  file_name text;
  object_path text;
  byte_size integer;
  image_width integer;
  image_height integer;
begin
  size_name := coalesce(nullif(args->>'size', ''), 'medium');
  if size_name not in ('thumbnail', 'medium', 'original') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'גודל התמונה יכול להיות thumbnail, medium או original');
  end if;
  image_index := coalesce(trunc(private.mcp_num(args, 'imageIndex'))::integer, 0);
  if image_index < 0 or image_index > 40 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'מספר התמונה לא תקין');
  end if;

  if tool_name = 'get_product_image' or tool_name = 'get_product_images' then
    denied := private.mcp_denied(target_store, 'products.read');
    if denied is not null then
      return denied;
    end if;
    if tool_name = 'get_product_image' then
      wanted_id := private.mcp_uuid(args, 'productId');
      if wanted_id is null then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר מזהה מוצר');
      end if;
      found := private.mcp_product_still(target_store, wanted_id, image_index);
      if found->>'ok' <> 'true' then
        return found;
      end if;
      files := jsonb_build_array(found->'file');
    else
      if jsonb_typeof(args->'productIds') <> 'array' or jsonb_array_length(args->'productIds') < 1 or jsonb_array_length(args->'productIds') > 5 then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'אפשר לבקש בין מוצר אחד לחמישה');
      end if;
      for entry in select value from jsonb_array_elements(args->'productIds') loop
        if jsonb_typeof(entry) <> 'string' or entry#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          errors := errors || jsonb_build_array(jsonb_build_object('code', 'VALIDATION', 'error', 'מזהה מוצר לא תקין'));
          continue;
        end if;
        found := private.mcp_product_still(target_store, (entry#>>'{}')::uuid, image_index);
        if found->>'ok' = 'true' then
          files := files || jsonb_build_array(found->'file');
        else
          errors := errors || jsonb_build_array(jsonb_build_object('productId', entry#>>'{}', 'code', found->>'code', 'error', found->>'error'));
        end if;
      end loop;
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'deliver', 'images', 'size', size_name, 'storeId', target_store, 'files', files, 'errors', errors
    ));
  end if;

  if tool_name = 'get_brand_assets' then
    if private.mcp_denied(target_store, 'settings.manage') is not null
      and private.mcp_denied(target_store, 'marketing.read') is not null
      and private.mcp_denied(target_store, 'products.read') is not null
    then
      return private.mcp_denied(target_store, 'settings.manage');
    end if;
    select coalesce(settings.display_name, store.name), settings.logo_url, settings.brand_colors
    into brand_name, logo, colors
    from public.store_settings as settings
    join public.stores as store on store.id = settings.store_id
    where settings.store_id = target_store;
    if brand_name is null then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'החנות לא נמצאה');
    end if;
    if btrim(coalesce(logo, '')) <> '' then
      owned := private.mcp_owned_media(target_store, logo);
      if owned ? 'bucket' then
        files := jsonb_build_array(owned || jsonb_build_object('role', 'logo', 'title', brand_name));
      else
        errors := jsonb_build_array(jsonb_build_object('code', 'VALIDATION', 'error', 'הלוגו השמור אינו קובץ במדיה של החנות'));
      end if;
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'deliver', 'images',
      'size', size_name,
      'storeId', target_store,
      'files', files,
      'errors', errors,
      'brandName', brand_name,
      'brandColors', coalesce(colors, '[]'::jsonb),
      'logoUrl', nullif(logo, ''),
      'logoLightUrl', null,
      'logoDarkUrl', null,
      'faviconUrl', null,
      'note', 'החנות שומרת לוגו אחד, זה שמוצג באתר. אין לוגו בהיר, לוגו כהה או favicon נפרדים.'
    ));
  end if;

  category := args->>'category';
  if category not in ('popup', 'banner', 'product', 'general') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'קטגוריית הקובץ לא תקינה');
  end if;
  denied := private.mcp_denied(target_store, case when category = 'product' then 'products.update' else 'marketing.read' end);
  if denied is not null then
    return denied;
  end if;

  if tool_name = 'discard_design_upload' then
    asset_id := private.mcp_uuid(args, 'assetId');
    if asset_id is not null then
      delete from public.design_assets as asset
      where asset.store_id = target_store
        and asset.id = asset_id;
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('discarded', true));
  end if;

  if tool_name <> 'reserve_design_upload' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'כלי לא מוכר');
  end if;

  mime_type := args->>'mimeType';
  if mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'אפשר להעלות רק JPEG, PNG או WebP');
  end if;
  file_name := left(btrim(coalesce(args->>'fileName', '')), 80);
  if file_name = '' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר שם קובץ');
  end if;
  asset_id := private.mcp_uuid(args, 'assetId');
  if asset_id is null then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('storeId', target_store, 'assetId', gen_random_uuid()));
  end if;

  extension := args->>'extension';
  if (mime_type = 'image/jpeg' and extension <> 'jpg')
    or (mime_type = 'image/png' and extension <> 'png')
    or (mime_type = 'image/webp' and extension <> 'webp')
  then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'סוג הקובץ לא תואם את התוכן');
  end if;
  byte_size := trunc(private.mcp_num(args, 'byteSize'))::integer;
  image_width := trunc(private.mcp_num(args, 'width'))::integer;
  image_height := trunc(private.mcp_num(args, 'height'))::integer;
  if byte_size is null or byte_size < 1 or byte_size > 4194304 or image_width is null or image_height is null
    or image_width < 1 or image_height < 1 or image_width > 8000 or image_height > 8000
  then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'גודל התמונה לא תקין');
  end if;
  object_path := target_store::text || '/' || case when category = 'popup' then 'popups' else 'design/' || category end || '/' || asset_id::text || '.' || extension;
  insert into public.design_assets (id, store_id, bucket, path, file_name, mime_type, byte_size, width, height, category)
  values (asset_id, target_store, 'email-media', object_path, file_name, mime_type, byte_size, image_width, image_height, category);
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'assetId', asset_id,
    'storeId', target_store,
    'bucket', 'email-media',
    'path', object_path,
    'publicUrl', 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/email-media/' || object_path,
    'width', image_width,
    'height', image_height,
    'mimeType', mime_type
  ));
end;
$$;

revoke all on function private.mcp_media(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_dispatch(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tool_name in (
    'get_product_image', 'get_product_images', 'get_brand_assets',
    'reserve_design_upload', 'discard_design_upload'
  ) then
    return private.mcp_media(target_store, tool_name, args);
  end if;
  if tool_name in (
    'list_popups', 'get_popup', 'create_popup', 'update_popup', 'publish_popup', 'preview_popup',
    'get_popup_analytics', 'duplicate_popup', 'delete_popup',
    'create_discount', 'update_discount', 'deactivate_discount', 'list_promotions', 'create_promotion', 'update_promotion',
    'list_bundles', 'create_bundle', 'update_bundle',
    'list_reviews', 'get_review', 'create_review', 'moderate_review',
    'list_pages', 'create_page', 'update_page', 'update_seo', 'get_seo_audit',
    'get_checkout_settings', 'update_checkout_settings', 'update_cart_rules', 'list_abandoned_carts', 'get_abandoned_cart',
    'list_shipping_methods', 'upsert_shipping_method', 'get_inventory', 'adjust_inventory', 'bulk_update_inventory', 'list_shipments',
    'list_campaigns', 'create_campaign', 'update_campaign', 'list_automations', 'upsert_automation', 'create_segment',
    'send_test_message', 'get_campaign_analytics', 'list_message_templates', 'create_message_template',
    'get_sales_analytics', 'get_product_analytics', 'get_customer_analytics', 'get_conversion_funnel', 'export_report',
    'get_store_settings', 'update_store_settings', 'list_admin_roles', 'get_audit_log',
    'list_media', 'import_media', 'delete_media', 'get_design_schema'
  ) then
    return private.mcp_growth(target_store, tool_name, args);
  end if;
  return private.mcp_dispatch_core(target_store, tool_name, args);
end;
$$;

revoke all on function private.mcp_dispatch(uuid, text, jsonb) from public, anon, authenticated;

do $bind_popup_media$
declare
  src text;
  marker text := 'if args ? ''blocks'' then design_raw := design_raw || jsonb_build_object(''blocks'', args->''blocks''); end if;';
  bound text := 'if args ? ''blocks'' then design_raw := design_raw || jsonb_build_object(''blocks'', private.mcp_bind_popup_blocks(target_store, args->''blocks'')); end if;';
  mobile text := 'if jsonb_typeof(args->''mobile'') = ''object'' then design_raw := design_raw || jsonb_build_object(''mobile'', args->''mobile''); end if;';
  extra text := E'\n  if jsonb_typeof(design_raw->''blocks'') = ''array'' and not (args ? ''blocks'') then\n    design_raw := design_raw || jsonb_build_object(''blocks'', private.mcp_bind_popup_blocks(target_store, design_raw->''blocks''));\n  end if;';
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'mcp_save_popup';
  if position('mcp_bind_popup_blocks' in src) = 0 then
    if position(marker in src) = 0 or position(mobile in src) = 0 then
      raise exception 'popup save markers were not found';
    end if;
    src := replace(src, marker, bound);
    src := replace(src, mobile, mobile || extra);
    execute src;
  end if;
end
$bind_popup_media$;
