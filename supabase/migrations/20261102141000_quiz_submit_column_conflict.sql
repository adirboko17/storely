-- Parameter names matched table columns, so the insert raised an ambiguity error.
-- Column names win inside SQL. The website still calls the same argument names.

create or replace function public.submit_store_quiz(
  tracking_key text,
  hostname text,
  email text,
  person_name text,
  phone text,
  answers jsonb,
  marketing_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  found_store uuid;
  email_key text := lower(btrim(coalesce(email, '')));
  clean_name text := left(btrim(coalesce(person_name, '')), 80);
  phone_key text := left(btrim(coalesce(phone, '')), 40);
  consent_flag boolean := coalesce(marketing_consent, false);
  quiz_flow jsonb;
  clean_answers jsonb := '[]'::jsonb;
  answer_item jsonb;
  question_id text;
  choice_id text;
  question_row jsonb;
  seen_questions text := '';
  recent_count integer;
  response_id uuid;
  remembered_id uuid;
  consented boolean;
begin
  if email_key !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or octet_length(email_key) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'האימייל לא תקין');
  end if;
  if jsonb_typeof(answers) is distinct from 'array'
    or jsonb_array_length(answers) < 1
    or jsonb_array_length(answers) > 12
    or octet_length(answers::text) > 8000 then
    return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
  end if;
  found_store := private.resolve_storefront(tracking_key, hostname);
  if found_store is null then
    return jsonb_build_object('ok', false, 'reason', 'החנות לא נמצאה');
  end if;
  select quiz.flow into quiz_flow
  from public.store_quizzes as quiz
  where quiz.store_id = found_store;
  for answer_item in select value from jsonb_array_elements(answers) loop
    if jsonb_typeof(answer_item) is distinct from 'object' then
      return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
    end if;
    question_id := answer_item->>'questionId';
    choice_id := answer_item->>'choiceId';
    if question_id !~ '^[A-Za-z0-9_-]{1,40}$' or choice_id !~ '^[A-Za-z0-9_-]{1,40}$' then
      return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
    end if;
    if position(('|' || question_id || '|') in seen_questions) > 0 then
      continue;
    end if;
    question_row := null;
    if quiz_flow is not null then
      select item into question_row
      from jsonb_array_elements(coalesce(quiz_flow->'questions', '[]'::jsonb)) as item
      where item->>'id' = question_id
      limit 1;
      if question_row is not null and not exists (
        select 1
        from jsonb_array_elements(coalesce(question_row->'choices', '[]'::jsonb)) as choice
        where choice->>'id' = choice_id
      ) then
        return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
      end if;
    end if;
    seen_questions := seen_questions || '|' || question_id || '|';
    clean_answers := clean_answers || jsonb_build_array(jsonb_build_object('questionId', question_id, 'choiceId', choice_id));
    if jsonb_array_length(clean_answers) >= 12 then
      exit;
    end if;
  end loop;
  if jsonb_array_length(clean_answers) < 1 then
    return jsonb_build_object('ok', false, 'reason', 'התשובות לא תקינות');
  end if;
  select count(*) into recent_count
  from public.store_quiz_responses as response
  where response.store_id = found_store
    and response.updated_at > now() - interval '1 minute';
  if recent_count >= 40 then
    return jsonb_build_object('ok', false, 'reason', 'נסו שוב בעוד רגע');
  end if;
  insert into public.store_quiz_responses (store_id, email, name, phone, answers, marketing_consent)
  values (found_store, email_key, clean_name, phone_key, clean_answers, consent_flag)
  on conflict (store_id, email) do update
  set name = excluded.name,
      phone = excluded.phone,
      answers = excluded.answers,
      marketing_consent = public.store_quiz_responses.marketing_consent or excluded.marketing_consent,
      updated_at = now()
  returning id, marketing_consent into response_id, consented;
  if consented then
    perform private.popup_subscribe(found_store, email_key, clean_name);
    select customer.id into remembered_id
    from public.customers as customer
    where customer.store_id = found_store
      and lower(customer.email) = email_key
    order by customer.created_at
    limit 1;
    if remembered_id is not null and phone_key <> '' then
      update public.customers as customer
      set phone = phone_key
      where customer.store_id = found_store
        and customer.id = remembered_id
        and btrim(coalesce(customer.phone, '')) = '';
    end if;
    update public.store_quiz_responses as response
    set customer_id = remembered_id
    where response.id = response_id
      and response.store_id = found_store;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_store_quiz(text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_store_quiz(text, text, text, text, text, jsonb, boolean) to anon, authenticated;
