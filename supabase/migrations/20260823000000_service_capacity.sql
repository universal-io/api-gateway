begin;

-- The ceiling that caps the product, not one account.
--
-- bs_plans caps a single tenant (free = 200 requests/month). Nothing capped
-- the whole service, so the real exposure was always "the free cap times
-- however many accounts exist" — and with open web signup, that count is not
-- a number this side chooses. One stranger cannot run away with the bill; a
-- hundred of them can, and no row in the database said otherwise.
--
-- Paid plans are never refused by this ceiling (owner decision 2026-08-23).
-- It exists to bound free traffic, not to interrupt a month somebody paid for.
create table if not exists public.bs_service_limits (
    -- One row, forever. A primary key with a single legal value states that in
    -- SQL rather than leaving it to a convention nothing checks.
    id text primary key default 'global'
        check (id = 'global'),
    -- Monthly ceiling across ALL tenants and ALL AI operations, in the same
    -- unit as bs_plans.monthly_usage_limit (1 request = 1 unit).
    -- NULL = no service-wide ceiling.
    monthly_usage_limit integer
        check (monthly_usage_limit is null or monthly_usage_limit >= 0),
    updated_at timestamptz not null default now()
);

comment on table public.bs_service_limits is
    'Service-wide monthly request ceiling (single row, id = global). Free plans are refused once the month total across every tenant reaches it; paid plans always pass. Read by the gateway with the service-role key. Change the ceiling HERE, never in gateway code or env.';

insert into public.bs_service_limits (id, monthly_usage_limit)
values ('global', 5000)
on conflict (id) do nothing;

drop trigger if exists bs_service_limits_touch_updated_at on public.bs_service_limits;
create trigger bs_service_limits_touch_updated_at
    before update on public.bs_service_limits
    for each row
    execute function public.bs_touch_updated_at();

-- Same posture as bs_plans: row level security on with no policies, so the
-- ceiling is gateway-internal. No end user reads this table directly; they
-- learn about it only from the error the gateway returns when it is reached.
alter table public.bs_service_limits enable row level security;

-- No new index on bs_usage_events. Counting the month service-wide filters on
-- created_at with no tenant_id, which bs_usage_events_tenant_created_at_idx
-- cannot serve on its leading column — but the rows being counted are bounded
-- by this very ceiling (a month cannot exceed it by much), and the gateway
-- caches the count for five minutes. Measure before adding one: an index that
-- was never needed still costs every insert on the hot path.

commit;
