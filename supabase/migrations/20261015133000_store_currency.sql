-- The store currency is already a column on store_settings.
-- Keep it to shekel, dollar, or euro, and return it from the shop and the cart quote.

update public.store_settings
set currency = 'ILS'
where currency not in ('ILS', 'USD', 'EUR');

alter table public.store_settings
  drop constraint if exists store_settings_currency_check;

alter table public.store_settings
  add constraint store_settings_currency_check
  check (currency in ('ILS', 'USD', 'EUR'));

create or replace function public.storefront_shop(tracking_key text, hostname text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_store uuid;
begin
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false);
  end if;

  return coalesce(public.store_public_catalog(found_store), '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'currency', coalesce((select settings.currency from public.store_settings as settings where settings.store_id = found_store), 'ILS'),
    'policies', coalesce((select settings.policies from public.store_settings as settings where settings.store_id = found_store), '{}'::jsonb),
    'shipping', private.shipping_rates(found_store),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', collection.id,
        'title', collection.title,
        'handle', collection.handle,
        'description', collection.description,
        'productIds', coalesce((
          select jsonb_agg(link.product_id order by link.position)
          from public.collection_products as link
          where link.store_id = collection.store_id
            and link.collection_id = collection.id
        ), '[]'::jsonb)
      ) order by collection.title)
      from public.collections as collection
      where collection.store_id = found_store
        and collection.hidden = false
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(post.post)
      from public.store_settings as settings
      cross join lateral jsonb_array_elements(coalesce(settings.posts, '[]'::jsonb)) as post(post)
      where settings.store_id = found_store
        and coalesce(post.post->>'visible', 'true') <> 'false'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.quote_storefront(
  tracking_key text,
  hostname text,
  code text default '',
  lines jsonb default '[]'::jsonb,
  shipping_name text default '',
  customer_email text default '',
  gift_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  cart jsonb;
  discount jsonb;
  ship numeric(12, 2);
  merchandise numeric(12, 2);
  gift numeric(12, 2);
  total numeric(12, 2);
  store_currency text;
begin
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;
  cart := private.storefront_cart(found_store, lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;
  discount := private.discount_for_cart(found_store, code, cart, customer_email);
  if coalesce(discount->>'ok', 'false') <> 'true' then
    return discount;
  end if;
  ship := private.shipping_price(found_store, shipping_name);
  if ship is null then
    return jsonb_build_object('ok', false, 'reason', 'אפשרות המשלוח לא קיימת');
  end if;
  if coalesce(discount->>'freeShipping', 'false') = 'true' then
    ship := 0;
  end if;
  merchandise := greatest((cart->>'subtotal')::numeric - (discount->>'amount')::numeric, 0);
  gift := private.gift_card_amount(found_store, gift_code, merchandise + ship);
  total := greatest(merchandise + ship - gift, 0);
  select coalesce(settings.currency, 'ILS')
  into store_currency
  from public.store_settings as settings
  where settings.store_id = found_store;
  return jsonb_build_object(
    'ok', true,
    'currency', coalesce(store_currency, 'ILS'),
    'subtotal', (cart->>'subtotal')::numeric,
    'discount', (discount->>'amount')::numeric,
    'discountCode', discount->>'code',
    'shipping', ship,
    'gift', gift,
    'total', total,
    'lines', cart->'lines',
    'shippingRates', private.shipping_rates(found_store)
  );
end;
$$;
