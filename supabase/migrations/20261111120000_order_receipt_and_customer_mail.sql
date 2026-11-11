-- The payment return can show the saved order, and the customer gets a confirmation from Resend.

alter table private.order_mail_log
  add column if not exists customer_sent_at timestamptz;

create or replace function private.mail_amount(amount numeric, currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(coalesce(currency, 'ILS'))
    when 'USD' then '$'
    when 'EUR' then '€'
    else '₪'
  end || case
    when coalesce(amount, 0) = trunc(coalesce(amount, 0)) then trim(to_char(coalesce(amount, 0), 'FM999999990'))
    else trim(to_char(coalesce(amount, 0), 'FM999999990.00'))
  end;
$$;

revoke all on function private.mail_amount(numeric, text) from public, anon, authenticated;

create or replace function private.storefront_order_summary(target_store uuid, order_no integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sale public.orders%rowtype;
  lines jsonb;
  customer_email text := '';
begin
  if order_no is null then
    return '{}'::jsonb;
  end if;
  select * into sale
  from public.orders
  where store_id = target_store and order_number = order_no;
  if sale.id is null then
    return '{}'::jsonb;
  end if;
  select coalesce(customer.email, '')
  into customer_email
  from public.customers as customer
  where customer.store_id = target_store and customer.id = sale.customer_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'title', item.title,
    'quantity', item.quantity,
    'unitPrice', item.unit_price
  ) order by item.id), '[]'::jsonb)
  into lines
  from public.order_items as item
  where item.store_id = target_store and item.order_id = sale.id;
  return jsonb_build_object(
    'lines', lines,
    'total', sale.total,
    'discount', coalesce(sale.discount_amount, 0),
    'shipping', coalesce(sale.shipping_amount, 0),
    'shippingName', coalesce(sale.shipping_name, ''),
    'email', customer_email
  );
end;
$$;

revoke all on function private.storefront_order_summary(uuid, integer) from public, anon, authenticated;

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
  order_ref text;
  attempt private.storefront_payments%rowtype;
  terminal text;
  api_key text;
  api_password text;
  verified text;
  paid_amount numeric(12, 2);
  placed jsonb;
  receipt jsonb;
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
  order_ref := private.form_value(clean_query, 'Order');
  if order_ref !~ '^[0-9]{1,12}$' then
    return jsonb_build_object('ok', false, 'reason', 'אישור התשלום לא תקין');
  end if;
  order_ref := lpad(order_ref, 10, '0');

  select payment.*
  into attempt
  from private.storefront_payments as payment
  where payment.store_id = found_store
    and payment.hyp_order = order_ref
  for update;
  if attempt.id is null then
    return jsonb_build_object('ok', false, 'reason', 'התשלום לא נמצא');
  end if;
  if attempt.status = 'paid' and coalesce(attempt.order_number, '') <> '' then
    receipt := private.storefront_order_summary(found_store, attempt.order_number::integer);
    return jsonb_build_object(
      'ok', true,
      'orderNumber', attempt.order_number,
      'total', coalesce(receipt->>'total', attempt.amount::text)::numeric,
      'currency', attempt.currency,
      'visitorKey', attempt.visitor_key,
      'receipt', receipt
    );
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

  receipt := private.storefront_order_summary(found_store, (placed->>'orderNumber')::integer);
  return placed || jsonb_build_object(
    'currency', attempt.currency,
    'visitorKey', attempt.visitor_key,
    'receipt', receipt
  );
end;
$$;

revoke all on function public.complete_storefront_payment(text, text, text) from public;
grant execute on function public.complete_storefront_payment(text, text, text) to anon, authenticated;

create or replace function private.mail_new_order(target_store uuid, target_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.orders%rowtype;
  customer_name text := '';
  customer_email text := '';
  customer_phone text := '';
  owner_email text;
  items text := '';
  plain_items text := '';
  customer_rows text := '';
  html text;
  plain text;
  subject text;
  sent_count integer := 0;
  logged boolean := false;
  customer_sent boolean := false;
  currency text := 'ILS';
  store_name text := '';
  store_host text := '';
  store_url text := '';
  logo_url text := '';
  money_total text;
  money_ship text;
  money_discount text;
begin
  if not exists (
    select 1 from private.store_messaging as saved
    where saved.store_id = target_store
      and saved.resend_api_key <> ''
      and saved.resend_from_email <> ''
  ) then
    return;
  end if;

  select exists (
    select 1 from private.order_mail_log as logged_row where logged_row.order_id = target_order
  ), exists (
    select 1 from private.order_mail_log as logged_row
    where logged_row.order_id = target_order and logged_row.customer_sent_at is not null
  )
  into logged, customer_sent;

  select * into sale from public.orders where id = target_order and store_id = target_store;
  if sale.id is null then
    return;
  end if;
  select coalesce(customer.name, ''), coalesce(customer.email, ''), coalesce(customer.phone, '')
  into customer_name, customer_email, customer_phone
  from public.customers as customer
  where customer.store_id = target_store and customer.id = sale.customer_id;

  select coalesce(settings.currency, 'ILS'), coalesce(settings.display_name, ''),
    case when coalesce(settings.logo_url, '') ~ '^https://[^[:space:]<>"]+$' then settings.logo_url else '' end
  into currency, store_name, logo_url
  from public.store_settings as settings
  where settings.store_id = target_store;
  select domain.hostname
  into store_host
  from public.store_domains as domain
  where domain.store_id = target_store and domain.verified_at is not null
  order by domain.kind = 'primary' desc, domain.hostname
  limit 1;
  store_url := case when coalesce(store_host, '') = '' then '' else 'https://' || store_host end;
  if store_name = '' then
    store_name := 'החנות';
  end if;

  select coalesce(string_agg(
    private.mail_escape(item.title) || ' × ' || item.quantity::text || ' · ' || private.mail_amount(item.unit_price * item.quantity, currency),
    '<br>'
    order by item.id
  ), ''),
  coalesce(string_agg(
    item.title || ' × ' || item.quantity::text || ' · ' || private.mail_amount(item.unit_price * item.quantity, currency),
    E'\n'
    order by item.id
  ), ''),
  coalesce(string_agg(
    '<tr>'
    || '<td width="76" valign="middle" style="padding:16px 12px 16px 0;border-bottom:1px solid #efe7df;">'
    || case when photo.image_url is null then
         '<div style="width:64px;height:64px;border-radius:12px;background:#f6f1eb;"></div>'
       else
         '<img src="' || photo.image_url || '" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:12px;border:1px solid #efe7df;">'
       end
    || '</td>'
    || '<td valign="middle" style="padding:16px 0;border-bottom:1px solid #efe7df;text-align:right;">'
    || '<div style="font-size:15px;line-height:1.5;">' || private.mail_escape(item.title) || '</div>'
    || '<div style="margin-top:4px;color:#7e746a;font-size:13px;">כמות ' || item.quantity::text || '</div></td>'
    || '<td valign="middle" style="padding:16px 0;border-bottom:1px solid #efe7df;text-align:left;white-space:nowrap;font-size:15px;">'
    || private.mail_amount(item.unit_price * item.quantity, currency) || '</td></tr>',
    ''
    order by item.id
  ), '')
  into items, plain_items, customer_rows
  from public.order_items as item
  left join lateral (
    select public.product_media_public_url(media.path) as image_url
    from public.product_variants as variant
    join public.product_media as media
      on media.store_id = variant.store_id
     and media.product_id = variant.product_id
    where variant.store_id = item.store_id
      and variant.id = item.variant_id
      and media.path !~* '\.(mp4|webm|mov)(\?|$)'
    order by media.position, media.id
    limit 1
  ) as photo on true
  where item.store_id = target_store and item.order_id = sale.id;

  money_total := private.mail_amount(sale.total, currency);
  money_ship := private.mail_amount(coalesce(sale.shipping_amount, 0), currency);
  money_discount := private.mail_amount(coalesce(sale.discount_amount, 0), currency);

  if not logged then
    subject := 'הזמנה חדשה #' || sale.order_number::text;
    plain := 'הזמנה #' || sale.order_number::text || E'\n'
      || customer_name || E'\n' || customer_email || E'\n' || customer_phone || E'\n'
      || plain_items || E'\n'
      || coalesce(sale.shipping_name, '') || E'\n'
      || 'סכום ' || money_total;
    html := '<div dir="rtl" style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;">'
      || '<h2 style="margin:0 0 12px;">הזמנה חדשה #' || sale.order_number::text || '</h2>'
      || '<p style="margin:0 0 8px;"><b>' || private.mail_escape(customer_name) || '</b><br>'
      || private.mail_escape(customer_email) || '<br>' || private.mail_escape(customer_phone) || '</p>'
      || '<p style="margin:0 0 8px;">' || items || '</p>'
      || '<p style="margin:0;">משלוח: ' || private.mail_escape(coalesce(sale.shipping_name, ''))
      || ' · ' || money_ship || '<br>'
      || 'הנחה: ' || money_discount || '<br>'
      || '<b>לתשלום: ' || money_total || '</b></p></div>';

    for owner_email in
      select account.email
      from public.store_members as member
      join public.roles as role
        on role.store_id = member.store_id
       and role.id = member.role_id
      join auth.users as account on account.id = member.user_id
      where member.store_id = target_store
        and role.key = 'owner'
        and account.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    loop
      if private.resend_send(target_store, owner_email, subject, html, plain) then
        sent_count := sent_count + 1;
      end if;
    end loop;
    if sent_count > 0 then
      insert into private.order_mail_log (order_id, store_id)
      values (target_order, target_store)
      on conflict (order_id) do nothing;
      logged := true;
    end if;
  end if;

  if customer_sent or customer_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;

  subject := 'ההזמנה שלך #' || sale.order_number::text || ' התקבלה';
  plain := store_name || E'\nההזמנה התקבלה\nמספר הזמנה ' || sale.order_number::text || E'\n'
    || plain_items || E'\n'
    || coalesce(sale.shipping_name, '') || ' ' || money_ship || E'\n'
    || 'לתשלום ' || money_total
    || case when store_url = '' then '' else E'\n' || store_url end;
  html := '<div dir="rtl" style="margin:0;padding:32px 16px;background:#f6f1eb;font-family:Arial,Helvetica,sans-serif;color:#43392f;">'
    || '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;">'
    || '<div style="padding:28px 28px 8px;text-align:center;">'
    || case when logo_url = '' then
         '<div style="font-size:13px;letter-spacing:2px;color:#8f6a4b;">' || private.mail_escape(store_name) || '</div>'
       else
         '<img src="' || logo_url || '" alt="' || private.mail_escape(store_name) || '" width="148" style="display:inline-block;width:148px;max-width:148px;height:auto;border:0;">'
       end
    || '</div>'
    || '<div style="padding:8px 28px 26px;text-align:center;">'
    || '<div style="font-size:26px;font-weight:400;">ההזמנה התקבלה</div>'
    || '<div style="margin-top:10px;display:inline-block;padding:6px 14px;border-radius:999px;background:#f6f1eb;font-size:13px;">מספר הזמנה ' || sale.order_number::text || '</div></div>'
    || '<div style="padding:28px;">'
    || '<p style="margin:0 0 18px;font-size:15px;line-height:1.7;">היי ' || private.mail_escape(customer_name) || ', תודה שהזמנת. הפרטים שמורים אצלנו.</p>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' || customer_rows || '</table>'
    || '<p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#7e746a;">'
    || private.mail_escape(coalesce(sale.shipping_name, 'משלוח')) || ': ' || money_ship || '<br>'
    || case when coalesce(sale.discount_amount, 0) > 0 then 'הנחה: ' || money_discount || '<br>' else '' end
    || '<span style="color:#43392f;font-size:18px;"><b>לתשלום: ' || money_total || '</b></span></p>'
    || case when store_url = '' then '' else
      '<p style="margin:24px 0 0;"><a href="' || store_url || '" style="display:inline-block;padding:14px 22px;border-radius:8px;background:#8f6a4b;color:#fffaf5;text-decoration:none;">חזרה לאתר</a></p>'
    end
    || '</div></div></div>';

  if private.resend_send(target_store, customer_email, subject, html, plain) then
    insert into private.order_mail_log (order_id, store_id, customer_sent_at)
    values (target_order, target_store, now())
    on conflict (order_id) do update
    set customer_sent_at = now();
  end if;
end;
$$;

revoke all on function private.mail_new_order(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
