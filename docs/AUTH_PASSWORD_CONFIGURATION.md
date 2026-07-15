# Configuracion de Supabase para contrasenas

## URL base

La aplicacion obtiene la URL publica solo desde `NEXT_PUBLIC_APP_URL`.

- Local: `http://localhost:3000`
- Produccion: la URL final de Vercel, por ejemplo `https://dominio-produccion`

No se debe construir la URL de redireccion desde headers no validados.

## Redirect URLs que debes autorizar

Agrega como minimo estas URLs en Supabase Auth > URL Configuration:

```text
http://localhost:3000/auth/confirm
https://TU-DOMINIO/auth/confirm
```

Si se usan previews de Vercel, autoriza solo los dominios preview que tu equipo controle. No agregues comodines amplios sin necesidad.

## Site URL

Configura la Site URL de Supabase con el dominio principal de produccion. En desarrollo local, `NEXT_PUBLIC_APP_URL` sigue resolviendo la redireccion solicitada por la aplicacion.

## Flujo usado

La aplicacion solicita recuperacion con:

```ts
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${appUrl}/auth/confirm?next=/restablecer-contrasena`,
});
```

`/auth/confirm` acepta PKCE con `code` y tambien `token_hash` con `type=recovery`. El callback crea una sesion SSR y marca una cookie HttpOnly de corta duracion para permitir solo el restablecimiento.

## Plantilla de correo

Si la plantilla de Supabase usa Token Hash, puede seguir esta estructura:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/restablecer-contrasena">
  Restablecer contraseña
</a>
```

El correo debe identificar a La Bajadita Barber Studio, indicar que se solicitó recuperación y pedir ignorarlo si el usuario no la solicitó. Nunca debe contener contraseñas, tokens visibles o información técnica.

## Política de contraseña

LBBS exige al menos 8 caracteres, una mayúscula, una minúscula, un número y un símbolo. Configura Supabase Auth con una política compatible; una configuración más estricta en Supabase puede rechazar una contraseña que el frontend ya haya aceptado.

## Sesiones

- Recuperación completada: el cliente solicita cierre global de sesiones y exige nuevo login.
- Cambio autenticado: también solicita cierre global para no conservar credenciales anteriores en otros dispositivos.
- Cambio obligatorio: conserva la sesión actual solo hasta liberar el acceso al panel.

## SMTP y límites

Configura SMTP de producción antes de depender de recuperaciones reales. El proveedor y Supabase pueden aplicar límites de envío; la aplicación siempre responde con un mensaje genérico y no confirma que un correo exista o que el mensaje haya sido entregado.

## Prueba manual

1. Solicita recuperación para una cuenta de QA.
2. Confirma que el enlace llega a `/auth/confirm`.
3. Restablece una contraseña que cumpla la política.
4. Confirma que el enlace no se puede reutilizar.
5. Inicia sesión con la nueva contraseña.
6. Revisa `audit_logs` sin exponer secretos.

## Errores comunes

- `redirectTo` rechazado: falta autorizar `/auth/confirm` en Supabase.
- Enlace inválido: expiró, fue usado o la plantilla no conserva `code` o `token_hash`.
- Restablecimiento bloqueado: confirma que la cookie de recuperación no haya sido eliminada por un dominio diferente.
- Usuario redirigido a cambio obligatorio: el empleado mantiene `must_change_password = true` hasta completar el flujo.
