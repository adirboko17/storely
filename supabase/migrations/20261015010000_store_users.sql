-- Store staff accounts. A settings manager or platform operator creates the login,
-- picks a display name and optional title, and chooses which admin areas they can open.

insert into public.permissions (key, description)
values
  ('analytics.live', 'צפייה חיה'),
  ('marketing.read', 'שיווק')
on conflict (key) do nothing;

insert into public.role_permissions (store_id, role_id, permission_key)
select role.store_id, role.id, permission.key
from public.roles as role
cross join (
  values ('analytics.live'), ('marketing.read')
) as permission (key)
where role.key = 'admin'
on conflict do nothing;

create or replace function private.copy_builtin_roles(target_store uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
  manager_id uuid;
  staff_id uuid;
  core_key text;
  admin_keys text[] := array[
    'products.read', 'products.create', 'products.update', 'products.delete',
    'orders.read', 'orders.create', 'orders.update',
    'customers.read', 'customers.create', 'customers.update',
    'discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete',
    'content.read', 'content.update',
    'analytics.read', 'analytics.live', 'marketing.read', 'settings.manage'
  ];
  manager_keys text[] := array[
    'products.read', 'products.update', 'orders.read', 'orders.update',
    'customers.read', 'analytics.read'
  ];
  staff_keys text[] := array['products.read', 'orders.read', 'orders.update', 'customers.read'];
begin
  insert into public.roles (store_id, key, name, built_in)
  values
    (target_store, 'owner', 'בעלים', true),
    (target_store, 'admin', 'מנהל', true),
    (target_store, 'manager', 'מנהל תפעול', true),
    (target_store, 'staff', 'צוות', true);

  select id into admin_id from public.roles where store_id = target_store and key = 'admin';
  select id into manager_id from public.roles where store_id = target_store and key = 'manager';
  select id into staff_id from public.roles where store_id = target_store and key = 'staff';

  foreach core_key in array admin_keys loop
    insert into public.role_permissions (store_id, role_id, permission_key)
    values (target_store, admin_id, core_key);
  end loop;
  foreach core_key in array manager_keys loop
    insert into public.role_permissions (store_id, role_id, permission_key)
    values (target_store, manager_id, core_key);
  end loop;
  foreach core_key in array staff_keys loop
    insert into public.role_permissions (store_id, role_id, permission_key)
    values (target_store, staff_id, core_key);
  end loop;
end;
$$;

revoke all on function private.copy_builtin_roles(uuid) from public, anon, authenticated;

create or replace function private.can_manage_store_users(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_store is not null and (
    private.has_store_permission(target_store, 'settings.manage', true)
    or private.is_platform_operator('platform.stores.read')
    or private.is_platform_operator('platform.stores.create')
  );
$$;

revoke all on function private.can_manage_store_users(uuid) from public, anon, authenticated;

create or replace function private.permissions_for_access(access_areas text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  area text;
  extra text[];
  grants text[] := '{}';
  all_grants text[] := array[
    'products.read', 'products.create', 'products.update', 'products.delete',
    'orders.read', 'orders.create', 'orders.update',
    'customers.read', 'customers.create', 'customers.update',
    'discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete',
    'content.read', 'content.update',
    'analytics.read', 'analytics.live', 'marketing.read', 'settings.manage'
  ];
begin
  if access_areas is null or cardinality(access_areas) = 0 then
    raise exception 'בחרו מה המשתמש יכול לראות' using errcode = '22023';
  end if;
  if 'all' = any (access_areas) then
    return all_grants;
  end if;

  foreach area in array access_areas loop
    extra := case area
      when 'orders' then array['orders.read', 'orders.create', 'orders.update']
      when 'products' then array['products.read', 'products.create', 'products.update', 'products.delete']
      when 'customers' then array['customers.read', 'customers.create', 'customers.update']
      when 'marketing' then array['marketing.read']
      when 'discounts' then array['discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete']
      when 'content' then array['content.read', 'content.update']
      when 'reports' then array['analytics.read']
      when 'live' then array['analytics.live']
      when 'settings' then array['settings.manage']
      else null
    end;
    if extra is null then
      raise exception 'הרשאה לא תקינה' using errcode = '22023';
    end if;
    grants := grants || extra;
  end loop;

  return grants;
end;
$$;

revoke all on function private.permissions_for_access(text[]) from public, anon, authenticated;

create or replace function private.access_areas_for_role(target_store uuid, target_role uuid, role_key text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  held text[];
  areas text[] := array[]::text[];
  all_grants text[] := array[
    'products.read', 'products.create', 'products.update', 'products.delete',
    'orders.read', 'orders.create', 'orders.update',
    'customers.read', 'customers.create', 'customers.update',
    'discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete',
    'content.read', 'content.update',
    'analytics.read', 'analytics.live', 'marketing.read', 'settings.manage'
  ];
begin
  if role_key = 'owner' then
    return array['all'];
  end if;

  select coalesce(array_agg(permission.permission_key), '{}')
  into held
  from public.role_permissions as permission
  where permission.store_id = target_store
    and permission.role_id = target_role;

  if all_grants <@ held then
    return array['all'];
  end if;

  if array['orders.read', 'orders.create', 'orders.update'] <@ held then
    areas := areas || array['orders'];
  end if;
  if array['products.read', 'products.create', 'products.update', 'products.delete'] <@ held then
    areas := areas || array['products'];
  end if;
  if array['customers.read', 'customers.create', 'customers.update'] <@ held then
    areas := areas || array['customers'];
  end if;
  if array['marketing.read'] <@ held then
    areas := areas || array['marketing'];
  end if;
  if array['discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete'] <@ held then
    areas := areas || array['discounts'];
  end if;
  if array['content.read', 'content.update'] <@ held then
    areas := areas || array['content'];
  end if;
  if array['analytics.read'] <@ held then
    areas := areas || array['reports'];
  end if;
  if array['analytics.live'] <@ held then
    areas := areas || array['live'];
  end if;
  if array['settings.manage'] <@ held then
    areas := areas || array['settings'];
  end if;

  return areas;
end;
$$;

revoke all on function private.access_areas_for_role(uuid, uuid, text) from public, anon, authenticated;

create or replace function private.role_for_access(
  target_store uuid,
  role_title text,
  access_areas text[],
  existing_role uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  grants text[];
  clean_title text;
  role_id uuid;
  role_built boolean;
  role_key text;
  holders integer;
begin
  grants := private.permissions_for_access(access_areas);
  clean_title := nullif(btrim(coalesce(role_title, '')), '');

  if 'all' = any (access_areas) and clean_title is null then
    select id into role_id
    from public.roles
    where store_id = target_store and key = 'admin';
    if role_id is null then
      raise exception 'חסר תפקיד מנהל' using errcode = 'P0001';
    end if;
    return role_id;
  end if;

  if clean_title is null then
    clean_title := 'צוות';
  end if;
  if char_length(clean_title) > 40 then
    raise exception 'שם התפקיד ארוך מדי' using errcode = '22023';
  end if;

  if existing_role is not null then
    select built_in, key into role_built, role_key
    from public.roles
    where store_id = target_store and id = existing_role;

    select count(*) into holders
    from public.store_members
    where store_id = target_store and role_id = existing_role;

    if role_built is false and holders <= 1 and role_key is distinct from 'owner' then
      update public.roles
      set name = clean_title
      where store_id = target_store and id = existing_role;

      delete from public.role_permissions
      where store_id = target_store and role_id = existing_role;

      insert into public.role_permissions (store_id, role_id, permission_key)
      select target_store, existing_role, permission_key
      from unnest(grants) as permission_key
      group by permission_key;

      return existing_role;
    end if;
  end if;

  insert into public.roles (store_id, key, name, built_in)
  values (
    target_store,
    'member_' || replace(gen_random_uuid()::text, '-', ''),
    clean_title,
    false
  )
  returning id into role_id;

  insert into public.role_permissions (store_id, role_id, permission_key)
  select target_store, role_id, permission_key
  from unnest(grants) as permission_key
  group by permission_key;

  return role_id;
end;
$$;

revoke all on function private.role_for_access(uuid, text, text[], uuid) from public, anon, authenticated;

create or replace function private.drop_unused_custom_role(target_store uuid, role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if role_id is null then
    return;
  end if;
  if exists (
    select 1 from public.roles
    where store_id = target_store and id = role_id and built_in
  ) then
    return;
  end if;
  if exists (
    select 1 from public.store_members
    where store_id = target_store and role_id = drop_unused_custom_role.role_id
  ) then
    return;
  end if;

  delete from public.role_permissions
  where store_id = target_store and role_id = drop_unused_custom_role.role_id;

  delete from public.roles
  where store_id = target_store and id = drop_unused_custom_role.role_id and not built_in;
end;
$$;

revoke all on function private.drop_unused_custom_role(uuid, uuid) from public, anon, authenticated;

create or replace function public.current_store_access(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if target_store is null then
    return jsonb_build_object('full', false, 'settings', false, 'permissions', '[]'::jsonb, 'name', '', 'email', '');
  end if;

  if private.is_platform_operator('platform.stores.read')
    or private.is_platform_operator('platform.stores.create') then
    return jsonb_build_object(
      'full', true,
      'settings', true,
      'permissions', '["*"]'::jsonb,
      'name', '',
      'email', ''
    );
  end if;

  select jsonb_build_object(
    'full', role.key = 'owner',
    'settings', role.key = 'owner' or exists (
      select 1
      from public.role_permissions as permission
      where permission.store_id = member.store_id
        and permission.role_id = member.role_id
        and permission.permission_key = 'settings.manage'
    ),
    'permissions', case
      when role.key = 'owner' then '["*"]'::jsonb
      else coalesce((
        select jsonb_agg(permission.permission_key)
        from public.role_permissions as permission
        where permission.store_id = member.store_id
          and permission.role_id = member.role_id
      ), '[]'::jsonb)
    end,
    'name', member.display_name,
    'email', coalesce(account.email, '')
  )
  into result
  from public.store_members as member
  join public.roles as role
    on role.store_id = member.store_id
   and role.id = member.role_id
  left join auth.users as account on account.id = member.user_id
  where member.store_id = target_store
    and member.user_id = (select auth.uid())
    and member.status = 'active';

  return coalesce(
    result,
    jsonb_build_object('full', false, 'settings', false, 'permissions', '[]'::jsonb, 'name', '', 'email', '')
  );
end;
$$;

revoke all on function public.current_store_access(uuid) from public, anon;
grant execute on function public.current_store_access(uuid) to authenticated;

create or replace function public.list_store_users(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_store_users(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'userId', member.user_id,
        'name', member.display_name,
        'email', coalesce(account.email, ''),
        'roleKey', role.key,
        'roleName', role.name,
        'status', member.status,
        'primary', role.key = 'owner',
        'areas', to_jsonb(private.access_areas_for_role(member.store_id, role.id, role.key))
      )
      order by (role.key = 'owner') desc, member.created_at
    )
    from public.store_members as member
    join public.roles as role
      on role.store_id = member.store_id
     and role.id = member.role_id
    left join auth.users as account on account.id = member.user_id
    where member.store_id = target_store
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_store_users(uuid) from public, anon;
grant execute on function public.list_store_users(uuid) to authenticated;

create or replace function public.add_store_user(
  target_store uuid,
  member_name text,
  member_email text,
  member_password text,
  role_title text,
  access_areas text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text;
  clean_email text;
  new_user uuid := gen_random_uuid();
  new_role uuid;
begin
  if not private.can_manage_store_users(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  clean_name := btrim(coalesce(member_name, ''));
  if char_length(clean_name) < 2 then
    raise exception 'חסר שם' using errcode = '22023';
  end if;
  if char_length(clean_name) > 80 then
    raise exception 'השם ארוך מדי' using errcode = '22023';
  end if;

  clean_email := lower(btrim(coalesce(member_email, '')));
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'האימייל לא תקין' using errcode = '22023';
  end if;
  if member_password is null or char_length(member_password) < 8 then
    raise exception 'הסיסמה צריכה 8 תווים לפחות' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean_email) then
    raise exception 'האימייל כבר בשימוש' using errcode = '23505';
  end if;

  new_role := private.role_for_access(target_store, role_title, access_areas, null);

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
    extensions.crypt(member_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', clean_name),
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

  insert into public.store_members (store_id, user_id, role_id, display_name, status)
  values (target_store, new_user, new_role, clean_name, 'active');

  return jsonb_build_object('userId', new_user, 'email', clean_email);
end;
$$;

revoke all on function public.add_store_user(uuid, text, text, text, text, text[]) from public, anon;
grant execute on function public.add_store_user(uuid, text, text, text, text, text[]) to authenticated;

create or replace function public.update_store_user(
  target_store uuid,
  member_user uuid,
  member_name text,
  role_title text,
  access_areas text[],
  member_status text,
  member_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text;
  clean_status text;
  previous_role uuid;
  next_role uuid;
  role_key text;
begin
  if not private.can_manage_store_users(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if member_user = (select auth.uid()) then
    raise exception 'אי אפשר לשנות את המשתמש שלך' using errcode = '42501';
  end if;

  select member.role_id, role.key
  into previous_role, role_key
  from public.store_members as member
  join public.roles as role
    on role.store_id = member.store_id
   and role.id = member.role_id
  where member.store_id = target_store
    and member.user_id = member_user;

  if previous_role is null then
    raise exception 'המשתמש לא נמצא' using errcode = 'P0002';
  end if;
  if role_key = 'owner' then
    raise exception 'אי אפשר לשנות את המשתמש הראשי' using errcode = '42501';
  end if;

  clean_name := btrim(coalesce(member_name, ''));
  if char_length(clean_name) < 2 then
    raise exception 'חסר שם' using errcode = '22023';
  end if;
  if char_length(clean_name) > 80 then
    raise exception 'השם ארוך מדי' using errcode = '22023';
  end if;

  clean_status := btrim(coalesce(member_status, ''));
  if clean_status not in ('active', 'disabled') then
    raise exception 'סטטוס לא תקין' using errcode = '22023';
  end if;
  if member_password is not null and btrim(member_password) <> '' and char_length(member_password) < 8 then
    raise exception 'הסיסמה צריכה 8 תווים לפחות' using errcode = '22023';
  end if;

  next_role := private.role_for_access(target_store, role_title, access_areas, previous_role);

  update public.store_members
  set display_name = clean_name,
      role_id = next_role,
      status = clean_status
  where store_id = target_store
    and user_id = member_user;

  update auth.users as account
  set
    raw_user_meta_data = jsonb_set(
      coalesce(account.raw_user_meta_data, '{}'::jsonb),
      '{name}',
      to_jsonb(clean_name),
      true
    ),
    encrypted_password = case
      when member_password is null or btrim(member_password) = '' then account.encrypted_password
      else extensions.crypt(member_password, extensions.gen_salt('bf'))
    end,
    updated_at = now()
  where account.id = member_user;

  if next_role is distinct from previous_role then
    perform private.drop_unused_custom_role(target_store, previous_role);
  end if;
end;
$$;

revoke all on function public.update_store_user(uuid, uuid, text, text, text[], text, text) from public, anon;
grant execute on function public.update_store_user(uuid, uuid, text, text, text[], text, text) to authenticated;

do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.store_traffic_snapshot(uuid)'::regprocedure);
  src := replace(
    src,
    'private.has_store_permission(target_store, ''analytics.read'', false)',
    'private.has_store_permission(target_store, ''analytics.read'', false) or private.has_store_permission(target_store, ''analytics.live'', false)'
  );
  if src not like '%analytics.live%' then
    raise exception 'traffic snapshot was not updated';
  end if;
  execute src;

  src := pg_get_functiondef('public.store_messaging_status(uuid)'::regprocedure);
  src := replace(
    src,
    'private.has_store_permission(target_store, ''analytics.read'', false)',
    'private.has_store_permission(target_store, ''analytics.read'', false) or private.has_store_permission(target_store, ''marketing.read'', false)'
  );
  if src not like '%marketing.read%' then
    raise exception 'messaging status was not updated';
  end if;
  execute src;
end $$;
