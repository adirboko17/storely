-- Describe the public site from data Storely already stores.
-- Homepage layout is custom site code. These tools refuse to invent a section tree.

create or replace function private.mcp_website_layout_block(action text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'code', 'UNSUPPORTED',
    'editable', false,
    'requiresDeploy', true,
    'error', 'This store''s homepage, header, and footer are compiled into its own website. Storely does not store those sections, and the admin visual editor cannot edit them. '
      || action
      || ' was not saved. A banner, section order, or new section needs a code deploy of that website.'
  );
$$;

revoke all on function private.mcp_website_layout_block(text) from public, anon, authenticated;

create or replace function private.mcp_website_extra(properties jsonb, allowed text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
begin
  if jsonb_typeof(properties) is distinct from 'object' then
    return null;
  end if;
  for key in select jsonb_object_keys(properties) loop
    if not (key = any (allowed)) then
      return key;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.mcp_website_extra(jsonb, text[]) from public, anon, authenticated;

create or replace function private.mcp_website(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  denied jsonb;
  settings public.store_settings%rowtype;
  section_id text := left(btrim(coalesce(args->>'sectionId', '')), 80);
  page_name text := left(btrim(coalesce(args->>'page', '')), 40);
  section_type text := lower(left(btrim(coalesce(args->>'type', '')), 40));
  properties jsonb := case when jsonb_typeof(args->'properties') = 'object' then args->'properties' else '{}'::jsonb end;
  allowed text[] := array['title', 'excerpt', 'body', 'author', 'visible', 'image', 'imageX', 'imageY', 'imageScale', 'seoTitle', 'seoDescription', 'handle', 'productId', 'productNote', 'blog', 'tags', 'tone', 'video', 'template', 'updated'];
  extra text;
  forwarded jsonb;
  article_id text;
  policy_kind text;
  domains jsonb;
  articles jsonb;
  policies jsonb;
  collections jsonb;
  events jsonb;
  popups jsonb;
begin
  if args ? 'storeId' or args ? 'store_id' then
    return jsonb_build_object('ok', false, 'code', 'PERMISSION', 'error', 'The store is fixed by this connection. Do not send a store id.');
  end if;

  denied := private.mcp_denied(target_store, 'settings.manage');
  if denied is not null then
    return denied;
  end if;

  select * into settings from public.store_settings where store_id = target_store;

  if tool_name = 'update_website_section' then
    if section_id in ('home-layout', 'header', 'footer') then
      return private.mcp_website_layout_block('The layout edit');
    end if;
    extra := private.mcp_website_extra(properties, allowed);
    if section_id = 'logo' then
      if properties ? 'logoUrl' and (select count(*) from jsonb_object_keys(properties)) = 1 then
        return private.mcp_growth(target_store, 'update_logo', jsonb_build_object('logoUrl', properties->>'logoUrl'));
      end if;
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'The logo accepts only logoUrl. Use update_logo.');
    end if;
    if section_id = 'brand-colors' then
      if properties ? 'colors' and jsonb_typeof(properties->'colors') = 'array' and (select count(*) from jsonb_object_keys(properties)) = 1 then
        return private.mcp_growth(target_store, 'update_brand_colors', jsonb_build_object('colors', properties->'colors'));
      end if;
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Brand colors accept only a colors array of 1 to 24 hex values. Use update_brand_colors.');
    end if;
    if section_id like 'policy:%' then
      policy_kind := split_part(section_id, ':', 2);
      if policy_kind not in ('return', 'privacy', 'terms', 'shipping', 'contact', 'legal', 'purchase') then
        return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'That policy is not one of the stored policy documents.');
      end if;
      if extra is not null then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'requiresDeploy', extra in ('html', 'css', 'style'), 'error', 'Policy documents do not accept ' || extra || '. Use update_policy with the fields that document already has.');
      end if;
      forwarded := jsonb_build_object('kind', policy_kind) || properties;
      return private.mcp_growth(target_store, 'update_policy', forwarded);
    end if;
    if exists (
      select 1
      from jsonb_array_elements(coalesce(settings.posts, '[]'::jsonb)) as post(post)
      where post.post->>'id' = section_id
    ) then
      if extra is not null then
        return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED', 'requiresDeploy', true, 'error', 'Articles do not have a ' || extra || ' field. The public site would ignore it. This call changed nothing.');
      end if;
      return private.mcp_growth(target_store, 'update_page', properties || jsonb_build_object('id', section_id));
    end if;
    if section_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1 from public.store_popups as popup
        where popup.store_id = target_store and popup.id = section_id::uuid
      ) then
      return jsonb_build_object('ok', false, 'code', 'USE_EXISTING_TOOL', 'tool', 'update_popup_block', 'sectionId', section_id, 'error', 'Popups are edited with the popup design tools. Read get_popup_design_schema, then update_popup_block. This call changed nothing.');
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'That section id is not stored for this store. Read get_website_structure.');
  end if;

  if tool_name = 'add_website_section' then
    if section_type <> 'article' or page_name not in ('articles', 'content') then
      return private.mcp_website_layout_block('Adding a ' || coalesce(nullif(section_type, ''), 'section'));
    end if;
    extra := private.mcp_website_extra(properties, allowed);
    if extra is not null then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A new article does not accept ' || extra || '.');
    end if;
    return private.mcp_growth(target_store, 'create_page', (properties - 'visible') || jsonb_build_object('visible', false));
  end if;

  if tool_name = 'remove_website_section' then
    if section_id in ('home-layout', 'header', 'footer', 'logo', 'brand-colors') or section_id like 'policy:%' then
      return private.mcp_website_layout_block('Removing ' || section_id);
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(settings.posts, '[]'::jsonb)) as post(post)
      where post.post->>'id' = section_id
    ) then
      return private.mcp_growth(target_store, 'update_page', jsonb_build_object('id', section_id, 'visible', false));
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'That section cannot be removed. Homepage sections are not stored, and articles are hidden rather than deleted.');
  end if;

  if tool_name in ('reorder_website_sections', 'publish_website_changes') then
    return private.mcp_website_layout_block(case when tool_name = 'publish_website_changes' then 'Publishing homepage layout' else 'Reordering sections' end);
  end if;

  if tool_name = 'save_website_draft' then
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'saved', false,
        'requiresDeploy', true,
        'reason', 'There is no homepage draft. Article edits are already stored and stay off the public site while visible is false. Popup edits stay draft until publish_popup. Homepage layout has no draft to save.'
      )
    );
  end if;

  if tool_name = 'list_website_revisions' then
    article_id := regexp_replace(section_id, '^popup:', '');
    if article_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and exists (
      select 1 from public.store_popups as popup where popup.store_id = target_store and popup.id = article_id::uuid
    ) then
      return jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
        'sectionId', article_id,
        'source', 'popup_revisions',
        'revisions', coalesce((
          select jsonb_agg(jsonb_build_object('id', revision.id, 'createdAt', revision.created_at) order by revision.created_at desc)
          from (
            select id, created_at from public.popup_revisions
            where store_id = target_store and popup_id = article_id::uuid
            order by created_at desc
            limit 20
          ) as revision
        ), '[]'::jsonb)
        )
      );
    end if;
    if section_id in ('home-layout', 'header', 'footer') then
      return jsonb_build_object('ok', true, 'data', jsonb_build_object('sectionId', section_id, 'revisions', '[]'::jsonb, 'requiresDeploy', true, 'reason', 'Homepage layout is site code, so Storely has no revisions to restore.'));
    end if;
    return jsonb_build_object('ok', true, 'data', jsonb_build_object('sectionId', section_id, 'revisions', '[]'::jsonb, 'reason', 'That record has no stored revision list. Article history is not kept.'));
  end if;

  if tool_name = 'restore_website_revision' then
    article_id := regexp_replace(section_id, '^popup:', '');
    if article_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and exists (
      select 1 from public.store_popups as popup where popup.store_id = target_store and popup.id = article_id::uuid
    ) then
      return private.mcp_popup_studio(target_store, 'restore_popup_revision', jsonb_build_object('id', article_id, 'revisionId', args->>'revisionId'));
    end if;
    return private.mcp_website_layout_block('Restoring a homepage revision');
  end if;

  if tool_name = 'list_available_sections' then
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'renderer', 'custom-storefront',
        'sections', '[]'::jsonb,
        'articleTool', 'create_page',
        'reason', 'This site has no installable homepage section catalog. Hero, banner, FAQ, gallery, testimonials, and newsletter blocks are not stored and cannot be added until that site''s code and the admin editor both render them.'
      )
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('hostname', domain.hostname, 'verified', domain.verified_at is not null) order by domain.hostname), '[]'::jsonb)
  into domains
  from public.store_domains as domain
  where domain.store_id = target_store and domain.verified_at is not null;

  select coalesce(jsonb_agg(item.section order by item.ord), '[]'::jsonb)
  into articles
  from (
    select
      row_number() over () as ord,
      jsonb_build_object(
        'id', post.post->>'id',
        'sectionType', 'article',
        'title', left(coalesce(post.post->>'title', ''), 160),
        'handle', left(coalesce(post.post->>'handle', ''), 80),
        'visible', coalesce(post.post->'visible', 'false'::jsonb),
        'editable', true,
        'requiresDeploy', false,
        'customersSeeDraft', false,
        'tool', 'update_page',
        'editableProperties', to_jsonb(allowed)
      ) as section
    from jsonb_array_elements(coalesce(settings.posts, '[]'::jsonb)) with ordinality as post(post, ord)
    where ord <= 80
  ) as item;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'policy:' || (item.item->>'kind'),
    'sectionType', 'policy',
    'title', item.item->>'title',
    'editable', true,
    'requiresDeploy', false,
    'tool', 'update_policy',
    'editableProperties', jsonb_build_array('title', 'body')
  )), '[]'::jsonb)
  into policies
  from jsonb_array_elements(private.mcp_policy_items(settings.policies)) as item(item);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', collection.id,
    'sectionType', 'collection',
    'title', collection.title,
    'hidden', collection.hidden,
    'editable', true,
    'requiresDeploy', false,
    'tool', 'update_collection'
  ) order by collection.position, collection.title), '[]'::jsonb)
  into collections
  from public.collections as collection
  where collection.store_id = target_store;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'sectionType', 'event',
    'title', event.title,
    'slug', event.slug,
    'path', '/events/' || event.slug,
    'status', event.status,
    'editable', true,
    'requiresDeploy', false,
    'published', event.status <> 'draft'
  ) order by event.event_date, event.starts_at), '[]'::jsonb)
  into events
  from (
    select id, title, slug, status, event_date, starts_at
    from public.store_events
    where store_id = target_store
    order by event_date, starts_at
    limit 30
  ) as event;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', popup.id,
    'sectionType', 'popup',
    'name', popup.name,
    'status', popup.status,
    'editable', popup.status <> 'active',
    'requiresDeploy', false,
    'customersSeeDraft', false,
    'tool', 'update_popup_block'
  ) order by popup.updated_at desc), '[]'::jsonb)
  into popups
  from public.store_popups as popup
  where popup.store_id = target_store;

  if tool_name = 'get_website_design_capabilities' then
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
      'renderer', 'custom-storefront',
      'sharedSectionRenderer', false,
      'siteVersion', null,
      'capabilities', jsonb_build_array(
        jsonb_build_object('page', 'home', 'sectionId', 'home-layout', 'sectionType', 'custom-code', 'editable', false, 'editableProperties', '[]'::jsonb, 'canReorder', false, 'canHide', false, 'canDelete', false, 'requiresDeploy', true, 'reason', 'The homepage is this store''s own site code. Storely has no section schema for it.'),
        jsonb_build_object('page', 'home', 'sectionId', 'header', 'sectionType', 'custom-code', 'editable', false, 'editableProperties', '[]'::jsonb, 'canReorder', false, 'canHide', false, 'canDelete', false, 'requiresDeploy', true, 'reason', 'Header chrome is site code. The logo image is the separate logo section.'),
        jsonb_build_object('page', 'home', 'sectionId', 'footer', 'sectionType', 'custom-code', 'editable', false, 'editableProperties', '[]'::jsonb, 'canReorder', false, 'canHide', false, 'canDelete', false, 'requiresDeploy', true, 'reason', 'Footer chrome is site code. Policy links come from the policy documents.'),
        jsonb_build_object('page', 'brand', 'sectionId', 'logo', 'sectionType', 'logo', 'editable', true, 'editableProperties', jsonb_build_array('logoUrl'), 'canReorder', false, 'canHide', true, 'canDelete', false, 'requiresDeploy', false, 'tool', 'update_logo'),
        jsonb_build_object('page', 'brand', 'sectionId', 'brand-colors', 'sectionType', 'brand-colors', 'editable', true, 'editableProperties', jsonb_build_array('colors'), 'canReorder', false, 'canHide', false, 'canDelete', false, 'requiresDeploy', false, 'tool', 'update_brand_colors'),
        jsonb_build_object('page', 'articles', 'sectionId', 'article', 'sectionType', 'article', 'editable', true, 'editableProperties', to_jsonb(allowed), 'canReorder', false, 'canHide', true, 'canDelete', false, 'requiresDeploy', false, 'tool', 'update_page', 'reason', 'Each article id from get_website_structure is editable. Hidden articles are not returned to shoppers.'),
        jsonb_build_object('page', 'policies', 'sectionId', 'policy', 'sectionType', 'policy', 'editable', true, 'editableProperties', jsonb_build_array('title', 'body'), 'canReorder', false, 'canHide', false, 'canDelete', false, 'requiresDeploy', false, 'tool', 'update_policy'),
        jsonb_build_object('page', 'popups', 'sectionId', 'popup', 'sectionType', 'popup', 'editable', true, 'editableProperties', jsonb_build_array('design', 'targeting'), 'canReorder', false, 'canHide', true, 'canDelete', true, 'requiresDeploy', false, 'tool', 'update_popup_block', 'reason', 'Use the popup tools. Active popups refuse design edits.')
      )
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
    'store', jsonb_build_object(
      'name', (select store.name from public.stores as store where store.id = target_store),
      'connection', 'This connection can act only on this store. Another store needs its own connection.'
    ),
    'manifest', jsonb_build_object(
      'renderer', 'custom-storefront',
      'sharedSectionRenderer', false,
      'siteVersion', null,
      'versionSource', 'Storely does not store a per-store website version. Each public site is its own deployment.',
      'homepageSectionsInDatabase', false,
      'adminVisualEditor', 'articles, policies, collections, events, popups, logo, and brand colors'
    ),
    'domains', domains,
    'pages', jsonb_build_array(
      jsonb_build_object('id', 'home', 'path', '/', 'source', 'storefront-code', 'editable', false, 'requiresDeploy', true, 'sections', jsonb_build_array(
        jsonb_build_object('id', 'home-layout', 'sectionType', 'custom-code', 'editable', false, 'requiresDeploy', true, 'editableProperties', '[]'::jsonb, 'supportedActions', '[]'::jsonb),
        jsonb_build_object('id', 'header', 'sectionType', 'custom-code', 'editable', false, 'requiresDeploy', true),
        jsonb_build_object('id', 'footer', 'sectionType', 'custom-code', 'editable', false, 'requiresDeploy', true)
      )),
      jsonb_build_object('id', 'articles', 'path', '/articles/{handle}', 'source', 'store_settings.posts', 'editable', true, 'requiresDeploy', false, 'sections', articles),
      jsonb_build_object('id', 'policies', 'path', '/policies/{id}', 'source', 'store_settings.policies', 'editable', true, 'requiresDeploy', false, 'sections', policies),
      jsonb_build_object('id', 'collections', 'path', '/products', 'source', 'collections', 'editable', true, 'requiresDeploy', false, 'sections', collections),
      jsonb_build_object('id', 'events', 'path', '/events/{slug}', 'source', 'store_events', 'editable', true, 'requiresDeploy', false, 'sections', events),
      jsonb_build_object('id', 'popups', 'source', 'store_popups', 'editable', true, 'requiresDeploy', false, 'sections', popups),
      jsonb_build_object('id', 'brand', 'source', 'store_settings', 'editable', true, 'requiresDeploy', false, 'sections', jsonb_build_array(
        jsonb_build_object('id', 'logo', 'sectionType', 'logo', 'editable', true, 'requiresDeploy', false, 'editableProperties', jsonb_build_array('logoUrl')),
        jsonb_build_object('id', 'brand-colors', 'sectionType', 'brand-colors', 'editable', true, 'requiresDeploy', false, 'editableProperties', jsonb_build_array('colors'))
      ))
    )
    )
  );
end;
$$;

revoke all on function private.mcp_website(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.mcp_dispatch(target_store uuid, tool_name text, args jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tool_name in (
    'get_website_structure', 'get_website_design_capabilities', 'list_available_sections',
    'update_website_section', 'add_website_section', 'remove_website_section', 'reorder_website_sections',
    'save_website_draft', 'publish_website_changes', 'list_website_revisions', 'restore_website_revision'
  ) then
    return private.mcp_website(target_store, tool_name, args);
  end if;
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
