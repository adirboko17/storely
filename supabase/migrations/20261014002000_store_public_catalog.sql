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
                'path', media.path,
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
