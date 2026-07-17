-- Sprint 9, iteracion 10: laboratorio QA persistente y auditable.
-- Ejecutar manualmente en Supabase SQL Editor despues de 109.

create table if not exists public.qa_runs (
  id uuid primary key default gen_random_uuid(),
  run_code text not null unique,
  sprint_number integer not null default 9,
  iteration_number integer not null default 10,
  status text not null default 'preparing',
  result text,
  app_commit text,
  app_branch text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  started_by uuid references public.employees(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_runs_run_code_check
    check (run_code ~ '^QA_RUN_[0-9]{8}_[0-9]{3,}$'),
  constraint qa_runs_sprint_number_check check (sprint_number > 0),
  constraint qa_runs_iteration_number_check check (iteration_number > 0),
  constraint qa_runs_status_check
    check (status in ('preparing', 'running', 'blocked', 'failed', 'passed', 'passed_with_observations', 'archived')),
  constraint qa_runs_result_check
    check (result is null or result in ('passed', 'passed_with_observations', 'failed', 'blocked')),
  constraint qa_runs_dates_check check (finished_at is null or finished_at >= started_at),
  constraint qa_runs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.qa_scenario_results (
  id uuid primary key default gen_random_uuid(),
  qa_run_id uuid not null references public.qa_runs(id) on delete restrict,
  scenario_code text not null,
  module text not null,
  status text not null default 'pending',
  severity text,
  expected_result text,
  actual_result text,
  duration_ms integer,
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint qa_scenario_results_run_scenario_key unique (qa_run_id, scenario_code),
  constraint qa_scenario_results_status_check
    check (status in ('pending', 'running', 'passed', 'failed', 'blocked', 'not_run')),
  constraint qa_scenario_results_severity_check
    check (severity is null or severity in ('P0', 'P1', 'P2', 'P3')),
  constraint qa_scenario_results_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint qa_scenario_results_dates_check
    check (finished_at is null or started_at is null or finished_at >= started_at),
  constraint qa_scenario_results_evidence_object_check check (jsonb_typeof(evidence) = 'object')
);

create table if not exists public.qa_entity_registry (
  id uuid primary key default gen_random_uuid(),
  qa_run_id uuid not null references public.qa_runs(id) on delete restrict,
  entity_schema text not null default 'public',
  entity_table text not null,
  entity_id text not null,
  entity_type text,
  scenario_code text,
  lifecycle_status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint qa_entity_registry_run_entity_key
    unique (qa_run_id, entity_schema, entity_table, entity_id),
  constraint qa_entity_registry_schema_check check (entity_schema ~ '^[a-z_][a-z0-9_]*$'),
  constraint qa_entity_registry_table_check check (entity_table ~ '^[a-z_][a-z0-9_]*$'),
  constraint qa_entity_registry_id_check check (btrim(entity_id) <> ''),
  constraint qa_entity_registry_lifecycle_check
    check (lifecycle_status in ('active', 'incomplete', 'cancelled', 'archived')),
  constraint qa_entity_registry_archive_check
    check (
      (lifecycle_status = 'archived' and archived_at is not null)
      or (lifecycle_status <> 'archived' and archived_at is null)
    ),
  constraint qa_entity_registry_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.qa_findings (
  id uuid primary key default gen_random_uuid(),
  qa_run_id uuid not null references public.qa_runs(id) on delete restrict,
  finding_code text not null unique,
  severity text not null,
  module text not null,
  title text not null,
  status text not null default 'open',
  expected_result text,
  actual_result text,
  root_cause text,
  fix_summary text,
  regression_result text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qa_findings_code_check check (finding_code ~ '^QA-[0-9]{3,}$'),
  constraint qa_findings_severity_check check (severity in ('P0', 'P1', 'P2', 'P3')),
  constraint qa_findings_status_check
    check (status in ('open', 'in_progress', 'fixed', 'verified', 'accepted', 'closed')),
  constraint qa_findings_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists qa_runs_status_started_at_idx
  on public.qa_runs (status, started_at desc);
create index if not exists qa_runs_started_by_idx
  on public.qa_runs (started_by);
create index if not exists qa_scenario_results_run_status_idx
  on public.qa_scenario_results (qa_run_id, status);
create index if not exists qa_entity_registry_run_scenario_idx
  on public.qa_entity_registry (qa_run_id, scenario_code);
create index if not exists qa_entity_registry_entity_lookup_idx
  on public.qa_entity_registry (entity_schema, entity_table, entity_id);
create index if not exists qa_findings_run_status_idx
  on public.qa_findings (qa_run_id, status);
create index if not exists qa_findings_severity_status_idx
  on public.qa_findings (severity, status);

drop trigger if exists qa_runs_set_updated_at on public.qa_runs;
create trigger qa_runs_set_updated_at
before update on public.qa_runs
for each row execute function public.set_updated_at();

drop trigger if exists qa_findings_set_updated_at on public.qa_findings;
create trigger qa_findings_set_updated_at
before update on public.qa_findings
for each row execute function public.set_updated_at();

alter table public.qa_runs enable row level security;
alter table public.qa_scenario_results enable row level security;
alter table public.qa_entity_registry enable row level security;
alter table public.qa_findings enable row level security;

drop policy if exists "qa_runs_admin_select" on public.qa_runs;
drop policy if exists "qa_runs_admin_insert" on public.qa_runs;
drop policy if exists "qa_runs_admin_update" on public.qa_runs;
create policy "qa_runs_admin_select"
on public.qa_runs for select to authenticated
using (public.is_admin());
create policy "qa_runs_admin_insert"
on public.qa_runs for insert to authenticated
with check (public.is_admin());
create policy "qa_runs_admin_update"
on public.qa_runs for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "qa_scenario_results_admin_select" on public.qa_scenario_results;
drop policy if exists "qa_scenario_results_admin_insert" on public.qa_scenario_results;
drop policy if exists "qa_scenario_results_admin_update" on public.qa_scenario_results;
create policy "qa_scenario_results_admin_select"
on public.qa_scenario_results for select to authenticated
using (public.is_admin());
create policy "qa_scenario_results_admin_insert"
on public.qa_scenario_results for insert to authenticated
with check (public.is_admin());
create policy "qa_scenario_results_admin_update"
on public.qa_scenario_results for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "qa_entity_registry_admin_select" on public.qa_entity_registry;
drop policy if exists "qa_entity_registry_admin_insert" on public.qa_entity_registry;
drop policy if exists "qa_entity_registry_admin_update" on public.qa_entity_registry;
create policy "qa_entity_registry_admin_select"
on public.qa_entity_registry for select to authenticated
using (public.is_admin());
create policy "qa_entity_registry_admin_insert"
on public.qa_entity_registry for insert to authenticated
with check (public.is_admin());
create policy "qa_entity_registry_admin_update"
on public.qa_entity_registry for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "qa_findings_admin_select" on public.qa_findings;
drop policy if exists "qa_findings_admin_insert" on public.qa_findings;
drop policy if exists "qa_findings_admin_update" on public.qa_findings;
create policy "qa_findings_admin_select"
on public.qa_findings for select to authenticated
using (public.is_admin());
create policy "qa_findings_admin_insert"
on public.qa_findings for insert to authenticated
with check (public.is_admin());
create policy "qa_findings_admin_update"
on public.qa_findings for update to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.qa_runs from anon, authenticated, public;
revoke all on public.qa_scenario_results from anon, authenticated, public;
revoke all on public.qa_entity_registry from anon, authenticated, public;
revoke all on public.qa_findings from anon, authenticated, public;
grant select, insert, update on public.qa_runs to authenticated;
grant select, insert, update on public.qa_scenario_results to authenticated;
grant select, insert, update on public.qa_entity_registry to authenticated;
grant select, insert, update on public.qa_findings to authenticated;
grant all on public.qa_runs to service_role;
grant all on public.qa_scenario_results to service_role;
grant all on public.qa_entity_registry to service_role;
grant all on public.qa_findings to service_role;

create or replace view public.qa_run_summary_v
with (security_invoker = true)
as
select
  qr.id as qa_run_id,
  qr.run_code,
  qr.sprint_number,
  qr.iteration_number,
  qr.status,
  qr.result,
  qr.app_commit,
  qr.app_branch,
  qr.started_at,
  qr.finished_at,
  coalesce(qs.total_scenarios, 0) as total_scenarios,
  coalesce(qs.passed_scenarios, 0) as passed_scenarios,
  coalesce(qs.failed_scenarios, 0) as failed_scenarios,
  coalesce(qs.blocked_scenarios, 0) as blocked_scenarios,
  coalesce(qe.entity_count, 0) as entity_count,
  coalesce(qf.open_findings, 0) as open_findings
from public.qa_runs qr
left join (
  select
    qa_run_id,
    count(*) as total_scenarios,
    count(*) filter (where status = 'passed') as passed_scenarios,
    count(*) filter (where status = 'failed') as failed_scenarios,
    count(*) filter (where status = 'blocked') as blocked_scenarios
  from public.qa_scenario_results
  group by qa_run_id
) qs on qs.qa_run_id = qr.id
left join (
  select qa_run_id, count(*) as entity_count
  from public.qa_entity_registry
  group by qa_run_id
) qe on qe.qa_run_id = qr.id
left join (
  select qa_run_id, count(*) as open_findings
  from public.qa_findings
  where status in ('open', 'in_progress', 'fixed')
  group by qa_run_id
) qf on qf.qa_run_id = qr.id;

create or replace view public.qa_run_entities_v
with (security_invoker = true)
as
select
  qr.run_code,
  qr.status as run_status,
  qer.id as registry_id,
  qer.entity_schema,
  qer.entity_table,
  qer.entity_id,
  qer.entity_type,
  qer.scenario_code,
  qer.lifecycle_status,
  qer.created_at,
  qer.archived_at,
  qer.metadata
from public.qa_entity_registry qer
join public.qa_runs qr on qr.id = qer.qa_run_id;

create or replace view public.qa_open_findings_v
with (security_invoker = true)
as
select
  qr.run_code,
  qf.finding_code,
  qf.severity,
  qf.module,
  qf.title,
  qf.status,
  qf.expected_result,
  qf.actual_result,
  qf.root_cause,
  qf.fix_summary,
  qf.regression_result,
  qf.created_at,
  qf.updated_at
from public.qa_findings qf
join public.qa_runs qr on qr.id = qf.qa_run_id
where qf.status in ('open', 'in_progress', 'fixed');

revoke all on public.qa_run_summary_v from anon, public;
revoke all on public.qa_run_entities_v from anon, public;
revoke all on public.qa_open_findings_v from anon, public;
grant select on public.qa_run_summary_v to authenticated, service_role;
grant select on public.qa_run_entities_v to authenticated, service_role;
grant select on public.qa_open_findings_v to authenticated, service_role;

notify pgrst, 'reload schema';
