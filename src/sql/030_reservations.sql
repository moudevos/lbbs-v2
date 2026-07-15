create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  preferred_barber_id uuid references public.employees(id) on delete set null,
  service_interest_id uuid references public.services(id) on delete set null,
  scheduled_date date,
  scheduled_time time,
  status text not null default 'pending',
  source text not null default 'manual',
  channel text not null default 'reception',
  customer_message text,
  internal_notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.reservations
    drop constraint if exists reservations_status_check;

  alter table public.reservations
    add constraint reservations_status_check
    check (status in ('pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in', 'completed', 'cancelled', 'no_show'));

  alter table public.reservations
    drop constraint if exists reservations_source_check;

  alter table public.reservations
    add constraint reservations_source_check
    check (source in ('manual', 'public_form', 'whatsapp', 'phone'));

  alter table public.reservations
    drop constraint if exists reservations_channel_check;

  alter table public.reservations
    add constraint reservations_channel_check
    check (channel in ('reception', 'website', 'whatsapp', 'phone'));
end $$;

create table if not exists public.reservation_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists reservations_customer_id_idx
  on public.reservations (customer_id);

create index if not exists reservations_branch_id_idx
  on public.reservations (branch_id);

create index if not exists reservations_preferred_barber_id_idx
  on public.reservations (preferred_barber_id);

create index if not exists reservations_service_interest_id_idx
  on public.reservations (service_interest_id);

create index if not exists reservations_status_idx
  on public.reservations (status);

create index if not exists reservations_scheduled_date_idx
  on public.reservations (scheduled_date);

create index if not exists reservations_created_at_desc_idx
  on public.reservations (created_at desc);

create index if not exists reservation_notes_reservation_created_at_desc_idx
  on public.reservation_notes (reservation_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated, service_role;

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create or replace function public.can_view_reservation(
  reservation_branch_id uuid,
  reservation_barber_id uuid,
  reservation_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and (
        reservation_created_by = public.current_employee_id()
        or public.can_access_branch(reservation_branch_id)
      )
    )
    or (
      public.current_user_role() = 'barber'
      and reservation_barber_id = public.current_employee_id()
    )
    or (
      public.current_user_role() = 'viewer'
      and public.can_access_branch(reservation_branch_id)
    ),
    false
  )
$$;

create or replace function public.can_write_reservation(
  reservation_branch_id uuid,
  reservation_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin()
    or (
      public.current_user_role() = 'reception'
      and (
        reservation_created_by = public.current_employee_id()
        or reservation_branch_id is null
        or public.can_access_branch(reservation_branch_id)
      )
    ),
    false
  )
$$;

create or replace function public.can_write_reservation_note(target_reservation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.reservations r
    where r.id = target_reservation_id
      and (
        public.is_admin()
        or (
          public.current_user_role() = 'reception'
          and (
            r.created_by = public.current_employee_id()
            or r.branch_id is null
            or public.can_access_branch(r.branch_id)
          )
        )
        or (
          public.current_user_role() = 'barber'
          and r.preferred_barber_id = public.current_employee_id()
        )
      )
  )
$$;

revoke all on function public.can_view_reservation(uuid, uuid, uuid) from public;
revoke all on function public.can_write_reservation(uuid, uuid) from public;
revoke all on function public.can_write_reservation_note(uuid) from public;

grant execute on function public.can_view_reservation(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.can_write_reservation(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_write_reservation_note(uuid) to authenticated, service_role;

alter table public.reservations enable row level security;
alter table public.reservation_notes enable row level security;

drop policy if exists "reservations_select_team" on public.reservations;
drop policy if exists "reservations_insert_team" on public.reservations;
drop policy if exists "reservations_update_team" on public.reservations;
drop policy if exists "reservations_delete_admin" on public.reservations;
drop policy if exists "reservations_service_role_all" on public.reservations;

create policy "reservations_select_team"
on public.reservations
for select
to authenticated
using (
  public.can_view_reservation(branch_id, preferred_barber_id, created_by)
);

create policy "reservations_insert_team"
on public.reservations
for insert
to authenticated
with check (
  public.can_write_reservation(branch_id, created_by)
);

create policy "reservations_update_team"
on public.reservations
for update
to authenticated
using (
  public.can_write_reservation(branch_id, created_by)
)
with check (
  public.can_write_reservation(branch_id, created_by)
);

create policy "reservations_delete_admin"
on public.reservations
for delete
to authenticated
using (public.is_admin());

create policy "reservations_service_role_all"
on public.reservations
for all
to service_role
using (true)
with check (true);

drop policy if exists "reservation_notes_select_team" on public.reservation_notes;
drop policy if exists "reservation_notes_insert_team" on public.reservation_notes;
drop policy if exists "reservation_notes_delete_admin" on public.reservation_notes;
drop policy if exists "reservation_notes_service_role_all" on public.reservation_notes;

create policy "reservation_notes_select_team"
on public.reservation_notes
for select
to authenticated
using (
  exists (
    select 1
    from public.reservations r
    where r.id = reservation_id
      and public.can_view_reservation(r.branch_id, r.preferred_barber_id, r.created_by)
  )
);

create policy "reservation_notes_insert_team"
on public.reservation_notes
for insert
to authenticated
with check (
  public.can_write_reservation_note(reservation_id)
);

create policy "reservation_notes_delete_admin"
on public.reservation_notes
for delete
to authenticated
using (public.is_admin());

create policy "reservation_notes_service_role_all"
on public.reservation_notes
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.reservations to authenticated;
grant select, insert, delete on public.reservation_notes to authenticated;

grant all on public.reservations to service_role;
grant all on public.reservation_notes to service_role;

revoke all on public.reservations from public;
revoke all on public.reservation_notes from public;
