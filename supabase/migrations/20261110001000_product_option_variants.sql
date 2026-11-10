-- Product options such as color and size, with a price and stock for each combination.
-- The storefront reads merch.options and each variant's selected map.

alter table public.product_variants
  add column if not exists selected jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_variants_selected_object'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_selected_object check (jsonb_typeof(selected) = 'object');
  end if;
end
$$;

comment on column public.product_variants.selected is
  'Option name to chosen value, for example {"צבע":"שחור","מידה":"M"}.';

create or replace function private.drop_other_variants(target_store uuid, product_id uuid, kept uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.order_items as item
  set variant_id = null
  from public.product_variants as variant_row
  where item.store_id = target_store
    and variant_row.store_id = target_store
    and item.variant_id = variant_row.id
    and variant_row.product_id = product_id
    and not (variant_row.id = any (coalesce(kept, '{}'::uuid[])));

  delete from public.inventory_movements as movement
  using public.inventory_items as inventory, public.product_variants as variant_row
  where movement.store_id = target_store
    and inventory.store_id = target_store
    and variant_row.store_id = target_store
    and movement.inventory_item_id = inventory.id
    and inventory.variant_id = variant_row.id
    and variant_row.product_id = product_id
    and not (variant_row.id = any (coalesce(kept, '{}'::uuid[])));

  delete from public.inventory_items as inventory
  using public.product_variants as variant_row
  where inventory.store_id = target_store
    and variant_row.store_id = target_store
    and inventory.variant_id = variant_row.id
    and variant_row.product_id = product_id
    and not (variant_row.id = any (coalesce(kept, '{}'::uuid[])));

  delete from public.product_variants as variant_row
  where variant_row.store_id = target_store
    and variant_row.product_id = product_id
    and not (variant_row.id = any (coalesce(kept, '{}'::uuid[])));
end;
$$;

revoke all on function private.drop_other_variants(uuid, uuid, uuid[]) from public, anon, authenticated;

create or replace function public.save_store_product_variants(
  target_store uuid,
  product_id uuid,
  option_groups jsonb,
  variant_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  groups jsonb := '[]'::jsonb;
  names text[] := '{}';
  seen text[];
  values jsonb;
  group_row jsonb;
  option_name text;
  option_value text;
  expected integer := 1;
  group_count integer;
  pos integer;
  cursor integer;
  digit integer;
  value_count integer;
  row_price numeric;
  row_stock integer;
  row_id uuid;
  kept uuid[] := '{}';
  title text;
  selected jsonb;
  product_sku text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.products as product
    where product.store_id = target_store and product.id = product_id
  ) then
    raise exception 'המוצר לא נמצא' using errcode = 'P0002';
  end if;
  if jsonb_typeof(option_groups) is distinct from 'array' or jsonb_typeof(variant_rows) is distinct from 'array' then
    raise exception 'אפשרויות המוצר לא תקינות' using errcode = '22023';
  end if;
  if jsonb_array_length(option_groups) > 3 then
    raise exception 'אפשר להוסיף עד 3 אפשרויות' using errcode = '22023';
  end if;

  for group_row in select entry.value from jsonb_array_elements(option_groups) as entry(value)
  loop
    if jsonb_typeof(group_row) is distinct from 'object' then
      raise exception 'אפשרויות המוצר לא תקינות' using errcode = '22023';
    end if;
    option_name := btrim(coalesce(group_row->>'name', ''));
    if option_name = '' or char_length(option_name) > 40 or option_name ~ '[[:cntrl:]]' then
      raise exception 'שם האפשרות לא תקין' using errcode = '22023';
    end if;
    if option_name = any (names) then
      raise exception 'שם אפשרות כפול' using errcode = '22023';
    end if;
    if jsonb_typeof(group_row->'values') is distinct from 'array' then
      raise exception 'ערכי האפשרות לא תקינים' using errcode = '22023';
    end if;
    names := names || option_name;
    values := '[]'::jsonb;
    seen := '{}';
    for option_value in
      select btrim(item.value)
      from jsonb_array_elements_text(group_row->'values') as item(value)
    loop
      if option_value = '' or char_length(option_value) > 40 or option_value ~ '[[:cntrl:]]' or position('/' in option_value) > 0 then
        raise exception 'ערך אפשרות לא תקין' using errcode = '22023';
      end if;
      if option_value = any (seen) then
        raise exception 'ערך אפשרות כפול' using errcode = '22023';
      end if;
      seen := seen || option_value;
      values := values || to_jsonb(option_value);
    end loop;
    value_count := jsonb_array_length(values);
    if value_count < 1 or value_count > 30 then
      raise exception 'לכל אפשרות צריך בין ערך אחד ל-30' using errcode = '22023';
    end if;
    expected := expected * value_count;
    groups := groups || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'name', option_name,
      'values', values,
      'colors', (
        select nullif(jsonb_object_agg(picked.key, picked.hex), '{}'::jsonb)
        from (
          select item.value as key,
            case
              when coalesce(group_row->'colors'->>item.value, '') ~* '^#[0-9a-f]{6}$'
                then lower(group_row->'colors'->>item.value)
              else null
            end as hex
          from jsonb_array_elements_text(values) as item(value)
        ) as picked
        where picked.hex is not null
      )
    )));
  end loop;

  group_count := jsonb_array_length(groups);

  if group_count = 0 then
    select variant_row.id
    into row_id
    from public.product_variants as variant_row
    where variant_row.store_id = target_store
      and variant_row.product_id = product_id
    order by variant_row.position, variant_row.id
    limit 1;

    if row_id is not null then
      update public.product_variants as variant_row
      set title = '',
          selected = '{}'::jsonb,
          position = 0
      where variant_row.store_id = target_store
        and variant_row.id = row_id;
      perform private.drop_other_variants(target_store, product_id, array[row_id]);
    end if;

    update public.products as product
    set merch = jsonb_set(coalesce(product.merch, '{}'::jsonb), '{options}', '[]'::jsonb, true)
    where product.store_id = target_store
      and product.id = product_id;
  else
    if expected > 100 then
      raise exception 'אפשר עד 100 וריאציות' using errcode = '22023';
    end if;
    if jsonb_array_length(variant_rows) <> expected then
      raise exception 'רשימת הווריאציות לא תואמת לאפשרויות' using errcode = '22023';
    end if;

    select variant_row.sku
    into product_sku
    from public.product_variants as variant_row
    where variant_row.store_id = target_store
      and variant_row.product_id = product_id
      and variant_row.sku is not null
    order by variant_row.position, variant_row.id
    limit 1;

    update public.product_variants as variant_row
    set sku = null
    where variant_row.store_id = target_store
      and variant_row.product_id = product_id
      and variant_row.sku is not null;

    for pos in 0..expected - 1 loop
      if jsonb_typeof(variant_rows->pos) is distinct from 'object' then
        raise exception 'וריאציה לא תקינה' using errcode = '22023';
      end if;
      if coalesce(variant_rows->pos->>'price', '') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
        raise exception 'מחיר וריאציה לא תקין' using errcode = '22023';
      end if;
      if coalesce(variant_rows->pos->>'stock', '') !~ '^[0-9]+$' then
        raise exception 'מלאי וריאציה לא תקין' using errcode = '22023';
      end if;
      row_price := round((variant_rows->pos->>'price')::numeric, 2);
      row_stock := (variant_rows->pos->>'stock')::integer;
      if row_price > 1000000 or row_stock > 1000000 then
        raise exception 'מחיר או מלאי וריאציה לא תקינים' using errcode = '22023';
      end if;

      selected := '{}'::jsonb;
      cursor := pos;
      for digit in reverse group_count - 1..0 loop
        value_count := jsonb_array_length(groups->digit->'values');
        option_value := groups->digit->'values'->> (cursor % value_count);
        cursor := cursor / value_count;
        selected := selected || jsonb_build_object(groups->digit->>'name', option_value);
      end loop;

      title := '';
      for digit in 0..group_count - 1 loop
        option_value := selected->> (groups->digit->>'name');
        title := case when title = '' then option_value else title || ' / ' || option_value end;
      end loop;

      row_id := null;
      if coalesce(variant_rows->pos->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        row_id := (variant_rows->pos->>'id')::uuid;
        if row_id = any (kept) or not exists (
          select 1 from public.product_variants as variant_row
          where variant_row.store_id = target_store
            and variant_row.product_id = product_id
            and variant_row.id = row_id
        ) then
          row_id := null;
        end if;
      end if;

      if row_id is null then
        select variant_row.id
        into row_id
        from public.product_variants as variant_row
        where variant_row.store_id = target_store
          and variant_row.product_id = product_id
          and variant_row.title = title
          and not (variant_row.id = any (kept))
        limit 1;
      end if;

      if row_id is null then
        insert into public.product_variants (store_id, product_id, title, price, position, selected)
        values (target_store, product_id, title, row_price, pos, selected)
        returning id into row_id;
        insert into public.inventory_items (store_id, variant_id, available)
        values (target_store, row_id, row_stock);
      else
        update public.product_variants as variant_row
        set title = title,
            price = row_price,
            position = pos,
            selected = selected
        where variant_row.store_id = target_store
          and variant_row.id = row_id;
        insert into public.inventory_items (store_id, variant_id, available)
        values (target_store, row_id, row_stock)
        on conflict (store_id, variant_id) do update
        set available = excluded.available;
      end if;

      kept := kept || row_id;
    end loop;

    if product_sku is not null and cardinality(kept) > 0 then
      update public.product_variants as variant_row
      set sku = product_sku
      where variant_row.store_id = target_store
        and variant_row.id = kept[1];
    end if;

    perform private.drop_other_variants(target_store, product_id, kept);

    update public.products as product
    set merch = jsonb_set(coalesce(product.merch, '{}'::jsonb), '{options}', groups, true)
    where product.store_id = target_store
      and product.id = product_id;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', variant_row.id,
      'title', variant_row.title,
      'price', variant_row.price,
      'stock', coalesce(inventory.available, 0),
      'selected', coalesce(variant_row.selected, '{}'::jsonb),
      'position', variant_row.position
    ) order by variant_row.position, variant_row.id)
    from public.product_variants as variant_row
    left join public.inventory_items as inventory
      on inventory.store_id = variant_row.store_id
     and inventory.variant_id = variant_row.id
    where variant_row.store_id = target_store
      and variant_row.product_id = product_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.save_store_product_variants(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_store_product_variants(uuid, uuid, jsonb, jsonb) to authenticated, service_role;

do $patch$
declare
  src text;
  old text := $old$        'seo', jsonb_build_object('title', seo_title, 'description', seo_description)
      ),$old$;
  patched text := $new$        'seo', jsonb_build_object('title', seo_title, 'description', seo_description)
      ) || jsonb_build_object('options', coalesce(product.merch->'options', '[]'::jsonb)),$new$;
begin
  src := pg_get_functiondef('public.save_store_product_merch(uuid, uuid, jsonb)'::regprocedure);
  if position('product.merch->''options''' in src) > 0 then
    return;
  end if;
  if position(old in src) = 0 then
    raise exception 'save_store_product_merch options anchor moved';
  end if;
  execute replace(src, old, patched);
end
$patch$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.store_public_catalog(uuid)'::regprocedure);
  if position('''selected'', coalesce(variant_row.selected' in src) = 0 then
    if position($old$                'title', variant_row.title,
                'sku', variant_row.sku,$old$ in src) = 0 then
      raise exception 'store_public_catalog variant title moved';
    end if;
    src := replace(src, $old$                'title', variant_row.title,
                'sku', variant_row.sku,$old$, $new$                'title', variant_row.title,
                'sku', variant_row.sku,
                'selected', coalesce(variant_row.selected, '{}'::jsonb),$new$);
  end if;
  if position('''options'', coalesce(catalog_row.merch->''options''' in src) = 0 then
    if position($old$          'variants', catalog_row.variants,$old$ in src) = 0 then
      raise exception 'store_public_catalog variants field moved';
    end if;
    src := replace(src, $old$          'variants', catalog_row.variants,$old$, $new$          'variants', catalog_row.variants,
          'options', coalesce(catalog_row.merch->'options', '[]'::jsonb),$new$);
  end if;
  execute src;
end
$patch$;

do $patch$
declare
  src text;
  old text := $old$          'variant', coalesce(variant.title, ''),
          'stock', coalesce(inventory.available, 0),$old$;
  patched text := $new$          'variant', coalesce(variant.title, ''),
          'variants', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', variant_row.id,
              'title', variant_row.title,
              'price', variant_row.price,
              'stock', coalesce(stock_row.available, 0),
              'selected', coalesce(variant_row.selected, '{}'::jsonb)
            ) order by variant_row.position, variant_row.id)
            from public.product_variants as variant_row
            left join public.inventory_items as stock_row
              on stock_row.store_id = variant_row.store_id
             and stock_row.variant_id = variant_row.id
            where variant_row.store_id = product.store_id
              and variant_row.product_id = product.id
          ), '[]'::jsonb),
          'stock', coalesce(inventory.available, 0),$new$;
begin
  src := pg_get_functiondef('public.store_admin_slice(uuid, text)'::regprocedure);
  if position('''selected'', coalesce(variant_row.selected' in src) > 0 then
    return;
  end if;
  if position(old in src) = 0 then
    raise exception 'store_admin_slice variant field moved';
  end if;
  execute replace(src, old, patched);
end
$patch$;
