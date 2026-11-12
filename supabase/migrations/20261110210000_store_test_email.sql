-- A store manager can send one test email immediately, to check that Resend delivers.

create table if not exists private.test_mail_log (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  recipient text not null,
  ok boolean not null,
  sent_at timestamptz not null default now()
);

alter table private.test_mail_log enable row level security;
alter table private.test_mail_log force row level security;
revoke all on table private.test_mail_log from public, anon, authenticated;

create index if not exists test_mail_log_store_sent_idx
  on private.test_mail_log (store_id, sent_at desc);

create or replace function public.send_store_test_email(
  target_store uuid,
  recipient text,
  recipient_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_email text := lower(btrim(coalesce(recipient, '')));
  clean_name text := left(btrim(coalesce(recipient_name, '')), 80);
  store_name text := 'החנות';
  subject text;
  html text;
  plain text;
  sent boolean;
  recent integer;
begin
  if not private.can_manage_store(target_store) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'reason', 'כתובת המייל לא תקינה');
  end if;
  if not exists (
    select 1
    from private.store_messaging as saved
    where saved.store_id = target_store
      and saved.resend_api_key <> ''
      and saved.resend_from_email <> ''
  ) then
    return jsonb_build_object('ok', false, 'reason', 'Resend עדיין לא מחובר לחנות');
  end if;

  select count(*)
  into recent
  from private.test_mail_log as sent_mail
  where sent_mail.store_id = target_store
    and sent_mail.sent_at > now() - interval '1 hour';
  if recent >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'אפשר עד 20 שליחות בדיקה בשעה');
  end if;

  select coalesce(nullif(btrim(settings.display_name), ''), store.name, 'החנות')
  into store_name
  from public.stores as store
  left join public.store_settings as settings on settings.store_id = store.id
  where store.id = target_store;

  subject := 'בדיקת מייל מ' || store_name;
  plain := case when clean_name = '' then 'שלום,' else 'שלום ' || clean_name || ',' end
    || E'\n\nזה מייל בדיקה שנשלח עכשיו מ' || store_name || '. אם הוא הגיע, החיבור עובד.';
  html := '<div dir="rtl" style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;">'
    || '<p style="margin:0 0 12px;">'
    || case when clean_name = '' then 'שלום,' else 'שלום ' || private.mail_escape(clean_name) || ',' end
    || '</p><p style="margin:0;">זה מייל בדיקה שנשלח עכשיו מ<b>'
    || private.mail_escape(store_name)
    || '</b>. אם הוא הגיע, החיבור עובד.</p></div>';

  sent := private.resend_send(target_store, clean_email, subject, html, plain);
  insert into private.test_mail_log (store_id, recipient, ok)
  values (target_store, clean_email, sent);
  if not sent then
    return jsonb_build_object('ok', false, 'reason', 'Resend לא שלח את המייל. ודאו שהדומיין מאומת.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.send_store_test_email(uuid, text, text) from public, anon;
grant execute on function public.send_store_test_email(uuid, text, text) to authenticated;
