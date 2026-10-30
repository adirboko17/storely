-- Dispatch for the growth MCP tools. Helpers live in the previous migration.

create or replace function private.mcp_popups(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  popup_id uuid;
  popup public.store_popups%rowtype;
  next_name text;
  next_status text;
  next_design jsonb;
  next_targeting jsonb;
  starts_at timestamptz;
  ends_at timestamptz;
  listed jsonb;
  total integer;
  lim integer;
  recent jsonb;
  lead_count integer;
begin
  denied := private.mcp_denied(
    target_store,
    case when tool_name in ('list_popups', 'get_popup', 'preview_popup', 'get_popup_analytics') then 'marketing.read' else 'marketing.read' end
  );
  if denied is not null then
    return denied;
  end if;

  if tool_name = 'list_popups' then
    lim := least(greatest(coalesce(trunc(private.mcp_num(args, 'limit'))::integer, 30), 1), 100);
    select count(*)::integer
    into total
    from public.store_popups as row
    where row.store_id = target_store
      and (
        btrim(coalesce(args->>'query', '')) = ''
        or position(lower(btrim(args->>'query')) in lower(row.name)) > 0
      );
    select coalesce(jsonb_agg(item.payload order by item.updated_at desc), '[]'::jsonb)
    into listed
    from (
      select row.updated_at,
        jsonb_build_object(
          'id', row.id,
          'name', row.name,
          'status', row.status,
          'trigger', row.targeting->>'trigger',
          'device', row.targeting->>'device',
          'frequency', row.targeting->>'frequency',
          'startsAt', row.starts_at,
          'endsAt', row.ends_at,
          'updatedAt', row.updated_at,
          'leads', (
            select count(*)::integer
            from public.store_popup_leads as lead
            where lead.store_id = row.store_id
              and lead.popup_id = row.id
          )
        ) as payload
      from public.store_popups as row
      where row.store_id = target_store
        and (
          btrim(coalesce(args->>'query', '')) = ''
          or position(lower(btrim(args->>'query')) in lower(row.name)) > 0
        )
      order by row.updated_at desc
      limit lim
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('total', total, 'popups', listed));
  end if;

  popup_id := private.mcp_uuid(args, 'id');
  if popup_id is null then
    return jsonb_build_object('ok', false, 'error', 'חסר מזהה פופאפ');
  end if;

  if tool_name <> 'create_popup' then
    select row.*
    into popup
    from public.store_popups as row
    where row.store_id = target_store
      and row.id = popup_id;
    if popup.id is null and tool_name <> 'create_popup' then
      return jsonb_build_object('ok', false, 'error', 'הפופאפ לא נמצא');
    end if;
  end if;

  if tool_name = 'get_popup' or tool_name = 'preview_popup' then
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'id', popup.id,
      'name', popup.name,
      'status', popup.status,
      'design', popup.design,
      'targeting', popup.targeting,
      'startsAt', popup.starts_at,
      'endsAt', popup.ends_at,
      'updatedAt', popup.updated_at,
      'note', 'אלה הנתונים שהאתר מציג. אין כאן צילום מסך.'
    ));
  end if;

  if tool_name = 'get_popup_analytics' then
    select count(*)::integer
    into lead_count
    from public.store_popup_leads as lead
    where lead.store_id = target_store
      and lead.popup_id = popup.id;
    select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into recent
    from (
      select lead.created_at,
        jsonb_build_object(
          'id', lead.id,
          'pagePath', lead.page_path,
          'fields', lead.fields,
          'createdAt', lead.created_at
        ) as payload
      from public.store_popup_leads as lead
      where lead.store_id = target_store
        and lead.popup_id = popup.id
      order by lead.created_at desc
      limit 30
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'id', popup.id,
      'name', popup.name,
      'status', popup.status,
      'leads', lead_count,
      'impressions', null,
      'note', 'החנות שומרת לידים. היא לא שומרת כמה פעמים הפופאפ הוצג.',
      'recent', recent
    ));
  end if;

  if tool_name = 'delete_popup' then
    if not private.mcp_confirmed(args) then
      return jsonb_build_object('ok', false, 'error', 'צריך לאשר את המחיקה עם confirm');
    end if;
    delete from public.store_popups as row
    where row.store_id = target_store
      and row.id = popup.id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('deleted', popup.id));
  end if;

  if tool_name = 'duplicate_popup' then
    insert into public.store_popups (store_id, name, status, design, targeting, starts_at, ends_at)
    values (
      target_store,
      left('עותק של ' || popup.name, 80),
      'draft',
      popup.design,
      popup.targeting,
      popup.starts_at,
      popup.ends_at
    )
    returning id into popup_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', popup_id, 'status', 'draft'));
  end if;

  if tool_name = 'publish_popup' then
    next_status := btrim(coalesce(args->>'status', 'active'));
    if next_status not in ('draft', 'active', 'paused') then
      return jsonb_build_object('ok', false, 'error', 'סטטוס לא תקין');
    end if;
    update public.store_popups as row
    set status = next_status,
        updated_at = now()
    where row.store_id = target_store
      and row.id = popup.id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', popup.id, 'status', next_status));
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
end;
$$;

revoke all on function private.mcp_popups(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_save_popup(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  popup public.store_popups%rowtype;
  popup_id uuid;
  next_name text;
  next_status text;
  next_design jsonb;
  next_targeting jsonb;
  design_raw jsonb := '{}'::jsonb;
  targeting_raw jsonb := '{}'::jsonb;
  starts_at timestamptz;
  ends_at timestamptz;
begin
  denied := private.mcp_denied(target_store, 'marketing.read');
  if denied is not null then
    return denied;
  end if;

  if tool_name = 'update_popup' then
    popup_id := private.mcp_uuid(args, 'id');
    if popup_id is null then
      return jsonb_build_object('ok', false, 'error', 'חסר מזהה פופאפ');
    end if;
    select row.*
    into popup
    from public.store_popups as row
    where row.store_id = target_store
      and row.id = popup_id
    for update;
    if popup.id is null then
      return jsonb_build_object('ok', false, 'error', 'הפופאפ לא נמצא');
    end if;
    next_name := left(btrim(coalesce(nullif(args->>'name', ''), popup.name)), 80);
    next_status := coalesce(nullif(args->>'status', ''), popup.status);
    design_raw := case when jsonb_typeof(args->'design') = 'object' then args->'design' else '{}'::jsonb end;
    targeting_raw := case when jsonb_typeof(args->'targeting') = 'object' then args->'targeting' else '{}'::jsonb end;
    starts_at := case when args ? 'startsAt' then private.mcp_popup_time(args->>'startsAt') else popup.starts_at end;
    ends_at := case when args ? 'endsAt' then private.mcp_popup_time(args->>'endsAt') else popup.ends_at end;
  else
    next_name := left(btrim(coalesce(args->>'name', '')), 80);
    if next_name = '' then
      return jsonb_build_object('ok', false, 'error', 'חסר שם לפופאפ');
    end if;
    next_status := coalesce(nullif(args->>'status', ''), 'draft');
    design_raw := case when jsonb_typeof(args->'design') = 'object' then args->'design' else '{}'::jsonb end;
    targeting_raw := case when jsonb_typeof(args->'targeting') = 'object' then args->'targeting' else '{}'::jsonb end;
    starts_at := private.mcp_popup_time(args->>'startsAt');
    ends_at := private.mcp_popup_time(args->>'endsAt');
  end if;

  if next_status not in ('draft', 'active', 'paused') then
    return jsonb_build_object('ok', false, 'error', 'סטטוס לא תקין');
  end if;
  if args ? 'layout' then design_raw := design_raw || jsonb_build_object('layout', args->'layout'); end if;
  if args ? 'width' then design_raw := design_raw || jsonb_build_object('width', args->'width'); end if;
  if args ? 'background' then design_raw := design_raw || jsonb_build_object('background', args->'background'); end if;
  if args ? 'submitLabel' then design_raw := design_raw || jsonb_build_object('submitLabel', args->'submitLabel'); end if;
  if args ? 'blocks' then design_raw := design_raw || jsonb_build_object('blocks', args->'blocks'); end if;
  if args ? 'trigger' then targeting_raw := targeting_raw || jsonb_build_object('trigger', args->'trigger'); end if;
  if args ? 'delaySeconds' then targeting_raw := targeting_raw || jsonb_build_object('delaySeconds', args->'delaySeconds'); end if;
  if args ? 'scrollPercent' then targeting_raw := targeting_raw || jsonb_build_object('scrollPercent', args->'scrollPercent'); end if;
  if args ? 'frequency' then targeting_raw := targeting_raw || jsonb_build_object('frequency', args->'frequency'); end if;
  if args ? 'device' then targeting_raw := targeting_raw || jsonb_build_object('device', args->'device'); end if;
  if jsonb_typeof(args->'pages') = 'object' then
    targeting_raw := targeting_raw || jsonb_build_object('pages', args->'pages');
  end if;

  next_design := private.mcp_popup_design(design_raw, case when tool_name = 'update_popup' then popup.design else '{}'::jsonb end);
  next_targeting := private.mcp_popup_targeting(targeting_raw, case when tool_name = 'update_popup' then popup.targeting else '{}'::jsonb end);
  if starts_at is not null and ends_at is not null and ends_at <= starts_at then
    return jsonb_build_object('ok', false, 'error', 'מועד הסיום צריך להיות אחרי ההתחלה');
  end if;

  if tool_name = 'update_popup' then
    update public.store_popups as row
    set name = next_name,
        status = next_status,
        design = next_design,
        targeting = next_targeting,
        starts_at = starts_at,
        ends_at = ends_at,
        updated_at = now()
    where row.store_id = target_store
      and row.id = popup.id
    returning row.id into popup_id;
  else
    insert into public.store_popups (store_id, name, status, design, targeting, starts_at, ends_at)
    values (target_store, next_name, next_status, next_design, next_targeting, starts_at, ends_at)
    returning id into popup_id;
  end if;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', popup_id,
    'name', next_name,
    'status', next_status
  ));
end;
$$;

revoke all on function private.mcp_save_popup(uuid, text, jsonb) from public, anon, authenticated;
