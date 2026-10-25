-- Buy X Get Y can be a product pair, a quantity on one product, or a category gift.

alter table public.discounts
  add column if not exists bx_mode text not null default 'qty',
  add column if not exists bx_get_coll text not null default '',
  add column if not exists bx_buy_ids text[] not null default '{}',
  add column if not exists bx_get_ids text[] not null default '{}';

update public.discounts
set bx_mode = 'cats'
where kind = 'bxgy'
  and btrim(bx_coll) <> ''
  and bx_mode = 'qty';

alter table public.discounts drop constraint if exists discounts_bx_mode_check;
alter table public.discounts
  add constraint discounts_bx_mode_check check (bx_mode in ('pair', 'qty', 'cats'));

create or replace function private.store_product_ids(target_store uuid, raw jsonb)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select array_agg(picked.id order by picked.ordinality)
    from (
      select raw_id.id, min(raw_id.ordinality) as ordinality
      from jsonb_array_elements_text(coalesce(raw, '[]'::jsonb)) with ordinality as raw_id(id, ordinality)
      where exists (
        select 1
        from public.products as product
        where product.store_id = target_store
          and product.id::text = raw_id.id
      )
      group by raw_id.id
      order by min(raw_id.ordinality)
      limit 40
    ) as picked
  ), '{}'::text[]);
$$;

revoke all on function private.store_product_ids(uuid, jsonb) from public, anon, authenticated;

create or replace function private.bxgy_scope_matches(
  target_store uuid,
  product_id uuid,
  mode text,
  category text,
  product_ids text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when mode = 'cats' and cardinality(coalesce(product_ids, '{}'::text[])) > 0
      then product_id::text = any (product_ids)
    when mode = 'cats'
      then private.discount_covers_product(target_store, product_id, 'colls', array[btrim(coalesce(category, ''))])
    else product_id::text = any (coalesce(product_ids, '{}'::text[]))
  end;
$$;

revoke all on function private.bxgy_scope_matches(uuid, uuid, text, text, text[]) from public, anon, authenticated;

create or replace function private.bxgy_discount_amount(
  target_store uuid,
  mode text,
  buy_qty text,
  get_qty text,
  buy_coll text,
  get_coll text,
  buy_ids text[],
  get_ids text[],
  cart jsonb
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  need_buy integer := greatest(coalesce(nullif(regexp_replace(coalesce(buy_qty, ''), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  need_get integer := greatest(coalesce(nullif(regexp_replace(coalesce(get_qty, ''), '[^0-9]', '', 'g'), '')::integer, 1), 1);
  buy_have integer := 0;
  prices numeric[] := '{}'::numeric[];
  shared boolean[] := '{}'::boolean[];
  line jsonb;
  line_product uuid;
  line_price numeric;
  line_qty integer;
  parsed boolean;
  is_buy boolean;
  is_get boolean;
  i integer;
  amount numeric := 0;
begin
  if mode = 'qty'
    and cardinality(coalesce(buy_ids, '{}'::text[])) = 0
    and cardinality(coalesce(get_ids, '{}'::text[])) = 0
    and btrim(coalesce(buy_coll, '')) = '' then
    select min((value->>'unitPrice')::numeric)
    into amount
    from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value;
    amount := least(coalesce(amount, 0) * need_get, coalesce((cart->>'subtotal')::numeric, 0));
    if coalesce((cart->>'quantity')::integer, 0) < need_buy then
      amount := 0;
    end if;
    return greatest(coalesce(amount, 0), 0);
  end if;

  for line in select value from jsonb_array_elements(coalesce(cart->'lines', '[]'::jsonb)) as value
  loop
    parsed := true;
    begin
      line_product := (line->>'productId')::uuid;
      line_price := (line->>'unitPrice')::numeric;
      line_qty := (line->>'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        parsed := false;
    end;
    if not parsed or line_product is null or line_price is null or line_qty is null or line_qty < 1 or line_price < 0 then
      continue;
    end if;
    is_buy := private.bxgy_scope_matches(target_store, line_product, mode, buy_coll, buy_ids);
    is_get := private.bxgy_scope_matches(target_store, line_product, mode, get_coll, get_ids);
    if is_buy then
      buy_have := buy_have + line_qty;
    end if;
    if is_get then
      for i in 1..line_qty loop
        prices := array_append(prices, line_price);
        shared := array_append(shared, is_buy);
      end loop;
    end if;
  end loop;

  if buy_have < need_buy or cardinality(prices) = 0 then
    return 0;
  end if;

  select coalesce(sum(picked.price), 0)
  into amount
  from (
    select candidate.price
    from (
      select unit.price
      from unnest(prices, shared) as unit(price, shared_unit)
      where not unit.shared_unit
      union all
      (
        select unit.price
        from unnest(prices, shared) as unit(price, shared_unit)
        where unit.shared_unit
        order by unit.price
        limit greatest(buy_have - need_buy, 0)
      )
    ) as candidate
    order by candidate.price
    limit need_get
  ) as picked;

  return least(greatest(coalesce(amount, 0), 0), coalesce((cart->>'subtotal')::numeric, 0));
end;
$$;

revoke all on function private.bxgy_discount_amount(uuid, text, text, text, text, text, text[], text[], jsonb) from public, anon, authenticated;

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
      if candidate.kind = 'product' and candidate.applies in ('colls', 'subs', 'prods') then
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
        amount := private.bxgy_discount_amount(
          target_store, candidate.bx_mode, candidate.bx_buy, candidate.bx_get,
          candidate.bx_coll, candidate.bx_get_coll, candidate.bx_buy_ids, candidate.bx_get_ids, cart
        );
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
  if chosen.kind = 'product' and chosen.applies in ('colls', 'subs', 'prods') then
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
    amount := private.bxgy_discount_amount(
      target_store, chosen.bx_mode, chosen.bx_buy, chosen.bx_get,
      chosen.bx_coll, chosen.bx_get_coll, chosen.bx_buy_ids, chosen.bx_get_ids, cart
    );
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
    when discount->>'applies' = 'prods' then 'prods'
    else 'all'
  end;
  clean_titles text[] := case
    when clean_applies = 'prods' then coalesce((
      select array_agg(picked.id order by picked.ordinality)
      from (
        select raw.id, min(raw.ordinality) as ordinality
        from jsonb_array_elements_text(coalesce(discount->'collections', '[]'::jsonb)) with ordinality as raw(id, ordinality)
        where exists (
          select 1
          from public.products as product
          where product.store_id = target_store
            and product.id::text = raw.id
        )
        group by raw.id
        order by min(raw.ordinality)
        limit 40
      ) as picked
    ), '{}'::text[])
    else coalesce(array(select jsonb_array_elements_text(coalesce(discount->'collections', '[]'::jsonb))), '{}'::text[])
  end;
  clean_bx_mode text := case
    when clean_kind = 'bxgy' and discount->>'bxMode' in ('pair', 'qty', 'cats') then discount->>'bxMode'
    when clean_kind = 'bxgy' and btrim(coalesce(discount->>'bxColl', '')) <> '' then 'cats'
    else 'qty'
  end;
  clean_buy_ids text[] := private.store_product_ids(target_store, discount->'bxBuyIds');
  clean_get_ids text[] := private.store_product_ids(target_store, discount->'bxGetIds');
  clean_bx_buy text := case
    when clean_bx_mode = 'qty' and coalesce(discount->>'bxBuy', '') ~ '^[1-9][0-9]*$' then discount->>'bxBuy'
    when clean_bx_mode = 'qty' then null
    else '1'
  end;
  clean_bx_get text := case
    when clean_bx_mode = 'qty' and coalesce(discount->>'bxGet', '') ~ '^[1-9][0-9]*$' then discount->>'bxGet'
    when clean_bx_mode = 'qty' then null
    else '1'
  end;
  clean_bx_coll text := btrim(coalesce(discount->>'bxColl', ''));
  clean_bx_get_coll text := btrim(coalesce(discount->>'bxGetColl', ''));
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
  if clean_kind = 'product' and clean_applies = 'prods' and cardinality(clean_titles) = 0 then
    raise exception 'יש לבחור מוצר' using errcode = '22023';
  end if;
  if clean_bx_mode = 'pair' then
    clean_buy_ids := case when cardinality(clean_buy_ids) > 0 then clean_buy_ids[1:1] else '{}'::text[] end;
    clean_get_ids := case when cardinality(clean_get_ids) > 0 then clean_get_ids[1:1] else '{}'::text[] end;
  elsif clean_bx_mode = 'qty' then
    clean_buy_ids := case when cardinality(clean_buy_ids) > 0 then clean_buy_ids[1:1] else '{}'::text[] end;
    clean_get_ids := clean_buy_ids;
  end if;
  if clean_bx_mode <> 'cats' then
    clean_bx_coll := '';
    clean_bx_get_coll := '';
  end if;
  if clean_kind = 'bxgy' and clean_bx_mode = 'pair' and (cardinality(clean_buy_ids) <> 1 or cardinality(clean_get_ids) <> 1 or clean_buy_ids[1] = clean_get_ids[1]) then
    raise exception 'יש לבחור מוצר לקנייה ומוצר מתנה' using errcode = '22023';
  end if;
  if clean_kind = 'bxgy' and clean_bx_mode = 'qty' and (cardinality(clean_buy_ids) <> 1 or clean_bx_buy is null or clean_bx_get is null) then
    raise exception 'יש לבחור מוצר וכמות' using errcode = '22023';
  end if;
  if clean_kind = 'bxgy' and clean_bx_mode = 'cats' and (clean_bx_coll = '' or clean_bx_get_coll = '') then
    raise exception 'יש לבחור קטגוריות' using errcode = '22023';
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
        collection_titles = clean_titles,
        bx_mode = clean_bx_mode,
        bx_buy = coalesce(clean_bx_buy, '1'),
        bx_get = coalesce(clean_bx_get, '1'),
        bx_coll = clean_bx_coll,
        bx_get_coll = clean_bx_get_coll,
        bx_buy_ids = clean_buy_ids,
        bx_get_ids = clean_get_ids,
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
      comb_product, comb_order, comb_ship, block_gift, applies, collection_titles,
      bx_mode, bx_buy, bx_get, bx_coll, bx_get_coll, bx_buy_ids, bx_get_ids
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
      clean_titles,
      clean_bx_mode,
      coalesce(clean_bx_buy, '1'),
      coalesce(clean_bx_get, '1'),
      clean_bx_coll,
      clean_bx_get_coll,
      clean_buy_ids,
      clean_get_ids
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
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  if position('''bxMode'', discount.bx_mode' in src) = 0 then
    if position('''bxColl'', discount.bx_coll' in src) = 0 then
      raise exception 'admin snapshot is missing bxgy fields';
    end if;
    src := replace(
      src,
      '''bxColl'', discount.bx_coll',
      '''bxColl'', discount.bx_coll, ''bxMode'', discount.bx_mode, ''bxGetColl'', discount.bx_get_coll, ''bxBuyIds'', to_jsonb(discount.bx_buy_ids), ''bxGetIds'', to_jsonb(discount.bx_get_ids)'
    );
    execute src;
  end if;
end $$;
