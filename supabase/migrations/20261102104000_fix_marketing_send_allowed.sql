-- The suppression lookup compared marketing_suppressions.address to itself,
-- because the unqualified address parameter was hidden by that column.
-- Any suppression in the store then blocked every recipient.

create or replace function private.marketing_send_allowed(
  target_store uuid,
  channel text,
  address text,
  purpose text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    marketing_send_allowed.target_store is not null
    and marketing_send_allowed.channel in ('email', 'sms')
    and marketing_send_allowed.purpose in ('marketing', 'transactional')
    and btrim(coalesce(marketing_send_allowed.address, '')) <> ''
    and not exists (
      select 1
      from public.marketing_suppressions as blocked
      where blocked.store_id = marketing_send_allowed.target_store
        and blocked.channel = marketing_send_allowed.channel
        and blocked.address = case
          when marketing_send_allowed.channel = 'email' then lower(btrim(marketing_send_allowed.address))
          else btrim(marketing_send_allowed.address)
        end
        and (
          marketing_send_allowed.purpose = 'marketing'
          or blocked.reason in ('bounce', 'complaint')
        )
    );
$$;

revoke all on function private.marketing_send_allowed(uuid, text, text, text) from public, anon, authenticated;

comment on function private.marketing_send_allowed(uuid, text, text, text) is
  'Marketing mail is blocked by every suppression. Transactional mail is blocked only by bounce or complaint.';
