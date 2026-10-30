-- Richer popup blocks for the existing popup renderer.
-- Old blocks stay valid. New keys are a fixed style list, never raw HTML or CSS.

create table if not exists public.popup_revisions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  popup_id uuid not null,
  design jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, popup_id) references public.store_popups (store_id, id) on delete cascade,
  check (jsonb_typeof(design) = 'object'),
  check (octet_length(design::text) <= 200000)
);

create index if not exists popup_revisions_popup_idx
  on public.popup_revisions (store_id, popup_id, created_at desc);

alter table public.popup_revisions enable row level security;
alter table public.popup_revisions force row level security;
revoke all on table public.popup_revisions from public, anon, authenticated;

alter table public.store_popup_leads
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists source text not null default 'popup';

alter table public.store_popup_leads drop constraint if exists store_popup_leads_source_check;
alter table public.store_popup_leads
  add constraint store_popup_leads_source_check
  check (source ~ '^[a-z0-9_-]{1,32}$');

create or replace function private.snapshot_popup_design()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.design is distinct from new.design then
    insert into public.popup_revisions (store_id, popup_id, design)
    values (old.store_id, old.id, old.design);
    delete from public.popup_revisions as revision
    where revision.id in (
      select old_revision.id
      from public.popup_revisions as old_revision
      where old_revision.store_id = old.store_id
        and old_revision.popup_id = old.id
      order by old_revision.created_at desc
      offset 20
    );
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_popup_design() from public, anon, authenticated;

drop trigger if exists store_popups_snapshot on public.store_popups;
create trigger store_popups_snapshot
  before update on public.store_popups
  for each row execute function private.snapshot_popup_design();

create or replace function private.mcp_popup_style(item jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  result jsonb := '{}'::jsonb;
  stop jsonb;
  stops jsonb := '[]'::jsonb;
  angle numeric;
  weight numeric;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    return null;
  end if;
  if item ? 'width' then result := result || jsonb_build_object('width', private.mcp_clamp(private.mcp_num(item, 'width'), 0, 1200, 0)); end if;
  if item ? 'height' then result := result || jsonb_build_object('height', private.mcp_clamp(private.mcp_num(item, 'height'), 0, 1200, 0)); end if;
  if item ? 'padding' then result := result || jsonb_build_object('padding', private.mcp_clamp(private.mcp_num(item, 'padding'), 0, 80, 0)); end if;
  if item ? 'margin' then result := result || jsonb_build_object('margin', private.mcp_clamp(private.mcp_num(item, 'margin'), 0, 80, 0)); end if;
  if item ? 'gap' then result := result || jsonb_build_object('gap', private.mcp_clamp(private.mcp_num(item, 'gap'), 0, 64, 0)); end if;
  if item ? 'background' then result := result || jsonb_build_object('background', private.mcp_hex(item->>'background', '#ffffff')); end if;
  if item ? 'color' then result := result || jsonb_build_object('color', private.mcp_hex(item->>'color', '#1a1a1a')); end if;
  if item ? 'borderColor' then result := result || jsonb_build_object('borderColor', private.mcp_hex(item->>'borderColor', '#1a1a1a')); end if;
  if item ? 'borderWidth' then result := result || jsonb_build_object('borderWidth', private.mcp_clamp(private.mcp_num(item, 'borderWidth'), 0, 12, 0)); end if;
  if item ? 'radius' then result := result || jsonb_build_object('radius', private.mcp_clamp(private.mcp_num(item, 'radius'), 0, 999, 0)); end if;
  if item ? 'opacity' then result := result || jsonb_build_object('opacity', private.mcp_clamp(private.mcp_num(item, 'opacity'), 0, 100, 100)); end if;
  if item ? 'z' then result := result || jsonb_build_object('z', private.mcp_clamp(private.mcp_num(item, 'z'), 0, 40, 0)); end if;
  if item ? 'rotate' then result := result || jsonb_build_object('rotate', private.mcp_clamp(private.mcp_num(item, 'rotate'), -30, 30, 0)); end if;
  if item ? 'order' then result := result || jsonb_build_object('order', private.mcp_clamp(private.mcp_num(item, 'order'), 0, 20, 0)); end if;
  if item ? 'fontSize' then result := result || jsonb_build_object('fontSize', private.mcp_clamp(private.mcp_num(item, 'fontSize'), 11, 64, 16)); end if;
  if item ? 'lineHeight' and private.mcp_num(item, 'lineHeight') is not null then
    result := result || jsonb_build_object('lineHeight', least(2, greatest(1, round(private.mcp_num(item, 'lineHeight'), 2))));
  end if;
  if item ? 'letterSpacing' and private.mcp_num(item, 'letterSpacing') is not null then
    result := result || jsonb_build_object('letterSpacing', least(8, greatest(-1, round(private.mcp_num(item, 'letterSpacing'), 2))));
  end if;
  if item->>'shadow' in ('none', 'soft', 'medium', 'strong') then result := result || jsonb_build_object('shadow', item->>'shadow'); end if;
  if item->>'align' in ('start', 'center', 'end', 'stretch') then result := result || jsonb_build_object('align', item->>'align'); end if;
  if item->>'justify' in ('start', 'center', 'end', 'between') then result := result || jsonb_build_object('justify', item->>'justify'); end if;
  if item->>'direction' in ('row', 'column') then result := result || jsonb_build_object('direction', item->>'direction'); end if;
  if item->>'overflow' in ('visible', 'hidden') then result := result || jsonb_build_object('overflow', item->>'overflow'); end if;
  if item->>'fontFamily' in ('inherit', 'heebo', 'frank', 'playfair') then result := result || jsonb_build_object('fontFamily', item->>'fontFamily'); end if;
  if item->>'fit' in ('contain', 'cover') then result := result || jsonb_build_object('fit', item->>'fit'); end if;
  if item->>'position' in ('center', 'top', 'bottom') then result := result || jsonb_build_object('position', item->>'position'); end if;
  if item->>'aspect' in ('auto', '1/1', '3/4', '4/5', '16/9') then result := result || jsonb_build_object('aspect', item->>'aspect'); end if;
  if item->>'hide' in ('desktop', 'mobile') then result := result || jsonb_build_object('hide', item->>'hide'); end if;
  weight := private.mcp_num(item, 'fontWeight');
  if weight in (400, 500, 600, 700) then result := result || jsonb_build_object('fontWeight', weight); end if;
  if jsonb_typeof(item->'gradient') = 'object' and jsonb_typeof(item->'gradient'->'stops') = 'array' then
    angle := private.mcp_clamp(private.mcp_num(item->'gradient', 'angle'), 0, 360, 90);
    for stop in select value from jsonb_array_elements(item->'gradient'->'stops') loop
      exit when jsonb_array_length(stops) >= 4;
      if jsonb_typeof(stop) = 'object' and stop->>'color' ~ '^#[0-9A-Fa-f]{6}$' then
        stops := stops || jsonb_build_array(jsonb_build_object(
          'color', lower(stop->>'color'),
          'offset', private.mcp_clamp(private.mcp_num(stop, 'offset'), 0, 100, 0)
        ));
      end if;
    end loop;
    if jsonb_array_length(stops) >= 2 then
      result := result || jsonb_build_object('gradient', jsonb_build_object('angle', angle, 'stops', stops));
    end if;
  end if;
  if result = '{}'::jsonb then
    return null;
  end if;
  return result;
end;
$$;

revoke all on function private.mcp_popup_style(jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_decorate(source jsonb, built jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  styled jsonb;
  mobile_src text;
begin
  if built is null then
    return null;
  end if;
  styled := private.mcp_popup_style(source->'style');
  if styled is not null then
    built := built || jsonb_build_object('style', styled);
  end if;
  styled := private.mcp_popup_style(source->'mobile');
  if styled is not null then
    built := built || jsonb_build_object('mobile', styled);
  end if;
  mobile_src := left(btrim(coalesce(source->>'mobileSrc', '')), 500);
  if built->>'type' in ('image', 'logo', 'overlay') and mobile_src ~* '^https://[^[:space:]"''()<>]+$' then
    built := built || jsonb_build_object('mobileSrc', mobile_src);
  end if;
  return built;
end;
$$;

revoke all on function private.mcp_popup_decorate(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_block(item jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_variable
declare
  kind text;
  depth integer;
  block_id text;
  built jsonb;
  field_type text;
  field_name text;
  href text;
  src text;
  columns jsonb := '[]'::jsonb;
  column_item jsonb;
  column_blocks jsonb;
  child jsonb;
  built_child jsonb;
  blocks jsonb := '[]'::jsonb;
  column_index integer := 0;
  child_index integer := 0;
  seen text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    return null;
  end if;
  depth := coalesce(trunc(private.mcp_num(item, '_depth'))::integer, 0);
  if depth > 4 then
    return null;
  end if;
  item := item - '_depth';
  kind := coalesce(item->>'type', '');
  block_id := left(btrim(coalesce(item->>'id', '')), 80);
  if block_id = '' then
    block_id := gen_random_uuid()::text;
  end if;

  if kind in ('container', 'stack', 'overlay') then
    child_index := 0;
    for child in select value from jsonb_array_elements(case when jsonb_typeof(item->'blocks') = 'array' then item->'blocks' else '[]'::jsonb end) loop
      exit when child_index >= 8;
      built_child := private.mcp_popup_block(case when jsonb_typeof(child) = 'object' then child || jsonb_build_object('_depth', depth + 1) else '{}'::jsonb end);
      if built_child is not null then
        blocks := blocks || jsonb_build_array(built_child);
        child_index := child_index + 1;
      end if;
    end loop;
    if kind = 'overlay' then
      src := left(btrim(coalesce(item->>'src', '')), 500);
      if src !~* '^https://[^[:space:]"''()<>]+$' then
        src := '';
      end if;
      built := jsonb_build_object('id', block_id, 'type', 'overlay', 'span', 'full', 'src', src, 'alt', left(coalesce(item->>'alt', ''), 120), 'blocks', blocks);
    elsif kind = 'stack' then
      built := jsonb_build_object('id', block_id, 'type', 'stack', 'span', 'full', 'direction', case when item->>'direction' = 'row' then 'row' else 'column' end, 'blocks', blocks);
    else
      built := jsonb_build_object('id', block_id, 'type', 'container', 'span', 'full', 'blocks', blocks);
    end if;
  elsif kind in ('row', 'columns') then
    if jsonb_typeof(item->'columns') <> 'array' then
      return null;
    end if;
    for column_item in select value from jsonb_array_elements(item->'columns') loop
      exit when column_index >= case when kind = 'columns' then 3 else 4 end;
      if jsonb_typeof(column_item) is distinct from 'object' then
        continue;
      end if;
      column_blocks := '[]'::jsonb;
      child_index := 0;
      if jsonb_typeof(column_item->'blocks') = 'array' then
        for child in select value from jsonb_array_elements(column_item->'blocks') loop
          exit when child_index >= 8;
          built_child := private.mcp_popup_block(case when jsonb_typeof(child) = 'object' then child || jsonb_build_object('_depth', depth + 1) else '{}'::jsonb end);
          if built_child is not null then
            column_blocks := column_blocks || jsonb_build_array(built_child);
            child_index := child_index + 1;
          end if;
        end loop;
      end if;
      columns := columns || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(nullif(left(btrim(coalesce(column_item->>'id', '')), 80), ''), gen_random_uuid()::text),
        'width', private.mcp_clamp(private.mcp_num(column_item, 'width'), 15, 100, 50),
        'blocks', column_blocks,
        'mobileOrder', case when column_item ? 'mobileOrder' then private.mcp_clamp(private.mcp_num(column_item, 'mobileOrder'), -5, 20, 0) else null end
      )));
      column_index := column_index + 1;
    end loop;
    if jsonb_array_length(columns) = 0 then
      return null;
    end if;
    built := jsonb_build_object('id', block_id, 'type', kind, 'span', 'full', 'columns', columns);
  elsif kind = 'badge' then
    built := jsonb_build_object('id', block_id, 'type', 'badge', 'span', 'full', 'text', coalesce(nullif(left(coalesce(item->>'text', ''), 40), ''), 'מבצע'));
  elsif kind = 'divider' then
    built := jsonb_build_object('id', block_id, 'type', 'divider', 'span', 'full');
  elsif kind = 'icon' then
    built := jsonb_build_object('id', block_id, 'type', 'icon', 'span', 'full', 'name', case when item->>'name' in ('gift', 'star', 'check', 'mail', 'heart', 'leaf', 'spark') then item->>'name' else 'spark' end);
  elsif kind = 'shape' then
    built := jsonb_build_object('id', block_id, 'type', 'shape', 'span', 'full', 'kind', case when item->>'kind' in ('ellipse', 'line') then item->>'kind' else 'rect' end);
  elsif kind = 'heading' then
    built := jsonb_build_object(
      'id', block_id, 'type', 'heading', 'text', left(coalesce(item->>'text', ''), 160),
      'color', private.mcp_hex(item->>'color', '#1a1a1a'),
      'size', private.mcp_clamp(private.mcp_num(item, 'size'), 16, 48, 28),
      'align', case when item->>'align' in ('center', 'left') then item->>'align' else 'right' end,
      'weight', case when item->>'weight' = 'regular' then 'regular' else 'bold' end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  elsif kind = 'text' then
    built := jsonb_build_object(
      'id', block_id, 'type', 'text', 'text', left(coalesce(item->>'text', ''), 800),
      'color', private.mcp_hex(item->>'color', '#4a4a4a'),
      'size', private.mcp_clamp(private.mcp_num(item, 'size'), 12, 24, 15),
      'align', case when item->>'align' in ('center', 'left') then item->>'align' else 'right' end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  elsif kind = 'image' then
    src := left(btrim(coalesce(item->>'src', '')), 500);
    if src !~* '^https://[^[:space:]"''()<>]+$' then src := ''; end if;
    built := jsonb_build_object(
      'id', block_id, 'type', 'image', 'src', src, 'alt', left(coalesce(item->>'alt', ''), 120),
      'radius', private.mcp_clamp(private.mcp_num(item, 'radius'), 0, 40, 12),
      'width', private.mcp_clamp(private.mcp_num(item, 'width'), 10, 100, 100),
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  elsif kind = 'logo' then
    src := left(btrim(coalesce(item->>'src', '')), 500);
    if src !~* '^https://[^[:space:]"''()<>]+$' then src := ''; end if;
    built := jsonb_build_object(
      'id', block_id, 'type', 'logo', 'src', src,
      'width', private.mcp_clamp(private.mcp_num(item, 'width'), 24, 220, 112),
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  elsif kind = 'button' then
    href := left(btrim(coalesce(item->>'href', '')), 300);
    if not (
      (left(href, 1) = '/' and left(href, 2) <> '//')
      or href ~* '^https://'
      or href ~* '^mailto:[^[:space:]]+$'
      or href ~* '^tel:\+?[0-9-]{6,20}$'
    ) then
      href := '';
    end if;
    built := jsonb_build_object(
      'id', block_id, 'type', 'button',
      'label', coalesce(nullif(left(coalesce(item->>'label', ''), 40), ''), 'לחצו כאן'),
      'href', href,
      'background', private.mcp_hex(item->>'background', '#1a1a1a'),
      'color', private.mcp_hex(item->>'color', '#ffffff'),
      'radius', case when private.mcp_num(item, 'radius') = 999 then 999 else private.mcp_clamp(private.mcp_num(item, 'radius'), 0, 28, 12) end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  elsif kind = 'field' then
    field_type := case when item->>'fieldType' in ('email', 'tel', 'textarea', 'consent') then item->>'fieldType' else 'text' end;
    field_name := lower(btrim(coalesce(item->>'name', '')));
    if field_name !~ '^[a-z][a-z0-9_]{0,31}$' then
      field_name := case field_type when 'email' then 'email' when 'tel' then 'phone' when 'textarea' then 'note' when 'consent' then 'consent' else 'name' end;
    end if;
    seen := coalesce(current_setting('storely.popup_fields', true), '');
    if position(',' || field_name || ',' in ',' || seen || ',') > 0 then
      raise exception 'לכל שדה צריך שם שונה' using errcode = '22023';
    end if;
    perform set_config('storely.popup_fields', seen || ',' || field_name, true);
    built := jsonb_build_object(
      'id', block_id, 'type', 'field', 'fieldType', field_type,
      'label', left(coalesce(item->>'label', ''), 80),
      'name', field_name,
      'placeholder', left(coalesce(item->>'placeholder', ''), 80),
      'required', case when item->'required' = 'false'::jsonb then false else true end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  elsif kind = 'spacer' then
    built := jsonb_build_object(
      'id', block_id, 'type', 'spacer',
      'height', private.mcp_clamp(private.mcp_num(item, 'height'), 4, 80, 16),
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  return private.mcp_popup_decorate(item, built);
end;
$$;

revoke all on function private.mcp_popup_block(jsonb) from public, anon, authenticated;

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
  product_id uuid;
  image_index integer;
  found jsonb;
begin
  if jsonb_typeof(item) <> 'object' or item->>'type' not in ('image', 'logo', 'overlay') then
    return item;
  end if;
  product_id := private.mcp_uuid(item, 'productId');
  if product_id is not null then
    image_index := coalesce(trunc(private.mcp_num(item, 'imageIndex'))::integer, 0);
    found := private.mcp_product_still(target_store, product_id, image_index);
    if found->>'ok' <> 'true' then
      raise exception '%', coalesce(found->>'error', 'המוצר לא נמצא') using errcode = 'P0002';
    end if;
    item := (item - 'productId' - 'imageIndex') || jsonb_build_object('src', found->'file'->>'publicUrl');
  end if;
  asset_id := private.mcp_uuid(item, 'assetId');
  if asset_id is not null then
    select asset.bucket, asset.path into media_bucket, object_path
    from public.design_assets as asset
    where asset.store_id = target_store and asset.id = asset_id;
    if media_bucket is null then
      raise exception 'הנכס לא נמצא בחנות' using errcode = 'P0002';
    end if;
    item := (item - 'assetId') || jsonb_build_object(
      'src', 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/' || media_bucket || '/' || object_path
    );
  elsif btrim(coalesce(item->>'src', '')) <> '' then
    owned := private.mcp_owned_media(target_store, item->>'src');
    if owned is not null then
      item := item || jsonb_build_object('src', owned->>'publicUrl');
    end if;
  end if;
  asset_id := private.mcp_uuid(item, 'mobileAssetId');
  if asset_id is not null then
    select asset.bucket, asset.path into media_bucket, object_path
    from public.design_assets as asset
    where asset.store_id = target_store and asset.id = asset_id;
    if media_bucket is null then
      raise exception 'הנכס לא נמצא בחנות' using errcode = 'P0002';
    end if;
    item := (item - 'mobileAssetId') || jsonb_build_object(
      'mobileSrc', 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/' || media_bucket || '/' || object_path
    );
  end if;
  return item;
end;
$$;

revoke all on function private.mcp_bind_popup_block(uuid, jsonb) from public, anon, authenticated;

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
  nested jsonb;
begin
  if jsonb_typeof(blocks) <> 'array' then
    raise exception 'בלוקים לא תקינים' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if jsonb_typeof(item) <> 'object' then
      bound := bound || jsonb_build_array(item);
      continue;
    end if;
    if item->>'type' in ('row', 'columns') and jsonb_typeof(item->'columns') = 'array' then
      columns := '[]'::jsonb;
      for column_item in select value from jsonb_array_elements(item->'columns') loop
        column_blocks := '[]'::jsonb;
        if jsonb_typeof(column_item) = 'object' and jsonb_typeof(column_item->'blocks') = 'array' then
          for child in select value from jsonb_array_elements(column_item->'blocks') loop
            nested := private.mcp_bind_popup_blocks(target_store, jsonb_build_array(child));
            column_blocks := column_blocks || nested;
          end loop;
          column_item := column_item || jsonb_build_object('blocks', column_blocks);
        end if;
        columns := columns || jsonb_build_array(column_item);
      end loop;
      item := item || jsonb_build_object('columns', columns);
    elsif item->>'type' in ('container', 'stack', 'overlay') and jsonb_typeof(item->'blocks') = 'array' then
      item := item || jsonb_build_object('blocks', private.mcp_bind_popup_blocks(target_store, item->'blocks'));
    end if;
    if item->>'type' in ('image', 'logo', 'overlay') then
      item := private.mcp_bind_popup_block(target_store, item);
    end if;
    bound := bound || jsonb_build_array(item);
  end loop;
  return bound;
end;
$$;

revoke all on function private.mcp_bind_popup_blocks(uuid, jsonb) from public, anon, authenticated;

do $popup_design_limits$
declare
  src text;
  coupon text := E'  if raw ? ''couponCode'' then\n    result := result || jsonb_build_object(''couponCode'', upper(substring(coalesce(raw->>''couponCode'', '''') from ''[A-Za-z0-9-]{1,24}'')));\n  end if;\n';
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'mcp_popup_design';
  src := replace(src, 'private.mcp_clamp(private.mcp_num(raw, ''width''), 280, 880, 420)', 'private.mcp_clamp(private.mcp_num(raw, ''width''), 280, 1100, 420)');
  src := replace(src, 'exit when index >= 24', 'exit when index >= 40');
  src := replace(src, 'octet_length(result::text) > 100000', 'octet_length(result::text) > 200000');
  if position('couponCode' in src) = 0 then
    src := replace(src, '  if raw ? ''blocks'' then', coupon || '  if raw ? ''blocks'' then' || E'\n    perform set_config(''storely.popup_fields'', '''', true);');
  end if;
  execute src;
end;
$popup_design_limits$;

create or replace function private.popup_subscribe(target_store uuid, email_key text, person_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid;
begin
  if email_key !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  select customer.id into customer_id
  from public.customers as customer
  where customer.store_id = target_store
    and lower(customer.email) = lower(email_key)
  order by customer.created_at
  limit 1;
  if customer_id is null then
    insert into public.customers (store_id, name, email, phone, subscribed, email_consent_status, email_consent_at, email_consent_source)
    values (target_store, left(coalesce(nullif(person_name, ''), email_key), 80), email_key, '', true, 'subscribed', pg_catalog.now(), 'popup');
    return;
  end if;
  update public.customers as customer
  set subscribed = true,
      email_consent_status = 'subscribed',
      email_consent_at = coalesce(customer.email_consent_at, pg_catalog.now()),
      email_consent_source = case when customer.email_consent_source = '' then 'popup' else customer.email_consent_source end
  where customer.store_id = target_store
    and customer.id = customer_id
    and customer.email_consent_status is distinct from 'subscribed';
end;
$$;

revoke all on function private.popup_subscribe(uuid, text, text) from public, anon, authenticated;

create or replace function private.popup_defined_fields(blocks jsonb)
returns table(field_name text, field_type text, required boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  item jsonb;
  column_item jsonb;
begin
  if jsonb_typeof(blocks) <> 'array' then
    return;
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if item->>'type' = 'field' then
      field_name := coalesce(item->>'name', '');
      field_type := coalesce(item->>'fieldType', 'text');
      required := item->'required' is distinct from 'false'::jsonb;
      return next;
    elsif item->>'type' in ('row', 'columns') and jsonb_typeof(item->'columns') = 'array' then
      for column_item in select value from jsonb_array_elements(item->'columns') loop
        if jsonb_typeof(column_item) = 'object' then
          return query select * from private.popup_defined_fields(column_item->'blocks');
        end if;
      end loop;
    elsif item->>'type' in ('container', 'stack', 'overlay') then
      return query select * from private.popup_defined_fields(item->'blocks');
    end if;
  end loop;
end;
$$;

revoke all on function private.popup_defined_fields(jsonb) from public, anon, authenticated;

create or replace function public.submit_store_popup_lead(
  tracking_key text,
  hostname text,
  popup_id uuid,
  fields jsonb,
  page_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  popup public.store_popups%rowtype;
  rec record;
  clean_fields jsonb := '{}'::jsonb;
  clean_text text;
  clean_path text;
  recent_count integer;
  field_row record;
  lead_source text;
  consented boolean := false;
begin
  if popup_id is null or jsonb_typeof(coalesce(fields, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'חסרים פרטים');
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;
  select * into popup
  from public.store_popups as row
  where row.store_id = found_store
    and row.id = popup_id
    and row.status = 'active'
    and (row.starts_at is null or row.starts_at <= now())
    and (row.ends_at is null or row.ends_at > now());
  if popup.id is null then
    return jsonb_build_object('ok', false, 'reason', 'הפופאפ לא פעיל');
  end if;
  if not exists (
    select 1 from private.popup_defined_fields(popup.design->'blocks') as defined
  ) then
    return jsonb_build_object('ok', false, 'reason', 'לפופאפ הזה אין טופס');
  end if;
  for rec in select entry.key, entry.value from jsonb_each(fields) as entry(key, value) loop
    if rec.key ~ '^[a-z][a-z0-9_]{0,31}$' and jsonb_typeof(rec.value) = 'string' then
      clean_text := left(btrim(rec.value #>> '{}'), 400);
      if clean_text <> '' then
        clean_fields := clean_fields || jsonb_build_object(rec.key, clean_text);
      end if;
    end if;
    if (select count(*) from jsonb_object_keys(clean_fields)) >= 12 then
      exit;
    end if;
  end loop;
  for field_row in select * from private.popup_defined_fields(popup.design->'blocks') loop
    if field_row.required and coalesce(clean_fields->>field_row.field_name, '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'חסרים פרטים');
    end if;
    if field_row.field_type = 'email' and coalesce(clean_fields->>field_row.field_name, '') <> ''
      and clean_fields->>field_row.field_name !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      return jsonb_build_object('ok', false, 'reason', 'האימייל לא תקין');
    end if;
    if field_row.field_type = 'consent' and lower(coalesce(clean_fields->>field_row.field_name, '')) in ('yes', 'true', '1') then
      consented := true;
    end if;
    if field_row.field_type = 'consent' and field_row.required
      and lower(coalesce(clean_fields->>field_row.field_name, '')) not in ('yes', 'true', '1') then
      return jsonb_build_object('ok', false, 'reason', 'צריך לאשר קבלת דיוור');
    end if;
  end loop;
  if clean_fields ? 'email' and exists (
    select 1 from public.store_popup_leads as lead
    where lead.store_id = found_store
      and lead.popup_id = popup.id
      and lower(lead.fields->>'email') = lower(clean_fields->>'email')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'הכתובת הזו כבר רשומה');
  end if;
  clean_path := left(btrim(coalesce(page_path, '/')), 200);
  if clean_path = '' or left(clean_path, 1) <> '/' or left(clean_path, 2) = '//' then
    clean_path := '/';
  end if;
  lead_source := lower(coalesce(clean_fields->>'source', 'popup'));
  if lead_source !~ '^[a-z0-9_-]{1,32}$' then
    lead_source := 'popup';
  end if;
  select count(*) into recent_count
  from public.store_popup_leads as lead
  where lead.store_id = found_store and lead.popup_id = popup.id and lead.created_at > now() - interval '1 minute';
  if recent_count >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'נסו שוב בעוד רגע');
  end if;
  insert into public.store_popup_leads (store_id, popup_id, page_path, fields, marketing_consent, source)
  values (found_store, popup.id, clean_path, clean_fields, consented, lead_source);
  if consented and clean_fields ? 'email' then
    perform private.popup_subscribe(found_store, clean_fields->>'email', coalesce(clean_fields->>'name', ''));
  end if;
  if consented and coalesce(popup.design->>'couponCode', '') <> '' then
    return jsonb_build_object('ok', true, 'coupon', popup.design->>'couponCode');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_store_popup_lead(text, text, uuid, jsonb, text) from public;
grant execute on function public.submit_store_popup_lead(text, text, uuid, jsonb, text) to anon, authenticated;

create or replace function private.mcp_popup_patch_tree(blocks jsonb, block_id text, patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  next_blocks jsonb := '[]'::jsonb;
  column_item jsonb;
  columns jsonb;
  column_blocks jsonb;
  child jsonb;
begin
  if jsonb_typeof(blocks) <> 'array' then
    return '[]'::jsonb;
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if jsonb_typeof(item) = 'object' and item->>'id' = block_id then
      item := item || patch || jsonb_build_object('id', block_id);
    elsif jsonb_typeof(item) = 'object' and item->>'type' in ('row', 'columns') and jsonb_typeof(item->'columns') = 'array' then
      columns := '[]'::jsonb;
      for column_item in select value from jsonb_array_elements(item->'columns') loop
        column_blocks := private.mcp_popup_patch_tree(coalesce(column_item->'blocks', '[]'::jsonb), block_id, patch);
        columns := columns || jsonb_build_array(column_item || jsonb_build_object('blocks', column_blocks));
      end loop;
      item := item || jsonb_build_object('columns', columns);
    elsif jsonb_typeof(item) = 'object' and item->>'type' in ('container', 'stack', 'overlay') then
      item := item || jsonb_build_object('blocks', private.mcp_popup_patch_tree(coalesce(item->'blocks', '[]'::jsonb), block_id, patch));
    end if;
    next_blocks := next_blocks || jsonb_build_array(item);
  end loop;
  return next_blocks;
end;
$$;

revoke all on function private.mcp_popup_patch_tree(jsonb, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_reorder(blocks jsonb, ids jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  ordered jsonb := '[]'::jsonb;
  wanted text;
  item jsonb;
  used text[] := '{}';
begin
  if jsonb_typeof(ids) = 'array' then
    for wanted in select value #>> '{}' from jsonb_array_elements(ids) loop
      for item in select value from jsonb_array_elements(blocks) loop
        if item->>'id' = wanted and not (wanted = any(used)) then
          ordered := ordered || jsonb_build_array(item);
          used := used || wanted;
        end if;
      end loop;
    end loop;
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if not (coalesce(item->>'id', '') = any(used)) then
      ordered := ordered || jsonb_build_array(item);
    end if;
  end loop;
  return ordered;
end;
$$;

revoke all on function private.mcp_popup_reorder(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_reorder_tree(blocks jsonb, parent_id text, ids jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  next_blocks jsonb := '[]'::jsonb;
  column_item jsonb;
  columns jsonb;
begin
  if parent_id is null or parent_id = '' then
    return private.mcp_popup_reorder(blocks, ids);
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if jsonb_typeof(item) = 'object' and item->>'id' = parent_id and item->>'type' in ('container', 'stack', 'overlay') then
      item := item || jsonb_build_object('blocks', private.mcp_popup_reorder(coalesce(item->'blocks', '[]'::jsonb), ids));
    elsif jsonb_typeof(item) = 'object' and item->>'type' in ('row', 'columns') and jsonb_typeof(item->'columns') = 'array' then
      columns := '[]'::jsonb;
      for column_item in select value from jsonb_array_elements(item->'columns') loop
        if column_item->>'id' = parent_id then
          column_item := column_item || jsonb_build_object('blocks', private.mcp_popup_reorder(coalesce(column_item->'blocks', '[]'::jsonb), ids));
        else
          column_item := column_item || jsonb_build_object('blocks', private.mcp_popup_reorder_tree(coalesce(column_item->'blocks', '[]'::jsonb), parent_id, ids));
        end if;
        columns := columns || jsonb_build_array(column_item);
      end loop;
      item := item || jsonb_build_object('columns', columns);
    elsif jsonb_typeof(item) = 'object' and item->>'type' in ('container', 'stack', 'overlay') then
      item := item || jsonb_build_object('blocks', private.mcp_popup_reorder_tree(coalesce(item->'blocks', '[]'::jsonb), parent_id, ids));
    end if;
    next_blocks := next_blocks || jsonb_build_array(item);
  end loop;
  return next_blocks;
end;
$$;

revoke all on function private.mcp_popup_reorder_tree(jsonb, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_collect_urls(node jsonb, found jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  column_item jsonb;
  key text;
  src text;
begin
  if jsonb_typeof(node) = 'array' then
    for item in select value from jsonb_array_elements(node) loop
      found := private.mcp_popup_collect_urls(item, found);
    end loop;
    return found;
  end if;
  if jsonb_typeof(node) is distinct from 'object' then
    return found;
  end if;
  foreach key in array array['src', 'mobileSrc', 'backgroundImage', 'mediaImage'] loop
    src := node->>key;
    if src ~* '^https://' and not found ? src then
      found := found || jsonb_build_object(src, true);
    end if;
  end loop;
  if jsonb_typeof(node->'blocks') = 'array' then
    found := private.mcp_popup_collect_urls(node->'blocks', found);
  end if;
  if jsonb_typeof(node->'columns') = 'array' then
    for column_item in select value from jsonb_array_elements(node->'columns') loop
      found := private.mcp_popup_collect_urls(column_item, found);
    end loop;
  end if;
  return found;
end;
$$;

revoke all on function private.mcp_popup_collect_urls(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_studio(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  denied jsonb;
  popup public.store_popups%rowtype;
  popup_id uuid;
  block_id text;
  parent_id text;
  patched jsonb;
  cleaned jsonb;
  urls jsonb;
  revision_id uuid;
begin
  denied := private.mcp_denied(target_store, 'marketing.read');
  if denied is not null then
    return denied;
  end if;
  if tool_name = 'validate_popup_design' then
    if jsonb_typeof(args->'design') is distinct from 'object' and jsonb_typeof(args->'blocks') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר עיצוב לבדיקה');
    end if;
    begin
      perform set_config('storely.popup_fields', '', true);
      cleaned := private.mcp_popup_design(case when jsonb_typeof(args->'design') = 'object' then args->'design' else coalesce(args, '{}'::jsonb) end, '{}'::jsonb);
      return jsonb_build_object('ok', true, 'data', jsonb_build_object('valid', true, 'design', cleaned));
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', sqlerrm);
    end;
  end if;
  popup_id := private.mcp_uuid(args, 'id');
  if popup_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר מזהה פופאפ');
  end if;
  select popup_row.* into popup
  from public.store_popups as popup_row
  where popup_row.store_id = target_store and popup_row.id = popup_id
  for update;
  if popup.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'הפופאפ לא נמצא');
  end if;
  if tool_name = 'get_popup_assets' then
    urls := private.mcp_popup_collect_urls(popup.design, '{}'::jsonb);
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'id', popup.id,
      'assets', coalesce((select jsonb_agg(asset_key) from jsonb_object_keys(urls) as asset_key), '[]'::jsonb),
      'revisions', coalesce((
        select jsonb_agg(jsonb_build_object('id', revision.id, 'createdAt', revision.created_at) order by revision.created_at desc)
        from public.popup_revisions as revision
        where revision.store_id = target_store and revision.popup_id = popup.id
      ), '[]'::jsonb)
    ));
  end if;
  if popup.status = 'active' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'הפופאפ פעיל. העבירו אותו לטיוטה לפני שינוי עיצוב');
  end if;
  if tool_name = 'restore_popup_revision' then
    revision_id := private.mcp_uuid(args, 'revisionId');
    if revision_id is null then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר מזהה גרסה');
    end if;
    select revision.design into cleaned
    from public.popup_revisions as revision
    where revision.store_id = target_store and revision.popup_id = popup.id and revision.id = revision_id;
    if cleaned is null then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'הגרסה לא נמצאה');
    end if;
    update public.store_popups as popup_row
    set design = cleaned, updated_at = now()
    where popup_row.store_id = target_store and popup_row.id = popup.id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', popup.id, 'restored', revision_id, 'status', popup.status));
  end if;
  if tool_name = 'update_popup_block' then
    block_id := left(btrim(coalesce(args->>'blockId', '')), 80);
    if block_id = '' or jsonb_typeof(args->'block') is distinct from 'object' then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר בלוק לעדכון');
    end if;
    patched := private.mcp_popup_patch_tree(popup.design->'blocks', block_id, args->'block');
    if patched::text = (popup.design->'blocks')::text then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'הבלוק לא נמצא');
    end if;
  elsif tool_name = 'reorder_popup_blocks' then
    parent_id := left(btrim(coalesce(args->>'parentId', '')), 80);
    if jsonb_typeof(args->'blockIds') is distinct from 'array' then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'חסר סדר בלוקים');
    end if;
    patched := private.mcp_popup_reorder_tree(popup.design->'blocks', parent_id, args->'blockIds');
  else
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'כלי לא מוכר');
  end if;
  perform set_config('storely.popup_fields', '', true);
  cleaned := private.mcp_popup_design(
    jsonb_build_object('blocks', private.mcp_bind_popup_blocks(target_store, patched)),
    popup.design
  );
  update public.store_popups as popup_row
  set design = private.mcp_stamp_popup_logo(target_store, cleaned), updated_at = now()
  where popup_row.store_id = target_store and popup_row.id = popup.id;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', popup.id, 'status', popup.status));
end;
$$;

revoke all on function private.mcp_popup_studio(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_dispatch(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tool_name in (
    'update_popup_block', 'reorder_popup_blocks', 'restore_popup_revision',
    'get_popup_assets', 'validate_popup_design'
  ) then
    return private.mcp_popup_studio(target_store, tool_name, args);
  end if;
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

create or replace function private.mcp_stamp_popup_blocks(blocks jsonb, logo text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  next_blocks jsonb := '[]'::jsonb;
  item jsonb;
  columns jsonb;
  column_item jsonb;
begin
  if jsonb_typeof(blocks) <> 'array' then
    return '[]'::jsonb;
  end if;
  for item in select value from jsonb_array_elements(blocks) loop
    if jsonb_typeof(item) = 'object' and item->>'type' = 'logo' and coalesce(item->>'src', '') = '' then
      item := item || jsonb_build_object('src', left(logo, 500));
    end if;
    if jsonb_typeof(item) = 'object' and item->>'type' in ('row', 'columns') and jsonb_typeof(item->'columns') = 'array' then
      columns := '[]'::jsonb;
      for column_item in select value from jsonb_array_elements(item->'columns') loop
        columns := columns || jsonb_build_array(column_item || jsonb_build_object('blocks', private.mcp_stamp_popup_blocks(coalesce(column_item->'blocks', '[]'::jsonb), logo)));
      end loop;
      item := item || jsonb_build_object('columns', columns);
    elsif jsonb_typeof(item) = 'object' and item->>'type' in ('container', 'stack', 'overlay') then
      item := item || jsonb_build_object('blocks', private.mcp_stamp_popup_blocks(coalesce(item->'blocks', '[]'::jsonb), logo));
    end if;
    next_blocks := next_blocks || jsonb_build_array(item);
  end loop;
  return next_blocks;
end;
$$;

revoke all on function private.mcp_stamp_popup_blocks(jsonb, text) from public, anon, authenticated;

create or replace function private.mcp_stamp_popup_logo(target_store uuid, design jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  logo text;
begin
  select settings.logo_url into logo
  from public.store_settings as settings
  where settings.store_id = target_store;
  if logo is null or logo !~* '^https://[^[:space:]]+$' or jsonb_typeof(design->'blocks') <> 'array' then
    return design;
  end if;
  return design || jsonb_build_object('blocks', private.mcp_stamp_popup_blocks(design->'blocks', logo));
end;
$$;

revoke all on function private.mcp_stamp_popup_logo(uuid, jsonb) from public, anon, authenticated;

do $design_schema_note$
declare
  src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'mcp_catalog';
  if src is null then
    return;
  end if;
  src := replace(src,
    'heading'', ''text'', ''image'', ''logo'', ''button'', ''field'', ''spacer'', ''row''',
    'heading'', ''text'', ''image'', ''logo'', ''button'', ''field'', ''spacer'', ''row'', ''container'', ''columns'', ''stack'', ''overlay'', ''badge'', ''divider'', ''icon'', ''shape'''
  );
  src := replace(src,
    '''text'', ''email'', ''tel'', ''textarea''',
    '''text'', ''email'', ''tel'', ''textarea'', ''consent'''
  );
  src := replace(src,
    'אין ספריית תבניות נפרדת. עיצוב פופאפ נשמר על הפופאפ עצמו, וצבעי המותג הם רשימה של צבע אחד עד 24.',
    'תבניות הפופאפ זמינות ב-list_popup_templates והן נקודת התחלה בלבד. העיצוב נשמר על הפופאפ, כולל בלוקים מקוננים. צבעי המותג הם רשימה של צבע אחד עד 24.'
  );
  execute src;
end;
$design_schema_note$;
