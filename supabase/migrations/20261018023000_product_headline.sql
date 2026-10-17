-- Product page title can stay one line, or split into the existing title plus a smaller continuation.
-- Existing products have no headline, which reads as a single title.

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
  badge_label text := '';
  badge_hidden boolean := false;
  headline_mode text := 'single';
  headline_subtitle text := '';
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

  badge_label := left(btrim(regexp_replace(coalesce(merch #>> '{badge,label}', ''), '[[:cntrl:]]', '', 'g')), 24);
  badge_hidden := coalesce(merch #>> '{badge,hidden}', '') in ('true', 't');
  headline_mode := case when merch #>> '{headline,mode}' = 'split' then 'split' else 'single' end;
  headline_subtitle := left(btrim(regexp_replace(coalesce(merch #>> '{headline,subtitle}', ''), '[[:cntrl:]]', '', 'g')), 120);

  update public.products as product
  set merch = jsonb_build_object(
        'bundles', bundles,
        'page', page,
        'badge', jsonb_build_object('label', badge_label, 'hidden', badge_hidden),
        'headline', jsonb_build_object('mode', headline_mode, 'subtitle', headline_subtitle)
      ),
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
