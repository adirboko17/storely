-- A discount can refuse to apply when checkout includes a gift card.
-- That means a redeemed gift-card code, or a gift-card product in the cart.

alter table public.discounts
  add column if not exists block_gift boolean not null default false;

create or replace function private.checkout_has_gift(target_store uuid, cart jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.gift_card_amount(target_store, coalesce(cart->>'giftCode', ''), 100000000) > 0
    or exists (
      select 1
      from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as line(value)
      join public.products as product
        on product.store_id = target_store
       and product.id::text = line.value->>'productId'
      where btrim(product.category) = 'כרטיסי מתנה'
         or exists (
           select 1
           from unnest(coalesce(product.tags, '{}'::text[])) as tag(tag)
           where tag.tag like chr(1) || 'gift:%'
         )
    );
$$;

revoke all on function private.checkout_has_gift(uuid, jsonb) from public, anon, authenticated;

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
  gift_on boolean := private.checkout_has_gift(target_store, cart);
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
      if candidate.block_gift and gift_on then
        continue;
      end if;
      eligible := subtotal;
      if candidate.kind = 'product' and candidate.applies in ('colls', 'subs') then
        eligible := 0;
        for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
        loop
          line_product := (line->>'productId')::uuid;
          if private.discount_covers_product(target_store, line_product, candidate.applies, candidate.collection_titles) then
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

  if chosen.block_gift and gift_on then
    return jsonb_build_object('ok', false, 'reason', 'ההנחה לא משתלבת עם כרטיס מתנה');
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
  if chosen.kind = 'product' and chosen.applies in ('colls', 'subs') then
    eligible := 0;
    for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
    loop
      line_product := (line->>'productId')::uuid;
      if private.discount_covers_product(target_store, line_product, chosen.applies, chosen.collection_titles) then
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
  clean_applies text := case
    when discount->>'applies' = 'colls' then 'colls'
    when discount->>'applies' = 'subs' then 'subs'
    else 'all'
  end;
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
        block_gift = coalesce(discount->>'blockGift', 'false') = 'true',
        applies = clean_applies,
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
      comb_product, comb_order, comb_ship, block_gift, applies, collection_titles, bx_buy, bx_get, bx_coll
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
      coalesce(discount->>'blockGift', 'false') = 'true',
      clean_applies,
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

revoke all on function public.save_store_discount(uuid, jsonb) from public, anon;
grant execute on function public.save_store_discount(uuid, jsonb) to authenticated;

do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.quote_storefront(text, text, text, jsonb, text, text, text)'::regprocedure);
  if position('cart || jsonb_build_object(''giftCode''' in src) = 0 then
    if position('private.discount_for_cart(found_store, code, cart, customer_email)' in src) = 0 then
      raise exception 'storefront quote is missing the discount call';
    end if;
    src := replace(
      src,
      'private.discount_for_cart(found_store, code, cart, customer_email)',
      'private.discount_for_cart(found_store, code, cart || jsonb_build_object(''giftCode'', coalesce(gift_code, '''')), customer_email)'
    );
    execute src;
  end if;

  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  if position('''blockGift'', discount.block_gift' in src) = 0 then
    if position('''combShip'', discount.comb_ship,' in src) = 0 then
      raise exception 'admin snapshot is missing discount combinations';
    end if;
    src := replace(
      src,
      '''combShip'', discount.comb_ship,',
      '''combShip'', discount.comb_ship,' || E'\n          ''blockGift'', discount.block_gift,'
    );
    execute src;
  end if;
end $$;
