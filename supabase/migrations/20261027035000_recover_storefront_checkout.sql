-- One abandoned checkout, for the recovery link the merchant copies to the customer.
-- The storefront calls this with its tracking key. The checkout id in the link is the only cart returned.

create or replace function public.recover_storefront_checkout(
  tracking_key text,
  hostname text,
  checkout_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
<<recover>>
declare
  found_store uuid;
  draft_row public.checkout_drafts%rowtype;
  line jsonb;
  lines jsonb := '[]'::jsonb;
  variant_text text;
  title_text text;
  quantity integer;
  unit_price numeric;
  catalog_price numeric;
  product_id uuid;
  product_title text;
  cart_id uuid;
  image_url text;
  detail text;
begin
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select draft.*
  into draft_row
  from public.checkout_drafts as draft
  where draft.store_id = found_store
    and draft.id = checkout_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;

  for line in
    select jsonb_array_elements(coalesce(draft_row.lines, '[]'::jsonb))
  loop
    variant_text := nullif(btrim(line->>'variantId'), '');
    title_text := nullif(btrim(line->>'title'), '');
    quantity := 1;
    if coalesce(line->>'quantity', '') ~ '^[0-9]{1,4}(\.[0-9]+)?$' then
      quantity := greatest(1, least(9999, trunc((line->>'quantity')::numeric)::integer));
    end if;
    unit_price := 0;
    if coalesce(line->>'unitPrice', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      unit_price := round((line->>'unitPrice')::numeric, 2);
    elsif coalesce(line->>'price', '') ~ '^[0-9]+(\.[0-9]+)?$' then
      unit_price := round((line->>'price')::numeric, 2);
    end if;

    product_id := null;
    product_title := null;
    catalog_price := null;

    if variant_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select product.id, product.title, product.price
      into product_id, product_title, catalog_price
      from public.products as product
      where product.store_id = found_store
        and (
          product.id = variant_text::uuid
          or exists (
            select 1
            from public.product_variants as variant
            where variant.store_id = found_store
              and variant.product_id = product.id
              and variant.id = variant_text::uuid
          )
        )
      limit 1;
    end if;

    if product_id is null and title_text is not null then
      select product.id, product.title, product.price
      into product_id, product_title, catalog_price
      from public.products as product
      where product.store_id = found_store
        and product.status = 'active'
        and (
          title_text = product.title
          or (
            length(title_text) > length(product.title)
            and left(title_text, length(product.title)) = product.title
            and substring(title_text from length(product.title) + 1 for 1) in ('-', ' ', '|')
          )
        )
      order by length(product.title) desc
      limit 1;
    end if;

    if product_id is null then
      continue;
    end if;

    cart_id := product_id;
    if variant_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1
        from public.product_variants as variant
        where variant.store_id = found_store
          and variant.id = variant_text::uuid
      )
    then
      cart_id := variant_text::uuid;
    end if;

    if unit_price = 0 and catalog_price is not null then
      unit_price := catalog_price;
    end if;

    select public.product_media_public_url(media.path)
    into image_url
    from public.product_media as media
    where media.store_id = found_store
      and media.product_id = recover.product_id
    order by media.position
    limit 1;

    detail := '';
    if title_text is not null and product_title is not null and title_text <> product_title then
      if length(title_text) > length(product_title) and left(title_text, length(product_title)) = product_title then
        detail := btrim(regexp_replace(substring(title_text from length(product_title) + 1), '^[[:space:]|:-]+', ''));
      else
        detail := title_text;
      end if;
    end if;

    lines := lines || jsonb_build_array(jsonb_build_object(
      'id', cart_id,
      'name', product_title,
      'sub', detail,
      'price', unit_price,
      'image', image_url,
      'qty', quantity
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'name', draft_row.name,
    'email', draft_row.email,
    'phone', draft_row.phone,
    'street', draft_row.street,
    'city', draft_row.city,
    'zip', draft_row.zip,
    'recovered', draft_row.recovered,
    'lines', lines
  );
end;
$$;

revoke all on function public.recover_storefront_checkout(text, text, uuid) from public;
grant execute on function public.recover_storefront_checkout(text, text, uuid) to anon, authenticated;
