-- Límite distribuido: todas las instancias comparten el mismo contador.
create table if not exists public.api_rate_limit_windows (
  scope text not null,
  client_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope, client_key, window_started_at)
);

alter table public.api_rate_limit_windows enable row level security;
revoke all on public.api_rate_limit_windows from public, anon, authenticated;
grant all on public.api_rate_limit_windows to service_role;

create or replace function public.consume_distributed_rate_limit(
  p_scope text,
  p_client_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_max_requests < 1 or p_window_seconds < 1 then
    raise exception 'Configuración de límite inválida.';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limit_windows (scope, client_key, window_started_at, request_count)
  values (left(p_scope, 80), left(p_client_key, 160), v_window, 1)
  on conflict (scope, client_key, window_started_at) do update
  set request_count = public.api_rate_limit_windows.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_distributed_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_distributed_rate_limit(text, text, integer, integer) to service_role;

create index if not exists api_rate_limit_windows_expiry_idx
  on public.api_rate_limit_windows (window_started_at);

notify pgrst, 'reload schema';
