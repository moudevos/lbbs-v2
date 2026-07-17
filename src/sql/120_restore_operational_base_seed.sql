-- Restauracion operativa inicial de LBBS v2.
-- Requiere que los scripts 001 a 119 ya esten ejecutados.
-- No modifica auth.users ni el perfil del owner existente.
-- Para ejecutar: cambia solo v_confirm_restore a true y ejecuta todo el archivo.

begin;

do $$
declare
  v_confirm_restore constant boolean := true;
begin
  if not v_confirm_restore then
    raise exception 'Restauracion bloqueada. Cambia v_confirm_restore a true despues de revisar el script.';
  end if;

  if not exists (select 1 from public.employees where role = 'owner') then
    raise exception 'No existe un empleado owner activo para preservar. La restauracion fue cancelada.';
  end if;
end;
$$;

-- Limpieza de laboratorio, historial operativo y datos dependientes.
delete from public.qa_findings;
delete from public.qa_scenario_results;
delete from public.qa_entity_registry;
delete from public.qa_runs;

delete from public.whatsapp_contact_logs;
delete from public.identity_lookup_logs;
delete from public.identity_lookup_cache;
delete from public.sale_document_snapshots;
delete from public.pos_session_legacy_closure_authorizations;
delete from public.pos_session_payment_closures;

delete from public.employee_settlement_adjustments;
delete from public.employee_settlement_deductions;
delete from public.employee_settlement_bonus_lines;
delete from public.employee_settlement_service_lines;
delete from public.employee_settlements;
delete from public.employee_benefit_usages;
delete from public.employee_supply_deliveries;
delete from public.employee_debt_movements;
delete from public.employee_debts;
delete from public.employee_product_bonus_entries;
delete from public.employee_service_production;
delete from public.payroll_periods;

delete from public.reward_redemptions;
delete from public.customer_reward_entitlements;
delete from public.customer_reward_ledger;
delete from public.reward_rules;
delete from public.reward_benefits;

delete from public.courtesy_rule_benefits;
delete from public.courtesy_rules;
delete from public.reward_service_commission_rules;
delete from public.courtesy_service_commission_rules;
delete from public.product_bonus_rules;
delete from public.employee_supply_markup_rules;
delete from public.production_operational_rules;

delete from public.finance_manual_entries;
delete from public.cash_movements;
delete from public.pos_session_events;
delete from public.sale_payments;
delete from public.sale_items;
delete from public.sales;
delete from public.reservation_notes;
delete from public.reservations;
delete from public.pos_sessions;
delete from public.customers;

delete from public.stock_movements;
delete from public.product_branch_prices;
delete from public.service_branch_prices;
delete from public.products;
delete from public.product_categories;
delete from public.services;
delete from public.service_categories;

delete from public.payment_methods;
delete from public.cash_movement_categories;
delete from public.product_units;
delete from public.courtesy_reasons;
delete from public.stock_adjustment_reasons;
delete from public.sale_cancellation_reasons;
delete from public.finance_categories;
delete from public.whatsapp_templates;
delete from public.app_settings;

-- Se conserva la auditoria del owner y se descarta la del resto de perfiles eliminados.
delete from public.audit_logs
where actor_employee_id is null
   or actor_employee_id not in (select id from public.employees where role = 'owner');

-- Se eliminan perfiles no owner. Las cuentas Auth se conservan sin permisos hasta enlazarlas.
delete from public.employees
where role <> 'owner';

-- Se estabilizan las dos sedes operativas sin cambiar el perfil del owner.
update public.branches
set
  name = 'LA BAJADITA SAN JUAN',
  slug = 'la-bajadita-san-juan',
  code = 'SAN-JUAN',
  short_name = 'San Juan',
  city = 'San Juan Bautista',
  is_active = true,
  updated_at = now()
where slug = 'la-bajadita-san-juan' or code = 'SAN-JUAN';

insert into public.branches (name, slug, code, short_name, city, is_active)
select 'LA BAJADITA SAN JUAN', 'la-bajadita-san-juan', 'SAN-JUAN', 'San Juan', 'San Juan Bautista', true
where not exists (
  select 1 from public.branches where slug = 'la-bajadita-san-juan' or code = 'SAN-JUAN'
);

update public.branches
set
  name = 'LA BAJADITA IQUITOS',
  slug = 'la-bajadita-iquitos',
  code = 'IQUITOS',
  short_name = 'Iquitos',
  city = 'Iquitos',
  is_active = true,
  updated_at = now()
where slug = 'la-bajadita-iquitos' or code = 'IQUITOS';

insert into public.branches (name, slug, code, short_name, city, is_active)
select 'LA BAJADITA IQUITOS', 'la-bajadita-iquitos', 'IQUITOS', 'Iquitos', 'Iquitos', true
where not exists (
  select 1 from public.branches where slug = 'la-bajadita-iquitos' or code = 'IQUITOS'
);

-- Las sedes anteriores se conservan inactivas para no alterar relaciones del owner.
update public.branches
set is_active = false, updated_at = now()
where slug not in ('la-bajadita-san-juan', 'la-bajadita-iquitos');

insert into public.service_categories (name, slug, description, sort_order, is_active)
values
  ('Cortes', 'cortes', 'Servicios principales de corte.', 1, true),
  ('Barba y detalles', 'barba-detalles', 'Barba, cejas y detalles.', 2, true),
  ('Combos', 'combos', 'Servicios combinados.', 3, true),
  ('Tratamientos', 'tratamientos', 'Tratamientos capilares.', 4, true),
  ('Facial', 'facial', 'Limpieza y cuidado facial.', 5, true),
  ('Otros', 'otros', 'Servicios de precio manual.', 6, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

with seed (category_slug, name, slug, description, base_price, duration_minutes, allow_custom_price) as (
  values
    ('cortes', 'Corte Ejecutivo', 'corte-ejecutivo', 'Incluye masaje, locion, bebida e internet.', 35.00, 40, false),
    ('cortes', 'Corte Fade', 'corte-fade', 'Incluye masaje, locion, bebida e internet.', 40.00, 40, false),
    ('cortes', 'Corte Clasico', 'corte-clasico', 'Incluye masaje, locion, bebida e internet.', 30.00, 40, false),
    ('cortes', 'Corte a Tijeras', 'corte-a-tijeras', 'Incluye masaje, locion, bebida e internet.', 35.00, 40, false),
    ('combos', 'Corte + Barba', 'corte-barba', 'Incluye masaje, locion, bebida e internet.', 60.00, 40, false),
    ('combos', 'Bajadita Premium', 'bajadita-premium', 'Corte, barba o diseno, lavado, cejas y aceite.', 70.00, 40, false),
    ('tratamientos', 'Semiondulado + Corte', 'semiondulado-corte', 'Incluye masaje, locion, bebida e internet.', 150.00, 40, false),
    ('tratamientos', 'Ondulado + Corte', 'ondulado-corte', 'Incluye masaje, locion, bebida e internet.', 180.00, 40, false),
    ('tratamientos', 'Rayitos en Platinado', 'rayitos-platinado', 'Incluye masaje, locion, bebida e internet.', 150.00, 40, false),
    ('tratamientos', 'Platinado + Corte', 'platinado-corte', 'Incluye masaje, locion, bebida e internet.', 200.00, 40, false),
    ('tratamientos', 'Prepigmentacion', 'prepigmentacion', 'Incluye masaje, locion, bebida e internet.', 80.00, 40, false),
    ('tratamientos', 'Alisado + Corte', 'alisado-corte', 'Incluye masaje, locion, bebida e internet.', 120.00, 40, false),
    ('facial', 'Limpieza Facial Premium', 'limpieza-facial-premium', 'Cuidado facial con masaje, locion y bebida.', 100.00, 40, false),
    ('facial', 'Limpieza Facial Express + Corte', 'limpieza-facial-express-corte', 'Cuidado facial con corte, masaje, locion y bebida.', 120.00, 40, false),
    ('facial', 'Limpieza Facial Profunda + Corte', 'limpieza-facial-profunda-corte', 'Cuidado facial profundo con corte, masaje, locion y bebida.', 150.00, 40, false),
    ('barba-detalles', 'Barba Italiana', 'barba-italiana', 'Perfilacion con crema o aceite.', 30.00, 40, false),
    ('barba-detalles', 'Perfilado de Cejas', 'perfilado-cejas', 'Incluye masaje, locion, bebida e internet.', 25.00, 40, false),
    ('cortes', 'Corte de Cabello Puntas para Damas', 'corte-puntas-damas', 'Incluye masaje, locion, bebida e internet.', 30.00, 40, false),
    ('otros', 'Personalizado', 'servicio-personalizado', 'Servicio personalizado con descripcion y precio manual.', 1.00, 60, true)
)
insert into public.services (category_id, name, slug, description, base_price, duration_minutes, allow_custom_price, is_active)
select c.id, seed.name, seed.slug, seed.description, seed.base_price, seed.duration_minutes, seed.allow_custom_price, true
from seed
join public.service_categories c on c.slug = seed.category_slug
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    base_price = excluded.base_price,
    duration_minutes = excluded.duration_minutes,
    allow_custom_price = excluded.allow_custom_price,
    is_active = true,
    updated_at = now();

-- La duracion es global. Solo Corte Fade tiene un precio especial en Iquitos.
insert into public.service_branch_prices (service_id, branch_id, price, is_active)
select s.id, b.id, 35.00, true
from public.services s
join public.branches b on b.slug = 'la-bajadita-iquitos'
where s.slug = 'corte-fade'
on conflict (service_id, branch_id) do update
set price = excluded.price,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.product_categories (name, slug, description, sort_order, is_active)
values
  ('Productos de barberia', 'barberia', 'Productos de cuidado y peinado.', 1, true),
  ('Bebidas', 'bebidas', 'Bebidas y refrescos.', 2, true),
  ('Snacks y cafeteria', 'snacks-cafeteria', 'Snacks, postres y cafeteria.', 3, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

with seed (sku, name, slug, description, category_slug, cost_price, base_sale_price) as (
  values
    ('PROD-0001', 'Keke de banana', 'keke-de-banana', 'Keke de banana.', 'snacks-cafeteria', 0.00, 4.50),
    ('PROD-0002', 'Gel Rolda rojo x 500g', 'gel-rolda-rojo-500g', null, 'barberia', 18.00, 35.00),
    ('PROD-0003', 'Gel Rolda black x 500g', 'gel-rolda-black-500g', null, 'barberia', 23.00, 40.00),
    ('PROD-0004', 'Colonia Marmara N4', 'colonia-marmara-n4', 'Colonia transparente.', 'barberia', 14.00, 25.00),
    ('PROD-0005', 'Colonia Marmara N1', 'colonia-marmara-n1', 'Colonia morada.', 'barberia', 14.00, 25.00),
    ('PROD-0006', 'Colonia Marmara N2', 'colonia-marmara-n2', 'Colonia azul.', 'barberia', 14.00, 25.00),
    ('PROD-0007', 'Bandido cera mate verde x150ml', 'bandido-cera-mate-verde-150ml', null, 'barberia', 18.50, 35.00),
    ('PROD-0008', 'Bandido cera aquawax dorado x150ml', 'bandido-cera-aquawax-dorado-150ml', null, 'barberia', 7.00, 35.00),
    ('PROD-0009', 'Bandido cera aquawax azul x150ml', 'bandido-cera-aquawax-azul-150ml', null, 'barberia', 13.00, 35.00),
    ('PROD-0010', 'Bandido cera aquawax plomo', 'bandido-cera-aquawax-plomo', null, 'barberia', 13.00, 35.00),
    ('PROD-0011', 'Bandido cera aquawax rojo x150ml', 'bandido-cera-aquawax-rojo-150ml', null, 'barberia', 13.00, 35.00),
    ('PROD-0012', 'Bandido cera aquawax negro x150ml', 'bandido-cera-aquawax-negro-150ml', null, 'barberia', 13.00, 35.00),
    ('PROD-0013', 'Gel Rolda rojo x250g', 'gel-rolda-rojo-250g', null, 'barberia', 13.00, 25.00),
    ('PROD-0014', 'Gel Rolda morado x250g', 'gel-rolda-morado-250g', null, 'barberia', 13.00, 25.00),
    ('PROD-0015', 'Gel Rolda azul x250g', 'gel-rolda-azul-250g', null, 'barberia', 13.00, 25.00),
    ('PROD-0016', 'Bandido fiber wax x150ml', 'bandido-fiber-wax-150ml', null, 'barberia', 0.00, 35.00),
    ('PROD-0017', 'Cafe americano', 'cafe-americano', null, 'snacks-cafeteria', 0.00, 6.00),
    ('PROD-0018', 'Capuchino', 'capuchino', null, 'snacks-cafeteria', 0.00, 8.00),
    ('PROD-0019', 'Cafe helado', 'cafe-helado', null, 'snacks-cafeteria', 0.00, 8.00),
    ('PROD-0020', 'Expreso', 'expreso', null, 'snacks-cafeteria', 0.00, 6.00),
    ('PROD-0021', 'Frozen de pina', 'frozen-de-pina', null, 'bebidas', 0.00, 10.00),
    ('PROD-0022', 'Frozen de mango', 'frozen-de-mango', null, 'bebidas', 0.00, 10.00),
    ('PROD-0023', 'Frozen de maracuya', 'frozen-de-maracuya', null, 'bebidas', 0.00, 10.00),
    ('PROD-0024', 'Frozen de fresa', 'frozen-de-fresa', null, 'bebidas', 0.00, 10.00),
    ('PROD-0025', 'Frozen de camu camu', 'frozen-de-camu-camu', null, 'bebidas', 0.00, 10.00),
    ('PROD-0026', 'Jugo de papaya', 'jugo-de-papaya', null, 'bebidas', 0.00, 8.00),
    ('PROD-0027', 'Jugo de pina', 'jugo-de-pina', null, 'bebidas', 0.00, 8.00),
    ('PROD-0028', 'Jugo de fresa', 'jugo-de-fresa', null, 'bebidas', 0.00, 8.00),
    ('PROD-0030', 'Gelatina', 'gelatina', null, 'snacks-cafeteria', 0.00, 3.50),
    ('PROD-0031', 'Cafe en granos', 'cafe-en-granos', null, 'snacks-cafeteria', 0.00, 60.00),
    ('PROD-0032', 'Agua San Luis 500ml', 'agua-san-luis-500ml', null, 'bebidas', 0.83, 0.00),
    ('PROD-0033', 'Gaseosa Coca Cola', 'gaseosa-coca-cola', null, 'bebidas', 0.00, 3.00),
    ('PROD-0034', 'Dona Pepa', 'dona-pepa', null, 'snacks-cafeteria', 0.00, 2.00),
    ('PROD-0035', 'Doritos', 'doritos', null, 'snacks-cafeteria', 0.00, 2.00)
)
insert into public.products (
  category_id, sku, name, slug, description, unit, cost_price, base_sale_price,
  is_stockable, is_courtesy_allowed, is_active
)
select c.id, seed.sku, seed.name, seed.slug, seed.description, 'unidad', seed.cost_price,
       seed.base_sale_price, true, false, true
from seed
join public.product_categories c on c.slug = seed.category_slug
on conflict (sku) do update
set category_id = excluded.category_id,
    name = excluded.name,
    slug = excluded.slug,
    description = excluded.description,
    unit = excluded.unit,
    cost_price = excluded.cost_price,
    base_sale_price = excluded.base_sale_price,
    is_stockable = excluded.is_stockable,
    is_courtesy_allowed = excluded.is_courtesy_allowed,
    is_active = excluded.is_active,
    updated_at = now();

-- El stock inicial queda en cero porque no se crean movimientos ficticios de apertura.

insert into public.employees (
  branch_id, full_name, email, phone, role, status, position,
  can_login, must_change_password, notes
)
values
  ((select id from public.branches where slug = 'la-bajadita-san-juan'), 'Rodolfo Rojas', 'rrojasdelaguila@gmail.com', '987499571', 'admin', 'active', 'Administrador', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Nicole Elespuro', 'labajaditabs@gmail.com', '929618376', 'admin', 'active', 'Administradora', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-san-juan'), 'Grecia Maricielo', 'labajaditacontacto@gmail.com', '906248846', 'reception', 'active', 'Recepcionista', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-san-juan'), 'Gerson Yahuarcani Cachique', 'gersonalcibiades@gmail.com', '906840005', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Heber Lincoln Cueva Bustamante', 'cheber.bus@gmail.com', '916367308', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'David Ochoa', 'ochoaguerradavid2@gmail.com', '981330538', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Wagner Danilo Inuma Fachin', 'danilofacin2@gmail.com', '921452058', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Jack Gallardo', 'jackgallardo71@gmail.com', '918060963', 'barber', 'inactive', 'Barbero', false, false, 'Perfil legado inactivo.'),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Harley Sinarahua Grandez', null, '980257628', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-san-juan'), 'Nick Andrew Nicolini Caceres', 'nicknicolini0605@gmail.com', '932403338', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-san-juan'), 'Jaime Ali Tello Huinapi', 'jaimealitello@gmail.com', '936866371', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-san-juan'), 'Bruce Anderson Villacorta Ramirez', 'andervillacorta19@icloud.com', '925676158', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Leonardo Pinche', 'leonardosanchezpinche@gmail.com', '935627411', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Junior Ortega Pisuri', 'ortegapisurijunior22@gmail.com', '929756312', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Vianca del Carmen Serroy Pezo', 'viancaserroy0@gmail.com', '931367011', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Luis Eduardo Perez Chumbico', 'luipe1804@gmail.com', '937137611', 'barber', 'active', 'Barbero', false, false, null),
  ((select id from public.branches where slug = 'la-bajadita-iquitos'), 'Oscar Davila', 'oscardavilapereya27@gmail.com', '942308924', 'barber', 'active', 'Barbero', false, false, null);

-- Solo se habilita acceso si ya existe una cuenta Auth con el correo correspondiente.
-- No se crean contrasenas ni usuarios Auth desde SQL.
update public.employees e
set
  user_id = u.id,
  can_login = true,
  must_change_password = false,
  login_created_at = coalesce(e.login_created_at, now()),
  updated_at = now()
from auth.users u
where e.user_id is null
  and lower(e.email) = lower(u.email)
  and e.email in (
    'rrojasdelaguila@gmail.com',
    'labajaditabs@gmail.com',
    'labajaditacontacto@gmail.com'
  );

insert into public.payment_methods (
  code, name, description, sort_order, is_active, payment_kind, allows_change, counts_as_cash
)
values
  ('cash', 'EFECTIVO', 'Cobro en efectivo.', 1, true, 'cash', true, true),
  ('qrayapeplin', 'QR YAPE/PLIN', 'Cobro por billetera digital o QR.', 2, true, 'wallet_qr', false, false),
  ('culqi', 'CULQI', 'Cobro por tarjeta procesado por Culqi.', 3, true, 'card', false, false),
  ('transferencia', 'TRANSFERENCIA BANCARIA', 'Cobro por transferencia bancaria.', 4, true, 'bank_transfer', false, false)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    payment_kind = excluded.payment_kind,
    allows_change = excluded.allows_change,
    counts_as_cash = excluded.counts_as_cash,
    updated_at = now();

insert into public.product_units (code, name, description, sort_order, is_active)
values
  ('unidad', 'Unidad', 'Unidad individual.', 1, true),
  ('botella', 'Botella', 'Presentacion tipo botella.', 2, true),
  ('paquete', 'Paquete', 'Presentacion agrupada.', 3, true),
  ('porcion', 'Porcion', 'Uso por porciones.', 4, true),
  ('otro', 'Otro', 'Unidad operativa personalizada.', 5, true)
on conflict (code) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
    is_active = excluded.is_active, updated_at = now();

insert into public.stock_adjustment_reasons (code, name, description, movement_type, sort_order, is_active)
values
  ('conteo_fisico', 'Conteo fisico', 'Ajuste por diferencia encontrada en conteo.', 'adjustment', 1, true),
  ('merma', 'Merma', 'Salida por perdida o dano del producto.', 'waste', 2, true),
  ('vencimiento', 'Vencimiento', 'Salida por producto vencido.', 'waste', 3, true),
  ('error_registro', 'Error de registro', 'Correccion por registro previo incorrecto.', 'adjustment', 4, true),
  ('uso_interno', 'Uso interno', 'Salida para consumo interno.', 'adjustment', 5, true),
  ('reposicion', 'Reposicion', 'Ingreso por reposicion manual.', 'purchase', 6, true),
  ('transferencia_entrada', 'Transferencia recibida', 'Ingreso recibido desde otra sede.', 'transfer_in', 7, true),
  ('transferencia_salida', 'Transferencia enviada', 'Salida enviada a otra sede.', 'transfer_out', 8, true)
on conflict (code) do update
set name = excluded.name, description = excluded.description, movement_type = excluded.movement_type,
    sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = now();

insert into public.courtesy_reasons (code, name, description, sort_order, is_active)
values
  ('cliente_frecuente', 'Cliente frecuente', 'Atencion especial para clientes recurrentes.', 1, true),
  ('compensacion', 'Compensacion', 'Compensacion por inconveniente operativo.', 2, true),
  ('promocion', 'Promocion', 'Cortesia por campana comercial.', 3, true),
  ('error_servicio', 'Error de servicio', 'Correccion por error detectado en el servicio.', 4, true),
  ('cortesia_admin', 'Cortesia autorizada', 'Cortesia aprobada por administracion.', 5, true)
on conflict (code) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
    is_active = excluded.is_active, updated_at = now();

insert into public.cash_movement_categories (code, name, description, movement_direction, sort_order, is_active)
values
  ('operational_income', 'Ingreso operativo', 'Ingreso manual fuera de ventas.', 'income', 1, true),
  ('employee_supply_collection', 'Cobro de insumo a empleado', 'Cobro manual por insumos entregados.', 'income', 2, true),
  ('cash_replenishment', 'Reposicion de caja', 'Ingreso para reponer efectivo operativo.', 'income', 3, true),
  ('other_income', 'Otro ingreso', 'Ingreso operativo no clasificado.', 'income', 4, true),
  ('operational_purchase', 'Compra operativa', 'Compra pagada desde caja sin afectar stock.', 'expense', 10, true),
  ('petty_purchase', 'Compra menor', 'Compra operativa menor pagada desde caja.', 'expense', 11, true),
  ('cash_withdrawal', 'Retiro de efectivo', 'Salida de efectivo de caja.', 'expense', 12, true),
  ('employee_settlement_payment', 'Pago de liquidacion', 'Salida de efectivo por liquidacion de empleado.', 'expense', 13, true),
  ('other_expense', 'Otro egreso', 'Egreso operativo no clasificado.', 'expense', 14, true),
  ('cash_adjustment', 'Ajuste de caja', 'Ajuste manual de caja operativa.', 'adjustment', 20, true),
  ('positive_adjustment', 'Ajuste positivo', 'Correccion positiva de caja.', 'adjustment', 21, true),
  ('negative_adjustment', 'Ajuste negativo', 'Correccion negativa de caja.', 'adjustment', 22, true)
on conflict (code) do update
set name = excluded.name, description = excluded.description, movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order, is_active = excluded.is_active, updated_at = now();

insert into public.sale_cancellation_reasons (code, name, description, sort_order, is_active)
values
  ('error_de_registro', 'Error de registro', 'Datos incorrectos durante el registro.', 1, true),
  ('cliente_desistio', 'Cliente desistio', 'El cliente decidio no continuar.', 2, true),
  ('pago_no_completado', 'Pago no completado', 'No se completo el pago de la venta.', 3, true),
  ('servicio_no_realizado', 'Servicio no realizado', 'El servicio finalmente no fue realizado.', 4, true),
  ('venta_duplicada', 'Venta duplicada', 'La venta fue registrada mas de una vez.', 5, true),
  ('otro', 'Otro motivo', 'Motivo no incluido en el catalogo.', 99, true)
on conflict (code) do update
set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order,
    is_active = excluded.is_active, updated_at = now();

insert into public.finance_categories (code, name, direction, is_active, sort_order)
values
  ('other_income', 'Otros ingresos', 'income', true, 100),
  ('operating_expense', 'Gastos operativos', 'expense', true, 100),
  ('employee_settlement_payment', 'Pago de liquidacion', 'expense', true, 50)
on conflict (code) do update
set name = excluded.name, direction = excluded.direction, is_active = excluded.is_active,
    sort_order = excluded.sort_order, updated_at = now();

insert into public.production_operational_rules (
  name, minimum_amount, maximum_amount, calculation_type, calculation_value,
  priority, is_active, effective_from
)
values
  ('Aporte servicios menores a S/ 60', 0, 59.99, 'fixed', 2, 20, true, date '2000-01-01'),
  ('Aporte servicios desde S/ 60', 60, null, 'fixed', 10, 10, true, date '2000-01-01');

insert into public.whatsapp_templates (code, name, contact_type, body, is_active)
values
  ('reservation_reminder_default', 'Recordatorio de reserva', 'reservation_reminder', 'Hola {{cliente}}, te recordamos tu reserva para {{fecha}} a las {{hora}} en {{sede}}. {{direccion}}. Barbero: {{barbero}}. Servicio de interes: {{servicio}}.', true),
  ('post_service_thanks_default', 'Agradecimiento post servicio', 'post_service_thanks', 'Gracias por visitarnos, {{cliente}}. Esperamos verte pronto en {{sede}}. Te atendio {{barbero}}. Servicios: {{servicios}}.', true)
on conflict (code) do update
set name = excluded.name, body = excluded.body, is_active = excluded.is_active, updated_at = now();

insert into public.customers (
  full_name, first_name, last_name, phone, phone_normalized, source, is_active
)
values (
  'Cliente varios', 'Cliente', 'varios', '000000000', '000000000', 'system', true
);

insert into public.app_settings (key, value, description)
values
  ('app.name', '"LBBS v2"'::jsonb, 'Nombre visible de la aplicacion.'),
  ('app.sprint', '"restauracion-operativa"'::jsonb, 'Base operativa restaurada.')
on conflict (key) do update
set value = excluded.value, description = excluded.description, updated_at = now();

commit;

-- Verificacion posterior a la restauracion.
select
  (select count(*) from public.employees where role = 'owner') as owners_preservados,
  (select count(*) from public.branches where is_active) as sedes_activas,
  (select count(*) from public.employees where role = 'barber') as barberos,
  (select count(*) from public.services where is_active) as servicios_activos,
  (select count(*) from public.products where is_active) as productos_activos,
  (select count(*) from public.stock_movements) as movimientos_stock,
  (select count(*) from public.payment_methods where is_active) as metodos_pago_activos;

select code, name, is_active
from public.branches
order by is_active desc, code;

select full_name, role, status, can_login, email
from public.employees
order by role, full_name;
