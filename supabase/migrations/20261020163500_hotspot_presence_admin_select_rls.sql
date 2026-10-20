-- LBBS v2.1: authenticated admins can read router presence alongside
-- their existing admin-only voucher list. No privileged service-role bypass
-- inside the Dashboard GET endpoint. No client or anonymous permissions.
alter table public.hotspot_client_presence_v2 enable row level security;
revoke all on public.hotspot_client_presence_v2 from anon, authenticated;
grant select on public.hotspot_client_presence_v2 to authenticated;
drop policy if exists hotspot_client_presence_v2_admin_read on public.hotspot_client_presence_v2;
create policy hotspot_client_presence_v2_admin_read
on public.hotspot_client_presence_v2
for select to authenticated
using (public.is_admin());
notify pgrst, 'reload schema';
