-- Hyp does not echo Fild1. On the return URL that field is the customer name, so the
-- payment has to be found by the Order number we sent.

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
    return jsonb_build_object(
      'ok', true,
      'orderNumber', attempt.order_number,
      'total', attempt.amount,
      'currency', attempt.currency,
      'visitorKey', attempt.visitor_key
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

  return placed || jsonb_build_object('currency', attempt.currency, 'visitorKey', attempt.visitor_key);
end;
$$;

revoke all on function public.complete_storefront_payment(text, text, text) from public;
grant execute on function public.complete_storefront_payment(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
