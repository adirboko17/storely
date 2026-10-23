-- The admin polls this instead of the full store snapshot.
-- It reads only the order number index, so it stays cheap as the store grows.

create or replace function public.store_orders_version(target_store uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*)::text || ':' || coalesce(max(sale.order_number), 0)::text
  into result
  from public.orders as sale
  where sale.store_id = target_store
    and sale.order_number is not null;

  return result;
end;
$$;

revoke all on function public.store_orders_version(uuid) from public, anon;
grant execute on function public.store_orders_version(uuid) to authenticated;
