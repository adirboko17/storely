-- The storefront promises free shipping once the cart reaches 250.
-- quote_storefront was still charging the flat rate, including on home delivery.

do $patch$
declare
  src text;
  marker text := 'if coalesce(discount->>''freeShipping'', ''false'') = ''true'' then';
  replacement text := 'if coalesce(discount->>''freeShipping'', ''false'') = ''true'' or coalesce((cart->>''subtotal'')::numeric, 0) >= 250 then';
begin
  src := pg_get_functiondef('public.quote_storefront(text, text, text, jsonb, text, text, text)'::regprocedure);
  if position('>= 250 then' in src) > 0 then
    return;
  end if;
  if position(marker in src) = 0 then
    raise exception 'quote_storefront free shipping check moved';
  end if;
  src := replace(src, marker, replacement);
  execute src;
end
$patch$;
