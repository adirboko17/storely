-- Platform home reads every store through an explicit operator check.
-- Store tables stay closed to anyone who is only a member of one store.

create or replace function public.has_platform_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_operator('platform.stores.read');
$$;

create or replace function public.list_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_operator('platform.stores.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(payload order by store_name)
      from (
        select
          s.name as store_name,
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'status', s.status,
            'environment', s.environment,
            'displayName', ss.display_name,
            'hostname', sd.hostname,
            'domainVerified', sd.verified_at is not null,
            'modules', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', module.module_id,
                'enabled', module.enabled
              ) order by module.module_id)
              from public.store_modules module
              where module.store_id = s.id
            ), '[]'::jsonb),
            'members', coalesce((
              select jsonb_agg(jsonb_build_object(
                'name', person.display_name,
                'email', person.email,
                'role', person.role_name,
                'roleKey', person.role_key,
                'status', person.status
              ) order by person.role_key, person.display_name)
              from (
                select
                  member.display_name,
                  account.email,
                  role.name as role_name,
                  role.key as role_key,
                  member.status
                from public.store_members member
                join public.roles role
                  on role.store_id = member.store_id
                  and role.id = member.role_id
                join auth.users account on account.id = member.user_id
                where member.store_id = s.id
              ) person
            ), '[]'::jsonb)
          ) as payload
        from public.stores s
        left join public.store_settings ss on ss.store_id = s.id
        left join lateral (
          select domain.hostname, domain.verified_at
          from public.store_domains domain
          where domain.store_id = s.id
          order by domain.verified_at desc nulls last
          limit 1
        ) sd on true
      ) store_row
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.has_platform_access() from public, anon;
revoke all on function public.list_platform_overview() from public, anon;
grant execute on function public.has_platform_access() to authenticated;
grant execute on function public.list_platform_overview() to authenticated;
