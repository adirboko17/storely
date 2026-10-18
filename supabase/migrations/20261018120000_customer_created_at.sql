-- The customer page needs the real creation time. The snapshot already
-- returns the rest of the profile, and this only adds createdAt.

do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.store_admin_snapshot(uuid)'::regprocedure);
  if position('''createdAt'', customer.created_at' in src) = 0 then
    if position('''id'', customer.id,' in src) = 0 then
      raise exception 'admin snapshot is missing the customer profile';
    end if;
    src := replace(
      src,
      '''id'', customer.id,',
      '''id'', customer.id, ''createdAt'', customer.created_at,'
    );
    execute src;
  end if;
end $$;
