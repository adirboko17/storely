create or replace function public.customer_order_statuses(
  target_store uuid,
  customer_phone text,
  customer_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted_phone text := right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 9);
  wanted_email text := lower(btrim(coalesce(customer_email, '')));
begin
  if length(wanted_phone) < 9 or wanted_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from public.stores as store where store.id = target_store) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'number', sale_row.order_number,
      'status', sale_row.customer_status,
      'total', sale_row.total,
      'title', sale_row.title,
      'at', sale_row.created_at
    ) order by sale_row.created_at desc)
    from (
      select sale.order_number, sale.customer_status, sale.total, sale.created_at,
        coalesce((
          select item.title
          from public.order_items as item
          where item.store_id = sale.store_id
            and item.order_id = sale.id
          order by item.id
          limit 1
        ), '') as title
      from public.orders as sale
      join public.customers as customer
        on customer.store_id = sale.store_id
       and customer.id = sale.customer_id
      where sale.store_id = target_store
        and sale.order_number is not null
        and lower(coalesce(customer.email, '')) = wanted_email
        and right(regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g'), 9) = wanted_phone
      order by sale.created_at desc
      limit 30
    ) as sale_row
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.customer_order_statuses(uuid, text, text) from public, anon, authenticated;
grant execute on function public.customer_order_statuses(uuid, text, text) to service_role;
