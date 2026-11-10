-- One payment terminal per store. The API key and PassP are vault secrets.
-- This table stores only the terminal and the secret ids, and no function returns the secrets.

create table private.store_payment_accounts (
  store_id uuid not null references public.stores (id) on delete cascade,
  provider text not null,
  terminal text not null,
  api_key_secret_id uuid,
  api_password_secret_id uuid,
  updated_at timestamptz not null default now(),
  primary key (store_id, provider),
  constraint store_payment_accounts_provider_check check (provider in ('hyp')),
  constraint store_payment_accounts_terminal_check check (terminal ~ '^[0-9]{7,12}$')
);

alter table private.store_payment_accounts enable row level security;
alter table private.store_payment_accounts force row level security;
revoke all on table private.store_payment_accounts from public, anon, authenticated;

create or replace function private.can_manage_store_payments(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_store is not null
    and auth.uid() is not null
    and (
      private.has_store_permission(target_store, 'settings.manage', true)
      or private.is_platform_operator('platform.stores.read')
      or private.is_platform_operator('platform.stores.create')
    );
$$;

revoke all on function private.can_manage_store_payments(uuid) from public, anon, authenticated;

create or replace function private.store_payment_put_secret(secret_id uuid, secret_value text, secret_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
begin
  if secret_id is null then
    return vault.create_secret(secret_value, secret_name, 'store payment credential');
  end if;
  begin
    perform vault.update_secret(secret_id, secret_value, secret_name, 'store payment credential');
    return secret_id;
  exception
    when others then
      saved := vault.create_secret(secret_value, secret_name, 'store payment credential');
      return saved;
  end;
end;
$$;

revoke all on function private.store_payment_put_secret(uuid, text, text) from public, anon, authenticated;

create or replace function private.forget_store_payment_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets
  where id = old.api_key_secret_id
     or id = old.api_password_secret_id;
  return old;
end;
$$;

revoke all on function private.forget_store_payment_secrets() from public, anon, authenticated;

drop trigger if exists store_payment_accounts_forget_secrets on private.store_payment_accounts;
create trigger store_payment_accounts_forget_secrets
  before delete on private.store_payment_accounts
  for each row
  execute function private.forget_store_payment_secrets();

create or replace function private.store_payment_status(target_store uuid, account_provider text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'provider', account.provider,
    'terminal', account.terminal,
    'connected', account.api_key_secret_id is not null and account.api_password_secret_id is not null,
    'updatedAt', account.updated_at
  )
  from private.store_payment_accounts as account
  where account.store_id = target_store
    and account.provider = account_provider;
$$;

revoke all on function private.store_payment_status(uuid, text) from public, anon, authenticated;

create or replace function public.store_payment_account(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  status jsonb;
begin
  if not private.can_manage_store_payments(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  status := private.store_payment_status(target_store, 'hyp');
  return coalesce(
    status,
    jsonb_build_object('provider', 'hyp', 'terminal', '', 'connected', false, 'updatedAt', null)
  );
end;
$$;

revoke all on function public.store_payment_account(uuid) from public, anon;
grant execute on function public.store_payment_account(uuid) to authenticated;

create or replace function public.save_store_payment_account(
  target_store uuid,
  terminal text,
  api_key text,
  api_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_terminal text := btrim(coalesce(terminal, ''));
  clean_key text := btrim(coalesce(api_key, ''));
  clean_pass text := btrim(coalesce(api_password, ''));
  account private.store_payment_accounts%rowtype;
  key_id uuid;
  pass_id uuid;
begin
  if not private.can_manage_store_payments(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean_terminal !~ '^[0-9]{7,12}$' then
    raise exception 'מספר המסוף צריך להיות 7 עד 12 ספרות' using errcode = '22023';
  end if;
  if clean_key <> '' and (char_length(clean_key) < 8 or char_length(clean_key) > 200 or clean_key ~ '\s') then
    raise exception 'מפתח ה-API לא תקין' using errcode = '22023';
  end if;
  if clean_pass <> '' and (char_length(clean_pass) < 4 or char_length(clean_pass) > 200 or clean_pass ~ '\s') then
    raise exception 'PassP לא תקין' using errcode = '22023';
  end if;

  select *
  into account
  from private.store_payment_accounts
  where store_id = target_store
    and provider = 'hyp';

  if account.store_id is null or account.api_key_secret_id is null or account.api_password_secret_id is null then
    if clean_key = '' or clean_pass = '' then
      raise exception 'הדביקו את מפתח ה-API ואת PassP' using errcode = '22023';
    end if;
  end if;

  if account.store_id is null then
    insert into private.store_payment_accounts (store_id, provider, terminal)
    values (target_store, 'hyp', clean_terminal);
  end if;

  key_id := account.api_key_secret_id;
  pass_id := account.api_password_secret_id;

  if clean_key <> '' then
    begin
      key_id := private.store_payment_put_secret(key_id, clean_key, 'payment:' || target_store::text || ':hyp:key');
    exception
      when others then
        raise exception 'שמירת מפתח ה-API נכשלה' using errcode = 'P0001';
    end;
  end if;

  if clean_pass <> '' then
    begin
      pass_id := private.store_payment_put_secret(pass_id, clean_pass, 'payment:' || target_store::text || ':hyp:pass');
    exception
      when others then
        raise exception 'שמירת PassP נכשלה' using errcode = 'P0001';
    end;
  end if;

  update private.store_payment_accounts
  set terminal = clean_terminal,
      api_key_secret_id = key_id,
      api_password_secret_id = pass_id,
      updated_at = now()
  where store_id = target_store
    and provider = 'hyp';

  return private.store_payment_status(target_store, 'hyp');
end;
$$;

revoke all on function public.save_store_payment_account(uuid, text, text, text) from public, anon;
grant execute on function public.save_store_payment_account(uuid, text, text, text) to authenticated;

create or replace function public.clear_store_payment_account(target_store uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account private.store_payment_accounts%rowtype;
begin
  if not private.can_manage_store_payments(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
  into account
  from private.store_payment_accounts
  where store_id = target_store
    and provider = 'hyp';

  if account.store_id is null then
    return jsonb_build_object('provider', 'hyp', 'terminal', '', 'connected', false, 'updatedAt', null);
  end if;

  delete from vault.secrets
  where id = account.api_key_secret_id
     or id = account.api_password_secret_id;

  update private.store_payment_accounts
  set api_key_secret_id = null,
      api_password_secret_id = null,
      updated_at = now()
  where store_id = target_store
    and provider = 'hyp';

  return private.store_payment_status(target_store, 'hyp');
end;
$$;

revoke all on function public.clear_store_payment_account(uuid) from public, anon;
grant execute on function public.clear_store_payment_account(uuid) to authenticated;

insert into private.store_payment_accounts (store_id, provider, terminal)
select store.id, 'hyp', '4502517527'
from public.stores as store
where store.name = 'שיר לביא'
  and exists (
    select 1
    from public.store_domains as domain
    where domain.store_id = store.id
      and domain.hostname in ('www.shirlavy.co.il', 'shirlavy.vercel.app')
  )
on conflict (store_id, provider) do nothing;
