# Socios LBBS

Un socio es una ficha existente de `customers` con un perfil adicional en `socios`; no es empleado ni usa `employee_customer_links`.

## Datos y vigencia

`socios` guarda sede opcional, estado, inicio, fin y notas. Solo un perfil por cliente es válido. Un perfil inactivo o fuera de vigencia no ofrece beneficios en POS.

`socio_benefit_assignments` asigna una regla existente de `employee_benefit_rules` a un socio, con su propia vigencia. No existe un segundo catálogo de reglas.

## POS y producción

Al seleccionar un cliente, `get_pos_internal_options` identifica primero un socio activo y devuelve las reglas asignadas bajo `beneficiaryType: "socio"`. El POS presenta el texto “Beneficio Socio” y no ofrece crédito de empleado.

`checkout_socio_benefit_sale` aplica el mismo precio y límite de la regla existente, registra `sales.operation_kind = 'socio_benefit'` e incluye `socio_id`, regla, precio de lista, descuento, pago fijo y aporte operativo en `internal_pos_operations`. Luego llama a `complete_sale`, por lo que usa el inventario, cierre y producción ya existentes. Una venta con total cero no genera pago ni dinero en caja.

Los usos se contabilizan por socio, regla, período y ventas completadas. Una anulación no borra historia y deja de contar porque la consulta de uso considera solo ventas `completed`.

## Seguridad

Administradores y owner crean, editan, activan/desactivan socios y asignaciones. Recepción solo consulta datos permitidos y puede aplicar una regla válida durante el checkout autorizado de POS.

## Reglas de empleados

Editar una regla desde Configuración no modifica la versión existente: la versión anterior se cierra al día previo de la fecha operativa de Lima y se inserta una nueva versión desde dicha fecha. Las operaciones ya cerradas conservan sus snapshots monetarios.

## Limitaciones de esta fase

No se incorporan contratos, pagos a socios, cuponeras, portal de socios, ledger financiero ni dashboards financieros nuevos. El pago fijo y aporte operativo siguen la semántica vigente del generador de producción; no se crea una comisión paralela.
