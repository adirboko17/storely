-- One homepage quiz per store. The admin edits the question graph.
-- storefront_shop returns the flow only while the quiz is active.

create table if not exists public.store_quizzes (
  store_id uuid primary key references public.stores (id) on delete cascade,
  status text not null default 'draft',
  flow jsonb not null,
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'active')),
  check (jsonb_typeof(flow) = 'object'),
  check (octet_length(flow::text) <= 120000)
);

comment on table public.store_quizzes is
  'The storefront 5% quiz. Drafts stay in the admin. The active row is copied into storefront_shop.';

alter table public.store_quizzes enable row level security;
alter table public.store_quizzes force row level security;

drop trigger if exists store_quizzes_lock_store on public.store_quizzes;
create trigger store_quizzes_lock_store
  before update on public.store_quizzes
  for each row execute function private.reject_store_id_change();

revoke all on table public.store_quizzes from public, anon;
grant select, insert, update, delete on table public.store_quizzes to authenticated;

drop policy if exists store_quizzes_select on public.store_quizzes;
drop policy if exists store_quizzes_insert on public.store_quizzes;
drop policy if exists store_quizzes_update on public.store_quizzes;
drop policy if exists store_quizzes_delete on public.store_quizzes;

create policy store_quizzes_select on public.store_quizzes
  for select to authenticated
  using ((select private.can_read_marketing(store_id)));

create policy store_quizzes_insert on public.store_quizzes
  for insert to authenticated
  with check ((select private.can_write_marketing(store_id)));

create policy store_quizzes_update on public.store_quizzes
  for update to authenticated
  using ((select private.can_write_marketing(store_id)))
  with check ((select private.can_write_marketing(store_id)));

create policy store_quizzes_delete on public.store_quizzes
  for delete to authenticated
  using ((select private.can_write_marketing(store_id)));

do $$
declare
  src text;
  old text;
  patched text;
begin
  src := pg_get_functiondef('public.storefront_shop(text, text)'::regprocedure);
  if position('public.store_quizzes' in src) = 0 then
    old := $old$        order by popup.updated_at desc
        limit 20
      ) as item
    ), '[]'::jsonb)
  );
end;$old$;
    patched := $new$        order by popup.updated_at desc
        limit 20
      ) as item
    ), '[]'::jsonb),
    'quiz', (
      select quiz.flow
      from public.store_quizzes as quiz
      where quiz.store_id = found_store
        and quiz.status = 'active'
    )
  );
end;$new$;
    if position(old in src) = 0 then
      raise exception 'storefront_shop popup block missing';
    end if;
    execute replace(src, old, patched);
  end if;
end $$;
