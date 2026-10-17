create or replace function public.update_store_order(target_store uuid, order_number integer, patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
  next_pay text := patch->>'pay';
  next_fulfillment text := patch->>'fulfillment';
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if next_pay is not null and next_pay not in ('paid', 'pending', 'partially_refunded', 'refunded') then
    raise exception 'סטטוס תשלום לא תקין' using errcode = '22023';
  end if;
  if next_fulfillment is not null and next_fulfillment not in ('unfulfilled', 'fulfilled', 'partial', 'onhold', 'progress') then
    raise exception 'סטטוס משלוח לא תקין' using errcode = '22023';
  end if;

  update public.orders as sale
  set financial_status = coalesce(next_pay, sale.financial_status),
      fulfillment_status = coalesce(next_fulfillment, sale.fulfillment_status),
      refunded = case when patch ? 'refunded' then greatest((patch->>'refunded')::numeric, 0) else sale.refunded end,
      carrier = case when patch ? 'carrier' then coalesce(patch->>'carrier', '') else sale.carrier end,
      tracking = case when patch ? 'tracking' then coalesce(patch->>'tracking', '') else sale.tracking end,
      timeline = case
        when nullif(patch->>'comment', '') is not null then sale.timeline || jsonb_build_array(jsonb_build_object('text', patch->>'comment', 'at', now()))
        else sale.timeline
      end
  where sale.store_id = target_store
    and sale.order_number = update_store_order.order_number
  returning sale.id into saved_id;

  if saved_id is null then
    raise exception 'ההזמנה לא נמצאה' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_store_order(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_store_order(uuid, integer, jsonb) to authenticated;
