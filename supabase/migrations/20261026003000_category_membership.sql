-- A product whose category is a collection title belongs on that storefront page.
-- Explicit collection links stay first. Category matches fill the ones that were never linked.

do $$
declare
  name text;
  src text;
  old text;
  patched text;
begin
  foreach name in array array['public.store_public_catalog(uuid)', 'public.storefront_shop(text, text)']
  loop
    src := pg_get_functiondef(name::regprocedure);
    old := case name
      when 'public.store_public_catalog(uuid)' then
        $cat$select jsonb_agg(link.product_id order by link.position)
            from public.collection_products as link
            where link.store_id = collection.store_id
              and link.collection_id = collection.id$cat$
      else
        $shop$select jsonb_agg(link.product_id order by link.position)
          from public.collection_products as link
          where link.store_id = collection.store_id
            and link.collection_id = collection.id$shop$
    end;
    patched := $new$select jsonb_agg(picked.product_id order by picked.ord)
            from (
              select link.product_id, link.position::bigint as ord
              from public.collection_products as link
              where link.store_id = collection.store_id
                and link.collection_id = collection.id
              union all
              select listed.id, 1000000 + listed.ord
              from (
                select product.id, row_number() over (order by product.created_at, product.id) as ord
                from public.products as product
                where product.store_id = collection.store_id
                  and product.status = 'active'
                  and btrim(product.category) <> ''
                  and btrim(product.category) = btrim(collection.title)
                  and not exists (
                    select 1
                    from public.collection_products as linked
                    where linked.store_id = product.store_id
                      and linked.collection_id = collection.id
                      and linked.product_id = product.id
                  )
              ) as listed
            ) as picked$new$;
    if position(old in src) = 0 then
      raise exception 'collection membership query missing in %', name;
    end if;
    if position(patched in src) = 0 then
      execute replace(src, old, patched);
    end if;
  end loop;
end $$;

insert into public.collection_products (store_id, collection_id, product_id, position)
select product.store_id,
  collection.id,
  product.id,
  coalesce((
    select max(link.position)
    from public.collection_products as link
    where link.store_id = collection.store_id
      and link.collection_id = collection.id
  ), -1) + row_number() over (partition by collection.id order by product.created_at, product.id)
from public.products as product
join public.collections as collection
  on collection.store_id = product.store_id
 and btrim(collection.title) = btrim(product.category)
where product.status = 'active'
  and btrim(product.category) <> ''
  and not exists (
    select 1
    from public.collection_products as link
    where link.store_id = product.store_id
      and link.collection_id = collection.id
      and link.product_id = product.id
  );
