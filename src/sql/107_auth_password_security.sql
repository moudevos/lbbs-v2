-- Sprint 8.15: metadatos seguros para cambio y recuperación de contraseña.
-- No guarda contraseñas, tokens ni enlaces de recuperación.

alter table public.employees
  add column if not exists password_changed_at timestamptz,
  add column if not exists password_recovery_sent_at timestamptz,
  add column if not exists password_recovery_sent_by uuid references public.employees(id) on delete set null;

create index if not exists employees_password_recovery_sent_idx
  on public.employees (password_recovery_sent_at desc)
  where password_recovery_sent_at is not null;

notify pgrst, 'reload schema';
