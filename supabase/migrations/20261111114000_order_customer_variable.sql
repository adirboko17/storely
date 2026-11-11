-- place_storefront_order keeps the customer id in a variable named customer_id, and the
-- address update also has a customer_id column. Postgres then refuses to save the order.

do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.place_storefront_order(text,text,text,jsonb,text,text,text,text,text,text,text,text,text,text)'::regprocedure);
  if position('#variable_conflict use_variable' in src) > 0 then
    return;
  end if;
  src := replace(
    src,
    'AS $function$' || chr(10) || 'declare',
    'AS $function$' || chr(10) || '#variable_conflict use_variable' || chr(10) || 'declare'
  );
  if position('#variable_conflict use_variable' in src) = 0 then
    raise exception 'place_storefront_order header moved';
  end if;
  execute src;
end $$;
