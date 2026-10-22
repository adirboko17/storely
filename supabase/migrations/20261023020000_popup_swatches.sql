alter table public.store_settings
  add column if not exists popup_swatches jsonb not null default '[]'::jsonb;

create or replace function public.save_popup_swatches(target_store uuid, swatches jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.can_write_marketing(target_store) or private.can_manage_store(target_store)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(swatches) <> 'array' or jsonb_array_length(swatches) > 12 then
    raise exception 'אפשר לשמור עד 12 צבעים' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(swatches) as item(color)
    where item.color !~ '^#[0-9a-fA-F]{6}$'
  ) then
    raise exception 'צבע לא תקין' using errcode = '22023';
  end if;

  update public.store_settings as settings
  set popup_swatches = save_popup_swatches.swatches
  where settings.store_id = target_store;
end;
$$;

revoke all on function public.save_popup_swatches(uuid, jsonb) from public, anon;
grant execute on function public.save_popup_swatches(uuid, jsonb) to authenticated;
