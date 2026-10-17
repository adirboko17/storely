-- The website can record "שליח עד הבית" or "נקודת איסוף" even when that
-- label is not a priced shipping rate. A priced rate keeps its own price.

create or replace function private.shipping_price(target_store uuid, shipping_name text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  wanted text := btrim(coalesce(shipping_name, ''));
  price numeric(12, 2);
begin
  if wanted = '' then
    return 0;
  end if;
  select rate.price
  into price
  from jsonb_to_recordset(private.shipping_rates(target_store)) as rate(name text, price numeric, zone text)
  where rate.name = wanted
  limit 1;
  if price is null then
    if wanted in ('שליח עד הבית', 'נקודת איסוף') then
      return 0;
    end if;
    return null;
  end if;
  return greatest(price, 0);
end;
$$;

revoke all on function private.shipping_price(uuid, text) from public, anon, authenticated;
