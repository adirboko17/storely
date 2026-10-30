-- Brand colors are a list the merchant grows, from one color up to 24.

create or replace function public.save_store_brand_colors(target_store uuid, colors jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned jsonb;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(colors) <> 'array'
    or jsonb_array_length(colors) < 1
    or jsonb_array_length(colors) > 24 then
    raise exception 'צריך בין צבע אחד ל-24 צבעים' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(colors) as item(color)
    where item.color !~ '^#[0-9a-fA-F]{6}$'
  ) then
    raise exception 'צבע לא תקין' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(lower(item) order by ord), '[]'::jsonb)
  into cleaned
  from jsonb_array_elements_text(colors) with ordinality as raw(item, ord);

  update public.store_settings as settings
  set brand_colors = cleaned
  where settings.store_id = target_store;
end;
$$;

revoke all on function public.save_store_brand_colors(uuid, jsonb) from public, anon;
grant execute on function public.save_store_brand_colors(uuid, jsonb) to authenticated;

alter table public.store_settings
  alter column brand_colors set default '["#1a1a1a"]'::jsonb;

update public.store_settings
set brand_colors = '["#1a1a1a"]'::jsonb
where brand_colors = '["#1a1a1a","#303030","#ffffff","#8e1f0b","#0c5132","#005bd3","#5b3fc4"]'::jsonb;

do $$
declare
  src text;
begin
  select pg_get_functiondef('private.mcp_site(uuid,text,jsonb)'::regprocedure) into src;
  if src like '%jsonb_array_length(colors) <> 7%' then
    src := replace(src, 'jsonb_array_length(colors) <> 7', '(jsonb_array_length(colors) < 1 or jsonb_array_length(colors) > 24)');
    src := replace(src, 'צריך בדיוק 7 צבעים', 'צריך בין צבע אחד ל-24 צבעים');
    execute src;
  elsif src not like '%jsonb_array_length(colors) > 24%' then
    raise exception 'brand color check missing from mcp_site';
  end if;

  select pg_get_functiondef('private.mcp_catalog(uuid,text,jsonb)'::regprocedure) into src;
  if src like '%''brandColors'', 7%' then
    src := replace(src, '''brandColors'', 7', '''brandColorLimit'', 24');
    src := replace(
      src,
      'וצבעי המותג נשמרים בשבעת הצבעים של החנות.',
      'וצבעי המותג הם רשימה של צבע אחד עד 24.'
    );
    execute src;
  elsif src not like '%''brandColorLimit'', 24%' then
    raise exception 'brand color schema missing from mcp_catalog';
  end if;
end;
$$;
