-- A purchased gift card becomes a unique code with a balance.
-- Spending part of it leaves the rest on the same card.

create or replace function private.fresh_gift_code(existing jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  candidate text;
  attempt integer := 0;
  index integer;
  bytes bytea;
begin
  loop
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'לא הצלחנו להפיק קוד' using errcode = 'P0001';
    end if;
    bytes := extensions.gen_random_bytes(16);
    candidate := '';
    for index in 0..15 loop
      candidate := candidate || substr(alphabet, (get_byte(bytes, index) % length(alphabet)) + 1, 1);
    end loop;
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(existing, '[]'::jsonb)) as card(card)
      where lower(coalesce(card.card->>'code', '')) = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

revoke all on function private.fresh_gift_code(jsonb) from public, anon, authenticated;

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
    and (
      coalesce(card.card->>'expires', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (card.card->>'expires')::date >= current_date
    )
  limit 1;
  return coalesce(balance, 0);
end;
$$;

revoke all on function private.gift_card_amount(uuid, text, numeric) from public, anon, authenticated;

create or replace function public.lookup_store_gift(target_store uuid, raw_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := lower(btrim(coalesce(raw_code, '')));
  card jsonb;
  balance numeric(12, 2);
begin
  if wanted = '' then
    return jsonb_build_object('ok', false, 'reason', 'חסר קוד');
  end if;
  select item.card
  into card
  from public.store_settings as settings
  cross join lateral jsonb_array_elements(coalesce(settings.gift_cards, '[]'::jsonb)) as item(card)
  where settings.store_id = target_store
    and lower(coalesce(item.card->>'code', '')) = wanted
  limit 1;
  if card is null then
    return jsonb_build_object('ok', false, 'reason', 'קוד הכרטיס לא נמצא');
  end if;
  if coalesce(card->>'expires', '') ~ '^\d{4}-\d{2}-\d{2}$' and (card->>'expires')::date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'תוקף הכרטיס פג');
  end if;
  balance := greatest(coalesce(nullif(card->>'balance', ''), card->>'value', '0')::numeric, 0);
  if balance <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'היתרה בכרטיס נוצלה');
  end if;
  return jsonb_build_object('ok', true, 'balance', balance);
end;
$$;

revoke all on function public.lookup_store_gift(uuid, text) from public, anon, authenticated;
grant execute on function public.lookup_store_gift(uuid, text) to service_role;

create or replace function public.settle_store_gifts(
  target_store uuid,
  customer_name text,
  customer_email text,
  redeem_code text,
  payable numeric,
  purchases jsonb
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
  end loop;

  update public.store_settings as settings
  set gift_cards = cards
  where settings.store_id = target_store;

  return jsonb_build_object('ok', true, 'applied', applied, 'issued', issued);
end;
$$;

revoke all on function public.settle_store_gifts(uuid, text, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.settle_store_gifts(uuid, text, text, text, numeric, jsonb) to service_role;
