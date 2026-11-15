-- Checkout answers live on the order. A separate hashed key can read new and
-- updated orders, and nothing else.

alter table public.orders
  add column if not exists updated_at timestamptz,
  add column if not exists pregnancy_week integer,
  add column if not exists baby_birth_date date,
  add column if not exists heard_about text not null default '',
  add column if not exists heard_detail text not null default '',
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists checkout_recorded boolean not null default false;

update public.orders
set updated_at = created_at
where updated_at is null;

alter table public.orders
  alter column updated_at set not null,
  alter column updated_at set default now();

alter table public.orders
  drop constraint if exists orders_pregnancy_week_check;
alter table public.orders
  add constraint orders_pregnancy_week_check
  check (pregnancy_week is null or pregnancy_week between 1 and 42);

alter table public.orders
  drop constraint if exists orders_heard_len_check;
alter table public.orders
  add constraint orders_heard_len_check
  check (char_length(heard_about) <= 80 and char_length(heard_detail) <= 200);

create index if not exists orders_feed_idx
  on public.orders (store_id, updated_at, id)
  where order_number is not null;

create or replace function private.touch_order_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_order_updated_at() from public, anon, authenticated;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function private.touch_order_updated_at();

create or replace function private.touch_parent_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_store uuid;
  parent_order uuid;
begin
  if tg_op = 'DELETE' then
    parent_store := old.store_id;
    parent_order := old.order_id;
  else
    parent_store := new.store_id;
    parent_order := new.order_id;
  end if;
  update public.orders
  set updated_at = now()
  where store_id = parent_store
    and id = parent_order;
  return coalesce(new, old);
end;
$$;

revoke all on function private.touch_parent_order() from public, anon, authenticated;

drop trigger if exists order_items_touch_parent on public.order_items;
create trigger order_items_touch_parent
after insert or update or delete on public.order_items
for each row execute function private.touch_parent_order();

create or replace function private.checkout_from_address(address text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  source text := coalesce(address, '');
  week_text text;
  week_number integer;
  birth_text text;
  birth_date date;
  heard_text text;
  detail_text text := '';
  known text[] := array['שמעתי מחברה', 'רשתות חברתיות', 'גוגל', 'דרך הפודקאסט', 'דולה/אשת מקצוע', 'אחר'];
begin
  week_text := substring(source from 'שבוע הריון ([0-9]{1,2})');
  if week_text ~ '^[0-9]+$' then
    week_number := week_text::integer;
    if week_number < 1 or week_number > 42 then
      week_number := null;
    end if;
  end if;

  birth_text := substring(source from 'תאריך לידה ([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})');
  if birth_text is not null then
    begin
      birth_date := to_date(birth_text, 'DD.MM.YYYY');
      if birth_date > current_date then
        birth_date := null;
      end if;
    exception
      when others then
        birth_date := null;
    end;
  end if;

  heard_text := btrim(substring(source from 'שמעה עלינו: ([^,]+)'));
  if heard_text ~ ' \(.+\)$' then
    detail_text := btrim(substring(heard_text from ' \((.+)\)$'));
    heard_text := btrim(regexp_replace(heard_text, ' \(.+\)$', ''));
  end if;
  if heard_text is null or not (heard_text = any (known)) then
    heard_text := '';
    detail_text := '';
  elsif heard_text <> 'אחר' then
    detail_text := '';
  end if;

  return jsonb_build_object(
    'pregnancyWeek', week_number,
    'babyBirthDate', birth_date,
    'heard', heard_text,
    'heardDetail', detail_text
  );
end;
$$;

revoke all on function private.checkout_from_address(text) from public, anon, authenticated;

create table if not exists public.order_read_keys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  token_hash text not null,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint order_read_keys_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint order_read_keys_hash_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint order_read_keys_prefix_len check (char_length(token_prefix) between 8 and 16)
);

create unique index if not exists order_read_keys_hash_key on public.order_read_keys (token_hash);
create index if not exists order_read_keys_store_idx
  on public.order_read_keys (store_id)
  where revoked_at is null;

alter table public.order_read_keys enable row level security;
revoke all on table public.order_read_keys from public, anon, authenticated;

create or replace function public.create_my_order_read_key(
  target_store uuid,
  key_name text,
  token_hash text,
  token_prefix text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  saved_at timestamptz;
  clean_name text := btrim(coalesce(key_name, ''));
begin
  if auth.uid() is null or not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception 'השם צריך להיות בין תו אחד ל-80' using errcode = '22023';
  end if;
  if token_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(token_prefix, '')) < 8 then
    raise exception 'מפתח לא תקין' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.order_read_keys as access_key
    where access_key.store_id = target_store
      and access_key.revoked_at is null
  ) >= 4 then
    raise exception 'אפשר עד 4 מפתחות פעילים' using errcode = '22023';
  end if;

  insert into public.order_read_keys (store_id, name, token_hash, token_prefix)
  values (target_store, clean_name, create_my_order_read_key.token_hash, left(create_my_order_read_key.token_prefix, 16))
  returning id, created_at into saved_id, saved_at;

  return jsonb_build_object(
    'id', saved_id,
    'name', clean_name,
    'tokenPrefix', left(token_prefix, 16),
    'createdAt', saved_at
  );
end;
$$;

create or replace function public.list_my_order_read_keys(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', access_key.id,
        'name', access_key.name,
        'tokenPrefix', access_key.token_prefix,
        'createdAt', access_key.created_at,
        'lastUsedAt', access_key.last_used_at
      )
      order by access_key.created_at desc
    )
    from public.order_read_keys as access_key
    where access_key.store_id = target_store
      and access_key.revoked_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.revoke_my_order_read_key(target_store uuid, key_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.order_read_keys
  set revoked_at = now()
  where id = key_id
    and store_id = target_store
    and revoked_at is null;

  if not found then
    raise exception 'המפתח לא נמצא' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_my_order_read_key(uuid, text, text, text) from public, anon;
revoke all on function public.list_my_order_read_keys(uuid) from public, anon;
revoke all on function public.revoke_my_order_read_key(uuid, uuid) from public, anon;
grant execute on function public.create_my_order_read_key(uuid, text, text, text) to authenticated;
grant execute on function public.list_my_order_read_keys(uuid) to authenticated;
grant execute on function public.revoke_my_order_read_key(uuid, uuid) to authenticated;

create or replace function public.record_storefront_checkout(
  tracking_key text,
  hostname text,
  order_number text,
  pregnancy_week integer,
  baby_birth date,
  heard text,
  heard_detail text,
  marketing_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  number_text text := btrim(coalesce(order_number, ''));
  number_value integer;
  clean_heard text := btrim(coalesce(heard, ''));
  clean_detail text := btrim(coalesce(heard_detail, ''));
  known text[] := array['שמעתי מחברה', 'רשתות חברתיות', 'גוגל', 'דרך הפודקאסט', 'דולה/אשת מקצוע', 'אחר'];
  saved_id uuid;
  saved_customer uuid;
begin
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null or number_text !~ '^[0-9]+$' then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא נמצאה');
  end if;
  number_value := number_text::integer;
  if pregnancy_week is not null and (pregnancy_week < 1 or pregnancy_week > 42) then
    return jsonb_build_object('ok', false, 'reason', 'שבוע הריון לא תקין');
  end if;
  if baby_birth is not null and baby_birth > current_date then
    return jsonb_build_object('ok', false, 'reason', 'תאריך הלידה לא תקין');
  end if;
  if clean_heard <> '' and not (clean_heard = any (known)) then
    return jsonb_build_object('ok', false, 'reason', 'התשובה לא מוכרת');
  end if;
  if clean_heard <> 'אחר' then
    clean_detail := '';
  end if;
  if char_length(clean_detail) > 200 then
    clean_detail := left(clean_detail, 200);
  end if;

  update public.orders as sale
  set pregnancy_week = record_storefront_checkout.pregnancy_week,
      baby_birth_date = baby_birth,
      heard_about = clean_heard,
      heard_detail = clean_detail,
      marketing_consent = coalesce(record_storefront_checkout.marketing_consent, false),
      checkout_recorded = true
  where sale.store_id = found_store
    and sale.order_number = number_value
    and sale.checkout_recorded = false
    and sale.created_at >= now() - interval '3 hours'
  returning sale.id, sale.customer_id into saved_id, saved_customer;

  if saved_id is null then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא נמצאה');
  end if;

  if coalesce(marketing_consent, false) and saved_customer is not null then
    update public.customers as customer
    set email_consent_status = 'subscribed',
        email_consent_at = now(),
        email_consent_source = 'checkout',
        sms_consent_status = 'subscribed',
        sms_consent_at = now(),
        sms_consent_source = 'checkout'
    where customer.store_id = found_store
      and customer.id = saved_customer;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_storefront_checkout(text, text, text, integer, date, text, text, boolean) from public;
grant execute on function public.record_storefront_checkout(text, text, text, integer, date, text, text, boolean) to anon, authenticated;

create or replace function public.read_store_orders(
  token_hash text,
  updated_since timestamptz,
  after_id uuid,
  page_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  cursor_time timestamptz := coalesce(updated_since, '-infinity'::timestamptz);
  cursor_id uuid := coalesce(after_id, '00000000-0000-0000-0000-000000000000'::uuid);
  bounded integer := least(greatest(coalesce(page_limit, 50), 1), 100);
  rows jsonb;
  extra boolean := false;
begin
  if token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select access_key.store_id
  into found_store
  from public.order_read_keys as access_key
  where access_key.token_hash = read_store_orders.token_hash
    and access_key.revoked_at is null;

  if found_store is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  update public.order_read_keys
  set last_used_at = now()
  where order_read_keys.token_hash = read_store_orders.token_hash
    and order_read_keys.revoked_at is null;

  with page as materialized (
    select sale.id, sale.updated_at
    from public.orders as sale
    where sale.store_id = found_store
      and sale.order_number is not null
      and (sale.updated_at, sale.id) > (cursor_time, cursor_id)
    order by sale.updated_at, sale.id
    limit bounded + 1
  ),
  chosen as (
    select page.id
    from page
    order by page.updated_at, page.id
    limit bounded
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sale.id,
    'number', sale.order_number,
    'createdAt', sale.created_at,
    'updatedAt', sale.updated_at,
    'paymentStatus', sale.financial_status,
    'fulfillmentStatus', sale.fulfillment_status,
    'customerStatus', sale.customer_status,
    'currency', coalesce(settings.currency, 'ILS'),
    'total', sale.total,
    'discountCode', coalesce(sale.discount_code, ''),
    'discountAmount', coalesce(sale.discount_amount, 0),
    'shippingName', coalesce(sale.shipping_name, ''),
    'shippingAmount', coalesce(sale.shipping_amount, 0),
    'refunded', coalesce(sale.refunded, 0),
    'note', coalesce(sale.note, ''),
    'tags', coalesce(to_jsonb(sale.tags), '[]'::jsonb),
    'carrier', coalesce(sale.carrier, ''),
    'tracking', coalesce(sale.tracking, ''),
    'customer', jsonb_build_object(
      'name', coalesce(customer.name, ''),
      'email', coalesce(customer.email, ''),
      'phone', coalesce(customer.phone, '')
    ),
    'address', jsonb_build_object(
      'street', coalesce(address.street, ''),
      'city', coalesce(address.city, ''),
      'zip', coalesce(address.zip, '')
    ),
    'checkout', case
      when sale.checkout_recorded then jsonb_build_object(
        'pregnancyWeek', sale.pregnancy_week,
        'babyBirthDate', sale.baby_birth_date,
        'heard', sale.heard_about,
        'heardDetail', sale.heard_detail,
        'marketingConsent', sale.marketing_consent
      )
      else private.checkout_from_address(coalesce(address.street, ''))
        || jsonb_build_object('marketingConsent', sale.marketing_consent)
    end,
    'items', coalesce(items.lines, '[]'::jsonb)
  ) order by sale.updated_at, sale.id), '[]'::jsonb),
  (select count(*) > bounded from page)
  into rows, extra
  from chosen
  join public.orders as sale
    on sale.store_id = found_store
   and sale.id = chosen.id
  left join public.store_settings as settings
    on settings.store_id = sale.store_id
  left join public.customers as customer
    on customer.store_id = sale.store_id
   and customer.id = sale.customer_id
  left join lateral (
    select addr.street, addr.city, addr.zip
    from public.customer_addresses as addr
    where addr.store_id = sale.store_id
      and addr.customer_id = sale.customer_id
    limit 1
  ) as address on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'title', item.title,
      'variant', coalesce(variant_row.title, ''),
      'sku', coalesce(variant_row.sku, ''),
      'quantity', item.quantity,
      'unitPrice', item.unit_price
    ) order by item.id) as lines
    from public.order_items as item
    left join public.product_variants as variant_row
      on variant_row.store_id = item.store_id
     and variant_row.id = item.variant_id
    where item.store_id = sale.store_id
      and item.order_id = sale.id
  ) as items on true;

  return jsonb_build_object('ok', true, 'orders', coalesce(rows, '[]'::jsonb), 'hasMore', coalesce(extra, false));
end;
$$;

revoke all on function public.read_store_orders(text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.read_store_orders(text, timestamptz, uuid, integer) to service_role;
