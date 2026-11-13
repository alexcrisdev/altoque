# US-085: pedido para llevar se paga antes de entrar a cocina

## Alcance

Solo los pedidos `TAKEAWAY` con `source = 'QR'` nacen en `PENDING`.
El cliente ve «Esperando pago». Al completar el saldo con pagos confirmados,
el pedido pasa a `IN_PROGRESS` y registra el motivo `US-085: pago confirmado`.
Los pedidos de mesa y los pedidos para llevar del mesero conservan su comportamiento.

Migración nueva: `supabase/migrations/20261112222619_pedidos_para_llevar_esperando_pago.sql`.
Se agregan triggers; no se reescriben las funciones de registro ni sus envoltorios de US-078.

## Entorno y resultados observados

Ejecuciones realizadas por el desarrollador en Windows, contra Supabase local en Docker.
API local: `http://127.0.0.1:54321`. Aplicación de prueba: `http://127.0.0.1:3005`.
Se utilizaron los QR existentes del seed para Mesa 3 y mostrador.
Las notificaciones n8n se deshabilitaron durante el recorrido local.

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Aprobado |
| `npm run typecheck` | Aprobado |
| `npm test` | 58 archivos; 935 casos aprobados |
| `npm run build` | Aprobado |
| `tests/rls/espera-pago.test.ts` | 14 casos aprobados en Supabase local |
| Selección E2E de esta historia | 6 casos aprobados en 58,4 segundos, con limpieza incluida |
| `git diff --check` | Sin errores de espacios; avisos de conversión LF a CRLF en Windows |

## Trazabilidad

| Criterio | Evidencia y alcance |
|---|---|
| Pedido QR para llevar nace esperando pago | Integración: funciones `registrar_pedido_cliente` y `registrar_pedido_qr`; historial inicial `PENDING`; también para llevar desde QR de mesa |
| Entra a preparación al completar el pago | Integración: efectivo, tarjeta aprobada, Yape verificado y RPC `registrar_pago_stripe`; pagos parciales, rechazados y pendientes no lo adelantan; reintentos y concurrencia no duplican el historial |
| Cocina no muestra pedidos esperando pago | Unitarias de consulta de cocina y KDS; E2E comprueba ausencia antes de cobrar y presencia después |
| Cliente ve «Esperando pago» | Unitarias de mensajes y etiquetas; E2E de la página del cliente. Se conserva el componente de pago Stripe |
| Pedidos en mesa conservan su flujo | Integración: nacen `IN_PROGRESS` sin pago; E2E de Mesa 3. Integración adicional para pedidos del mesero |
| Pruebas de integración del pago | `tests/rls/espera-pago.test.ts`: 14 casos; incluye devolución del stock al cancelar `PENDING` |

La resolución de cuenta Stripe distingue un pedido para llevar con clave de la cuenta
de mesa aunque ambos procedan del mismo QR. `tests/unit/pago-online-cuenta.test.ts`
agrega 11 casos; junto con `pago-online-actions.test.ts` se ejecutaron 18 casos aprobados.

## Reproducción de E2E

Con la aplicación compilada y ejecutándose contra Supabase local, y las variables
del proceso apuntando a ese entorno:

```powershell
npx playwright test pedido-para-llevar.spec.ts idempotencia.spec.ts conexion.spec.ts caja.spec.ts pago-y-cierre.spec.ts pedido-en-mesa.spec.ts --grep "US-085|CP-030-13|dos pulsaciones|sin conexión|abrir sesión" --max-failures=1
```

Comprueba caja, recuperación de conexión, doble confirmación, cierre con rechazo de
nuevos pagos, pedido en mesa y pedido para llevar. No equivale a ejecutar los 19 E2E.

Durante la preparación se corrigieron dos fallos de los helpers: cerrar el carrito
antes de abrir el enlace del pedido y reconocer un cierre persistido antes de
volver a recuperar una cuenta entregada. La ejecución final pasó sin esos fallos.

## Límites y despliegue

- Stripe se comprobó mediante su RPC y pruebas unitarias; no se ejecutó un Checkout
  externo ni un webhook firmado de extremo a extremo.
- Los 14 casos de integración corresponden a la suite específica de US-085;
  no se declara ejecutada toda la suite RLS.
- La migración se aplicó únicamente en Supabase local. El revisor debe revisar y
  aplicar la migración nueva en la base compartida antes del merge/despliegue.
- No se regeneraron QR ni se modificó `.env.local`. Las credenciales no forman
  parte de esta evidencia.
