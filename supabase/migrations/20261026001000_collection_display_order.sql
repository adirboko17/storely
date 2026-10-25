-- The storefront menu follows collections.position.
-- Existing categories keep today's title order until someone drags them.

alter table public.collections add column if not exists position integer;

update public.collections as collection
set position = ranked.pos
from (
  select id, (row_number() over (partition by store_id order by title, id) - 1)::integer as pos
  from public.collections
) as ranked
where collection.id = ranked.id
  and collection.position is null;

alter table public.collections alter column position set not null;

create index if not exists collections_position_idx on public.collections (store_id, position, id);

create or replace function private.assign_collection_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(existing.position), -1) + 1
    into new.position
    from public.collections as existing
    where existing.store_id = new.store_id;
  end if;
  return new;
end;
$$;

drop trigger if exists collections_assign_position on public.collections;
create trigger collections_assign_position
before insert on public.collections
for each row execute function private.assign_collection_position();

create or replace function public.reorder_store_collections(target_store uuid, titles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested integer;
  matched integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if titles is null or cardinality(titles) = 0 then
    return;
  end if;
  if cardinality(titles) > 200 then
    raise exception 'יותר מדי קטגוריות' using errcode = '22023';
  end if;

  select count(*)::integer into requested from unnest(titles) as item(title);
  select count(distinct item.title)::integer into matched from unnest(titles) as item(title) where btrim(item.title) <> '';
  if matched <> requested then
    raise exception 'רשימת הקטגוריות לא תקינה' using errcode = '22023';
  end if;

  insert into public.collections (store_id, title, handle, description)
  select target_store, item.title, item.title, ''
  from unnest(titles) as item(title)
  where not exists (
    select 1
    from public.collections as collection
    where collection.store_id = target_store
      and collection.title = item.title
  );

  update public.collections as collection
  set position = ordered.pos
  from (
    select item.title, (item.ord - 1)::integer as pos
    from unnest(titles) with ordinality as item(title, ord)
  ) as ordered
  where collection.store_id = target_store
    and collection.title = ordered.title;
end;
$$;

revoke all on function public.reorder_store_collections(uuid, text[]) from public, anon;
grant execute on function public.reorder_store_collections(uuid, text[]) to authenticated;

do $$
declare
  src text;
  name text;
  needle text := 'order by collection.title';
  patched text := 'order by collection.position, collection.title';
begin
  foreach name in array array['public.store_public_catalog(uuid)', 'public.storefront_shop(text, text)', 'public.store_admin_snapshot(uuid)']
  loop
    src := pg_get_functiondef(name::regprocedure);
    if position(patched in src) = 0 then
      if position(needle in src) = 0 then
        raise exception 'collection order missing in %', name;
      end if;
      execute replace(src, needle, patched);
    end if;
  end loop;
end $$;
