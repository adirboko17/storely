-- A checkout that reached Hyp and was not paid stays on the abandoned-cart page.
-- A manager can refund all or part of that charge back to the same card.

create or replace function public.list_store_refunds(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object('orders', coalesce((
    select jsonb_agg(jsonb_build_object(
      'orderNumber', sale.order_number,
      'createdAt', sale.created_at,
      'name', coalesce(customer.name, ''),
      'email', coalesce(customer.email, ''),
      'total', sale.total,
      'refunded', coalesce(sale.refunded, 0),
      'remaining', round(sale.total - coalesce(sale.refunded, 0), 2),
      'status', sale.financial_status
    ) order by sale.created_at desc)
    from public.orders as sale
    left join public.customers as customer
      on customer.store_id = sale.store_id
     and customer.id = sale.customer_id
    where sale.store_id = target_store
      and sale.order_number is not null
      and exists (
        select 1
        from private.storefront_payments as payment
        where payment.store_id = sale.store_id
          and payment.order_number = sale.order_number::text
          and payment.status = 'paid'
          and coalesce(payment.hyp_id, '') <> ''
      )
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.list_store_refunds(uuid) from public, anon;
grant execute on function public.list_store_refunds(uuid) to authenticated;

create or replace function public.refund_store_order(target_store uuid, order_number integer, amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.orders%rowtype;
  attempt private.storefront_payments%rowtype;
  payment_id uuid;
  terminal text;
  api_password text;
  credit numeric(12, 2) := round(coalesce(amount, 0), 2);
  already numeric(12, 2);
  response text;
  refund_url text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if credit <= 0 or credit > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום לזיכוי לא תקין');
  end if;

  select sale_row.*
  into sale
  from public.orders as sale_row
  where sale_row.store_id = target_store
    and sale_row.order_number = refund_store_order.order_number
  for update;
  if sale.id is null then
    return jsonb_build_object('ok', false, 'reason', 'ההזמנה לא נמצאה');
  end if;

  select payment.*
  into attempt
  from private.storefront_payments as payment
  where payment.store_id = target_store
    and payment.order_number = sale.order_number::text
    and payment.status = 'paid'
    and coalesce(payment.hyp_id, '') <> ''
  order by payment.created_at desc
  limit 1
  for update;
  if attempt.id is null then
    return jsonb_build_object('ok', false, 'reason', 'אין עסקת סליקה לזיכוי');
  end if;

  already := round(coalesce(sale.refunded, 0), 2);
  if credit > round(sale.total - already, 2) + 0.009 then
    return jsonb_build_object('ok', false, 'reason', 'הסכום גבוה מהיתרה לזיכוי');
  end if;

  select credentials.terminal, credentials.api_password
  into terminal, api_password
  from private.hyp_credentials(target_store) as credentials;
  if coalesce(terminal, '') = '' or coalesce(api_password, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'הסליקה של החנות לא מחוברת');
  end if;

  refund_url := 'https://pay.hyp.co.il/p/?action=zikoyAPI'
    || '&Masof=' || private.percent_encode(terminal)
    || '&PassP=' || private.percent_encode(api_password)
    || '&TransId=' || private.percent_encode(attempt.hyp_id)
    || '&Amount=' || private.percent_encode(private.hyp_money(credit));
  response := private.hyp_get(refund_url || '&SendHesh=True');
  if private.form_value(coalesce(response, ''), 'CCode') <> '0' then
    response := private.hyp_get(refund_url);
  end if;
  if position('PassP=' in coalesce(response, '')) > 0 or position('KEY=' in coalesce(response, '')) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'לא הצלחנו לזכות ב-Hyp');
  end if;
  if private.form_value(coalesce(response, ''), 'CCode') = '33' then
    return jsonb_build_object('ok', false, 'reason', 'הסכום גבוה מהחיוב המקורי');
  end if;
  if private.form_value(coalesce(response, ''), 'CCode') = '902' then
    return jsonb_build_object('ok', false, 'reason', 'Hyp דחה את פרטי המסוף');
  end if;
  if private.form_value(coalesce(response, ''), 'CCode') <> '0' then
    return jsonb_build_object('ok', false, 'reason', 'Hyp לא אישר את הזיכוי');
  end if;

  select card.id
  into payment_id
  from public.payments as card
  where card.store_id = target_store
    and card.order_id = sale.id
  limit 1;
  if payment_id is null then
    insert into public.payments (store_id, order_id, amount, status)
    values (target_store, sale.id, sale.total, 'paid')
    returning id into payment_id;
  end if;

  insert into public.refunds (store_id, payment_id, amount)
  values (target_store, payment_id, credit);

  update public.orders as sale_row
  set refunded = round(coalesce(sale_row.refunded, 0) + credit, 2),
      financial_status = case
        when round(coalesce(sale_row.refunded, 0) + credit, 2) >= sale_row.total - 0.009 then 'refunded'
        else 'partially_refunded'
      end
  where sale_row.id = sale.id;

  update public.payments as card
  set status = case
    when round(already + credit, 2) >= sale.total - 0.009 then 'refunded'
    else 'partially_refunded'
  end
  where card.id = payment_id;

  return jsonb_build_object(
    'ok', true,
    'refunded', round(already + credit, 2),
    'remaining', round(sale.total - already - credit, 2),
    'status', case when round(already + credit, 2) >= sale.total - 0.009 then 'refunded' else 'partially_refunded' end
  );
end;
$$;

revoke all on function public.refund_store_order(uuid, integer, numeric) from public, anon;
grant execute on function public.refund_store_order(uuid, integer, numeric) to authenticated;
