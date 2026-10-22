-- Storefront grids follow products.position. New products are appended.
-- Existing rows keep today's created_at order until someone drags them.

alter table public.collections add column if not exists manual_sort boolean not null default false;

alter table public.products add column if not exists position integer;

update public.products as product
set position = ranked.pos
from (
  select id, (row_number() over (partition by store_id order by created_at, id) - 1)::integer as pos
  from public.products
) as ranked
where product.id = ranked.id
  and product.position is null;

alter table public.products alter column position set not null;

create index if not exists products_position_idx on public.products (store_id, position, id);

create or replace function private.assign_product_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(existing.position), -1) + 1
    into new.position
    from public.products as existing
    where existing.store_id = new.store_id;
  end if;
  return new;
end;
$$;

drop trigger if exists products_assign_position on public.products;
create trigger products_assign_position
before insert on public.products
for each row execute function private.assign_product_position();

create or replace function public.reorder_store_products(target_store uuid, product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested integer;
  matched integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if product_ids is null or cardinality(product_ids) = 0 then
    return;
  end if;
  if cardinality(product_ids) > 500 then
    raise exception 'יותר מדי מוצרים' using errcode = '22023';
  end if;

  select count(*)::integer into requested from unnest(product_ids) as item(id);
  select count(distinct item.id)::integer into matched from unnest(product_ids) as item(id);
  if matched <> requested then
    raise exception 'רשימת המוצרים לא תקינה' using errcode = '22023';
  end if;

  select count(*)::integer
  into matched
  from public.products as product
  where product.store_id = target_store
    and product.id = any (product_ids);
  if matched <> requested then
    raise exception 'המוצר לא נמצא' using errcode = 'P0002';
  end if;

  with ordered as (
    select item.id, item.ord
    from unnest(product_ids) with ordinality as item(id, ord)
  ),
  slots as (
    select product.position, row_number() over (order by product.position, product.created_at, product.id) as slot
    from public.products as product
    where product.store_id = target_store
      and product.id = any (product_ids)
  )
  update public.products as product
  set position = slots.position
  from ordered
  join slots on slots.slot = ordered.ord
  where product.store_id = target_store
    and product.id = ordered.id;
end;
$$;

revoke all on function public.reorder_store_products(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_store_products(uuid, uuid[]) to authenticated;

do $$
declare
  src text;
  needle text;
  patched text;
begin
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  needle := 'order by product.created_at)';
  patched := 'order by product.position, product.created_at)';
  if position('order by product.position, product.created_at)' in src) = 0 then
    if position(needle in src) = 0 then
      raise exception 'admin snapshot product order missing';
    end if;
    src := replace(src, needle, patched);
  end if;
  needle := '''hidden'', collection.hidden, ''productIds''';
  patched := '''hidden'', collection.hidden, ''manualSort'', collection.manual_sort, ''productIds''';
  if position('''manualSort'', collection.manual_sort' in src) = 0 then
    if position(needle in src) = 0 then
      raise exception 'admin snapshot collection fields missing';
    end if;
    src := replace(src, needle, patched);
  end if;
  execute src;

  src := pg_get_functiondef('public.store_public_catalog(uuid)'::regprocedure);
  if position('catalog_row.position' in src) = 0 then
    needle := 'product.created_at,';
    patched := 'product.position,' || E'\n          product.created_at,';
    if position(needle in src) = 0 then
      raise exception 'catalog created_at column missing';
    end if;
    src := replace(src, needle, patched);
    needle := 'order by catalog_row.created_at';
    patched := 'order by catalog_row.position, catalog_row.created_at';
    if position(needle in src) = 0 then
      raise exception 'catalog product order missing';
    end if;
    src := replace(src, needle, patched);
  end if;
  needle := '''description'', collection.description,';
  patched := '''description'', collection.description,' || E'\n          ''manualSort'', collection.manual_sort,';
  if position('''manualSort'', collection.manual_sort' in src) = 0 then
    if position(needle in src) = 0 then
      raise exception 'catalog collection description missing';
    end if;
    src := replace(src, needle, patched);
  end if;
  execute src;

  src := pg_get_functiondef('public.save_store_collection(uuid, jsonb)'::regprocedure);
  if position('manual_sort' in src) = 0 then
    needle := 'exclude_out_of_stock, image, hidden)';
    patched := 'exclude_out_of_stock, image, hidden, manual_sort)';
    if position(needle in src) = 0 then
      raise exception 'collection insert columns missing';
    end if;
    src := replace(src, needle, patched);
    needle := 'coalesce(collection->>''image'', ''''), coalesce(collection->>''hidden'', ''false'') = ''true'')';
    patched := 'coalesce(collection->>''image'', ''''), coalesce(collection->>''hidden'', ''false'') = ''true'', case when collection ? ''manualSort'' then (collection->>''manualSort'') = ''true'' else false end)';
    if position(needle in src) = 0 then
      raise exception 'collection insert values missing';
    end if;
    src := replace(src, needle, patched);
    needle := 'hidden = coalesce(collection->>''hidden'', ''false'') = ''true''';
    patched := 'hidden = coalesce(collection->>''hidden'', ''false'') = ''true'', manual_sort = case when collection ? ''manualSort'' then (collection->>''manualSort'') = ''true'' else row.manual_sort end';
    if position(needle in src) = 0 then
      raise exception 'collection update missing';
    end if;
    execute replace(src, needle, patched);
  end if;
end $$;
