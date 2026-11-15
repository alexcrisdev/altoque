# US-097: validacion

**Fecha:** 15/11/2026
**Rama:** `dev/alina`

## Implementacion

- Los pedidos QR `PENDING` vencen a los 15 minutos, registran el motivo y devuelven el stock en la misma transaccion. Los pagos Yape `PENDING` mantienen protegidos los pedidos.
- Cada QR admite hasta dos pedidos pendientes. El temporizador muestra el tiempo para pagar en la pagina del pedido.
- Antes de calcular el saldo de Stripe se ejecuta el vencimiento. Cada Checkout guarda restaurante, cuenta, importe, pedidos incluidos, estado y vencimiento en `stripe_checkout_attempts`.
- Un Checkout activo protege del vencimiento solo a sus pedidos incluidos. Un pago de mesa libera solo los pedidos del snapshot; pedidos creados despues conservan su propio saldo.
- El webhook verifica la sesion, el identificador del Checkout, el restaurante, la cuenta y el importe contra el registro durable. El registro de pago vuelve a consultar `stripe_session_id` despues de tomar los bloqueos para cubrir webhooks simultaneos.
- Si el Checkout ya no corresponde a pedidos cobrables, el servidor solicita el reembolso. Estado, identificador Stripe y error quedan guardados; cada intento usa una clave idempotente y se puede reintentar sin duplicar el reembolso.

## Archivos principales

- Migraciones nuevas: `20261115174905_us097_pedidos_sin_pago_vencen.sql`, `20261115190000_us097_stripe_checkout_snapshot_refunds.sql`, `20261115193000_us097_confirmar_vencimientos_al_rechazar_qr.sql` y `20261115200000_us097_distinguir_rechazo_qr_antiguo.sql`.
- Stripe: `src/features/pago-cierre/pago-online.ts`, `pago-online-actions.ts`, `stripe-logica.ts` y `webhook-stripe.ts`.
- Vencimiento: `src/features/pedidos/vencimiento-datos.ts`, temporizador de pago y acciones/paginas relacionadas.
- Pruebas: unitarias de temporizador, Stripe y registro de pedidos (`tests/unit/pedidos-registro.test.ts`); diez escenarios RLS en `tests/rls/vencimiento-pedidos.test.ts`.

## Verificaciones

- `npm.cmd run lint`: aprobado.
- `npm.cmd run typecheck`: aprobado.
- `node_modules/.bin/vitest.cmd run tests/unit --no-cache --no-fsModuleCache`: 1082 pruebas aprobadas en 66 archivos.
- `npm.cmd run build`: aprobado con Next.js 16.4.3.
- Se prepararon diez escenarios RLS: vencimiento y devolución de stock, Yape pendiente, vencimientos confirmados junto a un rechazo, límite de dos pedidos, RPC QR antiguo e idempotencia, solicitudes simultáneas, Checkout activo, webhooks duplicados, Checkout iniciado con pedido vencido y Checkout antiguo frente a pedidos nuevos. No se ejecutaron.
- Docker no está disponible y `.env.local` apunta a `fxwqudqqwzzblokfuawc.supabase.co`, no a localhost. No se aplicaron migraciones ni se hicieron escrituras a Supabase compartido. `.env.local` y los stashes permanecen intactos.

## Riesgo pendiente

La cobertura de persistencia y concurrencia requiere ejecutar los diez escenarios RLS contra Supabase local aislado con las cuatro migraciones aplicadas. Docker y una configuración de prueba que apunte exclusivamente a localhost siguen pendientes.
