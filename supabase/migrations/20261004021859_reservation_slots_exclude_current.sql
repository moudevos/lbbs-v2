-- The fifth, optional parameter lets a reprogrammed reservation keep its own
-- slot in the availability list. Existing landing callers continue using four
-- parameters through the default value.
drop function if exists public.get_reservation_available_slots(uuid, uuid, uuid, date);

create function public.get_reservation_available_slots(
  p_branch_id uuid,
  p_service_id uuid,
  p_preferred_barber_id uuid,
  p_scheduled_date date,
  p_exclude_reservation_id uuid default null
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
  if auth.role() <> 'service_role' and not (
    public.is_admin() or (public.current_user_role() = 'reception' and public.can_access_branch(p_branch_id))
  ) then
    perform public.reservation_capacity_error('No tienes permisos para consultar disponibilidad en esta sede.');
  end if;

  if p_scheduled_date < (now() at time zone 'America/Lima')::date then return; end if;
  if not exists (select 1 from public.branches where id = p_branch_id and is_active) then
    perform public.reservation_capacity_error('La sede seleccionada no esta disponible.');
  end if;
  select coalesce(duration_minutes, 60) into v_duration from public.services where id = p_service_id and is_active;
  if v_duration is null then perform public.reservation_capacity_error('El servicio seleccionado no esta disponible.'); end if;
  if to_regclass('public.branch_schedules') is not null then
    execute 'select opens_at::time, closes_at::time, is_active from public.branch_schedules where branch_id = $1 and day_of_week = $2 limit 1'
      into v_open, v_close, v_schedule_active using p_branch_id, v_day_of_week;
    if found and not v_schedule_active then return; elsif not found then v_open := time '09:30'; v_close := time '21:30'; end if;
  end if;
  select count(*) into v_capacity from public.employees where branch_id = p_branch_id and role = 'barber' and status = 'active';
  if v_capacity = 0 then return; end if;
  if p_preferred_barber_id is not null and not exists (
    select 1 from public.employees where id = p_preferred_barber_id and branch_id = p_branch_id and role = 'barber' and status = 'active'
  ) then perform public.reservation_capacity_error('El barbero no esta disponible en esta sede.'); end if;

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
        and (p_exclude_reservation_id is null or reservation.id <> p_exclude_reservation_id)
        and v_slot < reservation.scheduled_time + make_interval(mins => coalesce(service.duration_minutes, 60))
        and v_slot + make_interval(mins => v_duration) > reservation.scheduled_time;
      if v_conflicts > 0 then continue; end if;
    end if;
    select count(*) into v_conflicts from public.reservations reservation
    left join public.services service on service.id = reservation.service_interest_id
    where reservation.branch_id = p_branch_id and reservation.scheduled_date = p_scheduled_date
      and reservation.status in ('scheduled', 'pending', 'contacted', 'confirmed', 'rescheduled', 'checked_in')
      and (p_exclude_reservation_id is null or reservation.id <> p_exclude_reservation_id)
      and v_slot < reservation.scheduled_time + make_interval(mins => coalesce(service.duration_minutes, 60))
      and v_slot + make_interval(mins => v_duration) > reservation.scheduled_time;
    if v_conflicts < v_capacity then slot_time := v_slot; return next; end if;
  end loop;
end;
$$;

revoke all on function public.get_reservation_available_slots(uuid, uuid, uuid, date, uuid) from public, anon;
grant execute on function public.get_reservation_available_slots(uuid, uuid, uuid, date, uuid) to authenticated, service_role;
