-- Corrige solo la sede de los barberos creados con el script 122.
-- No modifica cuentas Auth, roles, estado, datos personales ni permisos.

begin;

do $$
begin
  if (select count(*) from public.branches where code in ('LB-SSJ', 'LB-SRP')) <> 2 then
    raise exception 'Faltan las sedes LB-SSJ o LB-SRP.';
  end if;
end;
$$;

with assignment (branch_code, phone) as (
  values
    ('LB-SRP', '906840005'),
    ('LB-SRP', '932403338'),
    ('LB-SRP', '936866371'),
    ('LB-SRP', '925676158'),
    ('LB-SSJ', '916367308'),
    ('LB-SSJ', '981330538'),
    ('LB-SSJ', '921452058'),
    ('LB-SSJ', '918060963'),
    ('LB-SSJ', '980257628'),
    ('LB-SSJ', '935627411'),
    ('LB-SSJ', '929756312'),
    ('LB-SSJ', '931367011'),
    ('LB-SSJ', '937137611'),
    ('LB-SSJ', '942308924')
)
update public.employees employee
set branch_id = branch.id,
    updated_at = now()
from assignment
join public.branches branch on branch.code = assignment.branch_code
where employee.phone = assignment.phone
  and employee.role = 'barber';

commit;

select
  branch.code as codigo_sede,
  employee.full_name,
  employee.status
from public.employees employee
join public.branches branch on branch.id = employee.branch_id
where employee.role = 'barber'
  and employee.phone in (
    '906840005', '932403338', '936866371', '925676158',
    '916367308', '981330538', '921452058', '918060963', '980257628',
    '935627411', '929756312', '931367011', '937137611', '942308924'
  )
order by branch.code, employee.full_name;
