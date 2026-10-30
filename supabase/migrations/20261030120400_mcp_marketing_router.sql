-- Email and SMS drafts, then the router that keeps the older MCP tools working.

create or replace function private.mcp_public_error(sql_state text, sql_message text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  detail text := left(coalesce(sql_message, ''), 300);
  code text;
begin
  if detail ~* '(password|secret|bearer|api[_ ]?key|authorization)' then
    detail := 'הפעולה נכשלה';
  end if;
  code := case
    when sql_state in ('22023', '22007', '22P02', '23514', '23502') then 'VALIDATION'
    when sql_state = '42501' then 'PERMISSION'
    when sql_state = 'P0002' then 'NOT_FOUND'
    when sql_state = '23505' then 'CONFLICT'
    when sql_state = '23503' then 'CONSTRAINT'
    else 'DATABASE'
  end;
  return jsonb_build_object('ok', false, 'code', code, 'error', detail);
end;
$$;

revoke all on function private.mcp_public_error(text, text) from public, anon, authenticated;

create or replace function private.mcp_marketing(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  denied jsonb;
  campaign_id uuid;
  message_id uuid;
  segment_id uuid;
  campaign public.marketing_campaigns%rowtype;
  next_name text;
  next_status text;
  channel text;
  audience text;
  lookback integer;
  scheduled_at timestamptz;
  body_text text;
  subject text;
  listed jsonb;
begin
  denied := private.mcp_denied(target_store, 'marketing.read');
  if denied is not null then
    return denied;
  end if;

  if tool_name = 'list_campaigns' then
    select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into listed
    from (
      select campaign_row.created_at,
        jsonb_build_object(
          'id', campaign_row.id,
          'name', campaign_row.name,
          'status', campaign_row.status,
          'messageId', campaign_row.message_id,
          'segmentId', campaign_row.segment_id,
          'scheduledAt', campaign_row.scheduled_at,
          'channel', message.channel,
          'subject', message.subject
        ) as payload
      from public.marketing_campaigns as campaign_row
      left join public.marketing_messages as message
        on message.store_id = campaign_row.store_id
       and message.id = campaign_row.message_id
      where campaign_row.store_id = target_store
      order by campaign_row.created_at desc
      limit 50
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'campaigns', listed,
      'note', 'שליחה אמיתית חסומה. הספק הוא סימולציה.'
    ));
  end if;

  if tool_name = 'list_message_templates' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', message.id,
      'channel', message.channel,
      'name', message.name,
      'subject', message.subject
    ) order by message.updated_at desc), '[]'::jsonb)
    into listed
    from (
      select message.id, message.channel, message.name, message.subject, message.updated_at
      from public.marketing_messages as message
      where message.store_id = target_store
      order by message.updated_at desc
      limit 50
    ) as message;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('templates', listed));
  end if;

  if tool_name = 'create_message_template' then
    channel := case when args->>'channel' = 'sms' then 'sms' else 'email' end;
    next_name := left(btrim(coalesce(args->>'name', '')), 120);
    subject := left(btrim(coalesce(args->>'subject', '')), 200);
    body_text := left(coalesce(args->>'body', ''), 5000);
    if next_name = '' or body_text = '' then
      return jsonb_build_object('ok', false, 'error', 'חסר שם או תוכן להודעה');
    end if;
    message_id := gen_random_uuid();
    insert into public.marketing_messages (
      id, store_id, legacy_key, channel, name, subject, body_text, blocks, origin
    ) values (
      message_id, target_store, 'mcp-' || message_id::text, channel, next_name, subject, body_text, '[]'::jsonb, 'app'
    );
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', message_id, 'channel', channel));
  end if;

  if tool_name = 'list_automations' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', automation.id,
      'name', automation.name,
      'trigger', automation.trigger_label,
      'enabled', automation.enabled,
      'lookbackDays', automation.lookback_days
    ) order by automation.name), '[]'::jsonb)
    into listed
    from public.marketing_automations as automation
    where automation.store_id = target_store;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'automations', listed,
      'note', 'אפשר להפעיל או לכבות אוטומציה קיימת. אי אפשר לבנות ממנה זרימה חדשה.'
    ));
  end if;

  if tool_name = 'upsert_automation' then
    if private.mcp_uuid(args, 'id') is null or jsonb_typeof(args->'enabled') <> 'boolean' then
      return jsonb_build_object('ok', false, 'error', 'צריך מזהה אוטומציה וערך enabled');
    end if;
    update public.marketing_automations as automation
    set enabled = (args->'enabled') = 'true'::jsonb,
        name = case when args ? 'name' then left(btrim(coalesce(args->>'name', '')), 120) else automation.name end,
        updated_at = now()
    where automation.store_id = target_store
      and automation.id = private.mcp_uuid(args, 'id')
    returning automation.id into campaign_id;
    if campaign_id is null then
      return jsonb_build_object('ok', false, 'error', 'האוטומציה לא נמצאה');
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', campaign_id, 'enabled', args->'enabled'));
  end if;

  if tool_name = 'create_segment' then
    next_name := left(btrim(coalesce(args->>'name', '')), 120);
    audience := btrim(coalesce(args->>'audience', 'subscribed'));
    if next_name = '' then
      return jsonb_build_object('ok', false, 'error', 'חסר שם לקהל');
    end if;
    if audience not in ('subscribed', 'all', 'fresh', 'repeat') then
      return jsonb_build_object('ok', false, 'error', 'קהל לא נתמך');
    end if;
    lookback := trunc(private.mcp_num(args, 'lookbackDays'))::integer;
    insert into public.marketing_segments (store_id, name, kind, definition)
    values (
      target_store,
      next_name,
      'dynamic',
      jsonb_strip_nulls(jsonb_build_object('key', audience, 'lookbackDays', lookback))
    )
    returning id into segment_id;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', segment_id, 'audience', audience));
  end if;

  if tool_name = 'send_test_message' then
    if private.mcp_uuid(args, 'messageId') is not null and not exists (
      select 1 from public.marketing_messages as message
      where message.store_id = target_store
        and message.id = private.mcp_uuid(args, 'messageId')
    ) then
      return jsonb_build_object('ok', false, 'error', 'ההודעה לא נמצאה');
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'sent', false,
      'reason', 'החנות במצב סימולציה ולא שולחת אימייל, SMS או וואטסאפ'
    ));
  end if;

  if tool_name = 'get_campaign_analytics' then
    campaign_id := private.mcp_uuid(args, 'id');
    select coalesce(jsonb_object_agg(item.status, item.total), '{}'::jsonb)
    into listed
    from (
      select delivery.status, count(*)::integer as total
      from public.marketing_deliveries as delivery
      where delivery.store_id = target_store
        and (campaign_id is null or delivery.campaign_id = campaign_id)
      group by delivery.status
    ) as item;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'deliveries', listed,
      'note', 'הספק הוא סימולציה, ולכן לרוב אין כאן שליחות אמיתיות.'
    ));
  end if;

  if tool_name in ('create_campaign', 'update_campaign') then
    next_name := left(btrim(coalesce(args->>'name', '')), 160);
    next_status := coalesce(nullif(args->>'status', ''), 'draft');
    channel := case when args->>'channel' = 'sms' then 'sms' else 'email' end;
    audience := coalesce(nullif(args->>'audience', ''), 'subscribed');
    if next_status not in ('draft', 'scheduled', 'cancelled') then
      return jsonb_build_object('ok', false, 'error', 'אפשר לשמור טיוטה, תזמון או ביטול. אי אפשר לסמן קמפיין כנשלח');
    end if;
    if audience not in ('subscribed', 'all', 'fresh', 'repeat') then
      return jsonb_build_object('ok', false, 'error', 'קהל לא נתמך');
    end if;
    scheduled_at := case when args ? 'scheduledAt' then private.mcp_popup_time(args->>'scheduledAt') else null end;
    lookback := trunc(private.mcp_num(args, 'lookbackDays'))::integer;
    body_text := case when args ? 'body' then left(coalesce(args->>'body', ''), 5000) else null end;
    subject := left(btrim(coalesce(args->>'subject', '')), 200);

    if tool_name = 'update_campaign' then
      campaign_id := private.mcp_uuid(args, 'id');
      if campaign_id is null then
        return jsonb_build_object('ok', false, 'error', 'חסר מזהה קמפיין');
      end if;
      select campaign_row.*
      into campaign
      from public.marketing_campaigns as campaign_row
      where campaign_row.store_id = target_store
        and campaign_row.id = campaign_id
      for update;
      if campaign.id is null then
        return jsonb_build_object('ok', false, 'error', 'הקמפיין לא נמצא');
      end if;
      if next_name = '' then
        next_name := campaign.name;
      end if;
      if not args ? 'status' then
        next_status := campaign.status;
      end if;
      if not args ? 'scheduledAt' then
        scheduled_at := campaign.scheduled_at;
      end if;
      message_id := campaign.message_id;
      segment_id := campaign.segment_id;
    else
      if next_name = '' then
        return jsonb_build_object('ok', false, 'error', 'חסר שם לקמפיין');
      end if;
      campaign_id := gen_random_uuid();
      message_id := private.mcp_uuid(args, 'messageId');
    end if;

    if (tool_name = 'create_campaign' or args ? 'status' or args ? 'scheduledAt')
      and next_status = 'scheduled'
      and (scheduled_at is null or scheduled_at <= now()) then
      return jsonb_build_object('ok', false, 'error', 'תזמון צריך להיות בעתיד');
    end if;

    if body_text is not null and body_text <> '' then
      if message_id is null then
        message_id := gen_random_uuid();
        insert into public.marketing_messages (
          id, store_id, legacy_key, channel, name, subject, body_text, blocks, origin
        ) values (
          message_id, target_store, 'mcp-' || message_id::text, channel, next_name, subject, body_text, '[]'::jsonb, 'app'
        );
      else
        update public.marketing_messages as message
        set body_text = body_text,
            subject = case when args ? 'subject' then subject else message.subject end,
            name = next_name,
            updated_at = now()
        where message.store_id = target_store
          and message.id = message_id;
        if not found then
          return jsonb_build_object('ok', false, 'error', 'ההודעה לא נמצאה');
        end if;
      end if;
    elsif tool_name = 'create_campaign' and message_id is not null and not exists (
      select 1 from public.marketing_messages as message
      where message.store_id = target_store and message.id = message_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'ההודעה לא נמצאה');
    end if;

    if segment_id is null or args ? 'audience' then
      if segment_id is null then
        insert into public.marketing_segments (store_id, name, kind, definition)
        values (
          target_store,
          left('קהל ' || campaign_id::text, 120),
          'dynamic',
          jsonb_strip_nulls(jsonb_build_object('key', audience, 'lookbackDays', lookback))
        )
        returning id into segment_id;
      else
        update public.marketing_segments as segment
        set definition = jsonb_strip_nulls(jsonb_build_object('key', audience, 'lookbackDays', lookback)),
            updated_at = now()
        where segment.store_id = target_store
          and segment.id = segment_id;
      end if;
    end if;

    if tool_name = 'create_campaign' then
      insert into public.marketing_campaigns (
        id, store_id, name, status, purpose, provider, message_id, segment_id, scheduled_at
      ) values (
        campaign_id, target_store, next_name, next_status, 'marketing', 'mock', message_id, segment_id, scheduled_at
      );
    else
      update public.marketing_campaigns as campaign_row
      set name = next_name,
          status = next_status,
          message_id = message_id,
          segment_id = segment_id,
          scheduled_at = scheduled_at,
          updated_at = now()
      where campaign_row.store_id = target_store
        and campaign_row.id = campaign_id;
    end if;

    return jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'id', campaign_id,
      'status', next_status,
      'messageId', message_id,
      'sent', false
    ));
  end if;

  return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
end;
$$;

revoke all on function private.mcp_marketing(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_growth(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  page_args jsonb;
begin
  args := coalesce(args, '{}'::jsonb);
  if target_store is null or not private.can_manage_store(target_store) then
    return jsonb_build_object('ok', false, 'error', 'המשתמש כבר לא יכול לנהל את החנות');
  end if;

  begin
    if tool_name in ('create_popup', 'update_popup') then
      return private.mcp_save_popup(target_store, tool_name, args);
    end if;
    if tool_name in ('list_popups', 'get_popup', 'preview_popup', 'get_popup_analytics', 'delete_popup', 'duplicate_popup', 'publish_popup') then
      return private.mcp_popups(target_store, tool_name, args);
    end if;
    if tool_name in ('create_discount', 'update_discount', 'deactivate_discount', 'list_promotions', 'create_promotion', 'update_promotion') then
      return private.mcp_discounts(target_store, tool_name, args);
    end if;
    if tool_name in ('list_reviews', 'get_review', 'create_review', 'moderate_review') then
      return private.mcp_reviews(target_store, tool_name, args);
    end if;
    if tool_name in (
      'list_bundles', 'create_bundle', 'update_bundle', 'list_media', 'import_media', 'delete_media',
      'get_inventory', 'adjust_inventory', 'bulk_update_inventory', 'get_design_schema'
    ) or (tool_name = 'update_seo' and private.mcp_uuid(args, 'productId') is not null) then
      return private.mcp_catalog(target_store, tool_name, args);
    end if;
    if tool_name = 'list_pages' then
      return private.mcp_posts(target_store, 'list_posts', args);
    end if;
    if tool_name = 'create_page' then
      return private.mcp_posts(target_store, 'create_post', args);
    end if;
    if tool_name in ('update_page', 'update_seo') then
      page_args := args;
      if tool_name = 'update_seo' and not args ? 'id' then
        return jsonb_build_object('ok', false, 'error', 'צריך productId למוצר או id למאמר');
      end if;
      return private.mcp_posts(target_store, 'update_post', page_args);
    end if;
    if tool_name in (
      'get_checkout_settings', 'update_checkout_settings', 'update_cart_rules',
      'list_abandoned_carts', 'get_abandoned_cart', 'list_shipping_methods', 'upsert_shipping_method',
      'list_shipments', 'get_sales_analytics', 'get_product_analytics', 'get_customer_analytics',
      'get_conversion_funnel', 'export_report', 'get_store_settings', 'update_store_settings',
      'list_admin_roles', 'get_audit_log', 'get_seo_audit'
    ) then
      return private.mcp_commerce(target_store, tool_name, args);
    end if;
    if tool_name in (
      'list_campaigns', 'create_campaign', 'update_campaign', 'list_automations', 'upsert_automation',
      'create_segment', 'list_message_templates', 'create_message_template', 'send_test_message',
      'get_campaign_analytics'
    ) then
      return private.mcp_marketing(target_store, tool_name, args);
    end if;
    return jsonb_build_object('ok', false, 'error', 'כלי לא מוכר');
  exception
    when others then
      raise warning 'mcp % failed [%] %', tool_name, sqlstate, sqlerrm;
      return private.mcp_public_error(sqlstate, sqlerrm);
  end;
end;
$$;

revoke all on function private.mcp_growth(uuid, text, jsonb) from public, anon, authenticated;

do $rename_mcp_dispatch$
begin
  if to_regprocedure('private.mcp_dispatch_core(uuid,text,jsonb)') is null
     and to_regprocedure('private.mcp_dispatch(uuid,text,jsonb)') is not null then
    alter function private.mcp_dispatch(uuid, text, jsonb) rename to mcp_dispatch_core;
  end if;
  if to_regprocedure('private.mcp_dispatch_core(uuid,text,jsonb)') is null then
    raise exception 'mcp_dispatch_core missing';
  end if;
end
$rename_mcp_dispatch$;

create or replace function private.mcp_dispatch(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
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

do $mcp_growth_smoke$
declare
  design jsonb;
begin
  design := private.mcp_popup_design('{}'::jsonb, '{}'::jsonb);
  if jsonb_array_length(design->'blocks') < 1 then
    raise exception 'popup design smoke test failed';
  end if;
  if private.mcp_clean_bundles('[]'::jsonb) <> '[]'::jsonb then
    raise exception 'bundle smoke test failed';
  end if;
  perform private.mcp_popup_targeting('{}'::jsonb, '{}'::jsonb);
  perform private.mcp_period('{}'::jsonb);
end
$mcp_growth_smoke$;
