-- Resend sends the store owner a full order email, and sends customer emails that an automation is due to send.

create table if not exists private.marketing_jobs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  event text not null,
  dedupe text not null,
  recipient text not null,
  subject text not null,
  html text not null,
  plain text not null,
  send_at timestamptz not null default now(),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint marketing_jobs_status_check check (status in ('pending', 'sent', 'failed', 'cancelled')),
  constraint marketing_jobs_dedupe_key unique (dedupe)
);

alter table private.marketing_jobs enable row level security;
alter table private.marketing_jobs force row level security;
revoke all on table private.marketing_jobs from public, anon, authenticated;

create table if not exists private.order_mail_log (
  order_id uuid primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table private.order_mail_log enable row level security;
alter table private.order_mail_log force row level security;
revoke all on table private.order_mail_log from public, anon, authenticated;

create or replace function private.mail_escape(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(coalesce(raw, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

revoke all on function private.mail_escape(text) from public, anon, authenticated;

create or replace function private.resend_send(
  target_store uuid,
  recipient text,
  subject text,
  html text,
  plain text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  api_key text;
  from_email text;
  from_name text;
  sender text;
  response extensions.http_response;
begin
  if recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;
  if btrim(coalesce(subject, '')) = '' then
    return false;
  end if;
  select saved.resend_api_key, saved.resend_from_email, saved.resend_from_name
  into api_key, from_email, from_name
  from private.store_messaging as saved
  where saved.store_id = target_store;
  if coalesce(api_key, '') = '' or coalesce(from_email, '') = '' then
    return false;
  end if;
  sender := case
    when btrim(coalesce(from_name, '')) = '' then from_email
    else replace(replace(from_name, '<', ''), '>', '') || ' <' || from_email || '>'
  end;
  response := extensions.http((
    'POST',
    'https://api.resend.com/emails',
    array[
      extensions.http_header('Authorization', 'Bearer ' || api_key),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    jsonb_build_object(
      'from', sender,
      'to', jsonb_build_array(recipient),
      'subject', left(subject, 180),
      'html', left(coalesce(html, ''), 80000),
      'text', left(coalesce(plain, ''), 20000)
    )::text
  )::extensions.http_request);
  return response.status = 200 and position('"id"' in coalesce(response.content, '')) > 0;
exception
  when others then
    return false;
end;
$$;

revoke all on function private.resend_send(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function private.fill_mail_tokens(raw text, context jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  result text := coalesce(raw, '');
begin
  result := replace(result, '{first_name}', split_part(btrim(coalesce(context->>'name', '')), ' ', 1));
  result := replace(result, '{full_name}', coalesce(context->>'name', ''));
  result := replace(result, '{email}', coalesce(context->>'email', ''));
  result := replace(result, '{store_name}', coalesce(context->>'storeName', ''));
  result := replace(result, '{store_url}', coalesce(context->>'storeUrl', ''));
  result := replace(result, '{checkout_url}', coalesce(context->>'checkoutUrl', ''));
  result := replace(result, '{account_url}', coalesce(context->>'storeUrl', ''));
  result := replace(result, '{cart_items}', coalesce(context->>'items', ''));
  result := replace(result, '{cart_total}', coalesce(context->>'total', ''));
  return result;
end;
$$;

revoke all on function private.fill_mail_tokens(text, jsonb) from public, anon, authenticated;

create or replace function private.marketing_letter(target_store uuid, email_id text, step jsonb, context jsonb)
returns table (subject text, html text, plain text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  message jsonb;
  block jsonb;
  body text := '';
  html_body text := '';
  chosen_subject text;
  filled text;
begin
  select item
  into message
  from public.store_settings as settings
  cross join lateral jsonb_array_elements(coalesce(settings.marketing->'emails', '[]'::jsonb)) as item
  where settings.store_id = target_store
    and item->>'id' = coalesce(email_id, '')
  limit 1;

  chosen_subject := private.fill_mail_tokens(coalesce(message->>'subject', step->>'subject', ''), context);
  if message is not null then
    for block in select value from jsonb_array_elements(coalesce(message->'blocks', '[]'::jsonb)) as value
    loop
      if block->>'type' in ('heading', 'text') and btrim(coalesce(block->>'text', '')) <> '' then
        filled := private.fill_mail_tokens(block->>'text', context);
        body := body || case when body = '' then '' else E'\n\n' end || filled;
        html_body := html_body || '<p style="margin:0 0 12px;">' || replace(private.mail_escape(filled), E'\n', '<br>') || '</p>';
      elsif block->>'type' = 'button' and btrim(coalesce(block->>'label', '')) <> '' then
        filled := private.fill_mail_tokens(block->>'label', context);
        body := body || case when body = '' then '' else E'\n' end || filled || ' ' || private.fill_mail_tokens(coalesce(block->>'href', ''), context);
        html_body := html_body || '<p style="margin:16px 0;"><a href="' || private.mail_escape(private.fill_mail_tokens(coalesce(block->>'href', ''), context)) || '" style="color:#1a1a1a;">' || private.mail_escape(filled) || '</a></p>';
      end if;
    end loop;
  end if;
  if body = '' then
    body := private.fill_mail_tokens(coalesce(step->>'body', ''), context);
    html_body := '<p style="margin:0;">' || replace(private.mail_escape(body), E'\n', '<br>') || '</p>';
  end if;
  chosen_subject := btrim(chosen_subject);
  if chosen_subject = '' or btrim(body) = '' then
    return;
  end if;
  subject := chosen_subject;
  plain := body;
  html := '<div dir="rtl" style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;">' || html_body || '</div>';
  return next;
end;
$$;

revoke all on function private.marketing_letter(uuid, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function private.queue_flow_mail(
  target_store uuid,
  event_name text,
  flow_id text,
  step_key text,
  delay interval,
  recipient text,
  context jsonb,
  step jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  letter record;
begin
  select * into letter from private.marketing_letter(target_store, step->>'emailId', step, context);
  if letter.subject is null then
    return;
  end if;
  insert into private.marketing_jobs (store_id, event, dedupe, recipient, subject, html, plain, send_at)
  values (
    target_store,
    event_name,
    target_store::text || ':' || flow_id || ':' || step_key || ':' || lower(recipient) || ':' || coalesce(context->>'ref', ''),
    lower(recipient),
    letter.subject,
    letter.html,
    letter.plain,
    now() + delay
  )
  on conflict (dedupe) do nothing;
end;
$$;

revoke all on function private.queue_flow_mail(uuid, text, text, text, interval, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function private.walk_flow_steps(
  target_store uuid,
  event_name text,
  flow_id text,
  steps jsonb,
  delay interval,
  recipient text,
  context jsonb,
  path text
)
returns interval
language plpgsql
security definer
set search_path = ''
as $$
declare
  step jsonb;
  index integer := 0;
  amount numeric;
  next_delay interval := delay;
begin
  for step in select value from jsonb_array_elements(coalesce(steps, '[]'::jsonb)) as value
  loop
    index := index + 1;
    if step->>'type' = 'wait' then
      amount := least(coalesce(nullif(step->>'value', '')::numeric, 0), 90);
      next_delay := next_delay + case step->>'unit'
        when 'דקות' then make_interval(mins => amount::integer)
        when 'ימים' then make_interval(days => amount::integer)
        else make_interval(hours => amount::integer)
      end;
    elsif step->>'type' = 'email' then
      perform private.queue_flow_mail(target_store, event_name, flow_id, path || index::text, next_delay, recipient, context, step);
    elsif step->>'type' = 'both' then
      next_delay := private.walk_flow_steps(target_store, event_name, flow_id, step->'mail', next_delay, recipient, context, path || index::text || 'm');
    elsif step->>'type' = 'cond' then
      next_delay := private.walk_flow_steps(target_store, event_name, flow_id, step->'yes', next_delay, recipient, context, path || index::text || 'y');
    elsif step->>'type' = 'ab' then
      next_delay := private.walk_flow_steps(target_store, event_name, flow_id, step->'a', next_delay, recipient, context, path || index::text || 'a');
    elsif step->>'type' = 'end' then
      exit;
    end if;
  end loop;
  return next_delay;
end;
$$;

revoke all on function private.walk_flow_steps(uuid, text, text, jsonb, interval, text, jsonb, text) from public, anon, authenticated;

create or replace function private.dispatch_marketing(target_store uuid, event_name text, context jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  flow jsonb;
  recipient text := lower(btrim(coalesce(context->>'email', '')));
  wanted text;
  store_name text;
  store_host text;
  ready jsonb;
begin
  if recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return;
  end if;
  if not exists (
    select 1 from private.store_messaging as saved
    where saved.store_id = target_store
      and saved.email_marketing
      and saved.resend_api_key <> ''
      and saved.resend_from_email <> ''
  ) then
    return;
  end if;
  wanted := case event_name
    when 'paid' then 'הזמנה שולמה'
    when 'checkout' then 'התחיל תשלום ולא סיים'
    when 'cart' then 'הלקוח נטש עגלה'
    when 'fulfilled' then 'הזמנה סופקה'
    when 'subscribed' then 'לקוח נרשם לדיוור'
    when 'created' then 'לקוח חדש נוצר'
    else ''
  end;
  if wanted = '' then
    return;
  end if;

  select coalesce(settings.display_name, ''),
         coalesce((
           select domain.hostname from public.store_domains as domain
           where domain.store_id = target_store and domain.verified_at is not null
           order by domain.hostname = coalesce(context->>'host', '') desc
           limit 1
         ), '')
  into store_name, store_host
  from public.store_settings as settings
  where settings.store_id = target_store;

  ready := context || jsonb_build_object(
    'storeName', store_name,
    'storeUrl', case when store_host = '' then '' else 'https://' || store_host end
  );
  if coalesce(ready->>'checkoutUrl', '') = '' and store_host <> '' then
    ready := ready || jsonb_build_object('checkoutUrl', 'https://' || store_host || '/checkout');
  end if;

  for flow in
    select value
    from public.store_settings as settings
    cross join lateral jsonb_array_elements(coalesce(settings.marketing->'flows', '[]'::jsonb)) as value
    where settings.store_id = target_store
      and coalesce(value->>'on', 'false') = 'true'
      and value->>'trigger' = wanted
  loop
    perform private.walk_flow_steps(
      target_store,
      event_name,
      coalesce(flow->>'id', wanted),
      flow->'steps',
      interval '0',
      recipient,
      ready,
      ''
    );
  end loop;
end;
$$;

revoke all on function private.dispatch_marketing(uuid, text, jsonb) from public, anon, authenticated;

create or replace function private.flush_marketing_mail()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.marketing_jobs%rowtype;
  sent boolean;
begin
  for job in
    select *
    from private.marketing_jobs as queued
    where queued.status = 'pending'
      and queued.send_at <= now()
    order by queued.send_at
    limit 25
    for update skip locked
  loop
    sent := private.resend_send(job.store_id, job.recipient, job.subject, job.html, job.plain);
    update private.marketing_jobs
    set status = case when sent then 'sent' else 'failed' end
    where id = job.id;
  end loop;
end;
$$;

revoke all on function private.flush_marketing_mail() from public, anon, authenticated;

create or replace function private.mail_new_order(target_store uuid, target_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.orders%rowtype;
  customer_name text := '';
  customer_email text := '';
  customer_phone text := '';
  owner_email text;
  items text := '';
  plain_items text := '';
  html text;
  plain text;
  subject text;
  sent_count integer := 0;
begin
  if exists (select 1 from private.order_mail_log where order_id = target_order) then
    return;
  end if;
  if not exists (
    select 1 from private.store_messaging as saved
    where saved.store_id = target_store
      and saved.resend_api_key <> ''
      and saved.resend_from_email <> ''
  ) then
    return;
  end if;

  select * into sale from public.orders where id = target_order and store_id = target_store;
  if sale.id is null then
    return;
  end if;
  select coalesce(customer.name, ''), coalesce(customer.email, ''), coalesce(customer.phone, '')
  into customer_name, customer_email, customer_phone
  from public.customers as customer
  where customer.store_id = target_store and customer.id = sale.customer_id;

  select coalesce(string_agg(
    private.mail_escape(item.title) || ' × ' || item.quantity::text || ' · ' || trim(to_char(item.unit_price, 'FM999999990.00')) || ' ₪',
    '<br>'
    order by item.id
  ), ''),
  coalesce(string_agg(
    item.title || ' × ' || item.quantity::text || ' · ' || trim(to_char(item.unit_price, 'FM999999990.00')) || ' ₪',
    E'\n'
    order by item.id
  ), '')
  into items, plain_items
  from public.order_items as item
  where item.store_id = target_store and item.order_id = sale.id;

  subject := 'הזמנה חדשה #' || sale.order_number::text;
  plain := 'הזמנה #' || sale.order_number::text || E'\n'
    || customer_name || E'\n' || customer_email || E'\n' || customer_phone || E'\n'
    || plain_items || E'\n'
    || coalesce(sale.shipping_name, '') || E'\n'
    || 'סכום ' || trim(to_char(sale.total, 'FM999999990.00')) || ' ₪';
  html := '<div dir="rtl" style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;">'
    || '<h2 style="margin:0 0 12px;">הזמנה חדשה #' || sale.order_number::text || '</h2>'
    || '<p style="margin:0 0 8px;"><b>' || private.mail_escape(customer_name) || '</b><br>'
    || private.mail_escape(customer_email) || '<br>' || private.mail_escape(customer_phone) || '</p>'
    || '<p style="margin:0 0 8px;">' || items || '</p>'
    || '<p style="margin:0;">משלוח: ' || private.mail_escape(coalesce(sale.shipping_name, ''))
    || ' · ' || trim(to_char(coalesce(sale.shipping_amount, 0), 'FM999999990.00')) || ' ₪<br>'
    || 'הנחה: ' || trim(to_char(coalesce(sale.discount_amount, 0), 'FM999999990.00')) || ' ₪<br>'
    || '<b>לתשלום: ' || trim(to_char(sale.total, 'FM999999990.00')) || ' ₪</b></p></div>';

  for owner_email in
    select account.email
    from public.store_members as member
    join public.roles as role
      on role.store_id = member.store_id
     and role.id = member.role_id
    join auth.users as account on account.id = member.user_id
    where member.store_id = target_store
      and role.key = 'owner'
      and account.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  loop
    if private.resend_send(target_store, owner_email, subject, html, plain) then
      sent_count := sent_count + 1;
    end if;
  end loop;
  if sent_count > 0 then
    insert into private.order_mail_log (order_id, store_id)
    values (target_order, target_store)
    on conflict (order_id) do nothing;
  end if;

  if customer_email <> '' then
    update private.marketing_jobs
    set status = 'cancelled'
    where store_id = target_store
      and recipient = lower(customer_email)
      and status = 'pending'
      and event in ('checkout', 'cart');
    perform private.dispatch_marketing(target_store, 'paid', jsonb_build_object(
      'email', customer_email,
      'name', customer_name,
      'items', plain_items,
      'total', trim(to_char(sale.total, 'FM999999990.00')) || ' ₪',
      'ref', sale.order_number::text
    ));
  end if;
  perform private.flush_marketing_mail();
end;
$$;

revoke all on function private.mail_new_order(uuid, uuid) from public, anon, authenticated;

create or replace function private.after_paid_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' then
    perform private.mail_new_order(new.store_id, new.order_id);
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function private.after_paid_payment() from public, anon, authenticated;

drop trigger if exists payments_mail_new_order on public.payments;
create trigger payments_mail_new_order
after insert on public.payments
for each row execute function private.after_paid_payment();

create or replace function public.store_resend_status(target_store uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  saved private.store_messaging%rowtype;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into saved from private.store_messaging where store_id = target_store;
  if not found then
    return jsonb_build_object('connected', false, 'fromEmail', '', 'fromName', '');
  end if;
  return jsonb_build_object(
    'connected', saved.resend_api_key <> '' and saved.resend_from_email <> '',
    'fromEmail', saved.resend_from_email,
    'fromName', saved.resend_from_name
  );
end;
$$;

revoke all on function public.store_resend_status(uuid) from public, anon;
grant execute on function public.store_resend_status(uuid) to authenticated;

create or replace function public.save_store_resend(
  target_store uuid,
  api_key text,
  from_email text,
  from_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing private.store_messaging%rowtype;
  next_key text;
  next_email text := lower(btrim(coalesce(from_email, '')));
  next_name text := left(btrim(coalesce(from_name, '')), 80);
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into existing from private.store_messaging where store_id = target_store;
  next_key := case
    when btrim(coalesce(api_key, '')) = '' then coalesce(existing.resend_api_key, '')
    else btrim(api_key)
  end;
  if next_key <> '' and next_key !~ '^re_[A-Za-z0-9_-]{20,200}$' then
    raise exception 'מפתח Resend לא תקין' using errcode = '22023';
  end if;
  if next_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'כתובת השולח לא תקינה' using errcode = '22023';
  end if;
  if next_key = '' then
    raise exception 'הדביקו את מפתח ה-API' using errcode = '22023';
  end if;

  insert into private.store_messaging as saved (
    store_id, resend_api_key, resend_from_email, resend_from_name, email_marketing, email_login,
    pulseem_user, pulseem_password, pulseem_from, sms_marketing, sms_login
  )
  values (
    target_store, next_key, next_email, next_name, true, coalesce(existing.email_login, false),
    coalesce(existing.pulseem_user, ''), coalesce(existing.pulseem_password, ''), coalesce(existing.pulseem_from, ''),
    coalesce(existing.sms_marketing, false), coalesce(existing.sms_login, false)
  )
  on conflict (store_id) do update
  set resend_api_key = excluded.resend_api_key,
      resend_from_email = excluded.resend_from_email,
      resend_from_name = excluded.resend_from_name,
      email_marketing = true,
      updated_at = now();
  return public.store_resend_status(target_store);
end;
$$;

revoke all on function public.save_store_resend(uuid, text, text, text) from public, anon;
grant execute on function public.save_store_resend(uuid, text, text, text) to authenticated;

create or replace function public.clear_store_resend(target_store uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.store_messaging
  set resend_api_key = '',
      resend_from_email = '',
      resend_from_name = '',
      email_marketing = false,
      updated_at = now()
  where store_id = target_store;
  return public.store_resend_status(target_store);
end;
$$;

revoke all on function public.clear_store_resend(uuid) from public, anon;
grant execute on function public.clear_store_resend(uuid) to authenticated;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'storely-flush-marketing-mail') then
    return;
  end if;
  perform cron.schedule('storely-flush-marketing-mail', '* * * * *', 'select private.flush_marketing_mail()');
end
$cron$;
