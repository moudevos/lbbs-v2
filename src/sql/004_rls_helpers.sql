create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
  limit 1
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.role
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
  limit 1
$$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.branch_id
  from public.employees e
  where e.user_id = auth.uid()
    and e.status = 'active'
  limit 1
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_user_role() in ('owner', 'admin'), false)
$$;

create or replace function public.can_access_branch(branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    or branch_id = public.current_branch_id()
$$;

revoke all on function public.current_employee_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.current_branch_id() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.can_access_branch(uuid) from public;

grant execute on function public.current_employee_id() to authenticated, service_role;
grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_branch_id() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.can_access_branch(uuid) to authenticated, service_role;
