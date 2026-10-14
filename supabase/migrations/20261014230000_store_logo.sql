alter table public.store_settings
  add column if not exists logo_url text not null default '';

create or replace function public.save_store_logo(target_store uuid, logo_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if logo_url is null or length(logo_url) > 2000 then
    raise exception 'לוגו לא תקין' using errcode = '22023';
  end if;

  update public.store_settings as settings
  set logo_url = save_store_logo.logo_url
  where settings.store_id = target_store;
end;
$$;

revoke all on function public.save_store_logo(uuid, text) from public, anon;
grant execute on function public.save_store_logo(uuid, text) to authenticated;
