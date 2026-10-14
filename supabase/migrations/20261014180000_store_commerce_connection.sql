-- Connect discounts, orders, collections, customers, settings, content, and checkout
-- to the shared store. The storefront resolves a store from its tracking key and hostname.
-- It never sends a store id, and it never reads another store's rows.

alter table public.discounts
  add column if not exists kind text not null default 'order',
  add column if not exists value_type text not null default 'pct',
  add column if not exists amount numeric(12, 2) not null default 0,
  add column if not exists method text not null default 'code',
  add column if not exists eligibility text not null default 'all',
  add column if not exists segment text not null default '',
  add column if not exists min_type text not null default 'none',
  add column if not exists min_value numeric(12, 2) not null default 0,
  add column if not exists once_per_customer boolean not null default false,
  add column if not exists usage_limit integer,
  add column if not exists starts_on date,
  add column if not exists ends_on date,
  add column if not exists uses integer not null default 0,
  add column if not exists comb_product boolean not null default false,
  add column if not exists comb_order boolean not null default false,
  add column if not exists comb_ship boolean not null default false,
  add column if not exists applies text not null default 'all',
  add column if not exists collection_titles text[] not null default '{}',
  add column if not exists bx_buy text not null default '2',
  add column if not exists bx_get text not null default '1',
  add column if not exists bx_coll text not null default '';

alter table public.discounts drop constraint if exists discounts_kind_check;
alter table public.discounts
  add constraint discounts_kind_check check (kind in ('order', 'product', 'ship', 'bxgy'));
alter table public.discounts drop constraint if exists discounts_value_type_check;
alter table public.discounts
  add constraint discounts_value_type_check check (value_type in ('pct', 'fixed'));

alter table public.customers
  add column if not exists note text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists subscribed boolean not null default false,
  add column if not exists credit numeric(12, 2) not null default 0,
  add column if not exists locale text not null default 'he',
  add column if not exists sms boolean not null default false,
  add column if not exists whatsapp boolean not null default false;

alter table public.orders
  add column if not exists order_number integer,
  add column if not exists channel text not null default 'חנות אונליין',
  add column if not exists note text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists discount_code text not null default '',
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists shipping_name text not null default '',
  add column if not exists shipping_amount numeric(12, 2) not null default 0,
  add column if not exists refunded numeric(12, 2) not null default 0,
  add column if not exists carrier text not null default '',
  add column if not exists tracking text not null default '',
  add column if not exists timeline jsonb not null default '[]'::jsonb;

create unique index if not exists orders_number_idx on public.orders (store_id, order_number) where order_number is not null;

with numbered as (
  select id, row_number() over (partition by store_id order by created_at, id) + 1000 as next_number
  from public.orders
  where order_number is null
)
update public.orders as sale
set order_number = numbered.next_number
from numbered
where sale.id = numbered.id;

alter table public.collections
  add column if not exists conditions jsonb not null default '[]'::jsonb,
  add column if not exists exclude_out_of_stock boolean not null default false,
  add column if not exists image text not null default '',
  add column if not exists hidden boolean not null default false;

alter table public.store_settings
  add column if not exists policies jsonb not null default '{}'::jsonb,
  add column if not exists shipping jsonb not null default '{}'::jsonb,
  add column if not exists marketing jsonb not null default '{}'::jsonb,
  add column if not exists posts jsonb not null default '[]'::jsonb,
  add column if not exists gift_cards jsonb not null default '[]'::jsonb;

create table if not exists public.checkout_drafts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  visitor_key text not null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  street text not null default '',
  city text not null default '',
  zip text not null default '',
  lines jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  shipping_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  reminded boolean not null default false,
  recovered boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, visitor_key)
);

create index if not exists checkout_drafts_open_idx on public.checkout_drafts (store_id, updated_at desc) where recovered = false;

alter table public.checkout_drafts enable row level security;
alter table public.checkout_drafts force row level security;
drop trigger if exists checkout_drafts_lock_store on public.checkout_drafts;
create trigger checkout_drafts_lock_store
before update on public.checkout_drafts
for each row execute function private.reject_store_id_change();
revoke all on table public.checkout_drafts from public, anon, authenticated;

create or replace function private.resolve_storefront(tracking_key text, hostname text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clean_key text := lower(btrim(coalesce(tracking_key, '')));
  clean_host text;
  found_store uuid;
begin
  if clean_key !~ '^[0-9a-f]{48}$' then
    return null;
  end if;
  begin
    clean_host := private.clean_hostname(hostname);
  exception
    when sqlstate '22023' then
      return null;
  end;

  select keys.store_id
  into found_store
  from private.store_tracking_keys as keys
  join public.stores as store on store.id = keys.store_id
  where keys.tracking_key = clean_key
    and store.status = 'active';

  if found_store is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.store_domains as domain
    where domain.store_id = found_store
      and domain.hostname = clean_host
      and domain.verified_at is not null
  ) then
    return null;
  end if;

  return found_store;
end;
$$;

revoke all on function private.resolve_storefront(text, text) from public, anon, authenticated;

create or replace function private.storefront_cart(target_store uuid, lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  line jsonb;
  variant uuid;
  qty integer;
  unit_price numeric(12, 2);
  available integer;
  product_id uuid;
  product_title text;
  variant_title text;
  variant_sku text;
  priced jsonb := '[]'::jsonb;
  subtotal numeric(12, 2) := 0;
  quantity integer := 0;
begin
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 or jsonb_array_length(lines) > 30 then
    return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
  end if;

  for line in select value from jsonb_array_elements(lines) as value
  loop
    begin
      variant := (line->>'variantId')::uuid;
      qty := (line->>'quantity')::integer;
    exception
      when others then
        return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
    end;
    if qty is null or qty < 1 or qty > 99 then
      return jsonb_build_object('ok', false, 'reason', 'כמות לא תקינה');
    end if;

    select
      coalesce(variant_row.price, product.price),
      inventory.available,
      product.id,
      product.title,
      coalesce(variant_row.title, ''),
      coalesce(variant_row.sku, '')
    into unit_price, available, product_id, product_title, variant_title, variant_sku
    from public.product_variants as variant_row
    join public.products as product
      on product.store_id = variant_row.store_id
     and product.id = variant_row.product_id
    left join public.inventory_items as inventory
      on inventory.store_id = variant_row.store_id
     and inventory.variant_id = variant_row.id
    where variant_row.store_id = target_store
      and variant_row.id = variant
      and product.status = 'active';

    if product_id is null or unit_price is null or unit_price < 0 then
      return jsonb_build_object('ok', false, 'reason', 'מוצר לא זמין');
    end if;
    if coalesce(available, 0) < qty then
      return jsonb_build_object('ok', false, 'reason', 'המלאי לא מספיק');
    end if;

    priced := priced || jsonb_build_array(jsonb_build_object(
      'variantId', variant,
      'productId', product_id,
      'title', product_title,
      'variant', variant_title,
      'sku', variant_sku,
      'unitPrice', unit_price,
      'quantity', qty
    ));
    subtotal := subtotal + (unit_price * qty);
    quantity := quantity + qty;
  end loop;

  return jsonb_build_object('ok', true, 'subtotal', subtotal, 'quantity', quantity, 'lines', priced);
end;
$$;

revoke all on function private.storefront_cart(uuid, jsonb) from public, anon, authenticated;

create or replace function private.discount_for_cart(
  target_store uuid,
  raw_code text,
  cart jsonb,
  customer_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := lower(btrim(coalesce(raw_code, '')));
  subtotal numeric(12, 2) := coalesce((cart->>'subtotal')::numeric, 0);
  quantity integer := coalesce((cart->>'quantity')::integer, 0);
  chosen public.discounts%rowtype;
  candidate public.discounts%rowtype;
  best_amount numeric(12, 2) := -1;
  eligible numeric(12, 2);
  line jsonb;
  amount numeric(12, 2);
  free_shipping boolean;
  line_product uuid;
  matches_collection boolean;
begin
  if wanted <> '' then
    select discount.*
    into chosen
    from public.discounts as discount
    where discount.store_id = target_store
      and lower(coalesce(discount.code, '')) = wanted
      and discount.status = 'active'
      and (discount.starts_on is null or discount.starts_on <= current_date)
      and (discount.ends_on is null or discount.ends_on >= current_date)
      and (discount.usage_limit is null or discount.uses < discount.usage_limit)
    limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'הקוד לא תקף');
    end if;
  else
    for candidate in
      select discount.*
      from public.discounts as discount
      where discount.store_id = target_store
        and discount.method = 'auto'
        and discount.status = 'active'
        and (discount.starts_on is null or discount.starts_on <= current_date)
        and (discount.ends_on is null or discount.ends_on >= current_date)
        and (discount.usage_limit is null or discount.uses < discount.usage_limit)
    loop
      eligible := subtotal;
      if candidate.kind = 'product' and candidate.applies = 'colls' then
        eligible := 0;
        for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
        loop
          line_product := (line->>'productId')::uuid;
          select exists (
            select 1
            from public.collection_products as link
            join public.collections as collection
              on collection.store_id = link.store_id
             and collection.id = link.collection_id
            where link.store_id = target_store
              and link.product_id = line_product
              and collection.title = any(candidate.collection_titles)
          ) into matches_collection;
          if matches_collection then
            eligible := eligible + ((line->>'unitPrice')::numeric * (line->>'quantity')::integer);
          end if;
        end loop;
      end if;
      if candidate.min_type = 'amount' and subtotal < candidate.min_value then
        continue;
      end if;
      if candidate.min_type = 'qty' and quantity < candidate.min_value then
        continue;
      end if;
      if candidate.kind = 'ship' then
        amount := 0;
      elsif candidate.kind = 'bxgy' then
        amount := 0;
      elsif candidate.value_type = 'pct' then
        amount := round(eligible * candidate.amount / 100, 2);
      else
        amount := least(candidate.amount, eligible);
      end if;
      if amount > best_amount or (candidate.kind = 'ship' and best_amount < 0) then
        best_amount := amount;
        chosen := candidate;
      end if;
    end loop;
    if chosen.id is null then
      return jsonb_build_object('ok', true, 'code', '', 'amount', 0, 'freeShipping', false, 'title', '');
    end if;
  end if;

  if chosen.once_per_customer and btrim(coalesce(customer_email, '')) <> '' and exists (
    select 1
    from public.orders as sale
    join public.customers as customer
      on customer.store_id = sale.store_id
     and customer.id = sale.customer_id
    where sale.store_id = target_store
      and lower(coalesce(customer.email, '')) = lower(btrim(customer_email))
      and lower(sale.discount_code) = lower(coalesce(chosen.code, ''))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'הקוד כבר נוצל');
  end if;

  if chosen.min_type = 'amount' and subtotal < chosen.min_value then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא עומדת במינימום');
  end if;
  if chosen.min_type = 'qty' and quantity < chosen.min_value then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא עומדת במינימום');
  end if;

  eligible := subtotal;
  if chosen.kind = 'product' and chosen.applies = 'colls' then
    eligible := 0;
    for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
    loop
      line_product := (line->>'productId')::uuid;
      select exists (
        select 1
        from public.collection_products as link
        join public.collections as collection
          on collection.store_id = link.store_id
         and collection.id = link.collection_id
        where link.store_id = target_store
          and link.product_id = line_product
          and collection.title = any(chosen.collection_titles)
      ) into matches_collection;
      if matches_collection then
        eligible := eligible + ((line->>'unitPrice')::numeric * (line->>'quantity')::integer);
      end if;
    end loop;
  end if;

  free_shipping := chosen.kind = 'ship';
  if chosen.kind = 'ship' then
    amount := 0;
  elsif chosen.kind = 'bxgy' then
    select min((value->>'unitPrice')::numeric)
    into amount
    from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value;
    amount := least(coalesce(amount, 0) * greatest(coalesce(nullif(chosen.bx_get, '')::numeric, 1), 1), subtotal);
    if quantity < greatest(coalesce(nullif(chosen.bx_buy, '')::numeric, 1), 1) then
      amount := 0;
    end if;
  elsif chosen.value_type = 'pct' then
    amount := round(eligible * chosen.amount / 100, 2);
  else
    amount := least(chosen.amount, eligible);
  end if;
  if amount < 0 then
    amount := 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', coalesce(chosen.code, ''),
    'amount', amount,
    'freeShipping', free_shipping,
    'title', chosen.title
  );
end;
$$;

revoke all on function private.discount_for_cart(uuid, text, jsonb, text) from public, anon, authenticated;

create or replace function private.shipping_rates(target_store uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', rate.name, 'price', rate.price, 'zone', rate.zone)), '[]'::jsonb)
  from (
    select
      coalesce(rate_row.rate->>'name', zone_row.zone->>'name', 'משלוח') as name,
      coalesce(nullif(rate_row.rate->>'price', '')::numeric, 0) as price,
      coalesce(zone_row.zone->>'name', '') as zone
    from public.store_settings as settings
    cross join lateral jsonb_array_elements(coalesce(settings.shipping->'profiles', '[]'::jsonb)) as profile(profile)
    cross join lateral jsonb_array_elements(coalesce(profile.profile->'zones', '[]'::jsonb)) as zone_row(zone)
    cross join lateral jsonb_array_elements(coalesce(zone_row.zone->'rates', '[]'::jsonb)) as rate_row(rate)
    where settings.store_id = target_store
  ) as rate;
$$;

revoke all on function private.shipping_rates(uuid) from public, anon, authenticated;

create or replace function private.shipping_price(target_store uuid, shipping_name text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := btrim(coalesce(shipping_name, ''));
  price numeric(12, 2);
begin
  if wanted = '' then
    return 0;
  end if;
  select rate.price
  into price
  from jsonb_to_recordset(private.shipping_rates(target_store)) as rate(name text, price numeric, zone text)
  where rate.name = wanted
  limit 1;
  if price is null then
    return null;
  end if;
  return greatest(price, 0);
end;
$$;

revoke all on function private.shipping_price(uuid, text) from public, anon, authenticated;

create or replace function private.gift_card_amount(target_store uuid, raw_code text, payable numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := lower(btrim(coalesce(raw_code, '')));
  balance numeric(12, 2);
begin
  if wanted = '' or payable <= 0 then
    return 0;
  end if;
  select least(payable, greatest(coalesce(nullif(card.card->>'balance', ''), card.card->>'value', '0')::numeric, 0))
  into balance
  from public.store_settings as settings
  cross join lateral jsonb_array_elements(coalesce(settings.gift_cards, '[]'::jsonb)) as card(card)
  where settings.store_id = target_store
    and lower(coalesce(card.card->>'code', '')) = wanted
  limit 1;
  return coalesce(balance, 0);
end;
$$;

revoke all on function private.gift_card_amount(uuid, text, numeric) from public, anon, authenticated;

drop function if exists public.save_store_customer(uuid, uuid, text, text, text, text, text, text);

create or replace function public.save_store_customer(
  target_store uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_street text,
  customer_city text,
  customer_zip text,
  replace_profile boolean default false,
  customer_note text default '',
  customer_tags text[] default '{}',
  customer_subscribed boolean default false,
  customer_credit numeric default 0,
  customer_locale text default 'he',
  customer_sms boolean default false,
  customer_whatsapp boolean default false
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
    insert into public.customers (
      store_id, name, email, phone, note, tags, subscribed, credit, locale, sms, whatsapp
    )
    values (
      target_store,
      btrim(customer_name),
      nullif(btrim(coalesce(customer_email, '')), ''),
      coalesce(customer_phone, ''),
      coalesce(customer_note, ''),
      coalesce(customer_tags, '{}'),
      coalesce(customer_subscribed, false),
      greatest(coalesce(customer_credit, 0), 0),
      case when customer_locale = 'en' then 'en' else 'he' end,
      coalesce(customer_sms, false),
      coalesce(customer_whatsapp, false)
    )
    returning id into saved_id;
  else
    update public.customers as customer
    set name = btrim(customer_name),
        email = nullif(btrim(coalesce(customer_email, '')), ''),
        phone = coalesce(customer_phone, ''),
        note = case when replace_profile then coalesce(customer_note, '') else customer.note end,
        tags = case when replace_profile then coalesce(customer_tags, '{}') else customer.tags end,
        subscribed = case when replace_profile then coalesce(customer_subscribed, false) else customer.subscribed end,
        credit = case when replace_profile then greatest(coalesce(customer_credit, 0), 0) else customer.credit end,
        locale = case when replace_profile then case when customer_locale = 'en' then 'en' else 'he' end else customer.locale end,
        sms = case when replace_profile then coalesce(customer_sms, false) else customer.sms end,
        whatsapp = case when replace_profile then coalesce(customer_whatsapp, false) else customer.whatsapp end
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

create or replace function public.save_store_discount(target_store uuid, discount jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  clean_code text := nullif(btrim(coalesce(discount->>'code', '')), '');
  clean_kind text := coalesce(discount->>'kind', 'order');
  clean_value_type text := coalesce(discount->>'valueType', 'pct');
  clean_amount numeric(12, 2) := greatest(coalesce((discount->>'value')::numeric, 0), 0);
  clean_start date := nullif(discount->>'start', '')::date;
  clean_end date := case when coalesce(discount->>'hasEnd', 'false') = 'true' then nullif(discount->>'end', '')::date else null end;
  clean_limit integer := case when coalesce(discount->>'limit', 'false') = 'true' then greatest(coalesce((discount->>'limitN')::integer, 0), 0) else null end;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean_code is null then
    raise exception 'חסר קוד הנחה' using errcode = '22023';
  end if;
  if clean_kind not in ('order', 'product', 'ship', 'bxgy') or clean_value_type not in ('pct', 'fixed') then
    raise exception 'הנחה לא תקינה' using errcode = '22023';
  end if;

  if nullif(discount->>'id', '') is not null then
    update public.discounts as row
    set code = clean_code,
        title = clean_code,
        kind = clean_kind,
        value_type = clean_value_type,
        amount = clean_amount,
        method = case when discount->>'method' = 'auto' then 'auto' else 'code' end,
        eligibility = case when discount->>'eligibility' = 'seg' then 'seg' else 'all' end,
        segment = coalesce(discount->>'segment', ''),
        min_type = case when discount->>'minType' in ('amount', 'qty') then discount->>'minType' else 'none' end,
        min_value = greatest(coalesce((discount->>'minValue')::numeric, 0), 0),
        once_per_customer = coalesce(discount->>'once', 'false') = 'true',
        usage_limit = clean_limit,
        starts_on = clean_start,
        ends_on = clean_end,
        comb_product = coalesce(discount->>'combProduct', 'false') = 'true',
        comb_order = coalesce(discount->>'combOrder', 'false') = 'true',
        comb_ship = coalesce(discount->>'combShip', 'false') = 'true',
        applies = case when discount->>'applies' = 'colls' then 'colls' else 'all' end,
        collection_titles = coalesce(array(select jsonb_array_elements_text(coalesce(discount->'collections', '[]'::jsonb))), '{}'),
        bx_buy = coalesce(discount->>'bxBuy', '2'),
        bx_get = coalesce(discount->>'bxGet', '1'),
        bx_coll = coalesce(discount->>'bxColl', ''),
        status = case
          when clean_end is not null and clean_end < current_date then 'expired'
          when clean_start is not null and clean_start > current_date then 'scheduled'
          else 'active'
        end
    where row.store_id = target_store
      and row.id = (discount->>'id')::uuid
    returning row.id into saved_id;
  end if;

  if saved_id is null then
    insert into public.discounts (
      store_id, code, title, status, kind, value_type, amount, method, eligibility, segment,
      min_type, min_value, once_per_customer, usage_limit, starts_on, ends_on,
      comb_product, comb_order, comb_ship, applies, collection_titles, bx_buy, bx_get, bx_coll
    )
    values (
      target_store, clean_code, clean_code,
      case
        when clean_end is not null and clean_end < current_date then 'expired'
        when clean_start is not null and clean_start > current_date then 'scheduled'
        else 'active'
      end,
      clean_kind, clean_value_type, clean_amount,
      case when discount->>'method' = 'auto' then 'auto' else 'code' end,
      case when discount->>'eligibility' = 'seg' then 'seg' else 'all' end,
      coalesce(discount->>'segment', ''),
      case when discount->>'minType' in ('amount', 'qty') then discount->>'minType' else 'none' end,
      greatest(coalesce((discount->>'minValue')::numeric, 0), 0),
      coalesce(discount->>'once', 'false') = 'true',
      clean_limit, clean_start, clean_end,
      coalesce(discount->>'combProduct', 'false') = 'true',
      coalesce(discount->>'combOrder', 'false') = 'true',
      coalesce(discount->>'combShip', 'false') = 'true',
      case when discount->>'applies' = 'colls' then 'colls' else 'all' end,
      coalesce(array(select jsonb_array_elements_text(coalesce(discount->'collections', '[]'::jsonb))), '{}'),
      coalesce(discount->>'bxBuy', '2'),
      coalesce(discount->>'bxGet', '1'),
      coalesce(discount->>'bxColl', '')
    )
    returning id into saved_id;
  end if;

  return saved_id;
end;
$$;

create or replace function public.delete_store_discounts(target_store uuid, discount_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.discounts as discount
  where discount.store_id = target_store
    and discount.id = any(coalesce(discount_ids, '{}'));
end;
$$;

create or replace function public.save_store_collection(target_store uuid, collection jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  clean_title text := btrim(coalesce(collection->>'title', ''));
  product_ids uuid[];
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean_title = '' then
    raise exception 'חסר שם אוסף' using errcode = '22023';
  end if;

  select coalesce(array_agg(product.id order by raw.ordinality), '{}')
  into product_ids
  from jsonb_array_elements_text(coalesce(collection->'productIds', '[]'::jsonb)) with ordinality as raw(product_id, ordinality)
  join public.products as product
    on product.store_id = target_store
   and product.id::text = raw.product_id
  where raw.product_id ~ '^[0-9a-fA-F-]{36}$';

  select row.id
  into saved_id
  from public.collections as row
  where row.store_id = target_store
    and row.title = clean_title
  limit 1;

  if saved_id is null then
    insert into public.collections (store_id, title, handle, description, conditions, exclude_out_of_stock, image, hidden)
    values (
      target_store,
      clean_title,
      clean_title,
      coalesce(collection->>'description', ''),
      coalesce(collection->'conditions', '[]'::jsonb),
      coalesce(collection->>'excludeOutOfStock', 'false') = 'true',
      coalesce(collection->>'image', ''),
      coalesce(collection->>'hidden', 'false') = 'true'
    )
    returning id into saved_id;
  else
    update public.collections as row
    set description = coalesce(collection->>'description', ''),
        conditions = coalesce(collection->'conditions', '[]'::jsonb),
        exclude_out_of_stock = coalesce(collection->>'excludeOutOfStock', 'false') = 'true',
        image = coalesce(collection->>'image', ''),
        hidden = coalesce(collection->>'hidden', 'false') = 'true'
    where row.store_id = target_store
      and row.id = saved_id;
  end if;

  delete from public.collection_products as link
  where link.store_id = target_store
    and link.collection_id = saved_id;

  insert into public.collection_products (store_id, collection_id, product_id, position)
  select target_store, saved_id, product_id, ordinality::integer - 1
  from unnest(coalesce(product_ids, '{}')) with ordinality as product(product_id, ordinality);

  return saved_id;
end;
$$;

create or replace function public.save_store_sections(target_store uuid, sections jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(sections) <> 'object' then
    raise exception 'הגדרות לא תקינות' using errcode = '22023';
  end if;

  update public.store_settings as settings
  set policies = case when sections ? 'policies' then sections->'policies' else settings.policies end,
      shipping = case when sections ? 'shipping' then sections->'shipping' else settings.shipping end,
      marketing = case when sections ? 'marketing' then sections->'marketing' else settings.marketing end,
      posts = case when sections ? 'posts' then sections->'posts' else settings.posts end,
      gift_cards = case when sections ? 'gift_cards' then sections->'gift_cards' else settings.gift_cards end
  where settings.store_id = target_store;
end;
$$;

create or replace function public.update_store_order(target_store uuid, order_number integer, patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  next_pay text := patch->>'pay';
  next_fulfillment text := patch->>'fulfillment';
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if next_pay is not null and next_pay not in ('paid', 'pending', 'partially_refunded', 'refunded') then
    raise exception 'סטטוס תשלום לא תקין' using errcode = '22023';
  end if;
  if next_fulfillment is not null and next_fulfillment not in ('unfulfilled', 'fulfilled', 'partial', 'onhold') then
    raise exception 'סטטוס משלוח לא תקין' using errcode = '22023';
  end if;

  update public.orders as sale
  set financial_status = coalesce(next_pay, sale.financial_status),
      fulfillment_status = coalesce(next_fulfillment, sale.fulfillment_status),
      refunded = case when patch ? 'refunded' then greatest((patch->>'refunded')::numeric, 0) else sale.refunded end,
      carrier = case when patch ? 'carrier' then coalesce(patch->>'carrier', '') else sale.carrier end,
      tracking = case when patch ? 'tracking' then coalesce(patch->>'tracking', '') else sale.tracking end,
      timeline = case
        when nullif(patch->>'comment', '') is not null then sale.timeline || jsonb_build_array(jsonb_build_object('text', patch->>'comment', 'at', now()))
        else sale.timeline
      end
  where sale.store_id = target_store
    and sale.order_number = update_store_order.order_number
  returning sale.id into saved_id;

  if saved_id is null then
    raise exception 'ההזמנה לא נמצאה' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.update_store_checkout(target_store uuid, checkout_id uuid, reminded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.checkout_drafts as draft
  set reminded = update_store_checkout.reminded
  where draft.store_id = target_store
    and draft.id = checkout_id;
end;
$$;

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
  return jsonb_build_object(
    'ok', true,
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

create or replace function public.save_storefront_checkout(
  tracking_key text,
  hostname text,
  visitor_key text,
  lines jsonb,
  customer_name text default '',
  customer_email text default '',
  customer_phone text default '',
  customer_street text default '',
  customer_city text default '',
  customer_zip text default '',
  shipping_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  clean_visitor text := btrim(coalesce(visitor_key, ''));
  cart jsonb;
  ship numeric(12, 2);
begin
  if clean_visitor !~ '^[A-Za-z0-9_-]{16,80}$' then
    return jsonb_build_object('ok', false);
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false);
  end if;
  cart := private.storefront_cart(found_store, lines);
  if coalesce(cart->>'ok', 'false') <> 'true' then
    return cart;
  end if;
  ship := coalesce(private.shipping_price(found_store, shipping_name), 0);
  insert into public.checkout_drafts as draft (
    store_id, visitor_key, name, email, phone, street, city, zip, lines, subtotal, shipping_amount, total
  )
  values (
    found_store, clean_visitor,
    left(coalesce(customer_name, ''), 120),
    left(coalesce(customer_email, ''), 180),
    left(coalesce(customer_phone, ''), 40),
    left(coalesce(customer_street, ''), 180),
    left(coalesce(customer_city, ''), 80),
    left(coalesce(customer_zip, ''), 20),
    cart->'lines',
    (cart->>'subtotal')::numeric,
    ship,
    (cart->>'subtotal')::numeric + ship
  )
  on conflict (store_id, visitor_key) do update
  set name = excluded.name,
      email = excluded.email,
      phone = excluded.phone,
      street = excluded.street,
      city = excluded.city,
      zip = excluded.zip,
      lines = excluded.lines,
      subtotal = excluded.subtotal,
      shipping_amount = excluded.shipping_amount,
      total = excluded.total,
      recovered = false,
      updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.place_storefront_order(
  tracking_key text,
  hostname text,
  visitor_key text,
  lines jsonb,
  customer_name text,
  customer_email text,
  customer_phone text default '',
  customer_street text default '',
  customer_city text default '',
  customer_zip text default '',
  shipping_name text default '',
  code text default '',
  gift_code text default '',
  payment_status text default 'paid'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  clean_visitor text := btrim(coalesce(visitor_key, ''));
  quote jsonb;
  customer_id uuid;
  saved_order uuid;
  next_number integer;
  line jsonb;
  taken integer;
  cards jsonb;
  card jsonb;
  next_cards jsonb := '[]'::jsonb;
  wanted_gift text := lower(btrim(coalesce(gift_code, '')));
  remaining numeric(12, 2);
begin
  if clean_visitor !~ '^[A-Za-z0-9_-]{16,80}$' then
    return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
  end if;
  if payment_status not in ('paid', 'pending') then
    return jsonb_build_object('ok', false, 'reason', 'סטטוס תשלום לא תקין');
  end if;
  if length(btrim(coalesce(customer_name, ''))) = 0 or length(btrim(coalesce(customer_email, ''))) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'חסרים פרטי לקוח');
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;

  perform 1 from public.stores as store where store.id = found_store for update;
  quote := public.quote_storefront(tracking_key, hostname, code, lines, shipping_name, customer_email, gift_code);
  if coalesce(quote->>'ok', 'false') <> 'true' then
    return quote;
  end if;

  for line in select value from jsonb_array_elements(quote->'lines') as value
  loop
    taken := null;
    update public.inventory_items as inventory
    set available = inventory.available - (line->>'quantity')::integer
    where inventory.store_id = found_store
      and inventory.variant_id = (line->>'variantId')::uuid
      and inventory.available >= (line->>'quantity')::integer
    returning inventory.available into taken;
    if taken is null then
      raise exception 'המלאי לא מספיק' using errcode = 'P0001';
    end if;
  end loop;

  select customer.id
  into customer_id
  from public.customers as customer
  where customer.store_id = found_store
    and lower(coalesce(customer.email, '')) = lower(btrim(customer_email))
  limit 1;

  if customer_id is null then
    insert into public.customers (store_id, name, email, phone)
    values (found_store, btrim(customer_name), lower(btrim(customer_email)), coalesce(customer_phone, ''))
    returning id into customer_id;
    insert into public.customer_addresses (store_id, customer_id, street, city, zip)
    values (found_store, customer_id, coalesce(customer_street, ''), coalesce(customer_city, ''), coalesce(customer_zip, ''));
  else
    update public.customers as customer
    set name = btrim(customer_name),
        phone = coalesce(customer_phone, customer.phone)
    where customer.store_id = found_store
      and customer.id = customer_id;
    update public.customer_addresses as addr
    set street = coalesce(customer_street, ''),
        city = coalesce(customer_city, ''),
        zip = coalesce(customer_zip, '')
    where addr.store_id = found_store
      and addr.customer_id = customer_id;
    if not found then
      insert into public.customer_addresses (store_id, customer_id, street, city, zip)
      values (found_store, customer_id, coalesce(customer_street, ''), coalesce(customer_city, ''), coalesce(customer_zip, ''));
    end if;
  end if;

  select coalesce(max(sale.order_number), 1000) + 1
  into next_number
  from public.orders as sale
  where sale.store_id = found_store;

  insert into public.orders (
    store_id, customer_id, financial_status, fulfillment_status, total, order_number, channel,
    discount_code, discount_amount, shipping_name, shipping_amount
  )
  values (
    found_store, customer_id, payment_status, 'unfulfilled', (quote->>'total')::numeric, next_number, 'חנות אונליין',
    coalesce(quote->>'discountCode', ''), (quote->>'discount')::numeric, coalesce(shipping_name, ''), (quote->>'shipping')::numeric
  )
  returning id into saved_order;

  insert into public.order_items (store_id, order_id, variant_id, title, quantity, unit_price)
  select
    found_store,
    saved_order,
    (line.line->>'variantId')::uuid,
    line.line->>'title',
    (line.line->>'quantity')::integer,
    (line.line->>'unitPrice')::numeric
  from jsonb_array_elements(quote->'lines') as line(line);

  insert into public.payments (store_id, order_id, amount, status)
  values (found_store, saved_order, (quote->>'total')::numeric, payment_status);

  insert into public.shipments (store_id, order_id, status)
  values (found_store, saved_order, 'unfulfilled');

  if coalesce(quote->>'discountCode', '') <> '' then
    update public.discounts as discount
    set uses = discount.uses + 1
    where discount.store_id = found_store
      and lower(coalesce(discount.code, '')) = lower(quote->>'discountCode');
  end if;

  if (quote->>'gift')::numeric > 0 and wanted_gift <> '' then
    select settings.gift_cards
    into cards
    from public.store_settings as settings
    where settings.store_id = found_store
    for update;
    for card in select value from jsonb_array_elements(coalesce(cards, '[]'::jsonb)) as value
    loop
      if lower(coalesce(card->>'code', '')) = wanted_gift then
        remaining := greatest(
          coalesce(nullif(card->>'balance', ''), card->>'value', '0')::numeric - (quote->>'gift')::numeric,
          0
        );
        card := jsonb_set(card, '{balance}', to_jsonb(remaining), true);
      end if;
      next_cards := next_cards || jsonb_build_array(card);
    end loop;
    update public.store_settings as settings
    set gift_cards = next_cards
    where settings.store_id = found_store;
  end if;

  update public.checkout_drafts as draft
  set recovered = true
  where draft.store_id = found_store
    and draft.visitor_key = clean_visitor;

  return jsonb_build_object(
    'ok', true,
    'orderNumber', next_number,
    'total', (quote->>'total')::numeric,
    'discount', (quote->>'discount')::numeric,
    'shipping', (quote->>'shipping')::numeric
  );
end;
$$;

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
  settings public.store_settings%rowtype;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select settings_row.*
  into settings
  from public.store_settings as settings_row
  where settings_row.store_id = target_store;

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
    'ownerEmail', coalesce(owner_email, ''),
    'policies', coalesce(settings.policies, '{}'::jsonb),
    'shipping', coalesce(settings.shipping, '{}'::jsonb),
    'marketing', coalesce(settings.marketing, '{}'::jsonb),
    'posts', coalesce(settings.posts, '[]'::jsonb),
    'giftCards', coalesce(settings.gift_cards, '[]'::jsonb),
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
          ),
          'note', customer.note,
          'tags', customer.tags,
          'subscribed', customer.subscribed,
          'credit', customer.credit,
          'language', customer.locale,
          'sms', customer.sms,
          'whatsapp', customer.whatsapp
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
          'applies', discount.applies,
          'collections', to_jsonb(discount.collection_titles),
          'bxBuy', discount.bx_buy,
          'bxGet', discount.bx_get,
          'bxColl', discount.bx_coll
        )
        order by discount.title
      )
      from public.discounts as discount
      where discount.store_id = target_store
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
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
        )
        order by sale.created_at desc
      )
      from public.orders as sale
      where sale.store_id = target_store
        and sale.order_number is not null
    ), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', collection.title,
        'description', collection.description,
        'conditions', collection.conditions,
        'excludeOutOfStock', collection.exclude_out_of_stock,
        'image', collection.image,
        'hidden', collection.hidden,
        'productIds', coalesce((
          select jsonb_agg(link.product_id order by link.position)
          from public.collection_products as link
          where link.store_id = collection.store_id
            and link.collection_id = collection.id
        ), '[]'::jsonb)
      ) order by collection.title)
      from public.collections as collection
      where collection.store_id = target_store
    ), '[]'::jsonb),
    'checkouts', coalesce((
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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.save_store_customer(uuid, uuid, text, text, text, text, text, text, boolean, text, text[], boolean, numeric, text, boolean, boolean) from public, anon;
revoke all on function public.save_store_discount(uuid, jsonb) from public, anon;
revoke all on function public.delete_store_discounts(uuid, uuid[]) from public, anon;
revoke all on function public.save_store_collection(uuid, jsonb) from public, anon;
revoke all on function public.save_store_sections(uuid, jsonb) from public, anon;
revoke all on function public.update_store_order(uuid, integer, jsonb) from public, anon;
revoke all on function public.update_store_checkout(uuid, uuid, boolean) from public, anon;
revoke all on function public.store_admin_snapshot(uuid) from public, anon;
revoke all on function public.storefront_shop(text, text) from public;
revoke all on function public.quote_storefront(text, text, text, jsonb, text, text, text) from public;
revoke all on function public.save_storefront_checkout(text, text, text, jsonb, text, text, text, text, text, text, text) from public;
revoke all on function public.place_storefront_order(text, text, text, jsonb, text, text, text, text, text, text, text, text, text, text) from public;

grant execute on function public.save_store_customer(uuid, uuid, text, text, text, text, text, text, boolean, text, text[], boolean, numeric, text, boolean, boolean) to authenticated;
grant execute on function public.save_store_discount(uuid, jsonb) to authenticated;
grant execute on function public.delete_store_discounts(uuid, uuid[]) to authenticated;
grant execute on function public.save_store_collection(uuid, jsonb) to authenticated;
grant execute on function public.save_store_sections(uuid, jsonb) to authenticated;
grant execute on function public.update_store_order(uuid, integer, jsonb) to authenticated;
grant execute on function public.update_store_checkout(uuid, uuid, boolean) to authenticated;
grant execute on function public.store_admin_snapshot(uuid) to authenticated;
grant execute on function public.storefront_shop(text, text) to anon, authenticated;
grant execute on function public.quote_storefront(text, text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.save_storefront_checkout(text, text, text, jsonb, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.place_storefront_order(text, text, text, jsonb, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
