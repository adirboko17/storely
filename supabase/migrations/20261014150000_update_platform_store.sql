-- Platform operators can correct the details they entered when a store was opened:
-- the store name, both hostnames, and the owner's name, email, and password.

create or replace function public.update_platform_store(
  target_store uuid,
  store_name text,
  owner_name text,
  owner_email text,
  owner_password text,
  site_host text,
  primary_host text,
  store_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_user uuid;
  clean_email text;
  clean_host text;
  clean_primary text;
  clean_name text;
  clean_owner text;
  store_environment text;
  preview_verified timestamptz;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  clean_name := btrim(store_name);
  clean_owner := btrim(owner_name);
  if clean_name is null or length(clean_name) < 2 then
    raise exception 'חסר שם חנות' using errcode = '22023';
  end if;
  if clean_owner is null or length(clean_owner) < 2 then
    raise exception 'חסר שם הבעלים' using errcode = '22023';
  end if;
  if store_status not in ('active', 'disabled') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  clean_email := lower(btrim(owner_email));
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'האימייל לא תקין' using errcode = '22023';
  end if;
  if btrim(coalesce(owner_password, '')) <> '' and char_length(owner_password) < 8 then
    raise exception 'הסיסמה צריכה 8 תווים לפחות' using errcode = '22023';
  end if;

  select environment into store_environment
  from public.stores
  where id = target_store;

  if store_environment is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select member.user_id into owner_user
  from public.store_members as member
  join public.roles as role
    on role.store_id = member.store_id
    and role.id = member.role_id
  where member.store_id = target_store
    and role.key = 'owner'
  order by member.created_at
  limit 1;

  if owner_user is null then
    raise exception 'חסר שם הבעלים' using errcode = '22023';
  end if;

  if exists (
    select 1 from auth.users as account
    where lower(account.email) = clean_email
      and account.id <> owner_user
  ) then
    raise exception 'האימייל כבר בשימוש' using errcode = '23505';
  end if;

  clean_host := private.clean_hostname(site_host);
  if exists (
    select 1 from public.store_domains as domain
    where domain.hostname = clean_host
      and not (domain.store_id = target_store and domain.kind = 'preview')
  ) then
    raise exception 'הדומיין כבר תפוס' using errcode = '23505';
  end if;

  if btrim(coalesce(primary_host, '')) <> '' then
    clean_primary := private.clean_hostname(primary_host);
    if clean_primary = clean_host or exists (
      select 1 from public.store_domains as domain
      where domain.hostname = clean_primary
        and not (domain.store_id = target_store and domain.kind = 'primary')
    ) then
      raise exception 'הדומיין כבר תפוס' using errcode = '23505';
    end if;
  end if;

  update public.stores
  set name = clean_name, status = store_status
  where id = target_store;

  insert into public.store_settings (store_id, display_name)
  values (target_store, clean_name)
  on conflict (store_id) do update
  set display_name = excluded.display_name;

  update public.store_members
  set display_name = clean_owner
  where store_id = target_store
    and user_id = owner_user;

  update auth.users as account
  set
    email = clean_email,
    raw_user_meta_data = jsonb_set(
      coalesce(account.raw_user_meta_data, '{}'::jsonb),
      '{name}',
      to_jsonb(clean_owner),
      true
    ),
    encrypted_password = case
      when btrim(coalesce(owner_password, '')) = '' then account.encrypted_password
      else extensions.crypt(owner_password, extensions.gen_salt('bf'))
    end,
    updated_at = now()
  where account.id = owner_user;

  update auth.identities as identity
  set
    identity_data = jsonb_set(identity.identity_data, '{email}', to_jsonb(clean_email), true),
    updated_at = now()
  where identity.user_id = owner_user
    and identity.provider = 'email';

  update public.store_domains as domain
  set hostname = clean_host
  where domain.store_id = target_store
    and domain.kind = 'preview';

  if not found then
    preview_verified := case when clean_primary is null then now() else now() - interval '1 second' end;
    insert into public.store_domains (store_id, hostname, environment, verified_at, kind)
    values (target_store, clean_host, store_environment, preview_verified, 'preview');
  end if;

  if clean_primary is null then
    delete from public.store_domains as domain
    where domain.store_id = target_store
      and domain.kind = 'primary';
  else
    update public.store_domains as domain
    set hostname = clean_primary, verified_at = coalesce(domain.verified_at, now())
    where domain.store_id = target_store
      and domain.kind = 'primary';

    if not found then
      insert into public.store_domains (store_id, hostname, environment, verified_at, kind)
      values (target_store, clean_primary, store_environment, now(), 'primary');
    end if;
  end if;

  return jsonb_build_object(
    'id', target_store,
    'name', clean_name,
    'email', clean_email,
    'hostname', clean_host,
    'primaryHost', clean_primary
  );
end;
$$;

revoke all on function public.update_platform_store(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_platform_store(uuid, text, text, text, text, text, text, text) to authenticated;
