# Probar pagos con Stripe

La app usa Stripe Checkout para una suscripción mensual de prueba de **MXN $49**. No ingreses la tarjeta en la app: el formulario lo sirve Stripe. Volver a la página de éxito no demuestra que el pago se haya confirmado; el backend solo activa la cuenta cuando recibe y valida un evento Stripe firmado.

## Variables locales

En `.env`:

```env
APP_BASE_URL=http://localhost:5173
STRIPE_MODE=test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Obtén `STRIPE_SECRET_KEY` desde las claves de API de tu cuenta Stripe con el modo de prueba activo. Nunca uses una clave `sk_live_` para estas pruebas ni la compartas por chat. Para el webhook local, instala e inicia Stripe CLI y deja esta orden ejecutándose:

```sh
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```

El CLI muestra un secreto `whsec_...`; copia ese valor en `STRIPE_WEBHOOK_SECRET` y reinicia `bun run dev`. No uses el secreto `whsec_` del CLI en el endpoint de producción: cada destino tiene su propio secreto.

En producción define `APP_BASE_URL` con el dominio HTTPS de la app, `STRIPE_MODE=live` y las claves live correspondientes solo cuando decidas recibir cobros reales. No publiques ni subas `.env` al repositorio.

**Importante:** usa una base de datos de staging separada al probar con claves `sk_test_...` y webhooks de prueba. No apuntes el modo test a la BD de producción: un evento de prueba firmado podría activar una cuenta real aunque no haya ocurrido un cobro real. Las claves, el secreto `whsec_...`, los eventos y la URL deben corresponder al mismo modo y cuenta de Stripe.

Para el entorno de pruebas, el destino debe enviar eventos snapshot clásicos a `POST /api/webhooks/stripe` y usar el secreto de firma de ese mismo destino. La app valida el formato snapshot de Stripe y no procesa eventos thin de Events v2. Si usas el panel de destinos v2, elige carga útil **Resumen/Snapshot**; si la entrega o la firma no coincide, crea un endpoint clásico en Webhooks. El endpoint de pruebas visible para la clave configurada debe existir en el modo de prueba; una configuración hecha en modo live no envía eventos de prueba.

## Recorrido de compra

1. Inicia la app con `bun run dev` y registra/inicia sesión con una cuenta que requiera membresía.
2. Elige **Continuar al pago** para abrir Stripe Checkout.
3. Prueba una compra aprobada con `4242 4242 4242 4242`, una fecha futura y cualquier CVC de tres dígitos.
4. Stripe redirige de vuelta con el ID de la sesión. El servidor consulta esa sesión directamente y valida propietario, modo, moneda, monto y estado; el webhook firmado sigue procesando renovaciones y otros eventos. La app muestra “Cuenta activada” solo tras verificar el pago en Stripe.
5. En el panel `/admin`, la cuenta debe aparecer como pagada/activa.

Si vuelves a Checkout en `localhost`, el webhook debe estar reenviado con Stripe CLI y su `whsec_` local. Para probar en el dominio publicado, crea el destino en modo test con URL `https://sugar-daddy.dibot.co/api/webhooks/stripe`, carga útil snapshot y el secreto `whsec_` de ese destino configurado en el runtime. La URL por sí sola no cambia el modo Stripe del servidor. Mantén una base Turso de staging para cualquier pago de prueba.

Para probar un rechazo, usa `4000 0000 0000 0002`. Un pago rechazado o cancelado debe dejar la cuenta pendiente; no existe un botón local que pueda activar una compra ficticia.

Para el endpoint webhook de Stripe, selecciona estos eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`. La firma se verifica sobre el cuerpo HTTP original antes de procesar el evento, y los IDs de evento se deduplican. Los eventos de renovación, pago fallido y cancelación también necesitan el webhook; no basta con configurar Checkout.

OXXO no se ofrece en este flujo recurrente: Stripe lo admite para pagos de un solo uso, no para suscripciones, así que requeriría diseñar y mostrar una membresía no renovable con vencimiento. Además, Stripe lista el MCC 7273 (Dating/Escort Services) como no compatible con OXXO; confirma la clasificación y elegibilidad con Stripe antes de implementar esa alternativa.

Referencia: [Stripe Checkout y fulfilment](https://docs.stripe.com/checkout/fulfillment), [validación de firmas de webhook](https://docs.stripe.com/webhooks/signature) y [tarjetas de prueba](https://docs.stripe.com/testing).
