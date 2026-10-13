-- The signed-in platform operator is not a store member, so store-table RLS
-- returns nothing for the client admin they open. These functions check that
-- authority inside the database and then read or write only that store.

create or replace function private.can_manage_store(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_store is not null and (
    private.is_platform_operator('platform.stores.read')
    or exists (
      select 1
      from public.store_members as member
      where member.store_id = target_store
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
  );
$$;

revoke all on function private.can_manage_store(uuid) from public, anon, authenticated;

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
          'stock', coalesce(inventory.available, 0)
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
  variant_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  saved_variant uuid;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(product_title, ''))) = 0 then
    raise exception 'חסרה כותרת למוצר' using errcode = '22023';
  end if;
  if product_status not in ('active', 'draft', 'archived') then
    raise exception 'סטטוס מוצר לא תקין' using errcode = '22023';
  end if;
  if product_price is null or product_price < 0 or coalesce(product_cost, 0) < 0 or coalesce(product_stock, 0) < 0 then
    raise exception 'מחיר או מלאי לא תקינים' using errcode = '22023';
  end if;

  if product_id is null then
    insert into public.products (
      store_id, title, status, description, vendor, category, price, compare_at, cost, tags
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
      coalesce(product_tags, '{}')
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
        updated_at = now()
    where product.store_id = target_store
      and product.id = product_id
    returning product.id into saved_id;

    if saved_id is null then
      raise exception 'המוצר לא נמצא' using errcode = '42501';
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

create or replace function public.save_store_customer(
  target_store uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_street text,
  customer_city text,
  customer_zip text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(btrim(coalesce(customer_name, ''))) = 0 then
    raise exception 'חסר שם לקוח' using errcode = '22023';
  end if;

  if customer_id is null then
    insert into public.customers (store_id, name, email, phone)
    values (
      target_store,
      btrim(customer_name),
      nullif(btrim(coalesce(customer_email, '')), ''),
      coalesce(customer_phone, '')
    )
    returning id into saved_id;
  else
    update public.customers as customer
    set name = btrim(customer_name),
        email = nullif(btrim(coalesce(customer_email, '')), ''),
        phone = coalesce(customer_phone, '')
    where customer.store_id = target_store
      and customer.id = customer_id
    returning customer.id into saved_id;

    if saved_id is null then
      raise exception 'הלקוח לא נמצא' using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1
    from public.customer_addresses as addr
    where addr.store_id = target_store
      and addr.customer_id = saved_id
  ) then
    update public.customer_addresses as addr
    set street = coalesce(customer_street, ''),
        city = coalesce(customer_city, ''),
        zip = coalesce(customer_zip, '')
    where addr.store_id = target_store
      and addr.customer_id = saved_id;
  else
    insert into public.customer_addresses (store_id, customer_id, street, city, zip)
    values (target_store, saved_id, coalesce(customer_street, ''), coalesce(customer_city, ''), coalesce(customer_zip, ''));
  end if;

  return saved_id;
end;
$$;

revoke all on function public.store_admin_snapshot(uuid) from public, anon;
revoke all on function public.save_store_product(uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, text[], text, text, integer, text) from public, anon;
revoke all on function public.delete_store_products(uuid, uuid[]) from public, anon;
revoke all on function public.save_store_customer(uuid, uuid, text, text, text, text, text, text) from public, anon;

grant execute on function public.store_admin_snapshot(uuid) to authenticated;
grant execute on function public.save_store_product(uuid, uuid, text, text, numeric, numeric, numeric, text, text, text, text[], text, text, integer, text) to authenticated;
grant execute on function public.delete_store_products(uuid, uuid[]) to authenticated;
grant execute on function public.save_store_customer(uuid, uuid, text, text, text, text, text, text) to authenticated;
