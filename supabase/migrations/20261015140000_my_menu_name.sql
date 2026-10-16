-- Personal name shown only to the signed-in user, in the admin menu.

create or replace function public.set_my_menu_name(next_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  clean_name := btrim(coalesce(next_name, ''));
  if char_length(clean_name) < 2 then
    raise exception 'הזינו שם' using errcode = '22023';
  end if;
  if char_length(clean_name) > 80 then
    raise exception 'השם ארוך מדי' using errcode = '22023';
  end if;

  update auth.users as account
  set raw_user_meta_data = jsonb_set(
    coalesce(account.raw_user_meta_data, '{}'::jsonb),
    '{menu_name}',
    to_jsonb(clean_name),
    true
  ),
  updated_at = now()
  where account.id = (select auth.uid());

  return clean_name;
end;
$$;

revoke all on function public.set_my_menu_name(text) from public, anon;
grant execute on function public.set_my_menu_name(text) to authenticated;
