-- Opens a development store and its first owner from the platform panel.
-- The store id is created inside the function. A caller cannot assign one.

create or replace function public.create_platform_store(
  store_name text,
  owner_name text,
  owner_email text,
  owner_password text,
  site_host text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_store uuid;
  new_user uuid := gen_random_uuid();
  owner_role uuid;
  clean_host text;
  clean_email text;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if store_name is null or length(btrim(store_name)) < 2 then
    raise exception 'חסר שם חנות' using errcode = '22023';
  end if;
  if owner_name is null or length(btrim(owner_name)) < 2 then
    raise exception 'חסר שם הבעלים' using errcode = '22023';
  end if;

  clean_email := lower(btrim(owner_email));
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'האימייל לא תקין' using errcode = '22023';
  end if;
  if owner_password is null or char_length(owner_password) < 8 then
    raise exception 'הסיסמה צריכה 8 תווים לפחות' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean_email) then
    raise exception 'האימייל כבר בשימוש' using errcode = '23505';
  end if;

  clean_host := lower(btrim(coalesce(site_host, '')));
  if clean_host = '' then
    raise exception 'חסר דומיין' using errcode = '22023';
  end if;
  if position('.' in clean_host) = 0 then
    clean_host := clean_host || '.localhost';
  end if;
  if clean_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'הדומיין לא תקין' using errcode = '22023';
  end if;
  if exists (select 1 from public.store_domains as domain where domain.hostname = clean_host) then
    raise exception 'הדומיין כבר תפוס' using errcode = '23505';
  end if;

  new_store := public.create_store(btrim(store_name), 'development');

  insert into public.store_domains (store_id, hostname, environment, verified_at)
  values (new_store, clean_host, 'development', now());

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    is_sso_user,
    is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_user,
    'authenticated',
    'authenticated',
    clean_email,
    extensions.crypt(owner_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', btrim(owner_name)),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    new_user,
    jsonb_build_object('sub', new_user::text, 'email', clean_email, 'email_verified', true),
    'email',
    new_user::text,
    now(),
    now()
  );

  select id into owner_role
  from public.roles
  where store_id = new_store and key = 'owner';

  insert into public.store_members (store_id, user_id, role_id, display_name, status)
  values (new_store, new_user, owner_role, btrim(owner_name), 'active');

  return jsonb_build_object('id', new_store, 'hostname', clean_host, 'email', clean_email);
end;
$$;

revoke all on function public.create_platform_store(text, text, text, text, text) from public, anon;
grant execute on function public.create_platform_store(text, text, text, text, text) to authenticated;
