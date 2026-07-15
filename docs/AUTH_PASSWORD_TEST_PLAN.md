# Validación manual: módulo de contraseñas

Este repositorio no tiene un runner de pruebas automatizadas configurado. Ejecuta los siguientes casos en una cuenta de QA después de aplicar `src/sql/107_auth_password_security.sql`.

## Recuperación

1. Solicita recuperación para un correo existente y otro inexistente.
2. Confirma que ambos muestran el mismo mensaje genérico.
3. Abre el enlace recibido y verifica que llega a `/auth/confirm` y luego a `/restablecer-contrasena`.
4. Prueba un enlace vencido o reutilizado: debe mostrar una pantalla controlada sin información técnica.
5. Restablece una contraseña que cumpla la política, inicia sesión con ella y confirma el evento en `audit_logs`.

## Cambio autenticado

1. Abre `/control/mi-cuenta` con una sesión válida.
2. Ingresa una contraseña actual incorrecta: la actualización debe rechazarse.
3. Prueba contraseña débil, confirmación distinta y contraseña igual a la actual.
4. Completa el cambio con una contraseña válida y confirma que se redirige a `/login`.

## Cambio obligatorio

1. Crea un empleado con acceso temporal o activa `must_change_password` para una cuenta de QA.
2. Inicia sesión y confirma la redirección a `/cambiar-contrasena-obligatoria`.
3. Intenta abrir `/control` y ejecutar una escritura: ambas acciones deben bloquearse.
4. Completa el cambio con la contraseña temporal correcta.
5. Confirma acceso a `/control`, fecha `password_changed_at` y evento de auditoría.

## Administración y sesiones

1. Como owner o admin, solicita recuperación desde Equipo para un empleado activo con acceso.
2. Como recepción, confirma que el endpoint devuelve acceso denegado.
3. En `/control/mi-cuenta`, usa "Cerrar sesión en otros dispositivos" y confirma que la sesión actual se conserva.
4. Revisa `audit_logs`: no deben aparecer contraseñas, tokens, cookies ni enlaces.
