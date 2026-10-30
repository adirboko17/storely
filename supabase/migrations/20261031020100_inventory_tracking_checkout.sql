-- Publish stock to the storefront, and skip the stock check when a product is untracked.

do $patch$
declare
  src text;
  old text;
  patched text;
begin
  src := pg_get_functiondef('public.store_public_catalog(uuid)'::regprocedure);
  if position('''tracked'', catalog_row.tracked' in src) = 0 then
    old := $old$          'tags', catalog_row.tags,
          'variants', catalog_row.variants,$old$;
    patched := $new$          'tags', catalog_row.tags,
          'tracked', catalog_row.tracked,
          'stock', catalog_row.stock,
          'variants', catalog_row.variants,$new$;
    if position(old in src) = 0 then
      raise exception 'store_public_catalog product fields moved';
    end if;
    src := replace(src, old, patched);
  end if;

  if position('product.track_inventory as tracked' in src) = 0 then
    old := $old$          product.tags,
          coalesce(($old$;
    patched := $new$          product.tags,
          product.track_inventory as tracked,
          coalesce((
            select sum(inventory.available)
            from public.product_variants as stock_variant
            join public.inventory_items as inventory
              on inventory.store_id = stock_variant.store_id
             and inventory.variant_id = stock_variant.id
            where stock_variant.store_id = product.store_id
              and stock_variant.product_id = product.id
          ), 0) as stock,
          coalesce(($new$;
    if position(old in src) = 0 then
      raise exception 'store_public_catalog product select moved';
    end if;
    src := replace(src, old, patched);
  end if;

  if position('''tracked'', product.track_inventory' in src) = 0 then
    old := $old$                'price', variant_row.price,
                'position', variant_row.position$old$;
    patched := $new$                'price', variant_row.price,
                'position', variant_row.position,
                'stock', coalesce((
                  select inventory.available
                  from public.inventory_items as inventory
                  where inventory.store_id = variant_row.store_id
                    and inventory.variant_id = variant_row.id
                ), 0),
                'tracked', product.track_inventory$new$;
    if position(old in src) = 0 then
      raise exception 'store_public_catalog variant fields moved';
    end if;
    src := replace(src, old, patched);
  end if;
  execute src;
end
$patch$;

do $patch$
declare
  src text;
  old text := $old$          'stock', coalesce(inventory.available, 0),$old$;
  patched text := $new$          'stock', coalesce(inventory.available, 0),
          'trackInventory', product.track_inventory,$new$;
begin
  src := pg_get_functiondef('public.store_admin_slice(uuid, text)'::regprocedure);
  if position('''trackInventory'', product.track_inventory' in src) > 0 then
    return;
  end if;
  if position(old in src) = 0 then
    raise exception 'store_admin_slice stock field moved';
  end if;
  execute replace(src, old, patched);
end
$patch$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('private.storefront_cart(uuid, jsonb)'::regprocedure);
  if position('product.track_inventory' in src) > 0 then
    return;
  end if;
  if position('  available integer;' in src) = 0
    or position('      inventory.available,' in src) = 0
    or position('    into unit_price, available, product_id, product_title, variant_title, variant_sku' in src) = 0
    or position('    if coalesce(available, 0) < held + qty then' in src) = 0 then
    raise exception 'storefront_cart stock check moved';
  end if;
  src := replace(src, '  available integer;', E'  available integer;\n  tracked boolean;');
  src := replace(src, '      inventory.available,', E'      inventory.available,\n      product.track_inventory,');
  src := replace(
    src,
    '    into unit_price, available, product_id, product_title, variant_title, variant_sku',
    '    into unit_price, available, tracked, product_id, product_title, variant_title, variant_sku'
  );
  src := replace(
    src,
    '    if coalesce(available, 0) < held + qty then',
    '    if tracked and coalesce(available, 0) < held + qty then'
  );
  execute src;
end
$patch$;

do $patch$
declare
  name text;
  src text;
  store_name text;
  line_name text;
  guard text;
  check_sql text;
begin
  foreach name in array array[
    'public.place_storefront_order(text,text,text,jsonb,text,text,text,text,text,text,text,text,text,text)',
    'public.place_store_cash_sale(uuid,jsonb,numeric,numeric)'
  ]
  loop
    src := pg_get_functiondef(name::regprocedure);
    if position('variant_tracks_inventory' in src) > 0 then
      continue;
    end if;
    store_name := case when name like 'public.place_storefront_order%' then 'found_store' else 'target_store' end;
    line_name := 'line';
    guard := format(
      ' and private.variant_tracks_inventory(%s, (%s->>''variantId'')::uuid)',
      store_name,
      line_name
    );
    check_sql := 'and inventory.available >= (' || line_name || '->>''quantity'')::integer';
    if position(check_sql in src) = 0 or position('if taken is null then' in src) = 0 then
      raise exception 'inventory guard moved in %', name;
    end if;
    src := replace(src, check_sql, check_sql || guard);
    src := replace(src, 'if taken is null then', 'if taken is null and private.variant_tracks_inventory(' || store_name || ', (' || line_name || '->>''variantId'')::uuid) then');
    execute src;
  end loop;
end
$patch$;

do $patch$
declare
  src text;
  guard text := ' and private.variant_tracks_inventory(target_store, (hold->>''variantId'')::uuid)';
begin
  src := pg_get_functiondef('public.create_store_order(uuid, jsonb)'::regprocedure);
  if position('variant_tracks_inventory' in src) > 0 then
    return;
  end if;
  if position('if found and taken < (hold->>''quantity'')::integer then' in src) = 0
    or position('and inventory.available >= (hold->>''quantity'')::integer' in src) = 0
    or position('and inventory.variant_id = (hold->>''variantId'')::uuid' in src) = 0 then
    raise exception 'create_store_order inventory guard moved';
  end if;
  src := replace(
    src,
    'if found and taken < (hold->>''quantity'')::integer then',
    'if found and private.variant_tracks_inventory(target_store, (hold->>''variantId'')::uuid) and taken < (hold->>''quantity'')::integer then'
  );
  src := replace(
    src,
    'and inventory.available >= (hold->>''quantity'')::integer',
    'and inventory.available >= (hold->>''quantity'')::integer' || guard
  );
  src := replace(
    src,
    'and inventory.variant_id = (hold->>''variantId'')::uuid',
    'and inventory.variant_id = (hold->>''variantId'')::uuid' || guard
  );
  execute src;
end
$patch$;
