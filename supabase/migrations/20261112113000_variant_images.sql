-- Each variant can point at the image shown as the product's main photo when it is selected.

alter table public.product_variants
  add column if not exists image text;

comment on column public.product_variants.image is
  'Https image shown as the product main image when this variant is selected.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_variants_image_https'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
      add constraint product_variants_image_https
      check (
        image is null
        or (
          char_length(image) <= 500
          and image ~* '^https://[^[:space:]]+$'
          and position('..' in image) = 0
        )
      );
  end if;
end
$$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.save_store_product_variants(uuid, uuid, jsonb, jsonb)'::regprocedure);
  if position('row_image text;' in src) = 0 then
    if position($old$  product_sku text;$old$ in src) = 0 then
      raise exception 'save_store_product_variants declare moved';
    end if;
    src := replace(src, $old$  product_sku text;$old$, $new$  product_sku text;
  row_image text;
  has_image boolean;$new$);
  end if;
  if position('תמונת וריאציה לא תקינה' in src) = 0 then
    if position($old$      if row_price > 1000000 or row_stock > 1000000 then
        raise exception 'מחיר או מלאי וריאציה לא תקינים' using errcode = '22023';
      end if;

      selected := '{}'::jsonb;$old$ in src) = 0 then
      raise exception 'save_store_product_variants price check moved';
    end if;
    src := replace(src, $old$      if row_price > 1000000 or row_stock > 1000000 then
        raise exception 'מחיר או מלאי וריאציה לא תקינים' using errcode = '22023';
      end if;

      selected := '{}'::jsonb;$old$, $new$      if row_price > 1000000 or row_stock > 1000000 then
        raise exception 'מחיר או מלאי וריאציה לא תקינים' using errcode = '22023';
      end if;

      if jsonb_exists(variant_rows->pos, 'image') then
        has_image := true;
        row_image := nullif(btrim(coalesce(variant_rows->pos->>'image', '')), '');
        if row_image is not null and (
          char_length(row_image) > 500
          or row_image !~* '^https://[^[:space:]]+$'
          or position('..' in row_image) > 0
        ) then
          raise exception 'תמונת וריאציה לא תקינה' using errcode = '22023';
        end if;
      else
        has_image := false;
        row_image := null;
      end if;

      selected := '{}'::jsonb;$new$);
  end if;
  if position('title, price, position, selected, image' in src) = 0 then
    if position($old$        insert into public.product_variants (store_id, product_id, title, price, position, selected)
        values (target_store, product_id, title, row_price, pos, selected)$old$ in src) = 0 then
      raise exception 'save_store_product_variants insert moved';
    end if;
    src := replace(src, $old$        insert into public.product_variants (store_id, product_id, title, price, position, selected)
        values (target_store, product_id, title, row_price, pos, selected)$old$, $new$        insert into public.product_variants (store_id, product_id, title, price, position, selected, image)
        values (target_store, product_id, title, row_price, pos, selected, row_image)$new$);
  end if;
  if position('case when has_image then row_image else variant_row.image end' in src) = 0 then
    if position($old$        update public.product_variants as variant_row
        set title = title,
            price = row_price,
            position = pos,
            selected = selected
        where variant_row.store_id = target_store
          and variant_row.id = row_id;$old$ in src) = 0 then
      raise exception 'save_store_product_variants update moved';
    end if;
    src := replace(src, $old$        update public.product_variants as variant_row
        set title = title,
            price = row_price,
            position = pos,
            selected = selected
        where variant_row.store_id = target_store
          and variant_row.id = row_id;$old$, $new$        update public.product_variants as variant_row
        set title = title,
            price = row_price,
            position = pos,
            selected = selected,
            image = case when has_image then row_image else variant_row.image end
        where variant_row.store_id = target_store
          and variant_row.id = row_id;$new$);
  end if;
  if position($old$      set title = '',
          selected = '{}'::jsonb,
          position = 0,
          image = null$old$ in src) = 0 then
    if position($old$      set title = '',
          selected = '{}'::jsonb,
          position = 0$old$ in src) = 0 then
      raise exception 'save_store_product_variants clear moved';
    end if;
    src := replace(src, $old$      set title = '',
          selected = '{}'::jsonb,
          position = 0$old$, $new$      set title = '',
          selected = '{}'::jsonb,
          position = 0,
          image = null$new$);
  end if;
  if position($old$      'selected', coalesce(variant_row.selected, '{}'::jsonb),
      'position', variant_row.position,
      'image', variant_row.image$old$ in src) = 0 then
    if position($old$      'selected', coalesce(variant_row.selected, '{}'::jsonb),
      'position', variant_row.position$old$ in src) = 0 then
      raise exception 'save_store_product_variants return moved';
    end if;
    src := replace(src, $old$      'selected', coalesce(variant_row.selected, '{}'::jsonb),
      'position', variant_row.position$old$, $new$      'selected', coalesce(variant_row.selected, '{}'::jsonb),
      'position', variant_row.position,
      'image', variant_row.image$new$);
  end if;
  execute src;
end
$patch$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.store_public_catalog(uuid)'::regprocedure);
  if position($old$                'selected', coalesce(variant_row.selected, '{}'::jsonb),
                'image', variant_row.image,$old$ in src) > 0 then
    return;
  end if;
  if position($old$                'selected', coalesce(variant_row.selected, '{}'::jsonb),
                'price', variant_row.price,$old$ in src) = 0 then
    raise exception 'store_public_catalog variant image anchor moved';
  end if;
  execute replace(src, $old$                'selected', coalesce(variant_row.selected, '{}'::jsonb),
                'price', variant_row.price,$old$, $new$                'selected', coalesce(variant_row.selected, '{}'::jsonb),
                'image', variant_row.image,
                'price', variant_row.price,$new$);
end
$patch$;

do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.store_admin_slice(uuid, text)'::regprocedure);
  if position($old$              'selected', coalesce(variant_row.selected, '{}'::jsonb),
              'image', variant_row.image$old$ in src) > 0 then
    return;
  end if;
  if position($old$              'selected', coalesce(variant_row.selected, '{}'::jsonb)
            ) order by variant_row.position, variant_row.id)$old$ in src) = 0 then
    raise exception 'store_admin_slice variant image anchor moved';
  end if;
  execute replace(src, $old$              'selected', coalesce(variant_row.selected, '{}'::jsonb)
            ) order by variant_row.position, variant_row.id)$old$, $new$              'selected', coalesce(variant_row.selected, '{}'::jsonb),
              'image', variant_row.image
            ) order by variant_row.position, variant_row.id)$new$);
end
$patch$;
