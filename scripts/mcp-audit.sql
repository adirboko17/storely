create or replace function pg_temp.mcp_step(sid uuid, tool text, args jsonb)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  begin
    result := private.mcp_dispatch(sid, tool, coalesce(args, '{}'::jsonb));
  exception
    when others then
      result := jsonb_build_object('ok', false, 'code', 'UNCAUGHT', 'error', left(sqlstate || ' ' || sqlerrm, 240));
  end;
  return coalesce(result, jsonb_build_object('ok', false, 'code', 'EMPTY', 'error', 'no result'));
end;
$$;

do $$
declare
  sid uuid;
  uid uuid;
  role_id uuid;
  result jsonb;
  failures jsonb := '[]'::jsonb;
  tool text;
  tools text[] := array[
    'store_summary','list_products','get_product','create_product','update_product','delete_products',
    'list_customers','create_customer','update_customer','list_discounts','list_posts','get_post','create_post','update_post','delete_post',
    'list_collections','get_collection','create_collection','update_collection','list_orders','get_order','create_order','update_order','delete_order',
    'list_policies','get_policy','update_policy','get_storefront','update_logo','update_brand_colors',
    'list_popups','get_popup','create_popup','update_popup','publish_popup','preview_popup','get_popup_analytics','duplicate_popup','delete_popup',
    'get_design_schema','create_discount','update_discount','deactivate_discount','list_promotions','create_promotion','update_promotion',
    'list_bundles','create_bundle','update_bundle','list_reviews','get_review','create_review','moderate_review',
    'list_pages','create_page','update_page','update_seo','get_seo_audit',
    'get_checkout_settings','update_checkout_settings','update_cart_rules','list_abandoned_carts','get_abandoned_cart',
    'list_shipping_methods','upsert_shipping_method','get_inventory','adjust_inventory','bulk_update_inventory','list_shipments',
    'list_media','get_product_image','get_product_images','get_brand_assets','upload_design_asset','import_media','delete_media','list_campaigns','create_campaign','update_campaign','list_message_templates','create_message_template',
    'list_automations','upsert_automation','create_segment','send_test_message','get_campaign_analytics',
    'get_sales_analytics','get_product_analytics','get_customer_analytics','get_conversion_funnel','export_report',
    'get_store_settings','update_store_settings','list_admin_roles','get_audit_log'
  ];
  product_id uuid;
  customer_id uuid;
  popup_id uuid;
  copied_id uuid;
  order_number text;
  post_id text;
  collection_id text;
  discount_id text;
  campaign_id text;
  checked integer := 0;
  passed integer := 0;
begin
  select member.user_id into uid
  from public.store_members as member
  where member.store_id = '27027a78-4e5b-43c8-b064-a43e8603e172'
    and member.status = 'active'
  order by member.created_at
  limit 1;

  insert into public.stores (name, environment)
  values ('mcp-audit-disposable', 'development')
  returning id into sid;
  insert into public.store_settings (store_id, display_name, logo_url)
  values (sid, 'mcp-audit-disposable', 'https://example.com/logo.png');
  perform private.copy_builtin_roles(sid);
  select id into role_id from public.roles where store_id = sid and key = 'owner';
  insert into public.store_members (store_id, user_id, role_id, display_name, status)
  values (sid, uid, role_id, 'audit', 'active');
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);

  foreach tool in array tools loop
    checked := checked + 1;
    result := pg_temp.mcp_step(sid, tool, '{}'::jsonb);
    if result->>'code' = 'UNCAUGHT' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', tool, 'step', 'smoke', 'error', result->>'error'));
    else
      passed := passed + 1;
    end if;
  end loop;

  result := pg_temp.mcp_step(sid, 'create_product', jsonb_build_object('title', 'Audit product', 'price', 19, 'stock', 5, 'status', 'draft'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_product', 'step', 'create', 'error', result->>'code', 'detail', result->>'error'));
  else
    product_id := (result#>>'{data,id}')::uuid;
    result := pg_temp.mcp_step(sid, 'get_product', jsonb_build_object('id', product_id));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_product', 'step', 'get', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'update_product', jsonb_build_object('id', product_id, 'title', 'Audit product renamed'));
    if result->>'ok' <> 'true' or result#>>'{data,title}' <> 'Audit product renamed' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_product', 'step', 'rename', 'detail', left(result::text, 240)));
    end if;
    result := pg_temp.mcp_step(sid, 'get_product', jsonb_build_object('id', product_id));
    if result#>>'{data,title}' is distinct from 'Audit product renamed' and result->>'ok' = 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_product', 'step', 'title persisted', 'detail', left(result::text, 180)));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_customer', jsonb_build_object('name', 'Audit Customer', 'email', 'audit-customer@example.com'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_customer', 'step', 'create', 'detail', result->>'error'));
  else
    customer_id := (result#>>'{data,id}')::uuid;
    result := pg_temp.mcp_step(sid, 'update_customer', jsonb_build_object('id', customer_id, 'city', 'Tel Aviv'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_customer', 'step', 'city', 'detail', result->>'error'));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_post', jsonb_build_object('title', 'Audit article', 'body', 'Hello', 'visible', false));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_post', 'step', 'create', 'detail', result->>'error'));
  else
    post_id := result#>>'{data,id}';
    result := pg_temp.mcp_step(sid, 'update_post', jsonb_build_object('id', post_id, 'title', 'Audit article renamed'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_post', 'step', 'rename', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'get_post', jsonb_build_object('id', post_id));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_post', 'step', 'get', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'delete_post', jsonb_build_object('id', post_id, 'confirm', true));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'delete_post', 'step', 'delete', 'detail', result->>'error'));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_page', jsonb_build_object('title', 'Audit page', 'visible', false));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_page', 'step', 'create', 'detail', result->>'error'));
  else
    post_id := result#>>'{data,id}';
    result := pg_temp.mcp_step(sid, 'update_page', jsonb_build_object('id', post_id, 'seoTitle', 'Audit SEO'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_page', 'step', 'seo', 'detail', result->>'error'));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_collection', jsonb_build_object('title', 'Audit collection'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_collection', 'step', 'create', 'detail', result->>'error'));
  else
    collection_id := coalesce(result#>>'{data,id}', result#>>'{data,title}');
    result := pg_temp.mcp_step(sid, 'update_collection', jsonb_build_object('title', 'Audit collection', 'description', 'Audit description'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_collection', 'step', 'description', 'detail', left(result::text, 240)));
    end if;
    result := pg_temp.mcp_step(sid, 'get_collection', jsonb_build_object('title', 'Audit collection'));
    if result#>>'{data,description}' is distinct from 'Audit description' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_collection', 'step', 'description persisted', 'detail', left(result::text, 240)));
    end if;
  end if;

  if product_id is not null then
    result := pg_temp.mcp_step(sid, 'create_order', jsonb_build_object('name', 'Audit Buyer', 'payment', 'pending', 'lines', jsonb_build_array(jsonb_build_object('productId', product_id, 'quantity', 1))));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_order', 'step', 'pending', 'detail', result->>'error'));
    else
      order_number := result#>>'{data,orderNumber}';
      result := pg_temp.mcp_step(sid, 'get_order', jsonb_build_object('number', order_number));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_order', 'step', 'get', 'detail', result->>'error'));
      end if;
      result := pg_temp.mcp_step(sid, 'update_order', jsonb_build_object('number', order_number, 'comment', 'audit note', 'customerStatus', 'delivered', 'fulfillment', 'fulfilled'));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_order', 'step', 'note', 'detail', result->>'error'));
      else
        result := pg_temp.mcp_step(sid, 'create_review', jsonb_build_object('orderNumber', order_number::integer, 'productId', product_id, 'rating', 5, 'body', 'Audit review'));
        if result->>'ok' <> 'true' then
          failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_review', 'step', 'create', 'detail', result->>'error'));
        else
          result := pg_temp.mcp_step(sid, 'moderate_review', jsonb_build_object('id', result#>>'{data,id}', 'decision', 'approve'));
          if result->>'ok' <> 'true' then
            failures := failures || jsonb_build_array(jsonb_build_object('tool', 'moderate_review', 'step', 'approve', 'detail', result->>'error'));
          end if;
        end if;
      end if;
      result := pg_temp.mcp_step(sid, 'delete_order', jsonb_build_object('number', order_number, 'confirm', true));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'delete_order', 'step', 'delete', 'detail', result->>'error'));
      end if;
    end if;

    result := pg_temp.mcp_step(sid, 'create_bundle', jsonb_build_object('productId', product_id, 'bundles', jsonb_build_array(jsonb_build_object('qty', 2, 'price', 30, 'label', 'pair'))));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_bundle', 'step', 'create', 'detail', result->>'error'));
    else
      result := pg_temp.mcp_step(sid, 'update_bundle', jsonb_build_object('productId', product_id, 'bundles', jsonb_build_array(jsonb_build_object('qty', 3, 'price', 40, 'label', 'trio'))));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_bundle', 'step', 'update', 'detail', result->>'error'));
      end if;
    end if;

    result := pg_temp.mcp_step(sid, 'import_media', jsonb_build_object('productId', product_id, 'url', 'https://example.com/audit-image.png'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'import_media', 'step', 'import', 'detail', result->>'error'));
    else
      result := pg_temp.mcp_step(sid, 'delete_media', jsonb_build_object('productId', product_id, 'path', 'https://example.com/audit-image.png', 'confirm', true));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'delete_media', 'step', 'delete', 'detail', result->>'error'));
      end if;
    end if;

    result := pg_temp.mcp_step(sid, 'adjust_inventory', jsonb_build_object('productId', product_id, 'delta', 2));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'adjust_inventory', 'step', 'delta', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'bulk_update_inventory', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('productId', product_id, 'stock', 4))));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'bulk_update_inventory', 'step', 'stock', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'update_seo', jsonb_build_object('productId', product_id, 'title', 'Audit product SEO', 'description', 'A test description'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_seo', 'step', 'product', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'create_promotion', jsonb_build_object('code', 'AUDITBX', 'kind', 'bxgy', 'bxMode', 'qty', 'bxBuyIds', jsonb_build_array(product_id::text), 'bxBuy', '2', 'bxGet', '1'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_promotion', 'step', 'create', 'detail', result->>'error'));
    else
      result := pg_temp.mcp_step(sid, 'update_promotion', jsonb_build_object('id', result#>>'{data,id}', 'bxBuy', '3'));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_promotion', 'step', 'quantity', 'detail', result->>'error'));
      end if;
    end if;
    result := pg_temp.mcp_step(sid, 'delete_products', jsonb_build_object('ids', jsonb_build_array(product_id), 'confirm', true));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'delete_products', 'step', 'delete', 'detail', result->>'error'));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_popup', jsonb_build_object(
    'name', 'Audit popup',
    'blocks', jsonb_build_array(
      jsonb_build_object('type', 'logo'),
      jsonb_build_object('type', 'heading', 'text', 'Hello', 'align', 'center'),
      jsonb_build_object('type', 'field', 'fieldType', 'email', 'name', 'email', 'label', 'Email', 'required', true),
      jsonb_build_object('type', 'row', 'columns', jsonb_build_array(jsonb_build_object('width', 50, 'blocks', jsonb_build_array(jsonb_build_object('type', 'button', 'label', 'Go', 'href', '/shop')))))
    ),
    'mobile', jsonb_build_object('radius', 8, 'padding', 12, 'gap', 6),
    'trigger', 'delay',
    'delaySeconds', 3,
    'device', 'all'
  ));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_popup', 'step', 'design', 'detail', result->>'error'));
  else
    popup_id := (result#>>'{data,id}')::uuid;
    result := pg_temp.mcp_step(sid, 'update_popup', jsonb_build_object('id', popup_id, 'name', 'Audit popup renamed'));
    if result->>'ok' <> 'true' or result#>>'{data,name}' <> 'Audit popup renamed' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_popup', 'step', 'name only', 'detail', left(result::text, 300)));
    end if;
    result := pg_temp.mcp_step(sid, 'get_popup', jsonb_build_object('id', popup_id));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_popup', 'step', 'get', 'detail', result->>'error'));
    elsif result#>>'{data,name}' <> 'Audit popup renamed' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'get_popup', 'step', 'name persisted', 'detail', result#>>'{data,name}'));
    elsif result#>>'{data,design,blocks,0,src}' is distinct from 'https://example.com/logo.png' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_popup', 'step', 'logo stamp', 'detail', coalesce(result#>>'{data,design,blocks,0,src}', 'missing')));
    elsif result#>>'{data,design,mobile,radius}' is distinct from '8' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_popup', 'step', 'mobile radius', 'detail', coalesce(result#>>'{data,design,mobile,radius}', 'missing')));
    end if;
    result := pg_temp.mcp_step(sid, 'update_popup', jsonb_build_object('id', popup_id, 'background', '#112233', 'submitLabel', 'Send', 'trigger', 'exit', 'frequency', 'once'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_popup', 'step', 'partial design', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'get_popup', jsonb_build_object('id', popup_id));
    if result#>>'{data,design,background}' is distinct from '#112233' or result#>>'{data,targeting,trigger}' is distinct from 'exit' or result#>>'{data,name}' is distinct from 'Audit popup renamed' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_popup', 'step', 'omitted fields', 'detail', left(result::text, 300)));
    end if;
    result := pg_temp.mcp_step(sid, 'preview_popup', jsonb_build_object('id', popup_id));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'preview_popup', 'step', 'preview', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'publish_popup', jsonb_build_object('id', popup_id, 'status', 'paused'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'publish_popup', 'step', 'pause', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'duplicate_popup', jsonb_build_object('id', popup_id));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'duplicate_popup', 'step', 'copy', 'detail', result->>'error'));
    else
      copied_id := (result#>>'{data,id}')::uuid;
      result := pg_temp.mcp_step(sid, 'delete_popup', jsonb_build_object('id', copied_id, 'confirm', true));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'delete_popup', 'step', 'delete copy', 'detail', result->>'error'));
      end if;
    end if;
    result := pg_temp.mcp_step(sid, 'delete_popup', jsonb_build_object('id', popup_id, 'confirm', true));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'delete_popup', 'step', 'delete', 'detail', result->>'error'));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_discount', jsonb_build_object('code', 'AUDIT10', 'kind', 'order', 'valueType', 'pct', 'value', 10));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_discount', 'step', 'create', 'detail', result->>'error'));
  else
    discount_id := coalesce(result#>>'{data,id}', result#>>'{data,code}');
    result := pg_temp.mcp_step(sid, 'update_discount', jsonb_build_object('id', result#>>'{data,id}', 'code', 'AUDIT10', 'value', 12));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_discount', 'step', 'value', 'detail', left(result::text, 240)));
    else
      result := pg_temp.mcp_step(sid, 'deactivate_discount', jsonb_build_object('code', 'AUDIT10', 'confirm', true));
      if result->>'ok' <> 'true' then
        failures := failures || jsonb_build_array(jsonb_build_object('tool', 'deactivate_discount', 'step', 'expire', 'detail', result->>'error'));
      end if;
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'update_logo', jsonb_build_object('logoUrl', 'https://example.com/logo.png'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_logo', 'step', 'set', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'update_policy', jsonb_build_object('kind', 'return', 'title', 'Audit returns', 'body', 'Test policy body'));
  if result->>'ok' <> 'true' and result->>'error' is distinct from 'המדיניות לא נמצאה' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_policy', 'step', 'body', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'update_cart_rules', jsonb_build_object('pickup', false));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_cart_rules', 'step', 'pickup', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'update_checkout_settings', jsonb_build_object('pickup', true));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_checkout_settings', 'step', 'pickup', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'upsert_shipping_method', jsonb_build_object('name', 'Audit delivery', 'price', 25));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'upsert_shipping_method', 'step', 'create', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'update_store_settings', jsonb_build_object('language', 'he'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_store_settings', 'step', 'language', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'update_brand_colors', jsonb_build_object('colors', jsonb_build_array('#112233')));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_brand_colors', 'step', 'one color', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'update_brand_colors', jsonb_build_object('colors', jsonb_build_array('#112233', '#ffffff')));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_brand_colors', 'step', 'add color', 'detail', result->>'error'));
  end if;

  result := pg_temp.mcp_step(sid, 'create_message_template', jsonb_build_object('channel', 'email', 'name', 'Audit template', 'subject', 'Hello', 'body', 'Body'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_message_template', 'step', 'create', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'create_campaign', jsonb_build_object('name', 'Audit campaign', 'channel', 'email', 'body', 'Hello', 'subject', 'Hi'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_campaign', 'step', 'draft', 'detail', result->>'error'));
  else
    campaign_id := result#>>'{data,id}';
    result := pg_temp.mcp_step(sid, 'update_campaign', jsonb_build_object('id', campaign_id, 'name', 'Audit campaign renamed'));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'update_campaign', 'step', 'rename', 'detail', result->>'error'));
    end if;
    result := pg_temp.mcp_step(sid, 'send_test_message', jsonb_build_object('id', campaign_id));
    if result->>'ok' <> 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'send_test_message', 'step', 'not delivered', 'detail', result->>'error'));
    elsif result#>>'{data,sent}' = 'true' then
      failures := failures || jsonb_build_array(jsonb_build_object('tool', 'send_test_message', 'step', 'unexpected send', 'detail', 'sent true'));
    end if;
  end if;

  result := pg_temp.mcp_step(sid, 'create_segment', jsonb_build_object('name', 'Audit segment', 'key', 'subscribed'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'create_segment', 'step', 'create', 'detail', result->>'error'));
  end if;
  result := pg_temp.mcp_step(sid, 'export_report', jsonb_build_object('report', 'sales'));
  if result->>'ok' <> 'true' then
    failures := failures || jsonb_build_array(jsonb_build_object('tool', 'export_report', 'step', 'sales', 'detail', result->>'error'));
  end if;

  raise exception 'audit checked=% failures=% detail=%', checked, jsonb_array_length(failures), left(failures::text, 6000);
end
$$;
