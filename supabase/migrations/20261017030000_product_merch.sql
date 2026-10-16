alter table public.products
  add column if not exists merch jsonb not null default '{}'::jsonb;

alter table public.products
  drop constraint if exists products_merch_object;

alter table public.products
  add constraint products_merch_object check (jsonb_typeof(merch) = 'object');

comment on column public.products.merch is
  'Storefront extras: quantity bundles for every store, and optional product-page sections for the Oli store.';

create or replace function private.clean_product_page(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  panels jsonb := '[]'::jsonb;
  stories jsonb := '[]'::jsonb;
  steps jsonb := '[]'::jsonb;
  ingredients jsonb := '[]'::jsonb;
  reviews jsonb := '[]'::jsonb;
  intro text := '';
  item jsonb;
  title text;
  body text;
  handle text;
  url text;
  name_en text;
  name_he text;
  person text;
  review_title text;
  review_date text;
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    return '{}'::jsonb;
  end if;

  if jsonb_typeof(raw->'panels') = 'array' then
    for item in select value from jsonb_array_elements(raw->'panels') limit 8 loop
      title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 80);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 4000);
      if title <> '' and body <> '' then
        panels := panels || jsonb_build_array(jsonb_build_object('title', title, 'body', body));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'stories') = 'array' then
    for item in select value from jsonb_array_elements(raw->'stories') limit 20 loop
      handle := left(btrim(regexp_replace(coalesce(item->>'handle', ''), '[[:cntrl:]]', '', 'g')), 80);
      url := left(btrim(coalesce(item->>'url', '')), 300);
      if url !~* '^https://([a-z0-9-]+\.)*instagram\.com/\S+$' then
        url := '';
      end if;
      if handle <> '' then
        stories := stories || jsonb_build_array(jsonb_build_object('handle', handle, 'url', url));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'steps') = 'array' then
    for item in select value from jsonb_array_elements(raw->'steps') limit 8 loop
      title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 80);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 500);
      if title <> '' and body <> '' then
        steps := steps || jsonb_build_array(jsonb_build_object('title', title, 'body', body));
      end if;
    end loop;
  end if;

  intro := left(btrim(regexp_replace(coalesce(raw->>'ingredientsIntro', ''), '[[:cntrl:]]', '', 'g')), 300);

  if jsonb_typeof(raw->'ingredients') = 'array' then
    for item in select value from jsonb_array_elements(raw->'ingredients') limit 12 loop
      name_en := left(btrim(regexp_replace(coalesce(item->>'en', ''), '[[:cntrl:]]', '', 'g')), 40);
      name_he := left(btrim(regexp_replace(coalesce(item->>'he', ''), '[[:cntrl:]]', '', 'g')), 40);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 500);
      if (name_en <> '' or name_he <> '') and body <> '' then
        ingredients := ingredients || jsonb_build_array(jsonb_build_object('en', name_en, 'he', name_he, 'body', body));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'reviews') = 'array' then
    for item in select value from jsonb_array_elements(raw->'reviews') limit 30 loop
      person := left(btrim(regexp_replace(coalesce(item->>'name', ''), '[[:cntrl:]]', '', 'g')), 80);
      review_title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 120);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 1000);
      review_date := left(btrim(regexp_replace(coalesce(item->>'date', ''), '[[:cntrl:]]', '', 'g')), 40);
      if person <> '' and body <> '' then
        reviews := reviews || jsonb_build_array(jsonb_build_object(
          'name', person,
          'title', review_title,
          'body', body,
          'date', review_date,
          'verified', item->>'verified' = 'true'
        ));
      end if;
    end loop;
  end if;

  if panels = '[]'::jsonb
    and stories = '[]'::jsonb
    and steps = '[]'::jsonb
    and ingredients = '[]'::jsonb
    and reviews = '[]'::jsonb
    and intro = '' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'panels', panels,
    'stories', stories,
    'steps', steps,
    'ingredientsIntro', intro,
    'ingredients', ingredients,
    'reviews', reviews
  );
end;
$$;

revoke all on function private.clean_product_page(jsonb) from public, anon, authenticated;

create or replace function public.save_store_product_merch(
  target_store uuid,
  product_id uuid,
  merch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
  bundles jsonb := '[]'::jsonb;
  page jsonb := '{}'::jsonb;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(merch) is distinct from 'object' then
    raise exception 'נתוני המוצר לא תקינים' using errcode = '22023';
  end if;
  if octet_length(merch::text) > 80000 then
    raise exception 'התוכן ארוך מדי' using errcode = '22023';
  end if;

  select account.email
  into owner_email
  from public.store_members as member
  join public.roles as role
    on role.store_id = member.store_id
   and role.id = member.role_id
  join auth.users as account on account.id = member.user_id
  where member.store_id = target_store
    and role.key = 'owner'
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('qty', picked.qty, 'price', picked.price) order by picked.ord), '[]'::jsonb)
  into bundles
  from (
    select distinct on (bundle.qty)
      bundle.qty,
      bundle.price,
      bundle.ord
    from (
      select
        trunc((item.item->>'qty')::numeric)::int as qty,
        round((item.item->>'price')::numeric, 2) as price,
        item.ordinality as ord
      from jsonb_array_elements(
        case when jsonb_typeof(merch->'bundles') = 'array' then merch->'bundles' else '[]'::jsonb end
      ) with ordinality as item(item, ordinality)
      where jsonb_typeof(item.item) = 'object'
        and (item.item->>'qty') ~ '^[0-9]{1,2}$'
        and (item.item->>'price') ~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
        and (item.item->>'qty')::numeric between 1 and 99
        and (item.item->>'price')::numeric between 0 and 1000000
    ) as bundle
    order by bundle.qty, bundle.ord
  ) as picked;

  if lower(coalesce(owner_email, '')) = 'itsfrontale@gmail.com' then
    page := private.clean_product_page(merch->'page');
  end if;

  update public.products as product
  set merch = jsonb_build_object('bundles', bundles, 'page', page),
      updated_at = now()
  where product.store_id = target_store
    and product.id = product_id;

  if not found then
    raise exception 'המוצר לא נמצא' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_store_product_merch(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_store_product_merch(uuid, uuid, jsonb) to authenticated;

do $$
declare
  src text;
  needle text;
  patched text;
begin
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  needle := '''description'', product.description,';
  patched := '''description'', product.description,' || E'\n          ''merch'', coalesce(product.merch, ''{}''::jsonb),';
  if src not like '%''merch'', coalesce(product.merch%' then
    if position(needle in src) = 0 then
      raise exception 'product description field missing from admin snapshot';
    end if;
    execute replace(src, needle, patched);
  end if;

  src := pg_get_functiondef('public.store_public_catalog(uuid)'::regprocedure);
  if src not like '%catalog_row.merch%' then
    needle := '''description'', catalog_row.description,';
    patched := '''description'', catalog_row.description,' || E'\n          ''merch'', coalesce(catalog_row.merch, ''{}''::jsonb),';
    if position(needle in src) = 0 then
      raise exception 'catalog description field missing';
    end if;
    src := replace(src, needle, patched);
    needle := 'product.description,';
    patched := 'product.description,' || E'\n          product.merch,';
    if position(needle in src) = 0 then
      raise exception 'catalog product description column missing';
    end if;
    execute replace(src, needle, patched);
  end if;
end $$;
