-- One PhotosPro credential per store. The raw key is shown to platform
-- operators and sent by PhotosPro as x-api-key. It is not a storefront secret.

create table public.photospro_links (
  store_id uuid primary key references public.stores (id) on delete cascade,
  api_key text not null,
  created_at timestamptz not null default now(),
  constraint photospro_links_key_format check (api_key ~ '^pp_[0-9a-f]{48}$')
);

create unique index photospro_links_api_key_key on public.photospro_links (api_key);

comment on table public.photospro_links is
  'PhotosPro reads and updates this store when the request carries its api_key.';

alter table public.photospro_links enable row level security;
alter table public.photospro_links force row level security;

revoke all on table public.photospro_links from public, anon, authenticated;
grant select on table public.photospro_links to service_role;

create or replace function private.photospro_api_key()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'pp_' || encode(extensions.gen_random_bytes(24), 'hex');
$$;

revoke all on function private.photospro_api_key() from public, anon, authenticated;

create or replace function private.attach_photospro_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.photospro_links (store_id, api_key)
  values (new.id, private.photospro_api_key())
  on conflict (store_id) do nothing;
  return new;
end;
$$;

revoke all on function private.attach_photospro_link() from public, anon, authenticated;

drop trigger if exists stores_photospro_link on public.stores;
create trigger stores_photospro_link
  after insert on public.stores
  for each row execute function private.attach_photospro_link();

insert into public.photospro_links (store_id, api_key)
select store.id, private.photospro_api_key()
from public.stores as store
on conflict (store_id) do nothing;

create or replace function public.platform_photospro_link(target_store uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link_key text;
begin
  if not private.is_platform_operator('platform.stores.read')
     and not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stores where id = target_store) then
    raise exception 'החנות לא נמצאה' using errcode = 'P0002';
  end if;

  insert into public.photospro_links (store_id, api_key)
  values (target_store, private.photospro_api_key())
  on conflict (store_id) do nothing;

  select api_key into link_key
  from public.photospro_links
  where store_id = target_store;

  return jsonb_build_object('apiKey', link_key);
end;
$$;

revoke all on function public.platform_photospro_link(uuid) from public, anon;
grant execute on function public.platform_photospro_link(uuid) to authenticated;
