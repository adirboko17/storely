-- Customer reviews of 4 or 5 stars publish on the product page.
-- Reviews under 4 stars wait in the admin until they are approved or rejected.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  product_id uuid not null,
  order_id uuid not null,
  customer_name text not null,
  body text not null default '',
  rating integer not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, order_id, product_id),
  foreign key (store_id, product_id) references public.products (store_id, id),
  foreign key (store_id, order_id) references public.orders (store_id, id),
  check (char_length(customer_name) between 1 and 80),
  check (char_length(body) <= 1000),
  check (rating between 1 and 5),
  check (status in ('pending', 'published', 'rejected'))
);

create index if not exists product_reviews_queue_idx
  on public.product_reviews (store_id, status, created_at desc);

comment on table public.product_reviews is
  'Reviews written by a customer after delivery. Under 4 stars stay pending until an admin approves them.';

alter table public.product_reviews enable row level security;
alter table public.product_reviews force row level security;

drop trigger if exists product_reviews_lock_store on public.product_reviews;
create trigger product_reviews_lock_store
  before update on public.product_reviews
  for each row execute function private.reject_store_id_change();

revoke all on table public.product_reviews from public, anon, authenticated;

create or replace function private.sync_product_review(
  target_store uuid,
  target_product uuid,
  person text,
  review_body text,
  stars integer,
  attach boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_merch jsonb;
  page jsonb;
  reviews jsonb := '[]'::jsonb;
  item jsonb;
  kept jsonb := '[]'::jsonb;
  removed boolean := false;
  entry jsonb;
begin
  select product.merch
  into current_merch
  from public.products as product
  where product.store_id = target_store
    and product.id = target_product
  for update;

  if not found then
    return;
  end if;
  if jsonb_typeof(current_merch) is distinct from 'object' then
    current_merch := '{}'::jsonb;
  end if;
  page := current_merch->'page';
  if jsonb_typeof(page) is distinct from 'object' then
    page := '{}'::jsonb;
  end if;
  if jsonb_typeof(page->'reviews') = 'array' then
    reviews := page->'reviews';
  end if;

  for item in select value from jsonb_array_elements(reviews) loop
    if not removed
      and not attach
      and coalesce(item->>'name', '') = person
      and coalesce(item->>'body', '') = review_body
      and coalesce(item->>'rating', '') = stars::text then
      removed := true;
      continue;
    end if;
    kept := kept || jsonb_build_array(item);
  end loop;

  if attach and not kept @> jsonb_build_array(jsonb_build_object(
    'name', person,
    'title', '',
    'body', review_body,
    'rating', stars,
    'verified', true
  )) then
    entry := jsonb_build_object(
      'name', person,
      'title', '',
      'body', review_body,
      'date', to_char(now() at time zone 'Asia/Jerusalem', 'DD.MM.YYYY'),
      'rating', stars,
      'verified', true
    );
    kept := kept || jsonb_build_array(entry);
  end if;

  page := jsonb_set(page, '{reviews}', kept, true);
  update public.products as product
  set merch = jsonb_set(current_merch, '{page}', private.clean_product_page(page), true),
      updated_at = now()
  where product.store_id = target_store
    and product.id = target_product;
end;
$$;

revoke all on function private.sync_product_review(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;

create or replace function public.submit_product_review(
  target_store uuid,
  customer_phone text,
  customer_email text,
  order_number integer,
  product_id uuid,
  stars integer,
  review_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted_phone text := right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 9);
  wanted_email text := lower(btrim(coalesce(customer_email, '')));
  clean_body text;
  person text;
  found_order uuid;
  existing public.product_reviews%rowtype;
  next_status text;
begin
  if length(wanted_phone) < 9 or wanted_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'חסרים פרטי החשבון');
  end if;
  if stars is null or stars < 1 or stars > 5 then
    return jsonb_build_object('ok', false, 'reason', 'צריך לבחור בין כוכב אחד לחמישה');
  end if;
  clean_body := private.clean_copy(review_body, 1000);
  if clean_body = '' then
    clean_body := 'ביקורת ללא טקסט';
  end if;

  select sale.id, left(btrim(regexp_replace(coalesce(customer.name, ''), '[[:cntrl:]]', '', 'g')), 80)
  into found_order, person
  from public.orders as sale
  join public.customers as customer
    on customer.store_id = sale.store_id
   and customer.id = sale.customer_id
  where sale.store_id = target_store
    and sale.order_number = submit_product_review.order_number
    and sale.customer_status = 'delivered'
    and lower(coalesce(customer.email, '')) = wanted_email
    and right(regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'), 9) = wanted_phone
    and exists (
      select 1
      from public.order_items as item
      join public.product_variants as variant
        on variant.store_id = item.store_id
       and variant.id = item.variant_id
      where item.store_id = sale.store_id
        and item.order_id = sale.id
        and variant.product_id = submit_product_review.product_id
    );

  if found_order is null then
    return jsonb_build_object('ok', false, 'reason', 'אפשר לכתוב ביקורת רק על מוצר מהזמנה שנמסרה');
  end if;
  if person is null or person = '' then
    person := 'לקוחה';
  end if;

  select review.*
  into existing
  from public.product_reviews as review
  where review.store_id = target_store
    and review.order_id = found_order
    and review.product_id = submit_product_review.product_id;

  if existing.id is not null and existing.status = 'published' then
    perform private.sync_product_review(target_store, existing.product_id, existing.customer_name, existing.body, existing.rating, false);
  end if;

  next_status := case when stars < 4 then 'pending' else 'published' end;

  insert into public.product_reviews as review (
    store_id, product_id, order_id, customer_name, body, rating, status
  ) values (
    target_store, submit_product_review.product_id, found_order, person, clean_body, stars, next_status
  )
  on conflict (store_id, order_id, product_id) do update
  set customer_name = excluded.customer_name,
      body = excluded.body,
      rating = excluded.rating,
      status = excluded.status,
      updated_at = now();

  if next_status = 'published' then
    perform private.sync_product_review(target_store, submit_product_review.product_id, person, clean_body, stars, true);
  end if;

  return jsonb_build_object('ok', true, 'status', next_status);
end;
$$;

revoke all on function public.submit_product_review(uuid, text, text, integer, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.submit_product_review(uuid, text, text, integer, uuid, integer, text) to service_role;

create or replace function public.list_store_product_reviews(
  target_store uuid,
  wanted_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  status_filter text := case
    when wanted_status in ('pending', 'published', 'rejected') then wanted_status
    else 'pending'
  end;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(picked.item order by picked.created_at desc)
    from (
      select jsonb_build_object(
        'id', review.id,
        'productId', review.product_id,
        'productTitle', product.title,
        'orderNumber', sale.order_number,
        'name', review.customer_name,
        'body', review.body,
        'rating', review.rating,
        'status', review.status,
        'createdAt', review.created_at
      ) as item,
      review.created_at
      from public.product_reviews as review
      join public.products as product
        on product.store_id = review.store_id
       and product.id = review.product_id
      join public.orders as sale
        on sale.store_id = review.store_id
       and sale.id = review.order_id
      where review.store_id = target_store
        and review.status = status_filter
      order by review.created_at desc
      limit 100
    ) as picked
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_store_product_reviews(uuid, text) from public, anon;
grant execute on function public.list_store_product_reviews(uuid, text) to authenticated;

create or replace function public.decide_store_product_review(
  target_store uuid,
  review_id uuid,
  decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.product_reviews%rowtype;
  next_status text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if decision not in ('approve', 'reject') then
    raise exception 'החלטה לא תקינה' using errcode = '22023';
  end if;

  select review.*
  into existing
  from public.product_reviews as review
  where review.store_id = target_store
    and review.id = review_id
  for update;

  if existing.id is null then
    raise exception 'הביקורת לא נמצאה' using errcode = 'P0002';
  end if;

  next_status := case when decision = 'approve' then 'published' else 'rejected' end;
  if existing.status = 'published' and next_status <> 'published' then
    perform private.sync_product_review(target_store, existing.product_id, existing.customer_name, existing.body, existing.rating, false);
  elsif next_status = 'published' and existing.status <> 'published' then
    perform private.sync_product_review(target_store, existing.product_id, existing.customer_name, existing.body, existing.rating, true);
  end if;

  update public.product_reviews as review
  set status = next_status,
      updated_at = now()
  where review.store_id = target_store
    and review.id = review_id;

  return jsonb_build_object('ok', true, 'status', next_status);
end;
$$;

revoke all on function public.decide_store_product_review(uuid, uuid, text) from public, anon;
grant execute on function public.decide_store_product_review(uuid, uuid, text) to authenticated;

create or replace function public.customer_order_statuses(
  target_store uuid,
  customer_phone text,
  customer_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted_phone text := right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 9);
  wanted_email text := lower(btrim(coalesce(customer_email, '')));
begin
  if length(wanted_phone) < 9 or wanted_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from public.stores as store where store.id = target_store) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'number', sale_row.order_number,
      'status', sale_row.customer_status,
      'total', sale_row.total,
      'title', sale_row.title,
      'at', sale_row.created_at,
      'items', sale_row.items
    ) order by sale_row.created_at desc)
    from (
      select sale.order_number, sale.customer_status, sale.total, sale.created_at,
        coalesce((
          select item.title
          from public.order_items as item
          where item.store_id = sale.store_id
            and item.order_id = sale.id
          order by item.id
          limit 1
        ), '') as title,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'title', item.title,
            'qty', item.quantity,
            'price', item.unit_price,
            'productId', (
              select variant.product_id
              from public.product_variants as variant
              where variant.store_id = item.store_id
                and variant.id = item.variant_id
            ),
            'image', (
              select case
                when media.path is null or btrim(media.path) = '' then null
                when media.path ~* '^https?://' then media.path
                else 'https://htxxawoyysmxzlxdwgng.supabase.co/storage/v1/object/public/product-media/' || media.path
              end
              from public.product_media as media
              join public.product_variants as variant
                on variant.store_id = media.store_id
               and variant.product_id = media.product_id
              where variant.store_id = item.store_id
                and variant.id = item.variant_id
                and media.path !~* '\.(mp4|webm|mov)(\?|$)'
              order by media.position, media.id
              limit 1
            )
          ) order by item.id)
          from public.order_items as item
          where item.store_id = sale.store_id
            and item.order_id = sale.id
        ), '[]'::jsonb) as items
      from public.orders as sale
      join public.customers as customer
        on customer.store_id = sale.store_id
       and customer.id = sale.customer_id
      where sale.store_id = target_store
        and sale.order_number is not null
        and lower(coalesce(customer.email, '')) = wanted_email
        and right(regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'), 9) = wanted_phone
      order by sale.created_at desc
      limit 30
    ) as sale_row
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.customer_order_statuses(uuid, text, text) from public, anon, authenticated;
grant execute on function public.customer_order_statuses(uuid, text, text) to service_role;
