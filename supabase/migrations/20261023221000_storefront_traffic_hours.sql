-- Hourly totals for the traffic charts.
-- Every event adds one to its hour, so the charts read at most 60 days x 24 rows
-- instead of scanning every event on each dashboard refresh.
-- Israel offsets are whole hours, so UTC hour buckets map exactly to local hours.

create table if not exists public.storefront_traffic_hours (
  store_id uuid not null references public.stores (id),
  hour timestamptz not null,
  page_views integer not null default 0,
  purchases integer not null default 0,
  sales numeric(14, 2) not null default 0,
  primary key (store_id, hour)
);

alter table public.storefront_traffic_hours enable row level security;
alter table public.storefront_traffic_hours force row level security;
revoke all on table public.storefront_traffic_hours from public, anon, authenticated;

create or replace function private.count_storefront_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name not in ('page_view', 'purchase') then
    return new;
  end if;
  insert into public.storefront_traffic_hours as traffic (store_id, hour, page_views, purchases, sales)
  values (
    new.store_id,
    date_trunc('hour', new.occurred_at),
    case when new.name = 'page_view' then 1 else 0 end,
    case when new.name = 'purchase' then 1 else 0 end,
    case when new.name = 'purchase' then coalesce(new.amount, 0) else 0 end
  )
  on conflict (store_id, hour) do update
  set
    page_views = traffic.page_views + excluded.page_views,
    purchases = traffic.purchases + excluded.purchases,
    sales = traffic.sales + excluded.sales;
  return new;
end;
$$;

revoke all on function private.count_storefront_event() from public, anon, authenticated;

drop trigger if exists storefront_events_count_hour on public.storefront_events;
create trigger storefront_events_count_hour
after insert on public.storefront_events
for each row execute function private.count_storefront_event();

lock table public.storefront_events in share mode;

delete from public.storefront_traffic_hours;

insert into public.storefront_traffic_hours (store_id, hour, page_views, purchases, sales)
select
  event.store_id,
  date_trunc('hour', event.occurred_at),
  count(*) filter (where event.name = 'page_view'),
  count(*) filter (where event.name = 'purchase'),
  coalesce(sum(event.amount) filter (where event.name = 'purchase'), 0)
from public.storefront_events as event
where event.name in ('page_view', 'purchase')
group by 1, 2;

create or replace function private.event_series(
  target_store uuid,
  range_start timestamptz,
  bucket_count integer,
  bucket_unit text,
  event_name text,
  aggregate_mode text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(coalesce(bucket.total, 0) order by slot.n), '[]'::jsonb)
  from generate_series(0, bucket_count - 1) as slot(n)
  left join (
    select
      (
        case
          when bucket_unit = 'hour' then extract(hour from traffic.hour at time zone 'Asia/Jerusalem')
          else (
            date_trunc('day', traffic.hour at time zone 'Asia/Jerusalem')::date
            - (range_start at time zone 'Asia/Jerusalem')::date
          )
        end
      )::int as n,
      sum(
        case
          when event_series.event_name = 'page_view' then traffic.page_views::numeric
          when aggregate_mode = 'sum' then traffic.sales
          else traffic.purchases::numeric
        end
      ) as total
    from public.storefront_traffic_hours as traffic
    where traffic.store_id = target_store
      and (
        (event_series.event_name = 'page_view' and traffic.page_views > 0)
        or (event_series.event_name = 'purchase' and traffic.purchases > 0)
      )
      and traffic.hour >= range_start
      and traffic.hour < range_start + (
        case when bucket_unit = 'hour' then bucket_count * interval '1 hour' else bucket_count * interval '1 day' end
      )
    group by 1
  ) as bucket on bucket.n = slot.n;
$$;

revoke all on function private.event_series(uuid, timestamptz, integer, text, text, text) from public, anon, authenticated;
