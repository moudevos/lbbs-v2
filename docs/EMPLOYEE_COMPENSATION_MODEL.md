# Modelo de remuneración del personal

La migración 176 amplía el motor existente; no crea otro flujo de liquidación y no modifica la migración financiera 175.

## Contratos históricos

Cada condición queda en `employee_compensation_terms` con fecha de inicio y cierre. Cargo (`employees.position`), rol del sistema y remuneración son independientes.

- **Comisión + bonos:** no guarda porcentaje contractual. Al preparar la liquidación se indica el porcentaje de esa quincena. Recibe bonos aplicables.
- **Solo comisiones:** no tiene sueldo fijo; exige porcentaje al preparar y no suma bonos remunerativos de productos. Conserva las comisiones fijas de servicios que la regla comercial ya haya reconocido.
- **Fijo + bonos:** requiere sueldo mensual. Cada quincena normal reconoce la mitad del sueldo mensual, prorrateada por los días cubiertos por la vigencia del término. Recibe bonos aplicables.
- **Solo fijo:** requiere sueldo mensual y conserva atribuciones comerciales, pero no recibe bonos de venta ni comisión porcentual.

Los términos anteriores quedan como legado y no reciben una tasa o salario inventado. Para que un empleado use la nueva lógica se registra una condición nueva con fecha de vigencia.

## Producción individual y descuento obligatorio

`recognized_production_total` es la suma prospectiva de:

1. servicios activos con el valor reconocido por `employee_service_production` (Rewards, socios, beneficios y cortesías consumen su snapshot existente);
2. productos atribuidos explícitamente por línea en `employee_sale_item_attributions`.

El descuento obligatorio se calcula como:

`producción reconocida × tasa del perfil / 100`

No usa sueldo, comisión, neto a pagar ni deuda. Si el checkbox del perfil está apagado, la tasa y la base de descuento de la liquidación quedan en cero.

Por cada línea se conservan tres conceptos distintos: `recognized_production_amount`, `operational_contribution_amount` y `commissionable_amount`. El aporte reduce únicamente la base comisionable. Por ejemplo, reconocido S/ 10 y aporte S/ 2 producen una base de S/ 8; el 1 % obligatorio continúa calculándose sobre S/ 10. Las líneas de liquidación guardan además el valor reconocido como snapshot.

Un producto de barbería exige vendedor; cafetería y otras categorías pueden no tenerlo. Sin responsable no forman producción individual ni bono. El responsable se guarda por línea, por lo que una boleta puede atribuir productos a personas distintas.

## Liquidación y contabilidad

La liquidación sigue siendo draft → review → approved → paid. `gross_pay_amount` significa remuneración antes del descuento obligatorio: sueldo fijo del período + comisión porcentual + comisiones fijas válidas + bonos remunerativos según el perfil. `labor_cost_amount` es `gross_pay_amount - mandatory_discount_amount`. `net_pay_amount` es costo laboral menos deudas, adelantos, créditos y otras recuperaciones.

`net_before_mandatory_discount` es un campo heredado y no es la fuente oficial de costo ni de la base obligatoria para las liquidaciones V2. Los importes canónicos son `recognized_production_total`, `mandatory_discount_base_amount`, `mandatory_discount_amount`, `labor_cost_amount` y `net_pay_amount`.

Al aprobar, Fase 0 crea el único `financial_posting` de `personnel_cost` por `labor_cost_amount`, con fecha de término del período. Pagar reduce tesorería/obligación y no duplica el costo. Cancelar una liquidación aprobada usa la reversa existente. Las deudas se descuentan después del costo laboral; no reducen ese costo.

Liquidaciones pagadas, períodos cerrados y ventas/producciones anteriores al hito de atribución no se recalculan. Los borradores/revisiones existentes conservan su lógica anterior: se anulan antes de prepararse otra liquidación bajo la nueva configuración.
