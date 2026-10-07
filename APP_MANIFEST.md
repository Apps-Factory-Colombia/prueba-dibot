# App Manifest

Este archivo es un contexto compacto y persistente para Dibot. Actualízalo cuando cambien las rutas, entidades, roles o integraciones.

## Identidad

- Nombre: Sugar Daddy.
- Tipo: aplicación móvil web de conexiones con membresía.
- Audiencia: mujeres y hombres mayores de 18 años en Latinoamérica.

## Producto

- Funciones principales: registro con rol, 3 fotos, perfiles, descubrimiento, likes, matches, chat, oferta MXN $49/$299, pago recurrente y soporte administrativo.
- Flujos: bienvenida con frases comerciales → cuenta → perfil y 3 fotos → acceso limitado o membresía → descubrir → match → chat.
- Rutas: `/`, `/admin`, `/api/auth/*`, `/api/profile`, `/api/profile/photos`, `/api/discover`, `/api/swipes`, `/api/matches`, `/api/matches/:id/messages`, `/api/billing/status`, `/api/billing/checkout`, `/api/webhooks/stripe`, `/api/admin/*`, `/api/support/*`.
- Entidades Turso: `app_meta`, `users`, `registration_leads` (hashes de correo para registros abandonados), `user_photos`, `swipes`, `matches`, `messages`, `subscriptions`, `payment_events`, `notification_logs`, `support_messages`.
- Roles y permisos: usuario mujer/hombre con límites según estado; administrador solo por `/admin`, sin enlace visible en navegación pública.

## Integraciones

- Turso: base persistente por app.
- R2: fotos de perfil en el bucket privado dedicado `sugar-daddy-assets`, bajo el namespace `apps/sugar-daddy-e7954a7ca7`; el contrato admite local para desarrollo.
- Auth: sesión HttpOnly firmada.
- Pagos: Stripe Checkout server-side para suscripción mensual con tarjeta, MXN $49 de lanzamiento frente a $299 de referencia. El webhook Stripe firmado y procesado en backend es la única vía para activar o suspender el acceso; modo de prueba por defecto en desarrollo.
- Correo: adaptador server-side configurable y deduplicación semanal en `notification_logs`.

## Reglas especiales

- Aplicación mobile-first.
- Datos reales, seed idempotente y acciones funcionales.
