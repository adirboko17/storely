update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'product-media';

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

  select coalesce(jsonb_agg(jsonb_build_object('qty', picked.qty, 'price', picked.price, 'label', picked.label) order by picked.ord), '[]'::jsonb)
  into bundles
  from (
    select distinct on (bundle.qty)
      bundle.qty,
      bundle.price,
      bundle.label,
      bundle.ord
    from (
      select
        trunc((item.item->>'qty')::numeric)::int as qty,
        round((item.item->>'price')::numeric, 2) as price,
        case
          when btrim(regexp_replace(coalesce(item.item->>'label', ''), '[[:cntrl:]]', '', 'g')) = ''
            then 'קנה ' || trunc((item.item->>'qty')::numeric)::int::text
          else left(btrim(regexp_replace(coalesce(item.item->>'label', ''), '[[:cntrl:]]', '', 'g')), 80)
        end as label,
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
