-- WiFi Staff phase 1: isolated backend storage, no changes to customer hotspot.
create table if not exists public.hotspot_staff_credentials (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null unique references public.employees(id) on delete cascade,
 branch_id uuid not null references public.branches(id),
 code_hash text not null,
 code_last2 text not null check (code_last2 ~ '^[0-9]{2}$'),
 is_enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revoked_at timestamptz
);
create index if not exists hotspot_staff_credentials_branch_idx on public.hotspot_staff_credentials(branch_id);
create table if not exists public.hotspot_staff_devices (
 id uuid primary key default gen_random_uuid(),
 credential_id uuid not null references public.hotspot_staff_credentials(id) on delete cascade,
 mac_address text not null check (mac_address ~* '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'),
 is_authorized boolean not null default true,
 registered_at timestamptz not null default now(),
 revoked_at timestamptz,
 unique(credential_id,mac_address)
);
create index if not exists hotspot_staff_devices_credential_idx on public.hotspot_staff_devices(credential_id);
create table if not exists public.hotspot_staff_sessions (
 id uuid primary key default gen_random_uuid(),
 credential_id uuid not null references public.hotspot_staff_credentials(id) on delete cascade,
 device_id uuid references public.hotspot_staff_devices(id) on delete set null,
 router_id uuid references public.hotspot_routers(id) on delete set null,
 router_session_key text,
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 end_reason text,
 check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists hotspot_staff_sessions_router_key_uidx on public.hotspot_staff_sessions(router_id,router_session_key) where router_id is not null and router_session_key is not null;
create index if not exists hotspot_staff_sessions_active_idx on public.hotspot_staff_sessions(credential_id,started_at desc) where ended_at is null;
alter table public.hotspot_staff_credentials enable row level security;
alter table public.hotspot_staff_devices enable row level security;
alter table public.hotspot_staff_sessions enable row level security;
revoke all on public.hotspot_staff_credentials from anon,authenticated;
revoke all on public.hotspot_staff_devices from anon,authenticated;
revoke all on public.hotspot_staff_sessions from anon,authenticated;
comment on table public.hotspot_staff_credentials is 'Staff hotspot credentials; code hashes only. Managed by server-side admin API.';
comment on table public.hotspot_staff_devices is 'Authorized Staff MAC addresses. Two-device cap enforced in server API/transaction before provisioning.';
comment on table public.hotspot_staff_sessions is 'Staff connection history populated by future router event integration.';