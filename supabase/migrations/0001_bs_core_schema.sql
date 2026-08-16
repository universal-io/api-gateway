begin;

create table if not exists public.bs_tenants (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    kind text not null check (kind in ('personal', 'enterprise')),
    status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.bs_profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text,
    email text,
    default_tenant_id uuid not null references public.bs_tenants (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.bs_tenant_members (
    tenant_id uuid not null references public.bs_tenants (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'member')),
    created_at timestamptz not null default now(),
    primary key (tenant_id, user_id)
);

create table if not exists public.bs_entitlements (
    tenant_id uuid primary key references public.bs_tenants (id) on delete cascade,
    plan text not null check (plan in ('free', 'pro', 'team', 'enterprise')),
    status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
    monthly_review_limit integer not null default 50 check (monthly_review_limit >= 0),
    monthly_audio_seconds_limit integer not null default 0 check (monthly_audio_seconds_limit >= 0),
    allowed_models jsonb not null default '[]'::jsonb,
    features jsonb not null default '{}'::jsonb,
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    stripe_customer_id text,
    stripe_subscription_id text,
    updated_at timestamptz not null default now(),
    check (current_period_end > current_period_start)
);

create table if not exists public.bs_usage_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.bs_tenants (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    operation text not null,
    model_vendor text,
    model_id text,
    input_units integer not null default 0 check (input_units >= 0),
    output_units integer not null default 0 check (output_units >= 0),
    unit_type text not null,
    request_id text,
    status text not null check (status in ('success', 'error', 'blocked')),
    error_code text,
    latency_ms integer check (latency_ms is null or latency_ms >= 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists bs_usage_events_tenant_request_id_key
    on public.bs_usage_events (tenant_id, request_id)
    where request_id is not null;

create index if not exists bs_usage_events_tenant_created_at_idx
    on public.bs_usage_events (tenant_id, created_at desc);

create index if not exists bs_usage_events_user_created_at_idx
    on public.bs_usage_events (user_id, created_at desc);

create table if not exists public.bs_app_devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    platform text not null check (platform in ('macos', 'ios', 'android', 'web')),
    install_id text not null,
    device_label text,
    app_version text,
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, platform, install_id)
);

create index if not exists bs_app_devices_user_last_seen_idx
    on public.bs_app_devices (user_id, last_seen_at desc);

create unique index if not exists bs_entitlements_stripe_customer_id_key
    on public.bs_entitlements (stripe_customer_id)
    where stripe_customer_id is not null;

create unique index if not exists bs_entitlements_stripe_subscription_id_key
    on public.bs_entitlements (stripe_subscription_id)
    where stripe_subscription_id is not null;

create or replace function public.bs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.bs_is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.bs_tenant_members member
        where member.tenant_id = target_tenant_id
          and member.user_id = auth.uid()
    );
$$;

create or replace function public.bs_is_tenant_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.bs_tenant_members member
        where member.tenant_id = target_tenant_id
          and member.user_id = auth.uid()
          and member.role in ('owner', 'admin')
    );
$$;

create or replace function public.bs_derived_display_name(user_email text, user_meta jsonb)
returns text
language sql
immutable
as $$
    select coalesce(
        nullif(trim(user_meta ->> 'full_name'), ''),
        nullif(trim(user_meta ->> 'name'), ''),
        nullif(trim(split_part(coalesce(user_email, ''), '@', 1)), ''),
        'User'
    );
$$;

create or replace function public.bs_provision_user(
    user_id uuid,
    user_email text,
    user_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    tenant_uuid uuid := gen_random_uuid();
    tenant_slug text := 'bs-personal-' || replace(user_id::text, '-', '');
    display_name text := public.bs_derived_display_name(user_email, user_meta);
    period_start timestamptz := date_trunc('month', now());
    period_end timestamptz := date_trunc('month', now()) + interval '1 month';
begin
    if exists (select 1 from public.bs_profiles profile where profile.id = user_id) then
        return;
    end if;

    insert into public.bs_tenants (id, slug, name, kind, status)
    values (tenant_uuid, tenant_slug, display_name, 'personal', 'active');

    insert into public.bs_profiles (id, display_name, email, default_tenant_id)
    values (user_id, display_name, user_email, tenant_uuid);

    insert into public.bs_tenant_members (tenant_id, user_id, role)
    values (tenant_uuid, user_id, 'owner');

    insert into public.bs_entitlements (
        tenant_id,
        plan,
        status,
        monthly_review_limit,
        monthly_audio_seconds_limit,
        allowed_models,
        features,
        current_period_start,
        current_period_end
    )
    values (
        tenant_uuid,
        'free',
        'active',
        50,
        0,
        '[]'::jsonb,
        jsonb_build_object('ai_review', true),
        period_start,
        period_end
    );
end;
$$;

create or replace function public.bs_initialize_current_user()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    auth_user record;
    tenant_uuid uuid;
begin
    select *
    into auth_user
    from auth.users
    where id = auth.uid();

    if auth_user.id is null then
        raise exception 'authenticated user not found in auth.users';
    end if;

    perform public.bs_provision_user(auth_user.id, auth_user.email, auth_user.raw_user_meta_data);

    select profile.default_tenant_id
    into tenant_uuid
    from public.bs_profiles profile
    where profile.id = auth_user.id;

    return tenant_uuid;
end;
$$;

do $$
declare
    existing_user record;
begin
    for existing_user in
        select user_row.id, user_row.email, user_row.raw_user_meta_data
        from auth.users as user_row
        where not exists (
            select 1
            from public.bs_profiles profile
            where profile.id = user_row.id
        )
    loop
        perform public.bs_provision_user(
            existing_user.id,
            existing_user.email,
            existing_user.raw_user_meta_data
        );
    end loop;
end;
$$;

revoke all on function public.bs_provision_user(uuid, text, jsonb) from public;
revoke all on function public.bs_initialize_current_user() from public;
grant execute on function public.bs_initialize_current_user() to authenticated;

drop trigger if exists bs_tenants_touch_updated_at on public.bs_tenants;
create trigger bs_tenants_touch_updated_at
    before update on public.bs_tenants
    for each row
    execute function public.bs_touch_updated_at();

drop trigger if exists bs_profiles_touch_updated_at on public.bs_profiles;
create trigger bs_profiles_touch_updated_at
    before update on public.bs_profiles
    for each row
    execute function public.bs_touch_updated_at();

drop trigger if exists bs_entitlements_touch_updated_at on public.bs_entitlements;
create trigger bs_entitlements_touch_updated_at
    before update on public.bs_entitlements
    for each row
    execute function public.bs_touch_updated_at();

drop trigger if exists bs_app_devices_touch_updated_at on public.bs_app_devices;
create trigger bs_app_devices_touch_updated_at
    before update on public.bs_app_devices
    for each row
    execute function public.bs_touch_updated_at();

alter table public.bs_tenants enable row level security;
alter table public.bs_profiles enable row level security;
alter table public.bs_tenant_members enable row level security;
alter table public.bs_entitlements enable row level security;
alter table public.bs_usage_events enable row level security;
alter table public.bs_app_devices enable row level security;

drop policy if exists "bs_tenants_select_member" on public.bs_tenants;
create policy "bs_tenants_select_member"
    on public.bs_tenants
    for select
    to authenticated
    using (public.bs_is_tenant_member(id));

drop policy if exists "bs_tenants_update_admin" on public.bs_tenants;
create policy "bs_tenants_update_admin"
    on public.bs_tenants
    for update
    to authenticated
    using (public.bs_is_tenant_admin(id))
    with check (public.bs_is_tenant_admin(id));

drop policy if exists "bs_profiles_select_self" on public.bs_profiles;
create policy "bs_profiles_select_self"
    on public.bs_profiles
    for select
    to authenticated
    using (auth.uid() = id);

drop policy if exists "bs_profiles_update_self" on public.bs_profiles;
create policy "bs_profiles_update_self"
    on public.bs_profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);

drop policy if exists "bs_tenant_members_select_member" on public.bs_tenant_members;
create policy "bs_tenant_members_select_member"
    on public.bs_tenant_members
    for select
    to authenticated
    using (public.bs_is_tenant_member(tenant_id));

drop policy if exists "bs_entitlements_select_member" on public.bs_entitlements;
create policy "bs_entitlements_select_member"
    on public.bs_entitlements
    for select
    to authenticated
    using (public.bs_is_tenant_member(tenant_id));

drop policy if exists "bs_usage_events_select_member" on public.bs_usage_events;
create policy "bs_usage_events_select_member"
    on public.bs_usage_events
    for select
    to authenticated
    using (public.bs_is_tenant_member(tenant_id));

drop policy if exists "bs_app_devices_select_self" on public.bs_app_devices;
create policy "bs_app_devices_select_self"
    on public.bs_app_devices
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists "bs_app_devices_insert_self" on public.bs_app_devices;
create policy "bs_app_devices_insert_self"
    on public.bs_app_devices
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists "bs_app_devices_update_self" on public.bs_app_devices;
create policy "bs_app_devices_update_self"
    on public.bs_app_devices
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

commit;
