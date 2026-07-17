-- Seed manual de barberos por sede.
-- Requiere las sedes con codigos LB-SSJ y LB-SRP.
-- No crea, elimina ni vincula cuentas en auth.users.

begin;

do $$
begin
  if (select count(*) from public.branches where code in ('LB-SSJ', 'LB-SRP')) <> 2 then
    raise exception 'Faltan las sedes LB-SSJ o LB-SRP. Crea o corrige ambas sedes antes de ejecutar este script.';
  end if;
end;
$$;

with seed (branch_code, full_name, email, phone, status, notes) as (
  values
    ('LB-SRP', 'Gerson Yahuarcani Cachique', 'gersonalcibiades@gmail.com', '906840005', 'active'::public.employee_status, null),
    ('LB-SRP', 'Nick Andrew Nicolini Caceres', 'nicknicolini0605@gmail.com', '932403338', 'active'::public.employee_status, null),
    ('LB-SRP', 'Jaime Ali Tello Huinapi', 'jaimealitello@gmail.com', '936866371', 'active'::public.employee_status, null),
    ('LB-SRP', 'Bruce Anderson Villacorta Ramirez', 'andervillacorta19@icloud.com', '925676158', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Heber Lincoln Cueva Bustamante', 'cheber.bus@gmail.com', '916367308', 'active'::public.employee_status, null),
    ('LB-SSJ', 'David Ochoa', 'ochoaguerradavid2@gmail.com', '981330538', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Wagner Danilo Inuma Fachin', 'danilofacin2@gmail.com', '921452058', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Jack Gallardo', 'jackgallardo71@gmail.com', '918060963', 'inactive'::public.employee_status, 'Perfil legado inactivo.'),
    ('LB-SSJ', 'Harley Sinarahua Grandez', null, '980257628', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Leonardo Pinche', 'leonardosanchezpinche@gmail.com', '935627411', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Junior Ortega Pisuri', 'ortegapisurijunior22@gmail.com', '929756312', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Vianca del Carmen Serroy Pezo', 'viancaserroy0@gmail.com', '931367011', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Luis Eduardo Perez Chumbico', 'luipe1804@gmail.com', '937137611', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Oscar Davila', 'oscardavilapereya27@gmail.com', '942308924', 'active'::public.employee_status, null)
), resolved as (
  select b.id as branch_id, seed.full_name, seed.email, seed.phone, seed.status, seed.notes
  from seed
  join public.branches b on b.code = seed.branch_code
)
update public.employees employee
set
  branch_id = resolved.branch_id,
  full_name = resolved.full_name,
  email = resolved.email,
  phone = resolved.phone,
  role = 'barber',
  status = resolved.status,
  position = 'Barbero',
  can_login = false,
  must_change_password = false,
  notes = resolved.notes,
  updated_at = now()
from resolved
where (resolved.email is not null and lower(employee.email) = lower(resolved.email))
   or employee.phone = resolved.phone;

with seed (branch_code, full_name, email, phone, status, notes) as (
  values
    ('LB-SRP', 'Gerson Yahuarcani Cachique', 'gersonalcibiades@gmail.com', '906840005', 'active'::public.employee_status, null),
    ('LB-SRP', 'Nick Andrew Nicolini Caceres', 'nicknicolini0605@gmail.com', '932403338', 'active'::public.employee_status, null),
    ('LB-SRP', 'Jaime Ali Tello Huinapi', 'jaimealitello@gmail.com', '936866371', 'active'::public.employee_status, null),
    ('LB-SRP', 'Bruce Anderson Villacorta Ramirez', 'andervillacorta19@icloud.com', '925676158', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Heber Lincoln Cueva Bustamante', 'cheber.bus@gmail.com', '916367308', 'active'::public.employee_status, null),
    ('LB-SSJ', 'David Ochoa', 'ochoaguerradavid2@gmail.com', '981330538', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Wagner Danilo Inuma Fachin', 'danilofacin2@gmail.com', '921452058', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Jack Gallardo', 'jackgallardo71@gmail.com', '918060963', 'inactive'::public.employee_status, 'Perfil legado inactivo.'),
    ('LB-SSJ', 'Harley Sinarahua Grandez', null, '980257628', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Leonardo Pinche', 'leonardosanchezpinche@gmail.com', '935627411', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Junior Ortega Pisuri', 'ortegapisurijunior22@gmail.com', '929756312', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Vianca del Carmen Serroy Pezo', 'viancaserroy0@gmail.com', '931367011', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Luis Eduardo Perez Chumbico', 'luipe1804@gmail.com', '937137611', 'active'::public.employee_status, null),
    ('LB-SSJ', 'Oscar Davila', 'oscardavilapereya27@gmail.com', '942308924', 'active'::public.employee_status, null)
), resolved as (
  select b.id as branch_id, seed.full_name, seed.email, seed.phone, seed.status, seed.notes
  from seed
  join public.branches b on b.code = seed.branch_code
)
insert into public.employees (
  branch_id, full_name, email, phone, role, status, position,
  can_login, must_change_password, notes
)
select
  resolved.branch_id, resolved.full_name, resolved.email, resolved.phone, 'barber', resolved.status, 'Barbero',
  false, false, resolved.notes
from resolved
where not exists (
  select 1
  from public.employees employee
  where (resolved.email is not null and lower(employee.email) = lower(resolved.email))
     or employee.phone = resolved.phone
);

commit;

select
  branch.code as codigo_sede,
  employee.full_name,
  employee.phone,
  employee.email,
  employee.status,
  employee.can_login
from public.employees employee
join public.branches branch on branch.id = employee.branch_id
where employee.role = 'barber'
  and branch.code in ('LB-SSJ', 'LB-SRP')
order by branch.code, employee.full_name;
