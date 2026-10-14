-- Per-store Resend and Pulseem credentials. The secrets stay in a private
-- table. Platform operators save them. Store admins only see whether sending is on.

create table private.store_messaging (
  store_id uuid primary key references public.stores (id) on delete cascade,
  resend_api_key text not null default '',
  resend_from_email text not null default '',
  resend_from_name text not null default '',
  email_marketing boolean not null default false,
  email_login boolean not null default false,
  pulseem_user text not null default '',
  pulseem_password text not null default '',
  pulseem_from text not null default '',
  sms_marketing boolean not null default false,
  sms_login boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.store_messaging enable row level security;
alter table private.store_messaging force row level security;
revoke all on table private.store_messaging from public, anon, authenticated;

create or replace function public.store_messaging_status(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved private.store_messaging%rowtype;
  found_row boolean;
begin
  if not (
    private.has_store_permission(target_store, 'settings.manage', false)
    or private.has_store_permission(target_store, 'analytics.read', false)
    or private.is_platform_operator('platform.stores.read')
    or private.is_platform_operator('platform.stores.create')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into saved from private.store_messaging where store_id = target_store;
  found_row := found;
  if not found_row then
    return jsonb_build_object(
      'email', jsonb_build_object('saved', false, 'fromEmail', '', 'fromName', '', 'marketing', false, 'login', false, 'hint', ''),
      'sms', jsonb_build_object('saved', false, 'user', '', 'from', '', 'marketing', false, 'login', false)
    );
  end if;

  return jsonb_build_object(
    'email', jsonb_build_object(
      'saved', saved.resend_api_key <> '' and saved.resend_from_email <> '',
      'fromEmail', saved.resend_from_email,
      'fromName', saved.resend_from_name,
      'marketing', saved.email_marketing,
      'login', saved.email_login,
      'hint', case when saved.resend_api_key = '' then '' else right(saved.resend_api_key, 4) end
    ),
    'sms', jsonb_build_object(
      'saved', saved.pulseem_user <> '' and saved.pulseem_password <> '' and saved.pulseem_from <> '',
      'user', saved.pulseem_user,
      'from', saved.pulseem_from,
      'marketing', saved.sms_marketing,
      'login', saved.sms_login
    )
  );
end;
$$;

revoke all on function public.store_messaging_status(uuid) from public, anon;
grant execute on function public.store_messaging_status(uuid) to authenticated;

create or replace function public.save_store_messaging(
  target_store uuid,
  resend_api_key text,
  resend_from_email text,
  resend_from_name text,
  email_marketing boolean,
  email_login boolean,
  clear_email boolean,
  pulseem_user text,
  pulseem_password text,
  pulseem_from text,
  sms_marketing boolean,
  sms_login boolean,
  clear_sms boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing private.store_messaging%rowtype;
  has_existing boolean;
  next_key text;
  next_email text;
  next_name text;
  next_email_marketing boolean;
  next_email_login boolean;
  next_user text;
  next_password text;
  next_from text;
  next_sms_marketing boolean;
  next_sms_login boolean;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stores where id = target_store) then
    raise exception 'החנות לא נמצאה' using errcode = '22023';
  end if;

  select * into existing from private.store_messaging where store_id = target_store;
  has_existing := found;

  if clear_email then
    next_key := '';
    next_email := '';
    next_name := '';
    next_email_marketing := false;
    next_email_login := false;
  else
    next_key := case
      when btrim(coalesce(resend_api_key, '')) = '' then case when has_existing then existing.resend_api_key else '' end
      else btrim(resend_api_key)
    end;
    next_email := lower(btrim(coalesce(resend_from_email, '')));
    next_name := left(btrim(coalesce(resend_from_name, '')), 80);
    next_email_marketing := coalesce(email_marketing, false);
    next_email_login := coalesce(email_login, false);
    if next_key <> '' and next_key !~ '^re_[A-Za-z0-9_-]{20,200}$' then
      raise exception 'מפתח Resend לא תקין' using errcode = '22023';
    end if;
    if next_email <> '' and next_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'כתובת השולח לא תקינה' using errcode = '22023';
    end if;
    if next_key <> '' and next_email = '' then
      raise exception 'חסרה כתובת שולח' using errcode = '22023';
    end if;
    if (next_email_marketing or next_email_login) and (next_key = '' or next_email = '') then
      raise exception 'חסרים פרטי Resend' using errcode = '22023';
    end if;
  end if;

  if clear_sms then
    next_user := '';
    next_password := '';
    next_from := '';
    next_sms_marketing := false;
    next_sms_login := false;
  else
    next_user := left(btrim(coalesce(pulseem_user, '')), 80);
    next_password := case
      when btrim(coalesce(pulseem_password, '')) = '' then case when has_existing then existing.pulseem_password else '' end
      else btrim(pulseem_password)
    end;
    next_from := regexp_replace(btrim(coalesce(pulseem_from, '')), '[[:space:]]', '', 'g');
    next_sms_marketing := coalesce(sms_marketing, false);
    next_sms_login := coalesce(sms_login, false);
    if next_password <> '' and char_length(next_password) < 4 then
      raise exception 'סיסמת Pulseem קצרה מדי' using errcode = '22023';
    end if;
    if next_from <> '' and next_from !~ '^[0-9+]{3,16}$' then
      raise exception 'מספר השולח לא תקין' using errcode = '22023';
    end if;
    if (next_user <> '' or next_password <> '' or next_from <> '')
      and (next_user = '' or next_password = '' or next_from = '') then
      raise exception 'חסרים פרטי Pulseem' using errcode = '22023';
    end if;
    if (next_sms_marketing or next_sms_login) and (next_user = '' or next_password = '' or next_from = '') then
      raise exception 'חסרים פרטי Pulseem' using errcode = '22023';
    end if;
  end if;

  insert into private.store_messaging as saved (
    store_id, resend_api_key, resend_from_email, resend_from_name, email_marketing, email_login,
    pulseem_user, pulseem_password, pulseem_from, sms_marketing, sms_login, updated_at
  )
  values (
    target_store, next_key, next_email, next_name, next_email_marketing, next_email_login,
    next_user, next_password, next_from, next_sms_marketing, next_sms_login, now()
  )
  on conflict (store_id) do update
  set
    resend_api_key = excluded.resend_api_key,
    resend_from_email = excluded.resend_from_email,
    resend_from_name = excluded.resend_from_name,
    email_marketing = excluded.email_marketing,
    email_login = excluded.email_login,
    pulseem_user = excluded.pulseem_user,
    pulseem_password = excluded.pulseem_password,
    pulseem_from = excluded.pulseem_from,
    sms_marketing = excluded.sms_marketing,
    sms_login = excluded.sms_login,
    updated_at = now();

  return public.store_messaging_status(target_store);
end;
$$;

revoke all on function public.save_store_messaging(uuid, text, text, text, boolean, boolean, boolean, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_store_messaging(uuid, text, text, text, boolean, boolean, boolean, text, text, text, boolean, boolean, boolean) to authenticated;

-- Used only by the platform server when it checks Resend. The browser screen never receives this payload.
create or replace function public.platform_messaging_secrets(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved private.store_messaging%rowtype;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into saved from private.store_messaging where store_id = target_store;
  if not found then
    return jsonb_build_object('resendApiKey', '', 'resendFromEmail', '');
  end if;
  return jsonb_build_object(
    'resendApiKey', saved.resend_api_key,
    'resendFromEmail', saved.resend_from_email
  );
end;
$$;

revoke all on function public.platform_messaging_secrets(uuid) from public, anon;
grant execute on function public.platform_messaging_secrets(uuid) to authenticated;
