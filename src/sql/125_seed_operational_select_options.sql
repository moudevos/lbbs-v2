-- Seed manual de opciones seleccionables operativas.
-- No crea ventas, sesiones POS, movimientos de caja, movimientos de stock ni registros financieros.

begin;

insert into public.payment_methods (
  code, name, description, sort_order, is_active, payment_kind, allows_change, counts_as_cash
)
values
  ('cash', 'EFECTIVO', 'Cobro en efectivo.', 1, true, 'cash', true, true),
  ('qrayapeplin', 'QR YAPE/PLIN', 'Cobro por billetera digital o codigo QR.', 2, true, 'wallet_qr', false, false),
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
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

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
set name = excluded.name,
    description = excluded.description,
    movement_type = excluded.movement_type,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.courtesy_reasons (code, name, description, sort_order, is_active)
values
  ('cliente_frecuente', 'Cliente frecuente', 'Atencion especial para clientes recurrentes.', 1, true),
  ('compensacion', 'Compensacion', 'Compensacion por inconveniente operativo.', 2, true),
  ('promocion', 'Promocion', 'Cortesia por campana comercial.', 3, true),
  ('error_servicio', 'Error de servicio', 'Correccion por error detectado en el servicio.', 4, true),
  ('cortesia_admin', 'Cortesia autorizada', 'Cortesia aprobada por administracion.', 5, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

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
set name = excluded.name,
    description = excluded.description,
    movement_direction = excluded.movement_direction,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.sale_cancellation_reasons (code, name, description, sort_order, is_active)
values
  ('error_de_registro', 'Error de registro', 'Datos incorrectos durante el registro.', 1, true),
  ('cliente_desistio', 'Cliente desistio', 'El cliente decidio no continuar.', 2, true),
  ('pago_no_completado', 'Pago no completado', 'No se completo el pago de la venta.', 3, true),
  ('servicio_no_realizado', 'Servicio no realizado', 'El servicio finalmente no fue realizado.', 4, true),
  ('venta_duplicada', 'Venta duplicada', 'La venta fue registrada mas de una vez.', 5, true),
  ('otro', 'Otro motivo', 'Motivo no incluido en el catalogo.', 99, true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.finance_categories (code, name, direction, is_active, sort_order)
values
  ('other_income', 'Otros ingresos', 'income', true, 100),
  ('operating_expense', 'Gastos operativos', 'expense', true, 100),
  ('employee_settlement_payment', 'Pago de liquidacion', 'expense', true, 50)
on conflict (code) do update
set name = excluded.name,
    direction = excluded.direction,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.whatsapp_templates (code, name, contact_type, body, is_active)
values
  ('reservation_reminder_default', 'Recordatorio de reserva', 'reservation_reminder', 'Hola {{cliente}}, te recordamos tu reserva para {{fecha}} a las {{hora}} en {{sede}}. {{direccion}}. Barbero: {{barbero}}. Servicio de interes: {{servicio}}.', true),
  ('post_service_thanks_default', 'Agradecimiento post servicio', 'post_service_thanks', 'Gracias por visitarnos, {{cliente}}. Esperamos verte pronto en {{sede}}. Te atendio {{barbero}}. Servicios: {{servicios}}.', true)
on conflict (code) do update
set name = excluded.name,
    body = excluded.body,
    is_active = excluded.is_active,
    updated_at = now();

commit;

select 'metodos_pago' as catalogo, count(*) as total from public.payment_methods where is_active
union all
select 'unidades_producto', count(*) from public.product_units where is_active
union all
select 'motivos_stock', count(*) from public.stock_adjustment_reasons where is_active
union all
select 'motivos_cortesia', count(*) from public.courtesy_reasons where is_active
union all
select 'motivos_caja', count(*) from public.cash_movement_categories where is_active
union all
select 'motivos_anulacion', count(*) from public.sale_cancellation_reasons where is_active
union all
select 'categorias_finanzas', count(*) from public.finance_categories where is_active
union all
select 'plantillas_whatsapp', count(*) from public.whatsapp_templates where is_active;
