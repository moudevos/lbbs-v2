-- Sprint 8.12: alinea el actor del snapshot con la convencion de empleados.
do $$
begin
  if exists (
    select 1
    from public.sale_document_snapshots snapshot
    left join public.employees employee on employee.id = snapshot.generated_by
    where snapshot.generated_by is not null
      and employee.id is null
  ) then
    raise exception 'No se puede alinear generated_by: existen actores que no corresponden a empleados.';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'sale_document_snapshots_generated_by_fkey'
      and conrelid = 'public.sale_document_snapshots'::regclass
      and pg_get_constraintdef(oid) not like '%REFERENCES employees(id)%'
  ) then
    alter table public.sale_document_snapshots
      drop constraint sale_document_snapshots_generated_by_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sale_document_snapshots_generated_by_fkey'
      and conrelid = 'public.sale_document_snapshots'::regclass
  ) then
    alter table public.sale_document_snapshots
      add constraint sale_document_snapshots_generated_by_fkey
      foreign key (generated_by) references public.employees(id) on delete set null;
  end if;
end;
$$;

notify pgrst, 'reload schema';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'sale_document_snapshots_generated_by_fkey';
