# US-097: validación

**Fecha:** 15/11/2026

**Rama:** `dev/alina`

## Implementación

- Los pedidos QR `PENDING` vencen a los 15 minutos, registran el motivo y devuelven el stock en la misma transacción. Los pagos Yape `PENDING` mantienen protegidos los pedidos.
- Cada QR admite hasta dos pedidos pendientes. Antes de calcular el saldo de Stripe se ejecuta el vencimiento.
- Cada Checkout guarda restaurante, cuenta, importe, pedidos incluidos, estado y vencimiento en `stripe_checkout_attempts`. Un Checkout activo protege solo a los pedidos incluidos en su snapshot.
- El webhook valida la sesión y los datos contra ese registro; el registro de pago revalida `stripe_session_id` después de los bloqueos. Los reembolsos guardan estado, identificador, error e intentos idempotentes.
- `iniciar_checkout_stripe` devuelve cero filas cuando el vencimiento deja la cuenta sin pedidos cobrables. Así el RPC termina sin excepción y PostgreSQL confirma, en una misma transacción, la cancelación, el historial y la devolución del stock.

## Archivos principales

- Migraciones US-097: `20261115174905_us097_pedidos_sin_pago_vencen.sql`, `20261115190000_us097_stripe_checkout_snapshot_refunds.sql`, `20261115193000_us097_confirmar_vencimientos_al_rechazar_qr.sql`, `20261115200000_us097_distinguir_rechazo_qr_antiguo.sql` y `20261115210000_us097_checkout_vencimiento_sin_reversion.sql`.
- Pruebas RLS: `tests/rls/vencimiento-pedidos.test.ts`.

## Verificaciones

- `npx supabase db reset --local`: aprobado; aplicó las migraciones hasta `20261115210000_us097_checkout_vencimiento_sin_reversion.sql` y sembró la instancia local en `127.0.0.1:54322`.
- `scripts/usuarios-demo.mjs`: ejecutado contra Supabase local con una contraseña temporal de proceso. No se modificó `.env.local`.
- Regresión `npx vitest run tests/rls/vencimiento-pedidos.test.ts -t "una orden vencida antes de iniciar Checkout" --no-file-parallelism`: 1 aprobada y 10 omitidas por el filtro. Comprobó RPC sin error y respuesta vacía, pedido `CANCELLED` y `product_daily_stock.sold = 0`.
- `npx vitest run tests/rls/vencimiento-pedidos.test.ts --no-file-parallelism`: 11/11 pruebas aprobadas en PostgreSQL local.
- `npm.cmd run test` (dos ejecuciones consecutivas): 1082/1082 pruebas unitarias aprobadas en 66 archivos en cada ejecución.
- `npm.cmd run lint`: aprobado (ESLint, código de salida 0).
- `npm.cmd run typecheck`: aprobado (`next typegen` y `tsc --noEmit`, código de salida 0).
- `npm.cmd run build`: aprobado (compilación de producción y generación de páginas, código de salida 0). Next.js mostró un aviso por `pnpm-workspace.yaml` fuera del repositorio; no impidió el build.
- La suite unitaria incluye `tests/unit/webhook-stripe.test.ts`, con comprobaciones de resultado de reembolso, reintento idempotente y estado fallido.
- `npm.cmd run test:integracion`: 108/108 pruebas aprobadas en 14 archivos contra Supabase local; se prepararon los seis usuarios demo con una contraseña temporal de proceso. No se cambió `.env.local`.
- `tests/rls/espera-pago.test.ts`: los dos casos Stripe ahora crean y vinculan un Checkout con snapshot antes de registrar el pago. La prueba de sesión comprueba los pedidos del snapshot y el motivo `US-097: pago Checkout`; la validación `CHECKOUT_STALE` sigue activa.
- La suite heredada dejó pedidos para llevar de pruebas anteriores porque su `afterEach` solo limpiaba pedidos de mesa. Se amplió la limpieza para retirar pagos, Checkouts y pedidos de cada caso. Con esta corrección desaparecieron los fallos en cascada de límite, transición, stock y limpieza.
- En la suite completa también pasaron US-012 y US-018 en la instancia local preparada; no se modificaron sus pruebas ni su lógica.
- `git diff --check`: aprobado. No se ejecutó SQL ni migraciones contra Supabase compartido.

## Riesgos pendientes

- La integración quedó aprobada en la instancia local preparada. La prueba inicial antes de restablecer las credenciales demo no ejecutó los casos porque falló el inicio de sesión del usuario mesero; no se contó como resultado aprobado.
- No se hizo commit ni push.
