-- Product photos uploaded in the admin are stored here and returned to the storefront.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_write_product_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text;
begin
  folder := (storage.foldername(object_name))[1];
  if folder is null or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.can_manage_store(folder::uuid);
end;
$$;

revoke all on function private.can_write_product_media(text) from public, anon;
grant execute on function private.can_write_product_media(text) to authenticated;

drop policy if exists product_media_insert on storage.objects;
drop policy if exists product_media_select on storage.objects;
drop policy if exists product_media_update on storage.objects;
drop policy if exists product_media_delete on storage.objects;

create policy product_media_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'product-media' and private.can_write_product_media(name));

create policy product_media_select on storage.objects
for select to authenticated
using (bucket_id = 'product-media' and private.can_write_product_media(name));

create policy product_media_update on storage.objects
for update to authenticated
using (bucket_id = 'product-media' and private.can_write_product_media(name))
with check (bucket_id = 'product-media' and private.can_write_product_media(name));

create policy product_media_delete on storage.objects
for delete to authenticated
using (bucket_id = 'product-media' and private.can_write_product_media(name));

create or replace function public.product_media_public_url(object_path text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when object_path is null or btrim(object_path) = '' then null
    when object_path ~* '^https?://' then object_path
    else 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/product-media/' || object_path
  end
$$;

revoke all on function public.product_media_public_url(text) from public, anon, authenticated;

create or replace function public.save_store_product_media(
  target_store uuid,
  product_id uuid,
  media_paths text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_path text;
  next_position integer := 0;
  prefix text := target_store::text || '/' || product_id::text || '/';
  removed text[];
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.products as product
    where product.store_id = target_store
      and product.id = product_id
  ) then
    raise exception 'המוצר לא נמצא' using errcode = '42501';
  end if;

  if media_paths is not null then
    foreach object_path in array media_paths loop
      if object_path is null
        or left(object_path, length(prefix)) <> prefix
        or substring(object_path from length(prefix) + 1) !~ '^[A-Za-z0-9._-]+$'
      then
        raise exception 'נתיב מדיה לא תקין' using errcode = '22023';
      end if;
    end loop;
  end if;

  select coalesce(array_agg(media.path), '{}'::text[])
  into removed
  from public.product_media as media
  where media.store_id = target_store
    and media.product_id = product_id
    and not (media.path = any (coalesce(media_paths, '{}'::text[])));

  delete from public.product_media as media
  where media.store_id = target_store
    and media.product_id = product_id;

  if media_paths is not null then
    foreach object_path in array media_paths loop
      insert into public.product_media (store_id, product_id, path, position)
      values (target_store, product_id, object_path, next_position);
      next_position := next_position + 1;
    end loop;
  end if;

  return coalesce(removed, '{}'::text[]);
end;
$$;

revoke all on function public.save_store_product_media(uuid, uuid, text[]) from public, anon;
grant execute on function public.save_store_product_media(uuid, uuid, text[]) to authenticated;

-- Public storefront catalog. anon may execute this function on purpose.
-- It never grants table access, and it never returns cost, customers, or orders.

create or replace function public.store_public_catalog(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  store_name text;
  store_host text;
begin
  select coalesce(settings.display_name, store.name)
  into store_name
  from public.stores as store
  left join public.store_settings as settings on settings.store_id = store.id
  where store.id = target_store
    and store.status = 'active';

  if not found then
    return null;
  end if;

  select domain.hostname
  into store_host
  from public.store_domains as domain
  where domain.store_id = target_store
  order by domain.verified_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'name', coalesce(store_name, ''),
    'hostname', coalesce(store_host, ''),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', catalog_row.id,
          'title', catalog_row.title,
          'handle', catalog_row.handle,
          'description', catalog_row.description,
          'vendor', catalog_row.vendor,
          'category', catalog_row.category,
          'price', catalog_row.price,
          'compareAt', catalog_row.compare_at,
          'tags', catalog_row.tags,
          'variants', catalog_row.variants,
          'media', catalog_row.media
        )
        order by catalog_row.created_at
      )
      from (
        select
          product.created_at,
          product.id,
          product.title,
          product.handle,
          product.description,
          product.vendor,
          product.category,
          product.price,
          product.compare_at,
          product.tags,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', variant_row.id,
                'title', variant_row.title,
                'sku', variant_row.sku,
                'price', variant_row.price,
                'position', variant_row.position
              )
              order by variant_row.position, variant_row.id
            )
            from public.product_variants as variant_row
            where variant_row.store_id = product.store_id
              and variant_row.product_id = product.id
          ), '[]'::jsonb) as variants,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', media.id,
                'path', public.product_media_public_url(media.path),
                'position', media.position
              )
              order by media.position, media.id
            )
            from public.product_media as media
            where media.store_id = product.store_id
              and media.product_id = product.id
          ), '[]'::jsonb) as media
        from public.products as product
        where product.store_id = target_store
          and product.status = 'active'
      ) as catalog_row
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.store_public_catalog(uuid) is
  'Public catalog for one active store: active products, variants, and media. Omits cost, customers, and orders.';

revoke all on function public.store_public_catalog(uuid) from public, anon, authenticated;
grant execute on function public.store_public_catalog(uuid) to anon, authenticated;

create or replace function public.store_admin_snapshot(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  store_name text;
  store_host text;
  owner_name text;
  owner_email text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select settings.display_name
  into store_name
  from public.store_settings as settings
  where settings.store_id = target_store;

  select domain.hostname
  into store_host
  from public.store_domains as domain
  where domain.store_id = target_store
  order by domain.verified_at desc nulls last
  limit 1;

  select member.display_name, account.email
  into owner_name, owner_email
  from public.store_members as member
  join public.roles as role
    on role.store_id = member.store_id
    and role.id = member.role_id
  join auth.users as account on account.id = member.user_id
  where member.store_id = target_store
    and role.key = 'owner'
  limit 1;

  return jsonb_build_object(
    'name', coalesce(store_name, ''),
    'hostname', coalesce(store_host, ''),
    'ownerName', coalesce(owner_name, ''),
    'ownerEmail', coalesce(owner_email, ''),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', product.id,
          'title', product.title,
          'status', product.status,
          'vendor', product.vendor,
          'category', product.category,
          'description', product.description,
          'price', coalesce(variant.price, product.price),
          'compareAt', product.compare_at,
          'cost', product.cost,
          'tags', product.tags,
          'sku', coalesce(variant.sku, ''),
          'barcode', variant.barcode,
          'variant', coalesce(variant.title, ''),
          'stock', coalesce(inventory.available, 0),
          'media', coalesce((
            select jsonb_agg(public.product_media_public_url(media.path) order by media.position, media.id)
            from public.product_media as media
            where media.store_id = product.store_id
              and media.product_id = product.id
          ), '[]'::jsonb)
        )
        order by product.created_at
      )
      from public.products as product
      left join lateral (
        select variant_row.id, variant_row.title, variant_row.sku, variant_row.barcode, variant_row.price
        from public.product_variants as variant_row
        where variant_row.store_id = product.store_id
          and variant_row.product_id = product.id
        order by variant_row.position, variant_row.id
        limit 1
      ) as variant on true
      left join public.inventory_items as inventory
        on inventory.store_id = product.store_id
        and inventory.variant_id = variant.id
      where product.store_id = target_store
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', customer.id,
          'name', customer.name,
          'email', coalesce(customer.email, ''),
          'phone', customer.phone,
          'street', coalesce(address.street, ''),
          'city', coalesce(address.city, ''),
          'zip', coalesce(address.zip, ''),
          'orders', (
            select count(*)
            from public.orders as sale
            where sale.store_id = customer.store_id
              and sale.customer_id = customer.id
          )
        )
        order by customer.created_at
      )
      from public.customers as customer
      left join lateral (
        select addr.street, addr.city, addr.zip
        from public.customer_addresses as addr
        where addr.store_id = customer.store_id
          and addr.customer_id = customer.id
        limit 1
      ) as address on true
      where customer.store_id = target_store
    ), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', discount.id,
          'code', coalesce(discount.code, discount.title),
          'title', discount.title,
          'status', discount.status
        )
        order by discount.title
      )
      from public.discounts as discount
      where discount.store_id = target_store
    ), '[]'::jsonb)
  );
end;
$$;


create or replace function public.delete_store_products(target_store uuid, product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.inventory_movements as movement
  using public.inventory_items as inventory, public.product_variants as variant_row
  where movement.store_id = target_store
    and inventory.store_id = target_store
    and variant_row.store_id = target_store
    and movement.inventory_item_id = inventory.id
    and inventory.variant_id = variant_row.id
    and variant_row.product_id = any(product_ids);

  delete from public.inventory_items as inventory
  using public.product_variants as variant_row
  where inventory.store_id = target_store
    and variant_row.store_id = target_store
    and inventory.variant_id = variant_row.id
    and variant_row.product_id = any(product_ids);

  delete from public.product_variants as variant_row
  where variant_row.store_id = target_store
    and variant_row.product_id = any(product_ids);

  delete from public.product_media as media
  where media.store_id = target_store
    and media.product_id = any(product_ids);

  delete from public.collection_products as link
  where link.store_id = target_store
    and link.product_id = any(product_ids);

  delete from public.products as product
  where product.store_id = target_store
    and product.id = any(product_ids);
end;
$$;

