-- Seed manual del catalogo legado de servicios y productos.
-- Servicios: catalogo global; solo Corte Fade tiene precio especial en LB-SSJ.
-- Productos: catalogo global sin movimientos de stock; el stock inicial permanece en cero.

begin;

do $$
begin
  if (select count(*) from public.branches where code in ('LB-SSJ', 'LB-SRP')) <> 2 then
    raise exception 'Faltan las sedes LB-SSJ o LB-SRP.';
  end if;
end;
$$;

insert into public.service_categories (name, slug, description, sort_order, is_active)
values
  ('Cortes', 'cortes', 'Servicios principales de corte.', 1, true),
  ('Barba y detalles', 'barba-detalles', 'Servicios de barba, cejas y detalles.', 2, true),
  ('Combos', 'combos', 'Servicios combinados.', 3, true),
  ('Tratamientos', 'tratamientos', 'Tratamientos capilares.', 4, true),
  ('Facial', 'facial', 'Servicios de limpieza facial.', 5, true),
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
    ('cortes', 'Corte Nino 5 anos', 'corte-nino-5-anos', 'Servicio para ninos de hasta 5 anos.', 25.00, 40, false),
    ('cortes', 'Corte de Cabello Puntas para Damas', 'corte-puntas-damas', 'Incluye masaje, locion, bebida e internet.', 30.00, 40, false),
    ('combos', 'Corte + Barba', 'corte-barba', 'Incluye masaje, locion, bebida e internet.', 60.00, 40, false),
    ('combos', 'Bajadita Premium', 'bajadita-premium', 'Corte, barba o diseno, lavado, cejas y aceite.', 70.00, 40, false),
    ('tratamientos', 'Semiondulado + Corte', 'semiondulado-corte', 'Incluye masaje, locion, bebida e internet.', 150.00, 40, false),
    ('tratamientos', 'Ondulado + Corte', 'ondulado-corte', 'Incluye masaje, locion, bebida e internet.', 180.00, 40, false),
    ('tratamientos', 'Rayitos en Platinado', 'rayitos-platinado', 'Incluye masaje, locion, bebida e internet.', 150.00, 40, false),
    ('tratamientos', 'Platinado + Corte', 'platinado-corte', 'Incluye masaje, locion, bebida e internet.', 200.00, 40, false),
    ('tratamientos', 'Prepigmentacion', 'prepigmentacion', 'Incluye masaje, locion, bebida e internet.', 80.00, 40, false),
    ('tratamientos', 'Alisado + Corte', 'alisado-corte', 'Incluye masaje, locion, bebida e internet.', 120.00, 40, false),
    ('facial', 'Limpieza Facial Premium', 'limpieza-facial-premium', 'Acido hialuronico, colageno y vitamina C.', 100.00, 40, false),
    ('facial', 'Limpieza Facial Express + Corte', 'limpieza-facial-express-corte', 'Acido hialuronico, colageno y vitamina C.', 120.00, 40, false),
    ('facial', 'Limpieza Facial Profunda + Corte', 'limpieza-facial-profunda-corte', 'Acido hialuronico, colageno y vitamina C.', 150.00, 40, false),
    ('barba-detalles', 'Barba Italiana', 'barba-italiana', 'Perfilacion con crema o aceite.', 30.00, 40, false),
    ('barba-detalles', 'Perfilado de Cejas', 'perfilado-cejas', 'Incluye masaje, locion, bebida e internet.', 25.00, 40, false),
    ('otros', 'Personalizado', 'servicio-personalizado', 'Servicio personalizado con precio manual.', 1.00, 60, true)
)
insert into public.services (
  category_id, name, slug, description, base_price, duration_minutes, allow_custom_price, is_active
)
select category.id, seed.name, seed.slug, seed.description, seed.base_price, seed.duration_minutes, seed.allow_custom_price, true
from seed
join public.service_categories category on category.slug = seed.category_slug
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    base_price = excluded.base_price,
    duration_minutes = excluded.duration_minutes,
    allow_custom_price = excluded.allow_custom_price,
    is_active = excluded.is_active,
    updated_at = now();

-- El catalogo legado tenia Corte Fade a S/ 35.00 en San Juan y S/ 40.00 como precio base.
insert into public.service_branch_prices (service_id, branch_id, price, is_active)
select service.id, branch.id, 35.00, true
from public.services service
join public.branches branch on branch.code = 'LB-SSJ'
where service.slug = 'corte-fade'
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

with seed (sku, name, slug, category_slug, cost_price, base_sale_price) as (
  values
    ('PROD-0001', 'Keke de banana', 'keke-de-banana', 'snacks-cafeteria', 0.00, 4.50),
    ('PROD-0002', 'Gel Rolda rojo x 500g', 'gel-rolda-rojo-500g', 'barberia', 18.00, 35.00),
    ('PROD-0003', 'Gel Rolda black x 500g', 'gel-rolda-black-500g', 'barberia', 23.00, 40.00),
    ('PROD-0004', 'Colonia Marmara N4', 'colonia-marmara-n4', 'barberia', 14.00, 25.00),
    ('PROD-0005', 'Colonia Marmara N1', 'colonia-marmara-n1', 'barberia', 14.00, 25.00),
    ('PROD-0006', 'Colonia Marmara N2', 'colonia-marmara-n2', 'barberia', 14.00, 25.00),
    ('PROD-0007', 'Bandido cera mate verde x150ml', 'bandido-cera-mate-verde-150ml', 'barberia', 18.50, 35.00),
    ('PROD-0008', 'Bandido cera aquawax dorado x150ml', 'bandido-cera-aquawax-dorado-150ml', 'barberia', 7.00, 35.00),
    ('PROD-0009', 'Bandido cera aquawax azul x150ml', 'bandido-cera-aquawax-azul-150ml', 'barberia', 13.00, 35.00),
    ('PROD-0010', 'Bandido cera aquawax plomo', 'bandido-cera-aquawax-plomo', 'barberia', 13.00, 35.00),
    ('PROD-0011', 'Bandido cera aquawax rojo x150ml', 'bandido-cera-aquawax-rojo-150ml', 'barberia', 13.00, 35.00),
    ('PROD-0012', 'Bandido cera aquawax negro x150ml', 'bandido-cera-aquawax-negro-150ml', 'barberia', 13.00, 35.00),
    ('PROD-0013', 'Gel Rolda rojo x250g', 'gel-rolda-rojo-250g', 'barberia', 13.00, 25.00),
    ('PROD-0014', 'Gel Rolda morado x250g', 'gel-rolda-morado-250g', 'barberia', 13.00, 25.00),
    ('PROD-0015', 'Gel Rolda azul x250g', 'gel-rolda-azul-250g', 'barberia', 13.00, 25.00),
    ('PROD-0016', 'Bandido fiber wax x150ml', 'bandido-fiber-wax-150ml', 'barberia', 0.00, 35.00),
    ('PROD-0017', 'Cafe americano', 'cafe-americano', 'snacks-cafeteria', 0.00, 6.00),
    ('PROD-0018', 'Capuchino', 'capuchino', 'snacks-cafeteria', 0.00, 8.00),
    ('PROD-0019', 'Cafe helado', 'cafe-helado', 'snacks-cafeteria', 0.00, 8.00),
    ('PROD-0020', 'Expreso', 'expreso', 'snacks-cafeteria', 0.00, 6.00),
    ('PROD-0021', 'Frozen de pina', 'frozen-de-pina', 'bebidas', 0.00, 10.00),
    ('PROD-0022', 'Frozen de mango', 'frozen-de-mango', 'bebidas', 0.00, 10.00),
    ('PROD-0023', 'Frozen de maracuya', 'frozen-de-maracuya', 'bebidas', 0.00, 10.00),
    ('PROD-0024', 'Frozen de fresa', 'frozen-de-fresa', 'bebidas', 0.00, 10.00),
    ('PROD-0025', 'Frozen de camu camu', 'frozen-de-camu-camu', 'bebidas', 0.00, 10.00),
    ('PROD-0026', 'Jugo de papaya', 'jugo-de-papaya', 'bebidas', 0.00, 8.00),
    ('PROD-0027', 'Jugo de pina', 'jugo-de-pina', 'bebidas', 0.00, 8.00),
    ('PROD-0028', 'Jugo de fresa', 'jugo-de-fresa', 'bebidas', 0.00, 8.00),
    ('PROD-0029', 'Keke de banana individual', 'keke-de-banana-individual', 'snacks-cafeteria', 0.00, 4.00),
    ('PROD-0030', 'Gelatina', 'gelatina', 'snacks-cafeteria', 0.00, 3.50),
    ('PROD-0031', 'Cafe en granos', 'cafe-en-granos', 'snacks-cafeteria', 0.00, 60.00),
    ('PROD-0032', 'Agua San Luis 500ml', 'agua-san-luis-500ml', 'bebidas', 0.83, 0.00),
    ('PROD-0033', 'Gaseosa Coca Cola', 'gaseosa-coca-cola', 'bebidas', 0.00, 3.00),
    ('PROD-0034', 'Dona Pepa', 'dona-pepa', 'snacks-cafeteria', 0.00, 2.00),
    ('PROD-0035', 'Doritos', 'doritos', 'snacks-cafeteria', 0.00, 2.00)
)
insert into public.products (
  category_id, sku, name, slug, unit, cost_price, base_sale_price,
  is_stockable, is_courtesy_allowed, is_active
)
select
  category.id, seed.sku, seed.name, seed.slug, 'unidad', seed.cost_price, seed.base_sale_price,
  true, false, true
from seed
join public.product_categories category on category.slug = seed.category_slug
on conflict (sku) do update
set category_id = excluded.category_id,
    name = excluded.name,
    slug = excluded.slug,
    unit = excluded.unit,
    cost_price = excluded.cost_price,
    base_sale_price = excluded.base_sale_price,
    is_stockable = excluded.is_stockable,
    is_courtesy_allowed = excluded.is_courtesy_allowed,
    is_active = excluded.is_active,
    updated_at = now();

commit;

select 'servicios' as tipo, count(*) as total from public.services
union all
select 'productos' as tipo, count(*) as total from public.products;
