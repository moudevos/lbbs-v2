# Iteración 04

## Validación de entorno

- `qaWritesEnabled`: `false`.
- `qaResetConfirmed`: `false`.
- Base URL local configurada para el puerto 3100.
- Credenciales owner configuradas.
- `.env.local` está ignorado por Git.
- Host Supabase registrado únicamente como host de proyecto en la ejecución segura.

## Resultado

No se realizaron escrituras ni se crearon usuarios, sedes, empleados, sesiones, ventas o datos `QA_TEST_DATA`.

La instrucción de la iteración exige detener las operaciones de escritura cuando ambos flags no están activos. Por ello quedan bloqueadas las fases de creación de admin/reception, barberos sin login, RLS entre sedes, POS, pagos, stock, caja, reservas, tickets, producción, simulaciones, liquidaciones, finanzas y concurrencia.

## Reanudación segura

Configurar fuera del repositorio:

```text
QA_ALLOW_WRITES=true
QA_RESET_CONFIRMED=true
```

Después se debe reiniciar desde esta iteración, volver a validar host y ejecutar el setup serial de datos QA.
