# Candidatos para migración manual a Socios

No se realizó conversión automática de empleados. Antes de migrar, ejecutar el siguiente reporte en Supabase y revisar cada fila con el negocio:

```sql
select
  employee.id as employee_id,
  employee.full_name as employee_name,
  link.customer_id,
  count(distinct operation.benefit_rule_id) as rules_used,
  count(operation.id) as historical_operations,
  min(sale.closed_at) as first_operation_at,
  max(sale.closed_at) as last_operation_at
from public.employees employee
join public.employee_customer_links link on link.employee_id = employee.id
left join public.internal_pos_operations operation on operation.employee_id = employee.id
left join public.sales sale on sale.id = operation.sale_id
where employee.status in ('active','inactive')
group by employee.id, employee.full_name, link.customer_id
order by historical_operations desc, employee.full_name;
```

Riesgo: convertir un empleado que trabaja en producción o tiene deudas/liquidaciones cambiaría el significado histórico de sus operaciones. Se debe crear el perfil Socio sobre el mismo `customer_id` solo después de confirmar que la persona no debe seguir siendo empleado.
