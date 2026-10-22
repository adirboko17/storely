-- Storefront popups edited in the admin and returned only while active.
-- Leads are inserted by the storefront through submit_store_popup_lead, not by the table API.

create table if not exists public.store_popups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  design jsonb not null default '{}'::jsonb,
  targeting jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (char_length(btrim(name)) between 1 and 80),
  check (status in ('draft', 'active', 'paused')),
  check (jsonb_typeof(design) = 'object'),
  check (jsonb_typeof(targeting) = 'object'),
  check (octet_length(design::text) <= 100000),
  check (octet_length(targeting::text) <= 8000),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists store_popups_store_updated_idx
  on public.store_popups (store_id, updated_at desc);

create table if not exists public.store_popup_leads (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  popup_id uuid not null,
  page_path text not null default '/',
  fields jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (store_id, popup_id) references public.store_popups (store_id, id) on delete cascade,
  check (char_length(page_path) between 1 and 200),
  check (page_path like '/%'),
  check (jsonb_typeof(fields) = 'object'),
  check (octet_length(fields::text) <= 8000)
);

create index if not exists store_popup_leads_popup_created_idx
  on public.store_popup_leads (store_id, popup_id, created_at desc);

comment on table public.store_popups is
  'Popup designs for the storefront. Drafts stay in the admin. Active rows are copied into storefront_shop.';

comment on table public.store_popup_leads is
  'Form answers from a storefront popup. Inserts go through submit_store_popup_lead.';

alter table public.store_popups enable row level security;
alter table public.store_popups force row level security;
alter table public.store_popup_leads enable row level security;
alter table public.store_popup_leads force row level security;

drop trigger if exists store_popups_lock_store on public.store_popups;
create trigger store_popups_lock_store
  before update on public.store_popups
  for each row execute function private.reject_store_id_change();

drop trigger if exists store_popup_leads_lock_store on public.store_popup_leads;
create trigger store_popup_leads_lock_store
  before update on public.store_popup_leads
  for each row execute function private.reject_store_id_change();

revoke all on table public.store_popups from public, anon;
revoke all on table public.store_popup_leads from public, anon;
grant select, insert, update, delete on table public.store_popups to authenticated;
grant select, delete on table public.store_popup_leads to authenticated;

drop policy if exists store_popups_select on public.store_popups;
drop policy if exists store_popups_insert on public.store_popups;
drop policy if exists store_popups_update on public.store_popups;
drop policy if exists store_popups_delete on public.store_popups;
drop policy if exists store_popup_leads_select on public.store_popup_leads;
drop policy if exists store_popup_leads_delete on public.store_popup_leads;

create policy store_popups_select on public.store_popups
  for select to authenticated
  using ((select private.can_read_marketing(store_id)));

create policy store_popups_insert on public.store_popups
  for insert to authenticated
  with check ((select private.can_write_marketing(store_id)));

create policy store_popups_update on public.store_popups
  for update to authenticated
  using ((select private.can_write_marketing(store_id)))
  with check ((select private.can_write_marketing(store_id)));

create policy store_popups_delete on public.store_popups
  for delete to authenticated
  using ((select private.can_write_marketing(store_id)));

create policy store_popup_leads_select on public.store_popup_leads
  for select to authenticated
  using ((select private.can_read_marketing(store_id)));

create policy store_popup_leads_delete on public.store_popup_leads
  for delete to authenticated
  using ((select private.can_write_marketing(store_id)));

create or replace function public.submit_store_popup_lead(
  tracking_key text,
  hostname text,
  popup_id uuid,
  fields jsonb,
  page_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_store uuid;
  popup public.store_popups%rowtype;
  rec record;
  clean_fields jsonb := '{}'::jsonb;
  clean_text text;
  clean_path text;
  recent_count integer;
begin
  if popup_id is null or jsonb_typeof(coalesce(fields, '{}'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'חסרים פרטים');
  end if;

  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;

  select *
  into popup
  from public.store_popups as row
  where row.store_id = found_store
    and row.id = popup_id
    and row.status = 'active'
    and (row.starts_at is null or row.starts_at <= now())
    and (row.ends_at is null or row.ends_at > now());

  if popup.id is null then
    return jsonb_build_object('ok', false, 'reason', 'הפופאפ לא פעיל');
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(popup.design -> 'blocks') = 'array' then popup.design -> 'blocks'
        else '[]'::jsonb
      end
    ) as block(block)
    where block.block ->> 'type' = 'field'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'לפופאפ הזה אין טופס');
  end if;

  for rec in
    select entry.key, entry.value
    from jsonb_each(fields) as entry(key, value)
  loop
    if rec.key ~ '^[a-z][a-z0-9_]{0,31}$' and jsonb_typeof(rec.value) = 'string' then
      clean_text := left(btrim(rec.value #>> '{}'), 400);
      if clean_text <> '' then
        clean_fields := clean_fields || jsonb_build_object(rec.key, clean_text);
      end if;
    end if;
    if (select count(*) from jsonb_object_keys(clean_fields)) >= 8 then
      exit;
    end if;
  end loop;

  if clean_fields = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'חסרים פרטים');
  end if;

  clean_path := left(btrim(coalesce(page_path, '/')), 200);
  if clean_path = '' or left(clean_path, 1) <> '/' or left(clean_path, 2) = '//' then
    clean_path := '/';
  end if;

  select count(*)
  into recent_count
  from public.store_popup_leads as lead
  where lead.store_id = found_store
    and lead.popup_id = popup.id
    and lead.created_at > now() - interval '1 minute';

  if recent_count >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'נסו שוב בעוד רגע');
  end if;

  insert into public.store_popup_leads (store_id, popup_id, page_path, fields)
  values (found_store, popup.id, clean_path, clean_fields);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_store_popup_lead(text, text, uuid, jsonb, text) from public;
grant execute on function public.submit_store_popup_lead(text, text, uuid, jsonb, text) to anon, authenticated;

comment on function public.submit_store_popup_lead(text, text, uuid, jsonb, text) is
  'Stores a lead for an active popup after the storefront is resolved from the tracking key and hostname.';

create or replace function public.storefront_shop(tracking_key text, hostname text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_store uuid;
begin
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false);
  end if;

  return coalesce(public.store_public_catalog(found_store), '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'currency', coalesce((select settings.currency from public.store_settings as settings where settings.store_id = found_store), 'ILS'),
    'policies', coalesce((select settings.policies from public.store_settings as settings where settings.store_id = found_store), '{}'::jsonb),
    'shipping', private.shipping_rates(found_store),
    'collections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', collection.id,
        'title', collection.title,
        'handle', collection.handle,
        'description', collection.description,
        'productIds', coalesce((
          select jsonb_agg(link.product_id order by link.position)
          from public.collection_products as link
          where link.store_id = collection.store_id
            and link.collection_id = collection.id
        ), '[]'::jsonb)
      ) order by collection.title)
      from public.collections as collection
      where collection.store_id = found_store
        and collection.hidden = false
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(post.post)
      from public.store_settings as settings
      cross join lateral jsonb_array_elements(coalesce(settings.posts, '[]'::jsonb)) as post(post)
      where settings.store_id = found_store
        and coalesce(post.post->>'visible', 'true') <> 'false'
    ), '[]'::jsonb),
    'popups', coalesce((
      select jsonb_agg(item.popup order by item.updated_at desc)
      from (
        select popup.updated_at,
          jsonb_build_object(
            'id', popup.id,
            'design', popup.design,
            'targeting', popup.targeting || jsonb_strip_nulls(jsonb_build_object(
              'startsAt', popup.starts_at,
              'endsAt', popup.ends_at
            ))
          ) as popup
        from public.store_popups as popup
        where popup.store_id = found_store
          and popup.status = 'active'
          and (popup.starts_at is null or popup.starts_at <= now())
          and (popup.ends_at is null or popup.ends_at > now())
        order by popup.updated_at desc
        limit 20
      ) as item
    ), '[]'::jsonb)
  );
end;
$$;
