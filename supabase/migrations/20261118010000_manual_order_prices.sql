-- Manual orders: a catalog line may carry its own unitPrice (e.g. 0 for a collaboration or a gift),
-- and a create with nothing to collect is recorded as paid.
do $patch$
declare
  body text;
  anchor constant text := E'      if picked_variant is not null then\n        holds := holds';
  override constant text := E'      if line ? ''productId'' and coalesce(line->>''unitPrice'', '''') ~ ''^[0-9]+(\\.[0-9]+)?$'' then\n        unit_price := round((line->>''unitPrice'')::numeric, 2);\n      end if;\n';
  paid_anchor constant text := E'  if shipping_label = '''' then';
begin
  body := pg_get_functiondef('public.create_store_order(uuid,jsonb)'::regprocedure);
  if position(anchor in body) = 0 or position(paid_anchor in body) = 0 then
    raise exception 'create_store_order anchor missing';
  end if;
  body := replace(body, anchor, override || anchor);
  body := replace(body, paid_anchor, E'  if order_total = 0 then\n    clean_payment := ''paid'';\n  end if;\n' || paid_anchor);
  execute body;

  body := pg_get_functiondef('public.edit_store_order(uuid,integer,jsonb)'::regprocedure);
  if position(anchor in body) = 0 then
    raise exception 'edit_store_order anchor missing';
  end if;
  body := replace(body, anchor, override || anchor);
  execute body;
end;
$patch$;

notify pgrst, 'reload schema';
