-- The admin used to download the whole store on every page.
-- Each slice is one piece, so a screen can open while the rest is still loading.

create or replace function public.store_admin_slice(target_store uuid, slice text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  settings public.store_settings%rowtype;
  store_name text;
  store_host text;
  owner_name text;
  owner_email text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if slice not in ('shell', 'desk', 'content', 'catalog', 'customers', 'discounts', 'orders', 'checkouts') then
    return '{}'::jsonb;
  end if;

  if slice in ('shell', 'desk', 'content', 'catalog') then
    select settings_row.*
    into settings
    from public.store_settings as settings_row
    where settings_row.store_id = target_store;
  end if;

  if slice = 'shell' then
    store_name := coalesce(settings.display_name, '');
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
      'ownerEmail', coalesce(owner_email, '')
    );
  end if;

  if slice = 'desk' then
    return jsonb_build_object(
      'policies', coalesce(settings.policies, '{}'::jsonb),
      'shipping', coalesce(settings.shipping, '{}'::jsonb),
      'marketing', case
        when private.can_read_marketing(target_store) then coalesce(settings.marketing, '{}'::jsonb)
        else '{}'::jsonb
      end
    );
  end if;

  if slice = 'content' then
    return jsonb_build_object('posts', coalesce(settings.posts, '[]'::jsonb));
  end if;

  if slice = 'catalog' then
    return jsonb_build_object(
      'giftCards', coalesce(settings.gift_cards, '[]'::jsonb),
      'products', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', product.id,
          'title', product.title,
          'handle', product.handle,
          'status', product.status,
          'vendor', product.vendor,
          'category', product.category,
          'description', product.description,
          'merch', coalesce(product.merch, '{}'::jsonb),
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
        ) order by product.position, product.created_at)
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
      'collections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'title', collection.title,
          'description', collection.description,
          'conditions', collection.conditions,
          'excludeOutOfStock', collection.exclude_out_of_stock,
          'image', collection.image,
          'hidden', collection.hidden,
          'manualSort', collection.manual_sort,
          'productIds', coalesce((
            select jsonb_agg(link.product_id order by link.position)
            from public.collection_products as link
            where link.store_id = collection.store_id
              and link.collection_id = collection.id
          ), '[]'::jsonb)
        ) order by collection.position, collection.title)
        from public.collections as collection
        where collection.store_id = target_store
      ), '[]'::jsonb)
    );
  end if;

  if slice = 'customers' then
    return jsonb_build_object('customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', customer.id,
        'createdAt', customer.created_at,
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
        ),
        'note', customer.note,
        'tags', customer.tags,
        'subscribed', customer.subscribed,
        'credit', customer.credit,
        'language', customer.locale,
        'sms', customer.sms,
        'whatsapp', customer.whatsapp
      ) order by customer.created_at)
      from public.customers as customer
      left join lateral (
        select addr.street, addr.city, addr.zip
        from public.customer_addresses as addr
        where addr.store_id = customer.store_id
          and addr.customer_id = customer.id
        limit 1
      ) as address on true
      where customer.store_id = target_store
    ), '[]'::jsonb));
  end if;

  if slice = 'discounts' then
    return jsonb_build_object('discounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', discount.id,
        'code', coalesce(discount.code, discount.title),
        'kind', discount.kind,
        'valueType', discount.value_type,
        'value', discount.amount,
        'method', discount.method,
        'eligibility', discount.eligibility,
        'segment', discount.segment,
        'minType', discount.min_type,
        'minValue', discount.min_value,
        'once', discount.once_per_customer,
        'limit', discount.usage_limit is not null,
        'limitN', coalesce(discount.usage_limit, 0),
        'start', coalesce(discount.starts_on::text, ''),
        'hasEnd', discount.ends_on is not null,
        'end', coalesce(discount.ends_on::text, ''),
        'uses', discount.uses,
        'combProduct', discount.comb_product,
        'combOrder', discount.comb_order,
        'combShip', discount.comb_ship,
        'blockGift', discount.block_gift,
        'combBundle', discount.comb_bundle,
        'applies', discount.applies,
        'collections', to_jsonb(discount.collection_titles),
        'bxBuy', discount.bx_buy,
        'bxGet', discount.bx_get,
        'bxColl', discount.bx_coll,
        'bxMode', discount.bx_mode,
        'bxGetColl', discount.bx_get_coll,
        'bxBuyIds', to_jsonb(discount.bx_buy_ids),
        'bxGetIds', to_jsonb(discount.bx_get_ids)
      ) order by discount.title)
      from public.discounts as discount
      where discount.store_id = target_store
    ), '[]'::jsonb));
  end if;

  if slice = 'orders' then
    return jsonb_build_object('orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sale.id,
        'number', sale.order_number,
        'createdAt', sale.created_at,
        'customerId', sale.customer_id,
        'customerName', coalesce((
          select customer.name
          from public.customers as customer
          where customer.store_id = sale.store_id
            and customer.id = sale.customer_id
        ), ''),
        'channel', sale.channel,
        'pay', sale.financial_status,
        'fulfillment', sale.fulfillment_status,
        'customerStatus', sale.customer_status,
        'total', sale.total,
        'note', sale.note,
        'tags', sale.tags,
        'discountCode', sale.discount_code,
        'discountAmount', sale.discount_amount,
        'shippingName', sale.shipping_name,
        'shippingAmount', sale.shipping_amount,
        'refunded', sale.refunded,
        'carrier', sale.carrier,
        'tracking', sale.tracking,
        'timeline', sale.timeline,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'productId', variant_row.product_id,
            'title', item.title,
            'quantity', item.quantity,
            'unitPrice', item.unit_price,
            'variant', coalesce(variant_row.title, ''),
            'sku', coalesce(variant_row.sku, '')
          ) order by item.id)
          from public.order_items as item
          left join public.product_variants as variant_row
            on variant_row.store_id = item.store_id
           and variant_row.id = item.variant_id
          where item.store_id = sale.store_id
            and item.order_id = sale.id
        ), '[]'::jsonb)
      ) order by sale.created_at desc)
      from public.orders as sale
      where sale.store_id = target_store
        and sale.order_number is not null
    ), '[]'::jsonb));
  end if;

  return jsonb_build_object('checkouts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', draft.id,
      'updatedAt', draft.updated_at,
      'name', draft.name,
      'email', draft.email,
      'phone', draft.phone,
      'street', draft.street,
      'city', draft.city,
      'zip', draft.zip,
      'lines', draft.lines,
      'subtotal', draft.subtotal,
      'shippingAmount', draft.shipping_amount,
      'total', draft.total,
      'reminded', draft.reminded,
      'recovered', draft.recovered
    ) order by draft.updated_at desc)
    from public.checkout_drafts as draft
    where draft.store_id = target_store
      and draft.recovered = false
  ), '[]'::jsonb));
end;
$$;

create or replace function public.store_admin_snapshot(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.store_admin_slice(target_store, 'shell')
    || public.store_admin_slice(target_store, 'desk')
    || public.store_admin_slice(target_store, 'content')
    || public.store_admin_slice(target_store, 'catalog')
    || public.store_admin_slice(target_store, 'customers')
    || public.store_admin_slice(target_store, 'discounts')
    || public.store_admin_slice(target_store, 'orders')
    || public.store_admin_slice(target_store, 'checkouts');
end;
$$;

revoke all on function public.store_admin_slice(uuid, text) from public, anon;
grant execute on function public.store_admin_slice(uuid, text) to authenticated;
