-- Checkout was crashing because `lines` named both a function argument and a checkout column.
-- A store with Hyp connected now opens a Hyp payment page, and the order is created only after Hyp verifies the charge.

create table if not exists private.storefront_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  visitor_key text not null,
  hyp_order text not null,
  amount numeric(12, 2) not null,
  currency text not null,
  payload jsonb not null,
  status text not null default 'pending',
  hyp_id text,
  order_number text,
  created_at timestamptz not null default now(),
  constraint storefront_payments_status_check check (status in ('pending', 'charged', 'paid', 'failed')),
  constraint storefront_payments_amount_check check (amount >= 0),
  constraint storefront_payments_order_key unique (store_id, hyp_order)
);

create index if not exists storefront_payments_store_idx on private.storefront_payments (store_id, created_at desc);

alter table private.storefront_payments enable row level security;
alter table private.storefront_payments force row level security;
revoke all on table private.storefront_payments from public, anon, authenticated;

create or replace function private.percent_encode(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  bytes bytea := convert_to(coalesce(raw, ''), 'UTF8');
  index integer := 0;
  byte integer;
  encoded text := '';
begin
  while index < octet_length(bytes) loop
    byte := get_byte(bytes, index);
    if byte between 48 and 57 or byte between 65 and 90 or byte between 97 and 122 or byte in (45, 46, 95, 126) then
      encoded := encoded || convert_from(set_byte('\x00'::bytea, 0, byte), 'UTF8');
    else
      encoded := encoded || '%' || upper(lpad(to_hex(byte), 2, '0'));
    end if;
    index := index + 1;
  end loop;
  return encoded;
end;
$$;

revoke all on function private.percent_encode(text) from public, anon, authenticated;

create or replace function private.percent_decode(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  input text := coalesce(raw, '');
  output bytea := ''::bytea;
  index integer := 1;
  size integer := char_length(input);
  hex text;
  item text;
begin
  while index <= size loop
    item := substr(input, index, 1);
    if item = '%' and index + 2 <= size and substr(input, index + 1, 2) ~ '^[0-9A-Fa-f]{2}$' then
      hex := substr(input, index + 1, 2);
      output := output || decode(hex, 'hex');
      index := index + 3;
    else
      output := output || convert_to(item, 'UTF8');
      index := index + 1;
    end if;
  end loop;
  return convert_from(output, 'UTF8');
exception
  when others then
    return '';
end;
$$;

revoke all on function private.percent_decode(text) from public, anon, authenticated;

create or replace function private.form_value(raw text, wanted text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  pair text;
  item_key text;
  item_value text;
begin
  foreach pair in array string_to_array(coalesce(raw, ''), '&') loop
    item_key := split_part(pair, '=', 1);
    item_value := substr(pair, char_length(item_key) + 2);
    if private.percent_decode(item_key) = wanted then
      return private.percent_decode(replace(item_value, '+', ' '));
    end if;
  end loop;
  return '';
end;
$$;

revoke all on function private.form_value(text, text) from public, anon, authenticated;

create or replace function private.hyp_credentials(target_store uuid)
returns table (terminal text, api_key text, api_password text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select account.terminal, key_secret.decrypted_secret, pass_secret.decrypted_secret
  from private.store_payment_accounts as account
  join vault.decrypted_secrets as key_secret on key_secret.id = account.api_key_secret_id
  join vault.decrypted_secrets as pass_secret on pass_secret.id = account.api_password_secret_id
  where account.store_id = target_store
    and account.provider = 'hyp'
    and account.api_key_secret_id is not null
    and account.api_password_secret_id is not null
  limit 1;
end;
$$;

revoke all on function private.hyp_credentials(uuid) from public, anon, authenticated;

create or replace function private.hyp_get(target text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  response extensions.http_response;
begin
  if coalesce(target, '') = '' or left(target, 24) <> 'https://pay.hyp.co.il/p/' then
    return null;
  end if;
  response := extensions.http_get(target);
  if response.status <> 200 or response.content is null or position('<html' in lower(response.content)) > 0 then
    return null;
  end if;
  return left(response.content, 8000);
exception
  when others then
    return null;
end;
$$;

revoke all on function private.hyp_get(text) from public, anon, authenticated;

create or replace function private.hyp_money(amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(to_char(round(coalesce(amount, 0), 2), 'FM999999990.00'));
$$;

revoke all on function private.hyp_money(numeric) from public, anon, authenticated;

create or replace function private.hyp_cart_text(quote jsonb, shipping_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  line jsonb;
  label text;
  variant_label text;
  item_qty integer;
  item_price numeric(12, 2);
  items text := '';
  summed numeric(12, 2) := 0;
  shipping_amount numeric(12, 2) := round(coalesce((quote->>'shipping')::numeric, 0), 2);
  discount_amount numeric(12, 2) := least(
    round(coalesce((quote->>'discount')::numeric, 0), 2),
    round(coalesce((quote->>'subtotal')::numeric, 0), 2)
  );
  gift_amount numeric(12, 2) := round(coalesce((quote->>'gift')::numeric, 0), 2);
  due numeric(12, 2) := round(coalesce((quote->>'total')::numeric, 0), 2);
begin
  for line in select value from jsonb_array_elements(coalesce(quote->'lines', '[]'::jsonb)) as value
  loop
    label := btrim(coalesce(line->>'title', ''));
    variant_label := btrim(coalesce(line->>'variant', ''));
    if variant_label <> '' and position(variant_label in label) = 0 and lower(variant_label) <> 'default title' then
      label := label || ' · ' || variant_label;
    end if;
    label := btrim(regexp_replace(regexp_replace(label, '[~\[\]]+', ' ', 'g'), '\s+', ' ', 'g'));
    label := left(label, 80);
    if label = '' then
      label := 'פריט';
    end if;
    if coalesce(line->>'bundle', '') = 'true'
      and coalesce(line->>'packQty', '') ~ '^[1-9][0-9]*$'
      and coalesce(line->>'packPrice', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      item_qty := (line->>'packQty')::integer;
      item_price := round((line->>'packPrice')::numeric, 2);
    elsif coalesce(line->>'quantity', '') ~ '^[1-9][0-9]*$'
      and coalesce(line->>'unitPrice', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      item_qty := (line->>'quantity')::integer;
      item_price := round((line->>'unitPrice')::numeric, 2);
    else
      continue;
    end if;
    items := items || '[0~' || label || '~' || item_qty::text || '~' || private.hyp_money(item_price) || ']';
    summed := summed + round(item_price * item_qty, 2);
  end loop;

  if shipping_amount > 0 then
    label := btrim(regexp_replace(regexp_replace(coalesce(nullif(btrim(shipping_name), ''), 'משלוח'), '[~\[\]]+', ' ', 'g'), '\s+', ' ', 'g'));
    items := items || '[0~' || left(label, 80) || '~1~' || private.hyp_money(shipping_amount) || ']';
    summed := summed + shipping_amount;
  end if;
  if discount_amount > 0 then
    items := items || '[0~הנחה~1~' || private.hyp_money(-discount_amount) || ']';
    summed := summed - discount_amount;
  end if;
  if gift_amount > 0 then
    items := items || '[0~כרטיס מתנה~1~' || private.hyp_money(-gift_amount) || ']';
    summed := summed - gift_amount;
  end if;
  if items = '' or abs(summed - due) > 0.009 then
    return '';
  end if;
  return items;
end;
$$;

revoke all on function private.hyp_cart_text(jsonb, text) from public, anon, authenticated;

do $patch$
declare
  src text;
  found_marker text := 'if found_store is null then return jsonb_build_object(''ok'', false, ''reason'', ''החנות לא נמצאה''); end if;';
  gate text := 'if found_store is null then return jsonb_build_object(''ok'', false, ''reason'', ''החנות לא נמצאה''); end if;
  if payment_status = ''paid''
     and coalesce(current_setting(''storely.payment_verified'', true), '''') <> ''1''
     and exists (
       select 1
       from private.store_payment_accounts as payment_account
       where payment_account.store_id = found_store
         and payment_account.provider = ''hyp''
         and payment_account.api_key_secret_id is not null
         and payment_account.api_password_secret_id is not null
     ) then
    return jsonb_build_object(''ok'', false, ''reason'', ''התשלום עדיין לא אושר'');
  end if;';
begin
  src := pg_get_functiondef('public.place_storefront_order(text,text,text,jsonb,text,text,text,text,text,text,text,text,text,text)'::regprocedure);
  src := replace(src, chr(13), '');
  if position('storely.payment_verified' in src) = 0 then
    if position(found_marker in src) = 0 then
      raise exception 'place_storefront_order store lookup moved';
    end if;
    src := replace(src, found_marker, gate);
  end if;
  if position('private.sale_line_key(lines)' in src) > 0 then
    src := replace(src, 'private.sale_line_key(lines)', 'private.sale_line_key(place_storefront_order.lines)');
  elsif position('private.sale_line_key(place_storefront_order.lines)' in src) = 0 then
    raise exception 'place_storefront_order lines reference moved';
  end if;
  execute src;
end
$patch$;

create or replace function public.begin_storefront_payment(
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
  gift_code text default ''
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
  due numeric(12, 2);
  coin text;
  attempt_id uuid;
  hyp_order text;
  terminal text;
  api_key text;
  api_password text;
  given_name text;
  family_name text;
  request_url text;
  signed text;
  payload jsonb;
  placed jsonb;
  try_index integer;
  cart_text text;
  draft_id uuid;
  mail_items text;
begin
  if clean_visitor !~ '^[A-Za-z0-9_-]{16,80}$' then
    return jsonb_build_object('ok', false, 'reason', 'העגלה לא תקינה');
  end if;
  if length(btrim(coalesce(customer_name, ''))) = 0 or length(btrim(coalesce(customer_email, ''))) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'חסרים פרטי לקוח');
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;

  quote := public.quote_storefront(tracking_key, hostname, code, lines, shipping_name, customer_email, gift_code);
  if coalesce(quote->>'ok', 'false') <> 'true' then
    return quote;
  end if;
  due := round(coalesce((quote->>'total')::numeric, 0), 2);
  if due < 0 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום לתשלום לא תקין');
  end if;

  payload := jsonb_build_object(
    'lines', lines,
    'customerName', btrim(customer_name),
    'customerEmail', btrim(customer_email),
    'customerPhone', coalesce(customer_phone, ''),
    'customerStreet', coalesce(customer_street, ''),
    'customerCity', coalesce(customer_city, ''),
    'customerZip', coalesce(customer_zip, ''),
    'shippingName', coalesce(shipping_name, ''),
    'code', coalesce(code, ''),
    'giftCode', coalesce(gift_code, '')
  );

  if due = 0 or not exists (
    select 1
    from private.store_payment_accounts as account
    where account.store_id = found_store
      and account.provider = 'hyp'
      and account.api_key_secret_id is not null
      and account.api_password_secret_id is not null
  ) then
    perform set_config('storely.payment_verified', '1', true);
    placed := public.place_storefront_order(
      tracking_key, hostname, clean_visitor, lines, customer_name, customer_email, customer_phone,
      customer_street, customer_city, customer_zip, shipping_name, code, gift_code, 'paid'
    );
    return placed || jsonb_build_object('currency', coalesce(quote->>'currency', 'ILS'));
  end if;

  select credentials.terminal, credentials.api_key, credentials.api_password
  into terminal, api_key, api_password
  from private.hyp_credentials(found_store) as credentials;
  if coalesce(terminal, '') = '' or coalesce(api_key, '') = '' or coalesce(api_password, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'הסליקה של החנות לא מחוברת');
  end if;

  coin := case coalesce(quote->>'currency', 'ILS')
    when 'USD' then '2'
    when 'EUR' then '3'
    else '1'
  end;
  given_name := split_part(btrim(customer_name), ' ', 1);
  family_name := nullif(btrim(substr(btrim(customer_name), char_length(given_name) + 1)), '');

  for try_index in 1..4 loop
    hyp_order := lpad((floor(random() * 10000000000))::bigint::text, 10, '0');
    begin
      insert into private.storefront_payments (store_id, visitor_key, hyp_order, amount, currency, payload)
      values (found_store, clean_visitor, hyp_order, due, coalesce(quote->>'currency', 'ILS'), payload)
      returning id into attempt_id;
      exit;
    exception
      when unique_violation then
        attempt_id := null;
    end;
  end loop;
  if attempt_id is null then
    return jsonb_build_object('ok', false, 'reason', 'לא הצלחנו לפתוח תשלום');
  end if;

  request_url := 'https://pay.hyp.co.il/p/?action=APISign&What=SIGN&Sign=True&UTF8=True&UTF8out=True'
    || '&Masof=' || private.percent_encode(terminal)
    || '&KEY=' || private.percent_encode(api_key)
    || '&PassP=' || private.percent_encode(api_password)
    || '&Amount=' || private.percent_encode(trim(to_char(due, 'FM999999990.00')))
    || '&Coin=' || coin
    || '&Order=' || hyp_order
    || '&Info=' || private.percent_encode('הזמנה')
    || '&Fild1=' || attempt_id::text
    || '&ClientName=' || private.percent_encode(given_name)
    || case when family_name is null then '' else '&ClientLName=' || private.percent_encode(family_name) end
    || '&email=' || private.percent_encode(btrim(customer_email))
    || '&cell=' || private.percent_encode(coalesce(customer_phone, ''))
    || '&street=' || private.percent_encode(coalesce(customer_street, ''))
    || '&city=' || private.percent_encode(coalesce(customer_city, ''))
    || '&PageLang=HEB';

  cart_text := private.hyp_cart_text(quote, shipping_name);
  signed := private.hyp_get(
    request_url
    || '&SendHesh=True&EZ.lang=he'
    || case when cart_text = '' then '' else '&Pritim=True&heshDesc=' || private.percent_encode(cart_text) end
  );
  if cart_text <> '' and (signed is null or position('signature=' in signed) = 0) then
    signed := private.hyp_get(request_url || '&SendHesh=True&EZ.lang=he');
  end if;
  if signed is null or position('signature=' in signed) = 0 or position('KEY=' in signed) > 0 or position('PassP=' in signed) > 0 then
    delete from private.storefront_payments where id = attempt_id;
    if signed is not null and private.form_value(signed, 'CCode') = '902' then
      return jsonb_build_object('ok', false, 'reason', 'Hyp דחה את פרטי המסוף');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'לא הצלחנו לפתוח את דף התשלום');
  end if;

  insert into public.checkout_drafts as draft (
    store_id, visitor_key, name, email, phone, street, city, zip, lines, subtotal, shipping_amount, total
  )
  values (
    found_store,
    clean_visitor,
    left(btrim(customer_name), 120),
    left(btrim(customer_email), 180),
    left(coalesce(customer_phone, ''), 40),
    left(coalesce(customer_street, ''), 180),
    left(coalesce(customer_city, ''), 80),
    left(coalesce(customer_zip, ''), 20),
    coalesce(quote->'lines', '[]'::jsonb),
    round(coalesce((quote->>'subtotal')::numeric, 0), 2),
    round(coalesce((quote->>'shipping')::numeric, 0), 2),
    due
  )
  on conflict on constraint checkout_drafts_store_id_visitor_key_key do update
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

  select draft.id into draft_id
  from public.checkout_drafts as draft
  where draft.store_id = found_store and draft.visitor_key = clean_visitor;

  select coalesce(string_agg(
    coalesce(nullif(btrim(item->>'title'), ''), 'פריט') || ' × ' || coalesce(nullif(item->>'quantity', ''), '1'),
    E'\n'
  ), '')
  into mail_items
  from jsonb_array_elements(coalesce(quote->'lines', '[]'::jsonb)) as item;

  begin
    perform private.dispatch_marketing(found_store, 'checkout', jsonb_build_object(
      'email', btrim(customer_email),
      'name', btrim(customer_name),
      'items', mail_items,
      'total', trim(to_char(due, 'FM999999990.00')) || ' ₪',
      'checkoutUrl', 'https://' || hostname || '/checkout?recover=' || coalesce(draft_id::text, ''),
      'host', hostname,
      'ref', clean_visitor
    ));
    perform private.dispatch_marketing(found_store, 'cart', jsonb_build_object(
      'email', btrim(customer_email),
      'name', btrim(customer_name),
      'items', mail_items,
      'total', trim(to_char(due, 'FM999999990.00')) || ' ₪',
      'checkoutUrl', 'https://' || hostname || '/checkout?recover=' || coalesce(draft_id::text, ''),
      'host', hostname,
      'ref', clean_visitor
    ));
    perform private.flush_marketing_mail();
  exception
    when others then
      null;
  end;

  return jsonb_build_object('ok', true, 'url', 'https://pay.hyp.co.il/p/?' || signed);
end;
$$;

revoke all on function public.begin_storefront_payment(text, text, text, jsonb, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.begin_storefront_payment(text, text, text, jsonb, text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.complete_storefront_payment(
  tracking_key text,
  hostname text,
  query text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  clean_query text := btrim(coalesce(query, ''));
  attempt private.storefront_payments%rowtype;
  terminal text;
  api_key text;
  api_password text;
  verified text;
  paid_amount numeric(12, 2);
  placed jsonb;
begin
  if left(clean_query, 1) = '?' then
    clean_query := substr(clean_query, 2);
  end if;
  if clean_query = '' or char_length(clean_query) > 8000 or clean_query ~* '(^|&)(key|passp)=' then
    return jsonb_build_object('ok', false, 'reason', 'אישור התשלום לא תקין');
  end if;
  if private.form_value(clean_query, 'CCode') <> '0' then
    return jsonb_build_object('ok', false, 'reason', 'התשלום לא אושר');
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;
  if private.form_value(clean_query, 'Fild1') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'reason', 'אישור התשלום לא תקין');
  end if;

  select payment.*
  into attempt
  from private.storefront_payments as payment
  where payment.id = private.form_value(clean_query, 'Fild1')::uuid
    and payment.store_id = found_store
  for update;
  if attempt.id is null then
    return jsonb_build_object('ok', false, 'reason', 'התשלום לא נמצא');
  end if;
  if attempt.status = 'paid' and coalesce(attempt.order_number, '') <> '' then
    return jsonb_build_object(
      'ok', true,
      'orderNumber', attempt.order_number,
      'total', attempt.amount,
      'currency', attempt.currency,
      'visitorKey', attempt.visitor_key
    );
  end if;
  if attempt.hyp_order <> private.form_value(clean_query, 'Order') then
    return jsonb_build_object('ok', false, 'reason', 'אישור התשלום לא תואם את ההזמנה');
  end if;
  if private.form_value(clean_query, 'Amount') !~ '^[0-9]+(\.[0-9]+)?$' then
    return jsonb_build_object('ok', false, 'reason', 'אישור התשלום לא תקין');
  end if;
  paid_amount := private.form_value(clean_query, 'Amount')::numeric;
  if abs(paid_amount - attempt.amount) > 0.009 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום ששולם לא תואם את ההזמנה');
  end if;

  select credentials.terminal, credentials.api_key, credentials.api_password
  into terminal, api_key, api_password
  from private.hyp_credentials(found_store) as credentials;
  if coalesce(terminal, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'הסליקה של החנות לא מחוברת');
  end if;
  verified := private.hyp_get(
    'https://pay.hyp.co.il/p/?action=APISign&What=VERIFY&Masof=' || private.percent_encode(terminal)
    || '&KEY=' || private.percent_encode(api_key)
    || '&PassP=' || private.percent_encode(api_password)
    || '&' || clean_query
  );
  if private.form_value(coalesce(verified, ''), 'CCode') <> '0' then
    return jsonb_build_object('ok', false, 'reason', 'לא הצלחנו לאמת את התשלום מול Hyp');
  end if;

  update private.storefront_payments
  set status = 'charged',
      hyp_id = nullif(private.form_value(clean_query, 'Id'), '')
  where id = attempt.id;

  perform set_config('storely.payment_verified', '1', true);
  begin
    placed := public.place_storefront_order(
      tracking_key,
      hostname,
      attempt.visitor_key,
      attempt.payload->'lines',
      attempt.payload->>'customerName',
      attempt.payload->>'customerEmail',
      attempt.payload->>'customerPhone',
      attempt.payload->>'customerStreet',
      attempt.payload->>'customerCity',
      attempt.payload->>'customerZip',
      attempt.payload->>'shippingName',
      attempt.payload->>'code',
      attempt.payload->>'giftCode',
      'paid'
    );
  exception
    when others then
      return jsonb_build_object('ok', false, 'reason', 'התשלום נקלט, אבל שמירת ההזמנה נכשלה. רענני את העמוד.');
  end;
  if coalesce(placed->>'ok', 'false') <> 'true' then
    return placed;
  end if;

  update private.storefront_payments
  set status = 'paid',
      order_number = placed->>'orderNumber'
  where id = attempt.id;

  return placed || jsonb_build_object('currency', attempt.currency, 'visitorKey', attempt.visitor_key);
end;
$$;

revoke all on function public.complete_storefront_payment(text, text, text) from public;
grant execute on function public.complete_storefront_payment(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
