create or replace function public.store_visit_host(target_store uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  chosen text;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(
    max(domain.hostname) filter (where domain.kind = 'primary'),
    max(domain.hostname) filter (where domain.kind = 'preview')
  )
  into chosen
  from public.store_domains as domain
  where domain.store_id = target_store;

  return coalesce(chosen, '');
end;
$$;

revoke all on function public.store_visit_host(uuid) from public, anon;
grant execute on function public.store_visit_host(uuid) to authenticated;
