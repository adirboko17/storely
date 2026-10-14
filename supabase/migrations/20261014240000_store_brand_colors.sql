alter table public.store_settings
  add column if not exists brand_colors jsonb not null default '["#1a1a1a","#303030","#ffffff","#8e1f0b","#0c5132","#005bd3","#5b3fc4"]'::jsonb;

create or replace function public.save_store_brand_colors(target_store uuid, colors jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(colors) <> 'array' or jsonb_array_length(colors) <> 7 then
    raise exception 'צריך בדיוק 7 צבעים' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(colors) as item(color)
    where item.color !~ '^#[0-9a-fA-F]{6}$'
  ) then
    raise exception 'צבע לא תקין' using errcode = '22023';
  end if;

  update public.store_settings as settings
  set brand_colors = save_store_brand_colors.colors
  where settings.store_id = target_store;
end;
$$;

revoke all on function public.save_store_brand_colors(uuid, jsonb) from public, anon;
grant execute on function public.save_store_brand_colors(uuid, jsonb) to authenticated;
