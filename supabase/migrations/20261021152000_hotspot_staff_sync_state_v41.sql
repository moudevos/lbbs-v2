-- LBBS Staff 41: privileged router-roster ACK. No access opens from SQL alone.
create table if not exists public.hotspot_staff_sync_state_v41 (
  router_id uuid primary key references public.hotspot_routers(id) on delete cascade,
  revision text not null check (revision ~ '^[a-f0-9]{64}$'),
  synced_at timestamptz not null default now()
);
alter table public.hotspot_staff_sync_state_v41 enable row level security;
revoke all on public.hotspot_staff_sync_state_v41 from public,anon,authenticated;
grant select,insert,update on public.hotspot_staff_sync_state_v41 to service_role;
notify pgrst,'reload schema';
