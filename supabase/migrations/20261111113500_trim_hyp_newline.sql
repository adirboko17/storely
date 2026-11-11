-- btrim only removes spaces. Hyp ends the verification body with a newline, so CCode comes back as "0" plus that newline.

create or replace function private.form_value(raw text, wanted text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  pair text;
  item_key text;
  item_value text;
begin
  foreach pair in array string_to_array(coalesce(raw, ''), '&') loop
    item_key := split_part(pair, '=', 1);
    item_value := substr(pair, char_length(item_key) + 2);
    if private.percent_decode(item_key) = wanted then
      return btrim(private.percent_decode(replace(item_value, '+', ' ')), E' \t\n\r');
    end if;
  end loop;
  return '';
end;
$$;

revoke all on function private.form_value(text, text) from public, anon, authenticated;
