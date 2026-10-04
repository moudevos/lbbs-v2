-- The legacy values remain valid for historical rows. New writes use
-- scheduled/cancelled; no historical row is rewritten by this migration.
alter table public.reservations
  add column if not exists attended_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists rescheduled_by uuid references public.employees(id) on delete set null,
  add column if not exists cancelled_by uuid references public.employees(id) on delete set null,
  add column if not exists cancellation_reason text;

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in (
    'scheduled',
    'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in',
    'completed', 'cancelled', 'no_show'
  ));

create index if not exists reservations_attended_at_idx
  on public.reservations (attended_at)
  where attended_at is not null;

create or replace function public.reservation_validate_schedule(
  p_branch_id uuid,
  p_service_id uuid,
  p_preferred_barber_id uuid,
  p_scheduled_date date,
  p_scheduled_time time,
  p_reservation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration integer;
  v_open time := time '09:30';
  v_close time := time '21:30';
  v_schedule_active boolean;
  v_barber_capacity integer;
  v_conflicts integer;
  v_day_of_week integer := extract(dow from p_scheduled_date)::integer;
begin
  if p_branch_id is null or p_service_id is null or p_scheduled_date is null or p_scheduled_time is null then
    perform public.reservation_capacity_error('La reserva requiere sede, servicio, fecha y hora.');
  end if;

  if not exists (select 1 from public.branches branch where branch.id = p_branch_id and branch.is_active) then
    perform public.reservation_capacity_error('La sede seleccionada no estÃ¡ disponible.');
  end if;

  select coalesce(service.duration_minutes, 60) into v_duration
  from public.services service where service.id = p_service_id and service.is_active;
  if v_duration is null then
    perform public.reservation_capacity_error('El servicio seleccionado no estÃ¡ disponible.');
  end if;

  if to_regclass('public.branch_schedules') is not null then
    execute 'select opens_at::time, closes_at::time, is_active from public.branch_schedules where branch_id = $1 and day_of_week = $2 limit 1'
      into v_open, v_close, v_schedule_active using p_branch_id, v_day_of_week;
    if found and not v_schedule_active then
      perform public.reservation_capacity_error('La sede no atiende en la fecha seleccionada.');
    elsif not found then
      v_open := time '09:30';
      v_close := time '21:30';
    end if;
  end if;

  if p_scheduled_date < (now() at time zone 'America/Lima')::date
    or (p_scheduled_date = (now() at time zone 'America/Lima')::date and p_scheduled_time <= (now() at time zone 'America/Lima')::time) then
    perform public.reservation_capacity_error('Selecciona una fecha y hora posterior a la actual.');
  end if;

  if p_scheduled_time < v_open
    or extract(minute from p_scheduled_time)::integer % 30 <> 0
    or p_scheduled_time + make_interval(mins => v_duration) > v_close then
    perform public.reservation_capacity_error('El horario seleccionado no estÃ¡ disponible para la sede.');
  end if;

  select count(*) into v_barber_capacity from public.employees employee
  where employee.branch_id = p_branch_id and employee.role = 'barber' and employee.status = 'active';
  if v_barber_capacity = 0 then
    perform public.reservation_capacity_error('No hay barberos activos disponibles en esta sede.');
  end if;

  if p_preferred_barber_id is not null and not exists (
    select 1 from public.employees employee
    where employee.id = p_preferred_barber_id and employee.branch_id = p_branch_id
      and employee.role = 'barber' and employee.status = 'active'
  ) then
    perform public.reservation_capacity_error('Selecciona un barbero activo de la sede elegida.');
  end if;

  if p_preferred_barber_id is not null then
    select count(*) into v_conflicts
    from public.reservations reservation
    left join public.services service on service.id = reservation.service_interest_id
    where reservation.branch_id = p_branch_id
      and reservation.scheduled_date = p_scheduled_date
      and reservation.preferred_barber_id = p_preferred_barber_id
      and reservation.status in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in')
      and (p_reservation_id is null or reservation.id <> p_reservation_id)
      and p_scheduled_time < reservation.scheduled_time + make_interval(mins => coalesce(service.duration_minutes, 60))
      and p_scheduled_time + make_interval(mins => v_duration) > reservation.scheduled_time;
    if v_conflicts > 0 then
      perform public.reservation_capacity_error('El barbero seleccionado ya tiene una reserva en ese horario.');
    end if;
  end if;

  select count(*) into v_conflicts
  from public.reservations reservation
  left join public.services service on service.id = reservation.service_interest_id
  where reservation.branch_id = p_branch_id
    and reservation.scheduled_date = p_scheduled_date
    and reservation.status in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in')
    and (p_reservation_id is null or reservation.id <> p_reservation_id)
    and p_scheduled_time < reservation.scheduled_time + make_interval(mins => coalesce(service.duration_minutes, 60))
    and p_scheduled_time + make_interval(mins => v_duration) > reservation.scheduled_time;
  if v_conflicts >= v_barber_capacity then
    perform public.reservation_capacity_error('Ya no hay disponibilidad para ese horario. Selecciona otra hora.');
  end if;
end;
$$;

create or replace function public.create_or_update_reservation_with_capacity(
  p_customer_id uuid, p_branch_id uuid, p_preferred_barber_id uuid, p_service_interest_id uuid,
  p_scheduled_date date, p_scheduled_time time, p_status text, p_source text, p_channel text,
  p_customer_message text, p_internal_notes text, p_confirmed_at timestamptz,
  p_cancelled_at timestamptz, p_completed_at timestamptz, p_reservation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.reservations%rowtype;
  v_actor uuid := public.current_employee_id();
  v_new_lock bigint;
  v_old_lock bigint;
  v_schedule_changed boolean := false;
  v_requires_capacity boolean := p_status in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in');
begin
  if auth.role() <> 'service_role' and not (
    public.is_admin() or (public.current_user_role() = 'reception' and (p_branch_id is null or public.can_access_branch(p_branch_id)))
  ) then
    perform public.reservation_capacity_error('No tienes permisos para modificar reservas en esta sede.');
  end if;

  if p_reservation_id is not null then
    select * into v_existing from public.reservations where id = p_reservation_id for update;
    if not found then
      perform public.reservation_capacity_error('La reserva no existe.');
    end if;
    if auth.role() <> 'service_role' and not public.is_admin()
      and v_existing.branch_id is not null and not public.can_access_branch(v_existing.branch_id) then
      perform public.reservation_capacity_error('No tienes permisos para modificar esta reserva.');
    end if;
    v_schedule_changed := v_existing.branch_id is distinct from p_branch_id
      or v_existing.preferred_barber_id is distinct from p_preferred_barber_id
      or v_existing.service_interest_id is distinct from p_service_interest_id
      or v_existing.scheduled_date is distinct from p_scheduled_date
      or v_existing.scheduled_time is distinct from p_scheduled_time;
  end if;

  if p_status not in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in', 'completed', 'cancelled', 'no_show') then
    perform public.reservation_capacity_error('El estado de la reserva no es vÃ¡lido.');
  end if;

  if v_requires_capacity then
    if p_branch_id is null or p_service_interest_id is null or p_scheduled_date is null or p_scheduled_time is null then
      perform public.reservation_capacity_error('La reserva requiere sede, servicio, fecha y hora.');
    end if;
    v_new_lock := hashtextextended(p_branch_id::text || ':' || p_scheduled_date::text, 0);
    if v_existing.id is not null and v_existing.branch_id is not null and v_existing.scheduled_date is not null then
      v_old_lock := hashtextextended(v_existing.branch_id::text || ':' || v_existing.scheduled_date::text, 0);
      if v_old_lock < v_new_lock then perform pg_advisory_xact_lock(v_old_lock); perform pg_advisory_xact_lock(v_new_lock);
      elsif v_old_lock > v_new_lock then perform pg_advisory_xact_lock(v_new_lock); perform pg_advisory_xact_lock(v_old_lock);
      else perform pg_advisory_xact_lock(v_new_lock); end if;
    else
      perform pg_advisory_xact_lock(v_new_lock);
    end if;
    perform public.reservation_validate_schedule(p_branch_id, p_service_interest_id, p_preferred_barber_id, p_scheduled_date, p_scheduled_time, p_reservation_id);
  end if;

  if p_reservation_id is null then
    insert into public.reservations (
      customer_id, branch_id, preferred_barber_id, service_interest_id, scheduled_date, scheduled_time,
      status, source, channel, customer_message, internal_notes, confirmed_at, cancelled_at, completed_at,
      created_by, updated_by
    ) values (
      p_customer_id, p_branch_id, p_preferred_barber_id, p_service_interest_id, p_scheduled_date, p_scheduled_time,
      p_status, p_source, p_channel, p_customer_message, p_internal_notes, p_confirmed_at, p_cancelled_at, p_completed_at,
      v_actor, v_actor
    ) returning id into p_reservation_id;
  else
    update public.reservations set
      customer_id = p_customer_id, branch_id = p_branch_id, preferred_barber_id = p_preferred_barber_id,
      service_interest_id = p_service_interest_id, scheduled_date = p_scheduled_date, scheduled_time = p_scheduled_time,
      status = p_status, source = p_source, channel = p_channel, customer_message = p_customer_message,
      internal_notes = p_internal_notes, confirmed_at = p_confirmed_at, cancelled_at = p_cancelled_at,
      completed_at = p_completed_at, rescheduled_at = case when v_schedule_changed then now() else rescheduled_at end,
      rescheduled_by = case when v_schedule_changed then v_actor else rescheduled_by end, updated_by = v_actor
    where id = p_reservation_id;
  end if;
  return p_reservation_id;
end;
$$;

create or replace function public.get_reservation_available_slots(
  p_branch_id uuid, p_service_id uuid, p_preferred_barber_id uuid, p_scheduled_date date
)
returns table(slot_time time)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration integer;
  v_open time := time '09:30';
  v_close time := time '21:30';
  v_schedule_active boolean;
  v_capacity integer;
  v_day_of_week integer := extract(dow from p_scheduled_date)::integer;
  v_slot time;
  v_conflicts integer;
begin
  if p_scheduled_date < (now() at time zone 'America/Lima')::date then return; end if;
  if not exists (select 1 from public.branches where id = p_branch_id and is_active) then
    perform public.reservation_capacity_error('La sede seleccionada no estÃ¡ disponible.');
  end if;
  select coalesce(duration_minutes, 60) into v_duration from public.services where id = p_service_id and is_active;
  if v_duration is null then perform public.reservation_capacity_error('El servicio seleccionado no estÃ¡ disponible.'); end if;
  if to_regclass('public.branch_schedules') is not null then
    execute 'select opens_at::time, closes_at::time, is_active from public.branch_schedules where branch_id = $1 and day_of_week = $2 limit 1'
      into v_open, v_close, v_schedule_active using p_branch_id, v_day_of_week;
    if found and not v_schedule_active then return; elsif not found then v_open := time '09:30'; v_close := time '21:30'; end if;
  end if;
  select count(*) into v_capacity from public.employees where branch_id = p_branch_id and role = 'barber' and status = 'active';
  if v_capacity = 0 then return; end if;
  if p_preferred_barber_id is not null and not exists (
    select 1 from public.employees where id = p_preferred_barber_id and branch_id = p_branch_id and role = 'barber' and status = 'active'
  ) then perform public.reservation_capacity_error('El barbero no estÃ¡ disponible en esta sede.'); end if;
  for v_slot in select (v_open + make_interval(mins => minute_offset))::time
    from generate_series(0, floor(extract(epoch from (v_close - v_open)) / 60)::integer - v_duration, 30) minute_offset
  loop
    if p_scheduled_date = (now() at time zone 'America/Lima')::date and v_slot <= (now() at time zone 'America/Lima')::time then continue; end if;
    if p_preferred_barber_id is not null then
      select count(*) into v_conflicts from public.reservations reservation
      left join public.services service on service.id = reservation.service_interest_id
      where reservation.branch_id = p_branch_id and reservation.scheduled_date = p_scheduled_date
        and reservation.preferred_barber_id = p_preferred_barber_id
        and reservation.status in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in')
        and v_slot < reservation.scheduled_time + make_interval(mins => coalesce(service.duration_minutes, 60))
        and v_slot + make_interval(mins => v_duration) > reservation.scheduled_time;
      if v_conflicts > 0 then continue; end if;
    end if;
    select count(*) into v_conflicts from public.reservations reservation
    left join public.services service on service.id = reservation.service_interest_id
    where reservation.branch_id = p_branch_id and reservation.scheduled_date = p_scheduled_date
      and reservation.status in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in')
      and v_slot < reservation.scheduled_time + make_interval(mins => coalesce(service.duration_minutes, 60))
      and v_slot + make_interval(mins => v_duration) > reservation.scheduled_time;
    if v_conflicts < v_capacity then slot_time := v_slot; return next; end if;
  end loop;
end;
$$;

create or replace function public.record_reservation_reminder(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_reservation public.reservations%rowtype;
begin
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then perform public.reservation_capacity_error('La reserva no existe.'); end if;
  if auth.role() <> 'service_role' and not public.is_admin()
    and (public.current_user_role() <> 'reception' or not public.can_access_branch(v_reservation.branch_id)) then
    perform public.reservation_capacity_error('No tienes permisos para enviar recordatorios de esta reserva.');
  end if;
  if v_reservation.status in ('cancelled', 'completed', 'no_show') then
    perform public.reservation_capacity_error('La reserva ya no admite recordatorios.');
  end if;
  update public.reservations set last_reminder_at = now(), reminder_count = reminder_count + 1,
    updated_by = public.current_employee_id() where id = p_reservation_id;
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_reservation public.reservations%rowtype; v_actor uuid := public.current_employee_id();
begin
  if nullif(btrim(p_reason), '') is null then perform public.reservation_capacity_error('Debes indicar el motivo de anulaciÃ³n.'); end if;
  select * into v_reservation from public.reservations where id = p_reservation_id for update;
  if not found then perform public.reservation_capacity_error('La reserva no existe.'); end if;
  if auth.role() <> 'service_role' and not public.is_admin()
    and (public.current_user_role() <> 'reception' or not public.can_access_branch(v_reservation.branch_id)) then
    perform public.reservation_capacity_error('No tienes permisos para anular esta reserva.');
  end if;
  if v_reservation.status = 'cancelled' then perform public.reservation_capacity_error('La reserva ya estÃ¡ anulada.'); end if;
  update public.reservations set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
    cancelled_by = v_actor, cancellation_reason = btrim(p_reason), updated_by = v_actor where id = p_reservation_id;
end;
$$;

create or replace function public.mark_reservation_attendance_from_sale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') and new.reservation_id is not null then
    update public.reservations set attended_at = coalesce(attended_at, now())
    where id = new.reservation_id and status <> 'cancelled';
  elsif new.status = 'cancelled' and old.status = 'completed' and new.reservation_id is not null
    and old.closed_at::date = (now() at time zone 'America/Lima')::date then
    -- A same-day reversal with no remaining completed sale did not produce a
    -- valid attendance. Older reversals intentionally retain the attendance fact.
    update public.reservations reservation set attended_at = null
    where reservation.id = new.reservation_id
      and not exists (
        select 1 from public.sales sale
        where sale.reservation_id = new.reservation_id and sale.status = 'completed'
      );
  end if;
  return new;
end;
$$;

create or replace function public.keep_completed_pos_reservation_scheduled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
    and exists (select 1 from public.sales sale where sale.reservation_id = new.id and sale.status = 'completed') then
    new.status := 'scheduled';
    new.attended_at := coalesce(new.attended_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists sales_mark_reservation_attended on public.sales;
create trigger sales_mark_reservation_attended
after insert or update of status, reservation_id on public.sales
for each row execute function public.mark_reservation_attendance_from_sale();

drop trigger if exists reservations_keep_pos_completion_scheduled on public.reservations;
create trigger reservations_keep_pos_completion_scheduled
before update of status on public.reservations
for each row execute function public.keep_completed_pos_reservation_scheduled();

revoke all on function public.record_reservation_reminder(uuid) from public, anon;
revoke all on function public.cancel_reservation(uuid, text) from public, anon;
revoke all on function public.mark_reservation_attendance_from_sale() from public, anon;
revoke all on function public.keep_completed_pos_reservation_scheduled() from public, anon;
grant execute on function public.record_reservation_reminder(uuid) to authenticated, service_role;
grant execute on function public.cancel_reservation(uuid, text) to authenticated, service_role;
