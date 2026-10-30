-- A product can stay unlimited, or sell only while stock remains.
-- track_inventory false means checkout does not read or change inventory.

alter table public.products
  add column if not exists track_inventory boolean not null default true;

comment on column public.products.track_inventory is
  'False means the product stays for sale with no stock limit.';

create or replace function private.variant_tracks_inventory(target_store uuid, variant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select product.track_inventory
    from public.product_variants as variant_row
    join public.products as product
      on product.store_id = variant_row.store_id
     and product.id = variant_row.product_id
    where variant_row.store_id = target_store
      and variant_row.id = variant
  ), true);
$$;

revoke all on function private.variant_tracks_inventory(uuid, uuid) from public, anon, authenticated;

drop function if exists public.save_store_product(uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, text[], text, text, integer, text);

create or replace function public.save_store_product(
  target_store uuid,
  product_id uuid,
  product_title text,
  product_status text,
  product_price numeric,
  product_compare numeric,
  product_cost numeric,
  product_vendor text,
  product_category text,
  product_description text,
  product_tags text[],
  product_sku text,
  product_barcode text,
  product_stock integer,
  variant_title text,
  product_track_inventory boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  saved_variant uuid;
  tracks boolean := coalesce(product_track_inventory, true);
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(product_title, ''))) = 0 then
    raise exception '׳—׳¡׳¨׳” ׳›׳•׳×׳¨׳× ׳׳׳•׳¦׳¨' using errcode = '22023';
  end if;
  if product_status not in ('active', 'draft', 'archived') then
    raise exception '׳¡׳˜׳˜׳•׳¡ ׳׳•׳¦׳¨ ׳׳ ׳×׳§׳™׳' using errcode = '22023';
  end if;
  if product_price is null or product_price < 0 or coalesce(product_cost, 0) < 0 or coalesce(product_stock, 0) < 0 then
    raise exception '׳׳—׳™׳¨ ׳׳• ׳׳׳׳™ ׳׳ ׳×׳§׳™׳ ׳™׳' using errcode = '22023';
  end if;

  if product_id is null then
    insert into public.products (
      store_id, title, status, description, vendor, category, price, compare_at, cost, tags, track_inventory
    )
    values (
      target_store,
      btrim(product_title),
      product_status,
      coalesce(product_description, ''),
      coalesce(product_vendor, ''),
      coalesce(product_category, ''),
      product_price,
      product_compare,
      coalesce(product_cost, 0),
      coalesce(product_tags, '{}'),
      tracks
    )
    returning id into saved_id;
  else
    update public.products as product
    set title = btrim(product_title),
        status = product_status,
        description = coalesce(product_description, ''),
        vendor = coalesce(product_vendor, ''),
        category = coalesce(product_category, ''),
        price = product_price,
        compare_at = product_compare,
        cost = coalesce(product_cost, 0),
        tags = coalesce(product_tags, '{}'),
        track_inventory = tracks,
        updated_at = now()
    where product.store_id = target_store
      and product.id = product_id
    returning product.id into saved_id;

    if saved_id is null then
      raise exception '׳”׳׳•׳¦׳¨ ׳׳ ׳ ׳׳¦׳' using errcode = '42501';
    end if;
  end if;

  select variant_row.id
  into saved_variant
  from public.product_variants as variant_row
  where variant_row.store_id = target_store
    and variant_row.product_id = saved_id
  order by variant_row.position, variant_row.id
  limit 1;

  if saved_variant is null then
    insert into public.product_variants (store_id, product_id, title, sku, barcode, price, position)
    values (
      target_store,
      saved_id,
      coalesce(variant_title, ''),
      nullif(btrim(coalesce(product_sku, '')), ''),
      nullif(btrim(coalesce(product_barcode, '')), ''),
      product_price,
      0
    )
    returning id into saved_variant;
  else
    update public.product_variants as variant_row
    set title = coalesce(variant_title, ''),
        sku = nullif(btrim(coalesce(product_sku, '')), ''),
        barcode = nullif(btrim(coalesce(product_barcode, '')), ''),
        price = product_price
    where variant_row.store_id = target_store
      and variant_row.id = saved_variant;
  end if;

  insert into public.inventory_items (store_id, variant_id, available)
  values (target_store, saved_variant, coalesce(product_stock, 0))
  on conflict (store_id, variant_id) do update
  set available = excluded.available;

  return saved_id;
end;
$$;

revoke all on function public.save_store_product(uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, text[], text, text, integer, text, boolean) from public, anon;
grant execute on function public.save_store_product(uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, text[], text, text, integer, text, boolean) to authenticated, service_role;
