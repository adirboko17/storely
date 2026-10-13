-- Postgres 17.11 on this project has gen_random_uuid() and does not have uuidv7().
-- Store rows are isolated by store_id. RLS is forced. The browser never receives service_role.

create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.reject_store_id_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.store_id is distinct from old.store_id then
    raise exception 'store_id cannot change';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_store_id_change() from public, anon;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  environment text not null check (environment in ('production', 'development')),
  core_version text not null default '0.1.0',
  created_at timestamptz not null default now()
);

create table public.store_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  hostname text not null,
  environment text not null check (environment in ('production', 'development')),
  verified_at timestamptz,
  unique (store_id, id),
  unique (hostname)
);

create index store_domains_store_idx on public.store_domains (store_id);

create or replace function private.domain_matches_store()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.stores
    where id = new.store_id
      and environment = new.environment
  ) then
    raise exception 'domain environment must match the store';
  end if;
  return new;
end;
$$;

create trigger store_domains_match_store
before insert or update on public.store_domains
for each row execute function private.domain_matches_store();

create table public.store_settings (
  store_id uuid primary key references public.stores (id),
  currency text not null default 'ILS',
  language text not null default 'he',
  display_name text not null
);

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  key text not null,
  name text not null,
  built_in boolean not null default false,
  unique (store_id, id),
  unique (store_id, key)
);

create table public.role_permissions (
  store_id uuid not null,
  role_id uuid not null,
  permission_key text not null references public.permissions (key),
  primary key (store_id, role_id, permission_key),
  foreign key (store_id, role_id) references public.roles (store_id, id)
);

create table public.store_members (
  store_id uuid not null references public.stores (id),
  user_id uuid not null references auth.users (id),
  role_id uuid not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id),
  foreign key (store_id, role_id) references public.roles (store_id, id)
);

create index store_members_user_idx on public.store_members (user_id, store_id);
create index store_members_active_idx on public.store_members (user_id, store_id) where status = 'active';

create table public.store_modules (
  store_id uuid not null references public.stores (id),
  module_id text not null,
  version text not null,
  enabled boolean not null default false,
  installed_at timestamptz not null default now(),
  primary key (store_id, module_id)
);

create table public.platform_operators (
  user_id uuid not null references auth.users (id),
  permission_key text not null,
  primary key (user_id, permission_key)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  title text not null,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  handle text,
  description text not null default '',
  vendor text not null default '',
  category text not null default '',
  price numeric(12, 2) not null default 0,
  compare_at numeric(12, 2),
  cost numeric(12, 2) not null default 0,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create unique index products_handle_idx on public.products (store_id, handle) where handle is not null;
create index products_status_idx on public.products (store_id, status, updated_at desc);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  title text not null default '',
  sku text,
  barcode text,
  price numeric(12, 2),
  position integer not null default 0,
  unique (store_id, id),
  foreign key (store_id, product_id) references public.products (store_id, id)
);

create unique index product_variants_sku_idx on public.product_variants (store_id, sku) where sku is not null;
create index product_variants_product_idx on public.product_variants (store_id, product_id);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  path text not null,
  position integer not null default 0,
  unique (store_id, id),
  foreign key (store_id, product_id) references public.products (store_id, id)
);

create index product_media_product_idx on public.product_media (store_id, product_id, position);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  title text not null,
  handle text not null,
  description text not null default '',
  unique (store_id, id),
  unique (store_id, handle)
);

create table public.collection_products (
  store_id uuid not null,
  collection_id uuid not null,
  product_id uuid not null,
  position integer not null default 0,
  primary key (store_id, collection_id, product_id),
  foreign key (store_id, collection_id) references public.collections (store_id, id),
  foreign key (store_id, product_id) references public.products (store_id, id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  variant_id uuid not null,
  available integer not null default 0,
  unique (store_id, id),
  unique (store_id, variant_id),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  inventory_item_id uuid not null,
  quantity integer not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, inventory_item_id) references public.inventory_items (store_id, id)
);

create index inventory_movements_store_idx on public.inventory_movements (store_id, created_at desc);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  name text not null,
  email text,
  phone text not null default '',
  created_at timestamptz not null default now(),
  unique (store_id, id)
);

create index customers_email_idx on public.customers (store_id, email);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  customer_id uuid not null,
  street text not null default '',
  city text not null default '',
  zip text not null default '',
  unique (store_id, id),
  foreign key (store_id, customer_id) references public.customers (store_id, id)
);

create index customer_addresses_customer_idx on public.customer_addresses (store_id, customer_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  customer_id uuid,
  financial_status text not null default 'pending',
  fulfillment_status text not null default 'unfulfilled',
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, customer_id) references public.customers (store_id, id)
);

create index orders_created_idx on public.orders (store_id, created_at desc);
create index orders_financial_idx on public.orders (store_id, financial_status);
create index orders_fulfillment_idx on public.orders (store_id, fulfillment_status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  variant_id uuid,
  title text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  unique (store_id, id),
  foreign key (store_id, order_id) references public.orders (store_id, id),
  foreign key (store_id, variant_id) references public.product_variants (store_id, id)
);

create index order_items_order_idx on public.order_items (store_id, order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  amount numeric(12, 2) not null,
  status text not null,
  unique (store_id, id),
  foreign key (store_id, order_id) references public.orders (store_id, id)
);

create index payments_order_idx on public.payments (store_id, order_id);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  payment_id uuid not null,
  amount numeric(12, 2) not null,
  unique (store_id, id),
  foreign key (store_id, payment_id) references public.payments (store_id, id)
);

create index refunds_payment_idx on public.refunds (store_id, payment_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  order_id uuid not null,
  status text not null default 'unfulfilled',
  unique (store_id, id),
  foreign key (store_id, order_id) references public.orders (store_id, id)
);

create index shipments_order_idx on public.shipments (store_id, order_id);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  code text,
  title text not null,
  status text not null default 'active',
  unique (store_id, id)
);

create unique index discounts_code_idx on public.discounts (store_id, code) where code is not null;

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  title text not null,
  handle text not null,
  unique (store_id, id),
  unique (store_id, handle)
);

create table public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  page_id uuid not null,
  position integer not null default 0,
  body text not null default '',
  unique (store_id, id),
  foreign key (store_id, page_id) references public.pages (store_id, id)
);

create index content_blocks_page_idx on public.content_blocks (store_id, page_id, position);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now(),
  unique (store_id, id)
);

create index audit_logs_store_idx on public.audit_logs (store_id, created_at desc);

create or replace function private.is_store_member(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members
    where store_id = target_store
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function private.has_store_permission(
  target_store uuid,
  permission_key text,
  require_active boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members as member
    join public.roles as role
      on role.store_id = member.store_id
     and role.id = member.role_id
    join public.stores as store
      on store.id = member.store_id
    where member.store_id = target_store
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and (not require_active or store.status = 'active')
      and (
        role.key = 'owner'
        or exists (
          select 1
          from public.role_permissions as grant_row
          where grant_row.store_id = member.store_id
            and grant_row.role_id = member.role_id
            and grant_row.permission_key = has_store_permission.permission_key
        )
      )
  );
$$;

create or replace function private.is_platform_operator(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_operators
    where user_id = (select auth.uid())
      and platform_operators.permission_key = is_platform_operator.permission_key
  );
$$;

revoke all on function private.is_store_member(uuid) from public, anon;
revoke all on function private.has_store_permission(uuid, text, boolean) from public, anon;
revoke all on function private.is_platform_operator(text) from public, anon;
grant execute on function private.is_store_member(uuid) to authenticated;
grant execute on function private.has_store_permission(uuid, text, boolean) to authenticated;

create or replace function private.copy_builtin_roles(target_store uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid;
  manager_id uuid;
  staff_id uuid;
  core_key text;
  admin_keys text[] := array[
    'products.read', 'products.create', 'products.update', 'products.delete',
    'orders.read', 'orders.create', 'orders.update',
    'customers.read', 'customers.create', 'customers.update',
    'discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete',
    'content.read', 'content.update',
    'analytics.read', 'settings.manage'
  ];
  manager_keys text[] := array[
    'products.read', 'products.update', 'orders.read', 'orders.update',
    'customers.read', 'analytics.read'
  ];
  staff_keys text[] := array['products.read', 'orders.read', 'orders.update', 'customers.read'];
begin
  insert into public.roles (store_id, key, name, built_in)
  values
    (target_store, 'owner', 'בעלים', true),
    (target_store, 'admin', 'מנהל', true),
    (target_store, 'manager', 'מנהל תפעול', true),
    (target_store, 'staff', 'צוות', true);

  select id into admin_id from public.roles where store_id = target_store and key = 'admin';
  select id into manager_id from public.roles where store_id = target_store and key = 'manager';
  select id into staff_id from public.roles where store_id = target_store and key = 'staff';

  foreach core_key in array admin_keys loop
    insert into public.role_permissions (store_id, role_id, permission_key)
    values (target_store, admin_id, core_key);
  end loop;
  foreach core_key in array manager_keys loop
    insert into public.role_permissions (store_id, role_id, permission_key)
    values (target_store, manager_id, core_key);
  end loop;
  foreach core_key in array staff_keys loop
    insert into public.role_permissions (store_id, role_id, permission_key)
    values (target_store, staff_id, core_key);
  end loop;
end;
$$;

revoke all on function private.copy_builtin_roles(uuid) from public, anon, authenticated;

create or replace function public.create_store(store_name text, store_environment text default 'development')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not private.is_platform_operator('platform.stores.create') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if store_environment not in ('production', 'development') then
    raise exception 'invalid environment';
  end if;

  insert into public.stores (name, environment)
  values (store_name, store_environment)
  returning id into new_id;

  insert into public.store_settings (store_id, display_name)
  values (new_id, store_name);

  perform private.copy_builtin_roles(new_id);
  return new_id;
end;
$$;

revoke all on function public.create_store(text, text) from public, anon;
grant execute on function public.create_store(text, text) to authenticated;

insert into public.permissions (key, description)
values
  ('products.read', 'קריאת קטלוג'),
  ('products.create', 'יצירת מוצר'),
  ('products.update', 'עדכון מוצר ומלאי'),
  ('products.delete', 'מחיקת מוצר'),
  ('orders.read', 'קריאת הזמנות'),
  ('orders.create', 'יצירת הזמנה'),
  ('orders.update', 'עדכון הזמנה'),
  ('customers.read', 'קריאת לקוחות'),
  ('customers.create', 'יצירת לקוח'),
  ('customers.update', 'עדכון לקוח'),
  ('discounts.read', 'קריאת הנחות'),
  ('discounts.create', 'יצירת הנחה'),
  ('discounts.update', 'עדכון הנחה'),
  ('discounts.delete', 'מחיקת הנחה'),
  ('content.read', 'קריאת תוכן'),
  ('content.update', 'עדכון תוכן'),
  ('analytics.read', 'קריאת ניתוח'),
  ('settings.manage', 'ניהול הגדרות החנות'),
  ('loyalty.read', 'קריאת מועדון לקוחות'),
  ('loyalty.manage', 'ניהול מועדון לקוחות'),
  ('wholesale.read', 'קריאת הזמנות סיטונאיות');

do $$
declare
  rel text;
begin
  foreach rel in array array[
    'store_domains', 'roles', 'role_permissions', 'store_members', 'store_modules',
    'products', 'product_variants', 'product_media', 'collections', 'collection_products',
    'inventory_items', 'inventory_movements', 'customers', 'customer_addresses',
    'orders', 'order_items', 'payments', 'refunds', 'shipments', 'discounts',
    'pages', 'content_blocks', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', rel);
    execute format('alter table public.%I force row level security', rel);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.reject_store_id_change()',
      rel || '_lock_store',
      rel
    );
  end loop;
end $$;

alter table public.stores enable row level security;
alter table public.stores force row level security;
alter table public.store_settings enable row level security;
alter table public.store_settings force row level security;
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.platform_operators enable row level security;
alter table public.platform_operators force row level security;

create policy stores_select on public.stores
  for select to authenticated
  using ((select private.is_store_member(id)));

create policy store_settings_select on public.store_settings
  for select to authenticated
  using ((select private.is_store_member(store_id)));

create policy store_settings_update on public.store_settings
  for update to authenticated
  using ((select private.has_store_permission(store_id, 'settings.manage', true)))
  with check ((select private.has_store_permission(store_id, 'settings.manage', true)));

create policy store_domains_select on public.store_domains
  for select to authenticated
  using ((select private.is_store_member(store_id)));

create policy roles_select on public.roles
  for select to authenticated
  using ((select private.is_store_member(store_id)));

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using ((select private.is_store_member(store_id)));

create policy store_members_select on public.store_members
  for select to authenticated
  using ((select private.is_store_member(store_id)));

create policy store_members_insert on public.store_members
  for insert to authenticated
  with check ((select private.has_store_permission(store_id, 'settings.manage', true)));

create policy store_members_update on public.store_members
  for update to authenticated
  using ((select private.has_store_permission(store_id, 'settings.manage', true)))
  with check ((select private.has_store_permission(store_id, 'settings.manage', true)));

create policy store_modules_select on public.store_modules
  for select to authenticated
  using ((select private.is_store_member(store_id)));

create policy permissions_select on public.permissions
  for select to authenticated
  using (true);

do $$
declare
  item record;
begin
  for item in
    select *
    from (
      values
        ('products', 'products.read', 'products.create', 'products.update', 'products.delete'),
        ('product_variants', 'products.read', 'products.create', 'products.update', 'products.delete'),
        ('product_media', 'products.read', 'products.create', 'products.update', 'products.delete'),
        ('collections', 'products.read', 'products.create', 'products.update', 'products.delete'),
        ('collection_products', 'products.read', 'products.create', 'products.update', 'products.delete'),
        ('inventory_items', 'products.read', 'products.create', 'products.update', 'products.delete'),
        ('customers', 'customers.read', 'customers.create', 'customers.update', null),
        ('customer_addresses', 'customers.read', 'customers.create', 'customers.update', null),
        ('orders', 'orders.read', 'orders.create', 'orders.update', null),
        ('order_items', 'orders.read', 'orders.create', 'orders.update', null),
        ('payments', 'orders.read', 'orders.create', 'orders.update', null),
        ('refunds', 'orders.read', 'orders.update', 'orders.update', null),
        ('shipments', 'orders.read', 'orders.update', 'orders.update', null),
        ('discounts', 'discounts.read', 'discounts.create', 'discounts.update', 'discounts.delete'),
        ('pages', 'content.read', 'content.update', 'content.update', null),
        ('content_blocks', 'content.read', 'content.update', 'content.update', null),
        ('audit_logs', 'settings.manage', 'settings.manage', null, null),
        ('inventory_movements', 'products.read', 'products.update', null, null)
    ) as policy_map(rel, read_key, insert_key, update_key, delete_key)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_store_permission(store_id, %L, false)))',
      item.rel || '_select', item.rel, item.read_key
    );
    if item.insert_key is not null then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ((select private.has_store_permission(store_id, %L, true)))',
        item.rel || '_insert', item.rel, item.insert_key
      );
    end if;
    if item.update_key is not null then
      execute format(
        'create policy %I on public.%I for update to authenticated using ((select private.has_store_permission(store_id, %L, true))) with check ((select private.has_store_permission(store_id, %L, true)))',
        item.rel || '_update', item.rel, item.update_key, item.update_key
      );
    end if;
    if item.delete_key is not null then
      execute format(
        'create policy %I on public.%I for delete to authenticated using ((select private.has_store_permission(store_id, %L, true)))',
        item.rel || '_delete', item.rel, item.delete_key
      );
    end if;
  end loop;
end $$;

revoke all on all tables in schema public from anon, public;
grant select on public.stores, public.store_domains, public.store_settings, public.permissions,
  public.roles, public.role_permissions, public.store_members, public.store_modules
  to authenticated;
grant select, insert, update, delete on
  public.products, public.product_variants, public.product_media, public.collections, public.collection_products,
  public.inventory_items, public.inventory_movements, public.customers, public.customer_addresses,
  public.orders, public.order_items, public.payments, public.refunds, public.shipments,
  public.discounts, public.pages, public.content_blocks, public.audit_logs
  to authenticated;
grant select, insert, update on public.store_members to authenticated;
grant select, update on public.store_settings to authenticated;

create index collection_products_product_idx on public.collection_products (store_id, product_id);
create index inventory_movements_item_idx on public.inventory_movements (store_id, inventory_item_id);
create index order_items_variant_idx on public.order_items (store_id, variant_id);
create index orders_customer_idx on public.orders (store_id, customer_id);
create index role_permissions_permission_idx on public.role_permissions (permission_key);
create index store_members_role_idx on public.store_members (store_id, role_id);

create policy platform_operators_select on public.platform_operators
  for select to authenticated
  using (false);
