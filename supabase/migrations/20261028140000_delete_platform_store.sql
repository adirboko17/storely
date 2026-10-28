-- A platform operator can remove one store and the rows that belong to it.
-- Login accounts are removed only when they have no other store and are not operators.

create or replace function public.delete_platform_store(target_store uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_ids uuid[];
  rel record;
  removed bigint;
  table_count bigint;
  guard integer := 0;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_store is null or not exists (select 1 from public.stores where id = target_store) then
    raise exception 'החנות לא נמצאה' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(member.user_id), '{}'::uuid[])
  into member_ids
  from public.store_members as member
  where member.store_id = target_store
    and not exists (
      select 1
      from public.store_members as other
      where other.user_id = member.user_id
        and other.store_id <> target_store
    )
    and not exists (
      select 1
      from public.platform_operators as operator
      where operator.user_id = member.user_id
    );

  loop
    guard := guard + 1;
    if guard > 25 then
      raise exception 'לא הצלחנו למחוק את החנות' using errcode = '23503';
    end if;

    removed := 0;
    for rel in
      select namespace.nspname as schema_name, relation.relname as table_name
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      join pg_attribute as attribute
        on attribute.attrelid = relation.oid
        and attribute.attname = 'store_id'
        and attribute.attnum > 0
        and not attribute.attisdropped
      where relation.relkind = 'r'
        and namespace.nspname in ('public', 'private')
      order by namespace.nspname, relation.relname
    loop
      begin
        execute format('delete from %I.%I where store_id = $1', rel.schema_name, rel.table_name)
          using target_store;
        get diagnostics table_count = row_count;
        removed := removed + table_count;
      exception
        when foreign_key_violation then
          null;
      end;
    end loop;

    exit when removed = 0;
  end loop;

  begin
    delete from public.stores where id = target_store;
  exception
    when foreign_key_violation then
      raise exception 'לא הצלחנו למחוק את החנות' using errcode = '23503';
  end;

  if cardinality(member_ids) > 0 then
    delete from auth.users where id = any (member_ids);
  end if;
end;
$$;

revoke all on function public.delete_platform_store(uuid) from public, anon;
grant execute on function public.delete_platform_store(uuid) to authenticated;
