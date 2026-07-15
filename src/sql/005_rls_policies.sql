alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "branches_select_by_access" on public.branches;
drop policy if exists "branches_insert_by_admin" on public.branches;
drop policy if exists "branches_update_by_admin" on public.branches;
drop policy if exists "branches_delete_by_owner" on public.branches;

create policy "branches_select_by_access"
on public.branches for select
to authenticated
using (public.can_access_branch(id));

create policy "branches_insert_by_admin"
on public.branches for insert
to authenticated
with check (public.is_admin());

create policy "branches_update_by_admin"
on public.branches for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "branches_delete_by_owner"
on public.branches for delete
to authenticated
using (public.is_owner());

drop policy if exists "employees_select_by_role" on public.employees;
drop policy if exists "employees_insert_by_admin" on public.employees;
drop policy if exists "employees_update_by_admin" on public.employees;
drop policy if exists "employees_delete_by_owner" on public.employees;

create policy "employees_select_by_role"
on public.employees for select
to authenticated
using (
  public.is_admin()
  or id = public.current_employee_id()
);

create policy "employees_insert_by_admin"
on public.employees for insert
to authenticated
with check (public.is_admin());

create policy "employees_update_by_admin"
on public.employees for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "employees_delete_by_owner"
on public.employees for delete
to authenticated
using (public.is_owner());

drop policy if exists "app_settings_all_by_admin" on public.app_settings;

create policy "app_settings_all_by_admin"
on public.app_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "audit_logs_select_by_admin" on public.audit_logs;
drop policy if exists "audit_logs_insert_by_admin" on public.audit_logs;

create policy "audit_logs_select_by_admin"
on public.audit_logs for select
to authenticated
using (public.is_admin());

create policy "audit_logs_insert_by_admin"
on public.audit_logs for insert
to authenticated
with check (public.is_admin());
