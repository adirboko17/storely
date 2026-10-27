-- Long-press delete from the mobile admin.
-- Orders have no delete policy, and their lines, payments, shipments, and reviews
-- block a plain delete. Customers are kept off orders by clearing the link first.

create or replace function public.delete_store_order(target_store uuid, target_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_order is null then
    raise exception 'ההזמנה לא נמצאה' using errcode = 'P0002';
  end if;

  delete from public.product_reviews as review
  where review.store_id = target_store
    and review.order_id = target_order;

  delete from public.refunds as refund
  using public.payments as payment
  where refund.store_id = target_store
    and payment.store_id = target_store
    and refund.payment_id = payment.id
    and payment.order_id = target_order;

  delete from public.payments as payment
  where payment.store_id = target_store
    and payment.order_id = target_order;

  delete from public.shipments as shipment
  where shipment.store_id = target_store
    and shipment.order_id = target_order;

  delete from public.order_items as item
  where item.store_id = target_store
    and item.order_id = target_order;

  delete from public.orders as sale
  where sale.store_id = target_store
    and sale.id = target_order;
  get diagnostics removed = row_count;

  if removed <> 1 then
    raise exception 'ההזמנה לא נמצאה' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.delete_store_customer(target_store uuid, target_customer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_customer is null then
    raise exception 'הלקוח לא נמצא' using errcode = 'P0002';
  end if;

  update public.orders as sale
  set customer_id = null
  where sale.store_id = target_store
    and sale.customer_id = target_customer;

  delete from public.customer_addresses as address
  where address.store_id = target_store
    and address.customer_id = target_customer;

  delete from public.customers as customer
  where customer.store_id = target_store
    and customer.id = target_customer;
  get diagnostics removed = row_count;

  if removed <> 1 then
    raise exception 'הלקוח לא נמצא' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_store_order(uuid, uuid) from public, anon;
revoke all on function public.delete_store_customer(uuid, uuid) from public, anon;
grant execute on function public.delete_store_order(uuid, uuid) to authenticated;
grant execute on function public.delete_store_customer(uuid, uuid) to authenticated;
