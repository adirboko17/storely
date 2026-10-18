-- Checkout should show the shipping method name from the profile.
-- A rate created with a zone only stores the zone name ("ישראל"), which is the destination, not the method.

create or replace function private.shipping_rates(target_store uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', rate.name, 'price', rate.price, 'zone', rate.zone)), '[]'::jsonb)
  from (
    select
      case
        when btrim(coalesce(rate_row.rate->>'name', '')) <> ''
          and btrim(rate_row.rate->>'name') is distinct from btrim(coalesce(zone_row.zone->>'name', ''))
          then btrim(rate_row.rate->>'name')
        else coalesce(
          nullif(btrim(coalesce(profile.profile->>'name', '')), ''),
          nullif(btrim(coalesce(zone_row.zone->>'name', '')), ''),
          'משלוח'
        )
      end as name,
      coalesce(nullif(rate_row.rate->>'price', '')::numeric, 0) as price,
      coalesce(zone_row.zone->>'name', '') as zone
    from public.store_settings as settings
    cross join lateral jsonb_array_elements(coalesce(settings.shipping->'profiles', '[]'::jsonb)) as profile(profile)
    cross join lateral jsonb_array_elements(coalesce(profile.profile->'zones', '[]'::jsonb)) as zone_row(zone)
    cross join lateral jsonb_array_elements(coalesce(zone_row.zone->'rates', '[]'::jsonb)) as rate_row(rate)
    where settings.store_id = target_store
  ) as rate;
$$;

revoke all on function private.shipping_rates(uuid) from public, anon, authenticated;
