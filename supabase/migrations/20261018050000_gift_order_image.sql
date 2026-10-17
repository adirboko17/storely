create or replace function public.settle_store_gifts(
  target_store uuid,
  customer_name text,
  customer_email text,
  redeem_code text,
  payable numeric,
  purchases jsonb,
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
  cards jsonb;
  card jsonb;
  next_cards jsonb := '[]'::jsonb;
  wanted text := lower(btrim(coalesce(redeem_code, '')));
  due numeric(12, 2) := round(coalesce(payable, 0), 2);
  applied numeric(12, 2) := 0;
  remaining numeric(12, 2);
  found boolean := false;
  amount numeric(12, 2);
  issued jsonb := '[]'::jsonb;
  code text;
  buyer text;
  purchase jsonb;
  sale_total numeric(12, 2) := 0;
  customer_id uuid;
  saved_order uuid;
  next_number integer;
  gift_variant uuid;
  codes text;
begin
  if not exists (select 1 from public.stores as store where store.id = target_store) then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;
  if due < 0 or due > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום לא תקין');
  end if;
  if jsonb_typeof(coalesce(purchases, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(purchases, '[]'::jsonb)) > 30 then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא תקינה');
  end if;

  perform 1 from public.stores as store where store.id = target_store for update;

  select settings.gift_cards
  into cards
  from public.store_settings as settings
  where settings.store_id = target_store
  for update;
  if cards is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;

  if wanted <> '' then
    for card in select value from jsonb_array_elements(cards) as value
    loop
      if lower(coalesce(card->>'code', '')) = wanted and not found then
        found := true;
        if coalesce(card->>'expires', '') ~ '^\d{4}-\d{2}-\d{2}$' and (card->>'expires')::date < current_date then
          return jsonb_build_object('ok', false, 'reason', 'תוקף הכרטיס פג');
        end if;
        remaining := greatest(coalesce(nullif(card->>'balance', ''), card->>'value', '0')::numeric, 0);
        if remaining <= 0 then
          return jsonb_build_object('ok', false, 'reason', 'היתרה בכרטיס נוצלה');
        end if;
        applied := least(due, remaining);
        card := jsonb_set(card, '{balance}', to_jsonb(round(remaining - applied, 2)), true);
      end if;
      next_cards := next_cards || jsonb_build_array(card);
    end loop;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'קוד הכרטיס לא נמצא');
    end if;
    cards := next_cards;
  end if;

  buyer := left(btrim(concat_ws(' · ', nullif(btrim(coalesce(customer_name, '')), ''), nullif(btrim(coalesce(customer_email, '')), ''))), 180);
  for purchase in select value from jsonb_array_elements(coalesce(purchases, '[]'::jsonb)) as value
  loop
    begin
      amount := round((purchase #>> '{}')::numeric, 2);
    exception
      when others then
        return jsonb_build_object('ok', false, 'reason', 'סכום הכרטיס לא תקין');
    end;
    if amount is null or amount < 1 or amount > 2500 then
      return jsonb_build_object('ok', false, 'reason', 'סכום הכרטיס לא תקין');
    end if;
    code := private.fresh_gift_code(cards);
    cards := cards || jsonb_build_array(jsonb_build_object(
      'code', code,
      'value', amount,
      'balance', amount,
      'customer', buyer,
      'expires', '',
      'note', 'נוצר אוטומטית אחרי רכישה'
    ));
    issued := issued || jsonb_build_array(jsonb_build_object('code', code, 'amount', amount));
    sale_total := sale_total + amount;
  end loop;

  update public.store_settings as settings
  set gift_cards = cards
  where settings.store_id = target_store;

  if jsonb_array_length(issued) > 0 then
    select customer.id
    into customer_id
    from public.customers as customer
    where customer.store_id = target_store
      and lower(coalesce(customer.email, '')) = lower(btrim(coalesce(customer_email, '')))
    limit 1;

    if customer_id is null then
      insert into public.customers (store_id, name, email, phone)
      values (target_store, btrim(coalesce(customer_name, 'לקוח')), lower(btrim(coalesce(customer_email, ''))), coalesce(customer_phone, ''))
      returning id into customer_id;
      insert into public.customer_addresses (store_id, customer_id, street, city, zip)
      values (target_store, customer_id, coalesce(customer_street, ''), coalesce(customer_city, ''), coalesce(customer_zip, ''));
    end if;

    select variant_row.id
    into gift_variant
    from public.products as product
    join public.product_variants as variant_row
      on variant_row.store_id = product.store_id
     and variant_row.product_id = product.id
    where product.store_id = target_store
      and (
        product.title = 'כרטיס מתנה'
        or exists (
          select 1
          from unnest(coalesce(product.tags, '{}')) as gift_tag(value)
          where gift_tag.value like chr(1) || 'gift:%'
        )
      )
    order by variant_row.position, variant_row.id
    limit 1;

    select coalesce(max(sale.order_number), 1000) + 1
    into next_number
    from public.orders as sale
    where sale.store_id = target_store;

    select string_agg(item.item->>'code', ', ')
    into codes
    from jsonb_array_elements(issued) as item(item);

    insert into public.orders (
      store_id, customer_id, financial_status, fulfillment_status, total, order_number, channel,
      shipping_name, shipping_amount, note
    )
    values (
      target_store, customer_id, 'paid', 'unfulfilled', sale_total, next_number, 'חנות אונליין',
      coalesce(shipping_name, ''), 0, left('כרטיס מתנה · ' || coalesce(codes, ''), 500)
    )
    returning id into saved_order;

    insert into public.order_items (store_id, order_id, variant_id, title, quantity, unit_price)
    select target_store, saved_order, gift_variant, 'כרטיס מתנה', 1, (item.item->>'amount')::numeric
    from jsonb_array_elements(issued) as item(item);

    insert into public.payments (store_id, order_id, amount, status)
    values (target_store, saved_order, sale_total, 'paid');

    insert into public.shipments (store_id, order_id, status)
    values (target_store, saved_order, 'unfulfilled');
  end if;

  return jsonb_build_object('ok', true, 'applied', applied, 'issued', issued, 'orderNumber', next_number);
end;
$$;

revoke all on function public.settle_store_gifts(uuid, text, text, text, numeric, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_store_gifts(uuid, text, text, text, numeric, jsonb, text, text, text, text, text) to service_role;
