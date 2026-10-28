-- The customers screen reads one page at a time instead of the whole list.
-- store_admin_snapshot still uses the full customers slice for the mobile app.

create index if not exists customers_store_created_idx
  on public.customers (store_id, created_at, id);

create or replace function public.store_admin_customers_page(target_store uuid, page_index integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_page integer;
  page_size constant integer := 50;
  total_count integer;
  rows jsonb;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  bounded_page := least(greatest(coalesce(page_index, 0), 0), 100000);

  select count(*)
  into total_count
  from public.customers as customer
  where customer.store_id = target_store;

  with page as (
    select
      customer.id,
      customer.store_id,
      customer.created_at,
      customer.name,
      customer.email,
      customer.phone,
      customer.note,
      customer.tags,
      customer.subscribed,
      customer.credit,
      customer.locale,
      customer.sms,
      customer.whatsapp
    from public.customers as customer
    where customer.store_id = target_store
    order by customer.created_at, customer.id
    limit page_size
    offset bounded_page * page_size
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id,
    'createdAt', page.created_at,
    'name', page.name,
    'email', coalesce(page.email, ''),
    'phone', page.phone,
    'street', coalesce(address.street, ''),
    'city', coalesce(address.city, ''),
    'zip', coalesce(address.zip, ''),
    'orders', (
      select count(*)
      from public.orders as sale
      where sale.store_id = page.store_id
        and sale.customer_id = page.id
    ),
    'note', page.note,
    'tags', page.tags,
    'subscribed', page.subscribed,
    'credit', page.credit,
    'language', page.locale,
    'sms', page.sms,
    'whatsapp', page.whatsapp
  ) order by page.created_at, page.id), '[]'::jsonb)
  into rows
  from page
  left join lateral (
    select addr.street, addr.city, addr.zip
    from public.customer_addresses as addr
    where addr.store_id = page.store_id
      and addr.customer_id = page.id
    limit 1
  ) as address on true;

  return jsonb_build_object('total', total_count, 'customers', rows);
end;
$$;

revoke all on function public.store_admin_customers_page(uuid, integer) from public, anon;
grant execute on function public.store_admin_customers_page(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
