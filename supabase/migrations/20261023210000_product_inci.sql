-- Full INCI list sits under the key ingredients on the product page.

create or replace function private.clean_product_page(raw jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  panels jsonb := '[]'::jsonb;
  stories jsonb := '[]'::jsonb;
  steps jsonb := '[]'::jsonb;
  ingredients jsonb := '[]'::jsonb;
  inci jsonb := '[]'::jsonb;
  reviews jsonb := '[]'::jsonb;
  highlights jsonb := '[]'::jsonb;
  faqs jsonb := '[]'::jsonb;
  intro text := '';
  item jsonb;
  title text;
  body text;
  handle text;
  url text;
  name_en text;
  name_he text;
  inci_name text;
  inci_he text;
  inci_row jsonb;
  person text;
  review_title text;
  review_date text;
  stars int;
  highlight text;
  question text;
  answer text;
  topic text;
  link_kind text;
  link_label text;
  link_href text;
  link_row jsonb;
  raw_links jsonb;
  kept_links jsonb;
  panel_link jsonb;
  panel_row jsonb;
  align_left boolean;
begin
  if jsonb_typeof(raw) is distinct from 'object' then
    return '{}'::jsonb;
  end if;

  if jsonb_typeof(raw->'highlights') = 'array' then
    for item in select value from jsonb_array_elements(raw->'highlights') loop
      exit when jsonb_array_length(highlights) >= 4;
      highlight := left(btrim(regexp_replace(coalesce(item #>> '{}', ''), '[[:cntrl:]]', '', 'g')), 40);
      if highlight <> '' and not highlights @> jsonb_build_array(highlight) then
        highlights := highlights || jsonb_build_array(highlight);
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'faqs') = 'array' then
    for item in select value from jsonb_array_elements(raw->'faqs') limit 20 loop
      question := left(btrim(regexp_replace(coalesce(item->>'q', ''), '[[:cntrl:]]', '', 'g')), 180);
      answer := private.clean_copy(item->>'a', 1000);
      topic := coalesce(item->>'tag', '');
      if question <> '' and answer <> '' and topic in ('use', 'ing', 'post', 'buy') then
        faqs := faqs || jsonb_build_array(jsonb_build_object('q', question, 'a', answer, 'tag', topic));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'panels') = 'array' then
    for item in select value from jsonb_array_elements(raw->'panels') limit 8 loop
      title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 80);
      body := private.clean_copy(item->>'body', 4000);
      align_left := coalesce(item->>'align', '') = 'left';
      kept_links := '[]'::jsonb;
      raw_links := case
        when jsonb_typeof(item->'links') = 'array' and jsonb_array_length(item->'links') > 0 then item->'links'
        when jsonb_typeof(item->'link') = 'object' then jsonb_build_array(item->'link')
        else '[]'::jsonb
      end;
      for link_row in select value from jsonb_array_elements(raw_links) loop
        exit when jsonb_array_length(kept_links) >= 6;
        link_kind := coalesce(link_row->>'kind', '');
        link_label := left(btrim(regexp_replace(coalesce(link_row->>'label', ''), '[[:cntrl:]]', '', 'g')), 120);
        link_href := left(btrim(regexp_replace(coalesce(link_row->>'href', ''), '[[:cntrl:]]', '', 'g')), 300);
        panel_link := null;
        if link_label <> '' and position('..' in link_href) = 0 then
          if link_kind = 'article' and link_href ~ '^/articles/[a-z0-9-]+$' then
            panel_link := jsonb_build_object('kind', 'article', 'label', link_label, 'href', link_href);
          elsif link_kind = 'url' and (link_href ~* '^https://\S+$' or link_href ~ '^/[^/[:space:]]') then
            panel_link := jsonb_build_object('kind', 'url', 'label', link_label, 'href', link_href);
          end if;
        end if;
        if panel_link is not null and not kept_links @> jsonb_build_array(panel_link) then
          kept_links := kept_links || jsonb_build_array(panel_link);
        end if;
      end loop;
      if title <> '' and body <> '' then
        panel_row := jsonb_build_object('title', title, 'body', body);
        if align_left then
          panel_row := panel_row || jsonb_build_object('align', 'left');
        end if;
        if jsonb_array_length(kept_links) > 0 then
          panel_row := panel_row || jsonb_build_object('links', kept_links, 'link', kept_links->0);
        end if;
        panels := panels || jsonb_build_array(panel_row);
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'stories') = 'array' then
    for item in select value from jsonb_array_elements(raw->'stories') limit 20 loop
      handle := left(btrim(regexp_replace(coalesce(item->>'handle', ''), '[[:cntrl:]]', '', 'g')), 80);
      url := left(btrim(coalesce(item->>'url', '')), 500);
      if position('..' in url) > 0 then
        url := '';
      elsif url ~* '^https://([a-z0-9-]+\.)*instagram\.com/\S+$' then
        url := left(url, 300);
      elsif url ~* '^https://[a-z0-9.-]+/storage/v1/object/public/product-media/[a-z0-9._/-]+\.(mp4|webm|mov)(\?.*)?$' then
        url := left(split_part(url, '?', 1), 500);
      else
        url := '';
      end if;
      if handle <> '' or url <> '' then
        stories := stories || jsonb_build_array(jsonb_build_object('handle', handle, 'url', url));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'steps') = 'array' then
    for item in select value from jsonb_array_elements(raw->'steps') limit 8 loop
      title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 80);
      body := private.clean_copy(item->>'body', 500);
      if title <> '' and body <> '' then
        steps := steps || jsonb_build_array(jsonb_build_object('title', title, 'body', body));
      end if;
    end loop;
  end if;

  intro := private.clean_copy(raw->>'ingredientsIntro', 300);

  if jsonb_typeof(raw->'ingredients') = 'array' then
    for item in select value from jsonb_array_elements(raw->'ingredients') limit 12 loop
      name_en := left(btrim(regexp_replace(coalesce(item->>'en', ''), '[[:cntrl:]]', '', 'g')), 40);
      name_he := left(btrim(regexp_replace(coalesce(item->>'he', ''), '[[:cntrl:]]', '', 'g')), 40);
      body := private.clean_copy(item->>'body', 500);
      if (name_en <> '' or name_he <> '') and body <> '' then
        ingredients := ingredients || jsonb_build_array(jsonb_build_object('en', name_en, 'he', name_he, 'body', body));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'inci') = 'array' then
    for item in select value from jsonb_array_elements(raw->'inci') limit 60 loop
      inci_name := left(btrim(regexp_replace(coalesce(item->>'inci', ''), '[[:cntrl:]]', '', 'g')), 240);
      inci_he := left(btrim(regexp_replace(coalesce(item->>'he', ''), '[[:cntrl:]]', '', 'g')), 80);
      if inci_name <> '' then
        inci_row := jsonb_build_object('inci', inci_name, 'he', inci_he);
        if item->>'key' = 'true' then
          inci_row := inci_row || jsonb_build_object('key', true);
        end if;
        inci := inci || jsonb_build_array(inci_row);
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'reviews') = 'array' then
    for item in select value from jsonb_array_elements(raw->'reviews') limit 80 loop
      person := left(btrim(regexp_replace(coalesce(item->>'name', ''), '[[:cntrl:]]', '', 'g')), 80);
      review_title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 120);
      body := private.clean_copy(item->>'body', 1000);
      review_date := left(btrim(regexp_replace(coalesce(item->>'date', ''), '[[:cntrl:]]', '', 'g')), 40);
      stars := case when coalesce(item->>'rating', '') ~ '^[1-5]$' then (item->>'rating')::int else 5 end;
      if person <> '' and body <> '' then
        reviews := reviews || jsonb_build_array(jsonb_build_object(
          'name', person,
          'title', review_title,
          'body', body,
          'date', review_date,
          'rating', stars,
          'verified', item->>'verified' = 'true'
        ));
      end if;
    end loop;
  end if;

  if panels = '[]'::jsonb
    and stories = '[]'::jsonb
    and steps = '[]'::jsonb
    and ingredients = '[]'::jsonb
    and inci = '[]'::jsonb
    and reviews = '[]'::jsonb
    and highlights = '[]'::jsonb
    and faqs = '[]'::jsonb
    and intro = '' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'highlights', highlights,
    'faqs', faqs,
    'panels', panels,
    'stories', stories,
    'steps', steps,
    'ingredientsIntro', intro,
    'ingredients', ingredients,
    'inci', inci,
    'reviews', reviews
  );
end;
$$;

revoke all on function private.clean_product_page(jsonb) from public, anon, authenticated;
