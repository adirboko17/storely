-- More MCP tools for the surfaces the store already saves.
-- The store id still comes from the connection, never from the model.
-- Tools that the storefront cannot render are not added here.

create or replace function private.mcp_denied(target_store uuid, permission_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_store is null or not private.can_manage_store(target_store) then
    return jsonb_build_object('ok', false, 'error', 'המשתמש כבר לא יכול לנהל את החנות');
  end if;
  if not private.mcp_allowed(target_store, permission_key) then
    return jsonb_build_object('ok', false, 'error', 'אין הרשאה לפעולה הזו בחנות');
  end if;
  return null;
end;
$$;

revoke all on function private.mcp_denied(uuid, text) from public, anon, authenticated;

create or replace function private.mcp_hex(value text, fallback text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when value ~ '^#[0-9A-Fa-f]{6}$' then lower(value) else fallback end;
$$;

revoke all on function private.mcp_hex(text, text) from public, anon, authenticated;

create or replace function private.mcp_clamp(value numeric, low numeric, high numeric, fallback numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null then fallback
    else least(high, greatest(low, round(value)))
  end;
$$;

revoke all on function private.mcp_clamp(numeric, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function private.mcp_popup_block(item jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  kind text := coalesce(item->>'type', '');
  block_id text := left(btrim(coalesce(item->>'id', '')), 80);
  field_type text;
  field_name text;
  href text;
  src text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    return null;
  end if;
  if block_id = '' then
    block_id := gen_random_uuid()::text;
  end if;
  if kind = 'row' then
    if jsonb_typeof(item->'columns') = 'array' and octet_length(item::text) <= 20000 then
      return item || jsonb_build_object('id', block_id, 'type', 'row', 'span', 'full');
    end if;
    return null;
  end if;
  if kind = 'heading' then
    return jsonb_build_object(
      'id', block_id,
      'type', 'heading',
      'text', left(replace(coalesce(item->>'text', ''), chr(0), ''), 160),
      'color', private.mcp_hex(item->>'color', '#1a1a1a'),
      'size', private.mcp_clamp(private.mcp_num(item, 'size'), 16, 48, 28),
      'align', case when item->>'align' in ('center', 'left') then item->>'align' else 'right' end,
      'weight', case when item->>'weight' = 'regular' then 'regular' else 'bold' end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  if kind = 'text' then
    return jsonb_build_object(
      'id', block_id,
      'type', 'text',
      'text', left(replace(coalesce(item->>'text', ''), chr(0), ''), 800),
      'color', private.mcp_hex(item->>'color', '#4a4a4a'),
      'size', private.mcp_clamp(private.mcp_num(item, 'size'), 12, 24, 15),
      'align', case when item->>'align' in ('center', 'left') then item->>'align' else 'right' end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  if kind = 'image' then
    src := left(btrim(coalesce(item->>'src', '')), 500);
    if src !~* '^https://[^[:space:]"''()<>]+$' then
      src := '';
    end if;
    return jsonb_build_object(
      'id', block_id, 'type', 'image', 'src', src,
      'alt', left(replace(coalesce(item->>'alt', ''), chr(0), ''), 120),
      'radius', private.mcp_clamp(private.mcp_num(item, 'radius'), 0, 40, 12),
      'width', private.mcp_clamp(private.mcp_num(item, 'width'), 30, 100, 100),
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  if kind = 'logo' then
    src := left(btrim(coalesce(item->>'src', '')), 500);
    if src !~* '^https://[^[:space:]"''()<>]+$' then
      src := '';
    end if;
    return jsonb_build_object(
      'id', block_id, 'type', 'logo', 'src', src,
      'width', private.mcp_clamp(private.mcp_num(item, 'width'), 48, 220, 112),
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  if kind = 'button' then
    href := left(btrim(coalesce(item->>'href', '')), 300);
    if not (
      (left(href, 1) = '/' and left(href, 2) <> '//')
      or href ~* '^https://'
      or href ~* '^mailto:[^[:space:]]+$'
      or href ~* '^tel:\+?[0-9-]{6,20}$'
    ) then
      href := '';
    end if;
    return jsonb_build_object(
      'id', block_id,
      'type', 'button',
      'label', coalesce(nullif(left(replace(coalesce(item->>'label', ''), chr(0), ''), 40), ''), 'לחצו כאן'),
      'href', href,
      'background', private.mcp_hex(item->>'background', '#1a1a1a'),
      'color', private.mcp_hex(item->>'color', '#ffffff'),
      'radius', case when private.mcp_num(item, 'radius') = 999 then 999 else private.mcp_clamp(private.mcp_num(item, 'radius'), 0, 28, 12) end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  if kind = 'field' then
    field_type := case when item->>'fieldType' in ('email', 'tel', 'textarea') then item->>'fieldType' else 'text' end;
    field_name := lower(btrim(coalesce(item->>'name', '')));
    if field_name !~ '^[a-z][a-z0-9_]{0,31}$' then
      field_name := case field_type when 'email' then 'email' when 'tel' then 'phone' when 'textarea' then 'note' else 'name' end;
    end if;
    return jsonb_build_object(
      'id', block_id,
      'type', 'field',
      'fieldType', field_type,
      'label', left(replace(coalesce(item->>'label', ''), chr(0), ''), 60),
      'name', field_name,
      'placeholder', left(replace(coalesce(item->>'placeholder', ''), chr(0), ''), 80),
      'required', case when item->'required' = 'false'::jsonb then false else true end,
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  if kind = 'spacer' then
    return jsonb_build_object(
      'id', block_id,
      'type', 'spacer',
      'height', private.mcp_clamp(private.mcp_num(item, 'height'), 4, 80, 16),
      'span', case when item->>'span' = 'half' then 'half' else 'full' end
    );
  end if;
  return null;
end;
$$;

revoke all on function private.mcp_popup_block(jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_design(raw jsonb, base jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  result jsonb;
  blocks jsonb := '[]'::jsonb;
  item jsonb;
  built jsonb;
  names text[] := '{}';
  field_name text;
  index integer := 0;
  mobile jsonb;
begin
  if jsonb_typeof(base) is distinct from 'object' then
    base := '{}'::jsonb;
  end if;
  result := jsonb_build_object(
    'layout', 'modal',
    'width', 420,
    'radius', 24,
    'padding', 28,
    'gap', 12,
    'media', 'none',
    'mediaImage', '',
    'background', '#fffaf6',
    'backgroundImage', '',
    'overlay', 46,
    'closeOnOverlay', true,
    'closeColor', '#1a1a1a',
    'closeSize', 22,
    'closePlace', 'top-left',
    'mobile', jsonb_build_object('layout', 'same', 'width', 0, 'radius', -1, 'padding', -1, 'gap', -1, 'media', 'stack', 'columns', 'stack'),
    'submitLabel', 'שלחו לי',
    'submitBackground', '#1a1a1a',
    'submitColor', '#ffffff',
    'successTitle', 'קיבלנו',
    'successText', 'תודה, נחזור אלייך.',
    'blocks', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'type', 'heading', 'text', 'הטבה להזמנה הבאה', 'color', '#1a1a1a', 'size', 28, 'align', 'center', 'weight', 'bold', 'span', 'full'),
      jsonb_build_object('id', gen_random_uuid(), 'type', 'text', 'text', 'השאירו אימייל ונשלח הטבה להזמנה הבאה.', 'color', '#4a4a4a', 'size', 15, 'align', 'center', 'span', 'full'),
      jsonb_build_object('id', gen_random_uuid(), 'type', 'field', 'fieldType', 'email', 'label', 'אימייל', 'name', 'email', 'placeholder', 'name@email.com', 'required', true, 'span', 'full')
    )
  ) || base;

  if jsonb_typeof(raw) is distinct from 'object' then
    return result;
  end if;

  if raw ? 'layout' then
    result := result || jsonb_build_object('layout', case when raw->>'layout' in ('bar', 'corner') then raw->>'layout' else 'modal' end);
  end if;
  if raw ? 'width' then
    result := result || jsonb_build_object('width', private.mcp_clamp(private.mcp_num(raw, 'width'), 280, 880, 420));
  end if;
  if raw ? 'radius' then
    result := result || jsonb_build_object('radius', private.mcp_clamp(private.mcp_num(raw, 'radius'), 0, 40, 24));
  end if;
  if raw ? 'padding' then
    result := result || jsonb_build_object('padding', private.mcp_clamp(private.mcp_num(raw, 'padding'), 0, 64, 28));
  end if;
  if raw ? 'gap' then
    result := result || jsonb_build_object('gap', private.mcp_clamp(private.mcp_num(raw, 'gap'), 0, 40, 12));
  end if;
  if raw ? 'media' then
    result := result || jsonb_build_object('media', case when raw->>'media' in ('right', 'left') then raw->>'media' else 'none' end);
  end if;
  if raw ? 'mediaImage' then
    result := result || jsonb_build_object('mediaImage', case when coalesce(raw->>'mediaImage', '') ~* '^https://[^[:space:]]+$' then left(raw->>'mediaImage', 500) else '' end);
  end if;
  if raw ? 'background' then
    result := result || jsonb_build_object('background', private.mcp_hex(raw->>'background', '#fffaf6'));
  end if;
  if raw ? 'backgroundImage' then
    result := result || jsonb_build_object('backgroundImage', case when coalesce(raw->>'backgroundImage', '') ~* '^https://[^[:space:]]+$' then left(raw->>'backgroundImage', 500) else '' end);
  end if;
  if raw ? 'overlay' then
    result := result || jsonb_build_object('overlay', private.mcp_clamp(private.mcp_num(raw, 'overlay'), 0, 80, 46));
  end if;
  if raw ? 'closeOnOverlay' and jsonb_typeof(raw->'closeOnOverlay') = 'boolean' then
    result := result || jsonb_build_object('closeOnOverlay', raw->'closeOnOverlay');
  end if;
  if raw ? 'closeColor' then
    result := result || jsonb_build_object('closeColor', private.mcp_hex(raw->>'closeColor', '#1a1a1a'));
  end if;
  if raw ? 'closeSize' then
    result := result || jsonb_build_object('closeSize', private.mcp_clamp(private.mcp_num(raw, 'closeSize'), 14, 36, 22));
  end if;
  if raw ? 'closePlace' then
    result := result || jsonb_build_object('closePlace', case when raw->>'closePlace' in ('top-right', 'bottom-left', 'bottom-right') then raw->>'closePlace' else 'top-left' end);
  end if;
  if raw ? 'submitLabel' then
    result := result || jsonb_build_object('submitLabel', coalesce(nullif(left(replace(coalesce(raw->>'submitLabel', ''), chr(0), ''), 40), ''), 'שלחו לי'));
  end if;
  if raw ? 'submitBackground' then
    result := result || jsonb_build_object('submitBackground', private.mcp_hex(raw->>'submitBackground', '#1a1a1a'));
  end if;
  if raw ? 'submitColor' then
    result := result || jsonb_build_object('submitColor', private.mcp_hex(raw->>'submitColor', '#ffffff'));
  end if;
  if raw ? 'successTitle' then
    result := result || jsonb_build_object('successTitle', coalesce(nullif(left(replace(coalesce(raw->>'successTitle', ''), chr(0), ''), 80), ''), 'קיבלנו'));
  end if;
  if raw ? 'successText' then
    result := result || jsonb_build_object('successText', coalesce(nullif(left(replace(coalesce(raw->>'successText', ''), chr(0), ''), 240), ''), 'תודה, נחזור אלייך.'));
  end if;
  if jsonb_typeof(raw->'mobile') = 'object' then
    mobile := coalesce(result->'mobile', '{}'::jsonb);
    if raw->'mobile' ? 'layout' then
      mobile := mobile || jsonb_build_object('layout', case when raw->'mobile'->>'layout' in ('modal', 'bar', 'corner', 'same') then raw->'mobile'->>'layout' else 'same' end);
    end if;
    if raw->'mobile' ? 'width' then
      mobile := mobile || jsonb_build_object('width', private.mcp_clamp(private.mcp_num(raw->'mobile', 'width'), 0, 480, 0));
    end if;
    if raw->'mobile' ? 'media' then
      mobile := mobile || jsonb_build_object('media', case when raw->'mobile'->>'media' in ('same', 'stack', 'hide') then raw->'mobile'->>'media' else 'stack' end);
    end if;
    if raw->'mobile' ? 'columns' then
      mobile := mobile || jsonb_build_object('columns', case when raw->'mobile'->>'columns' = 'same' then 'same' else 'stack' end);
    end if;
    result := result || jsonb_build_object('mobile', mobile);
  end if;

  if raw ? 'blocks' then
    if jsonb_typeof(raw->'blocks') <> 'array' then
      raise exception 'בלוקים לא תקינים' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(raw->'blocks') loop
      exit when index >= 24;
      built := private.mcp_popup_block(item);
      if built is null then
        continue;
      end if;
      if built->>'type' = 'field' then
        field_name := built->>'name';
        if field_name = any(names) then
          raise exception 'לכל שדה צריך שם שונה' using errcode = '22023';
        end if;
        names := names || field_name;
      end if;
      blocks := blocks || jsonb_build_array(built);
      index := index + 1;
    end loop;
    if jsonb_array_length(blocks) = 0 then
      raise exception 'הוסיפו לפחות בלוק אחד' using errcode = '22023';
    end if;
    result := result || jsonb_build_object('blocks', blocks);
  end if;

  if octet_length(result::text) > 100000 then
    raise exception 'העיצוב ארוך מדי' using errcode = '22023';
  end if;
  return result;
end;
$$;

revoke all on function private.mcp_popup_design(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_targeting(raw jsonb, base jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb;
  pages jsonb;
  raw_pages jsonb := '{}'::jsonb;
  paths jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(base) is distinct from 'object' then
    base := '{}'::jsonb;
  end if;
  result := jsonb_build_object(
    'pages', jsonb_build_object('all', false, 'home', true, 'product', false, 'catalog', false, 'checkout', false, 'content', false, 'paths', '[]'::jsonb),
    'trigger', 'delay',
    'delaySeconds', 5,
    'scrollPercent', 40,
    'frequency', 'day',
    'device', 'all'
  ) || base;
  pages := coalesce(result->'pages', '{}'::jsonb);
  if jsonb_typeof(raw) is distinct from 'object' then
    raw := '{}'::jsonb;
  end if;
  if raw ? 'trigger' then
    if raw->>'trigger' not in ('immediate', 'delay', 'scroll', 'exit') then
      raise exception 'טריגר לא נתמך. האפשרויות הן immediate, delay, scroll, exit' using errcode = '22023';
    end if;
    result := result || jsonb_build_object('trigger', raw->>'trigger');
  end if;
  if raw ? 'delaySeconds' then
    result := result || jsonb_build_object('delaySeconds', private.mcp_clamp(private.mcp_num(raw, 'delaySeconds'), 0, 180, 5));
  end if;
  if raw ? 'scrollPercent' then
    result := result || jsonb_build_object('scrollPercent', private.mcp_clamp(private.mcp_num(raw, 'scrollPercent'), 5, 100, 40));
  end if;
  if raw ? 'frequency' then
    if raw->>'frequency' not in ('always', 'session', 'day', 'once') then
      raise exception 'תדירות לא נתמכת' using errcode = '22023';
    end if;
    result := result || jsonb_build_object('frequency', raw->>'frequency');
  end if;
  if raw ? 'device' then
    if raw->>'device' not in ('all', 'desktop', 'mobile') then
      raise exception 'מכשיר לא נתמך' using errcode = '22023';
    end if;
    result := result || jsonb_build_object('device', raw->>'device');
  end if;
  if jsonb_typeof(raw->'pages') = 'object' then
    raw_pages := raw->'pages';
    if raw_pages ? 'all' then pages := pages || jsonb_build_object('all', raw_pages->'all' = 'true'::jsonb); end if;
    if raw_pages ? 'home' then pages := pages || jsonb_build_object('home', raw_pages->'home' = 'true'::jsonb); end if;
    if raw_pages ? 'product' then pages := pages || jsonb_build_object('product', raw_pages->'product' = 'true'::jsonb); end if;
    if raw_pages ? 'catalog' then pages := pages || jsonb_build_object('catalog', raw_pages->'catalog' = 'true'::jsonb); end if;
    if raw_pages ? 'checkout' then pages := pages || jsonb_build_object('checkout', raw_pages->'checkout' = 'true'::jsonb); end if;
    if raw_pages ? 'content' then pages := pages || jsonb_build_object('content', raw_pages->'content' = 'true'::jsonb); end if;
    if raw_pages ? 'paths' then
      if jsonb_typeof(raw_pages->'paths') <> 'array' then
        raise exception 'רשימת עמודים לא תקינה' using errcode = '22023';
      end if;
      select coalesce(jsonb_agg(to_jsonb(picked.path)), '[]'::jsonb)
      into paths
      from (
        select left(btrim(item), 120) as path
        from jsonb_array_elements_text(raw_pages->'paths') as item
        where left(btrim(item), 1) = '/'
          and left(btrim(item), 2) <> '//'
          and btrim(item) !~ '[[:space:]]'
        limit 20
      ) as picked;
      pages := pages || jsonb_build_object('paths', paths);
    end if;
    result := result || jsonb_build_object('pages', pages);
  end if;

  pages := result->'pages';
  if coalesce(pages->'all', 'false'::jsonb) <> 'true'::jsonb
    and coalesce(pages->'home', 'false'::jsonb) <> 'true'::jsonb
    and coalesce(pages->'product', 'false'::jsonb) <> 'true'::jsonb
    and coalesce(pages->'catalog', 'false'::jsonb) <> 'true'::jsonb
    and coalesce(pages->'checkout', 'false'::jsonb) <> 'true'::jsonb
    and coalesce(pages->'content', 'false'::jsonb) <> 'true'::jsonb
    and jsonb_array_length(coalesce(pages->'paths', '[]'::jsonb)) = 0
  then
    raise exception 'בחרו לפחות עמוד אחד' using errcode = '22023';
  end if;
  if octet_length(result::text) > 8000 then
    raise exception 'תנאי החשיפה ארוכים מדי' using errcode = '22023';
  end if;
  return result;
end;
$$;

revoke all on function private.mcp_popup_targeting(jsonb, jsonb) from public, anon, authenticated;

create or replace function private.mcp_popup_time(value text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;
  return btrim(value)::timestamptz;
exception
  when others then
    raise exception 'תאריך לא תקין' using errcode = '22023';
end;
$$;

revoke all on function private.mcp_popup_time(text) from public, anon, authenticated;
