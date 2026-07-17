# Backup y recuperación

## Alcance crítico

Respaldar PostgreSQL y Storage, incluyendo ventas, pagos, stock, caja, rewards, producción, liquidaciones, finanzas, empleados, clientes y audit logs.

## Procedimiento sugerido

1. Definir responsable y frecuencia según volumen operativo.
2. Verificar que los backups administrados de Supabase estén habilitados para el plan contratado.
3. Mantener exportaciones protegidas y cifradas fuera del entorno de ejecución.
4. Probar restauración en un proyecto aislado antes de cualquier recuperación real.
5. Para recuperación parcial, identificar primero tablas, rango temporal y dependencias; no sobrescribir producción sin aprobación.
6. Para recuperación completa, detener escrituras, registrar hora de corte, restaurar, validar integridad y ejecutar smoke tests.

No existe evidencia en este repositorio de un backup verificado. La verificación y la prueba de restauración siguen pendientes del responsable de infraestructura.
