-- A product panel can end with a labeled link or an article on the site.

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
  person text;
  review_title text;
  review_date text;
  highlight text;
  question text;
  answer text;
  topic text;
  link_kind text;
  link_label text;
  link_href text;
  panel_link jsonb;
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
      answer := left(btrim(regexp_replace(coalesce(item->>'a', ''), '[[:cntrl:]]', '', 'g')), 1000);
      topic := coalesce(item->>'tag', '');
      if question <> '' and answer <> '' and topic in ('use', 'ing', 'post', 'buy') then
        faqs := faqs || jsonb_build_array(jsonb_build_object('q', question, 'a', answer, 'tag', topic));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'panels') = 'array' then
    for item in select value from jsonb_array_elements(raw->'panels') limit 8 loop
      title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 80);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 4000);
      link_kind := coalesce(item #>> '{link,kind}', '');
      link_label := left(btrim(regexp_replace(coalesce(item #>> '{link,label}', ''), '[[:cntrl:]]', '', 'g')), 120);
      link_href := left(btrim(regexp_replace(coalesce(item #>> '{link,href}', ''), '[[:cntrl:]]', '', 'g')), 300);
      panel_link := null;
      if link_label <> '' and position('..' in link_href) = 0 then
        if link_kind = 'article' and link_href ~ '^/articles/[a-z0-9-]+$' then
          panel_link := jsonb_build_object('kind', 'article', 'label', link_label, 'href', link_href);
        elsif link_kind = 'url' and (link_href ~* '^https://\S+$' or link_href ~ '^/[^/[:space:]]') then
          panel_link := jsonb_build_object('kind', 'url', 'label', link_label, 'href', link_href);
        end if;
      end if;
      if title <> '' and body <> '' then
        panels := panels || jsonb_build_array(
          case
            when panel_link is null then jsonb_build_object('title', title, 'body', body)
            else jsonb_build_object('title', title, 'body', body, 'link', panel_link)
          end
        );
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
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 500);
      if title <> '' and body <> '' then
        steps := steps || jsonb_build_array(jsonb_build_object('title', title, 'body', body));
      end if;
    end loop;
  end if;

  intro := left(btrim(regexp_replace(coalesce(raw->>'ingredientsIntro', ''), '[[:cntrl:]]', '', 'g')), 300);

  if jsonb_typeof(raw->'ingredients') = 'array' then
    for item in select value from jsonb_array_elements(raw->'ingredients') limit 12 loop
      name_en := left(btrim(regexp_replace(coalesce(item->>'en', ''), '[[:cntrl:]]', '', 'g')), 40);
      name_he := left(btrim(regexp_replace(coalesce(item->>'he', ''), '[[:cntrl:]]', '', 'g')), 40);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 500);
      if (name_en <> '' or name_he <> '') and body <> '' then
        ingredients := ingredients || jsonb_build_array(jsonb_build_object('en', name_en, 'he', name_he, 'body', body));
      end if;
    end loop;
  end if;

  if jsonb_typeof(raw->'reviews') = 'array' then
    for item in select value from jsonb_array_elements(raw->'reviews') limit 30 loop
      person := left(btrim(regexp_replace(coalesce(item->>'name', ''), '[[:cntrl:]]', '', 'g')), 80);
      review_title := left(btrim(regexp_replace(coalesce(item->>'title', ''), '[[:cntrl:]]', '', 'g')), 120);
      body := left(btrim(regexp_replace(coalesce(item->>'body', ''), '[[:cntrl:]]', '', 'g')), 1000);
      review_date := left(btrim(regexp_replace(coalesce(item->>'date', ''), '[[:cntrl:]]', '', 'g')), 40);
      if person <> '' and body <> '' then
        reviews := reviews || jsonb_build_array(jsonb_build_object(
          'name', person,
          'title', review_title,
          'body', body,
          'date', review_date,
          'verified', item->>'verified' = 'true'
        ));
      end if;
    end loop;
  end if;

  if panels = '[]'::jsonb
    and stories = '[]'::jsonb
    and steps = '[]'::jsonb
    and ingredients = '[]'::jsonb
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
    'reviews', reviews
  );
end;
$$;

revoke all on function private.clean_product_page(jsonb) from public, anon, authenticated;
