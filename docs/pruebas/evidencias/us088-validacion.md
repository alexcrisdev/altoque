# US-088 — Validación técnica y pendientes de aceptación

Fecha: **14/11/2026**, America/Lima. Rama de trabajo: `dev/erick`.

**Estado: implementación y prueba DEMO real aprobadas en entorno local;
revisión de la migración y despliegue compartido pendientes.**
Comprobante de prueba, sin valor tributario.

## Alcance y ajustes de Alexander

- AlToque reserva `PENDIENTE`, serie y número al completar el pago. La función
  del trigger bloquea `receipt_series`; n8n no asigna correlativos.
- Una reserva por sesión/pedido y por pago, con unicidad de restaurante/serie/número.
  El callback solo actualiza esa reserva. Repetirlo no crea otra fila.
- `receipt_series` no se carga automáticamente. Alexander comprueba el siguiente
  número libre de BBB1 en Nubefact y configura el restaurante al aplicar la migración.
- Se eliminan las firmas viejas de `registrar_pago` y `registrar_pago_stripe`;
  las nuevas llevan `p_receipt_email text default null`, con permisos explícitos.
  Las llamadas anteriores sin correo siguen admitidas por el valor predeterminado.
- El correo voluntario de Stripe viaja en metadata de la sesión, no se toma del
  correo solicitado por Stripe ni se copia al PaymentIntent. Si alguien altera
  esa metadata con un correo inválido, se conserva el registro del pago y se
  omite el correo.
- URL privada de Nubefact en variable privada del despliegue y proxy interno,
  alternativa acordada para conservar bloqueado el acceso de Code al entorno.
  Token exclusivamente en Header Auth de n8n. Plantilla sin credenciales.

## Resultados ejecutados

| Comprobación | Resultado |
|---|---|
| `npm run lint` | Aprobado |
| `npm run typecheck` | Aprobado |
| `npm test` | 969/969 aprobadas; 24 casos en `comprobantes.test.ts` |
| `npm run build` | Aprobado, incluida `/api/n8n/comprobantes` |
| Migraciones desde cero | Aplicadas en Supabase local, incluida la migración nueva |
| `supabase/tests/us088_boletas.sql` | Aprobado en `supabase_db_altoque`; rollback de todos los datos de cada ejecución |
| Regresión Playwright | 20/20 aprobadas, Chromium, instancia aislada `localhost:3100` con Supabase local |
| Comprobación E2E ampliada US-088 | 1/1 aprobada: añade correo inválido del cliente con Stripe simulado y captura de caja a 390 px |
| Emisión Nubefact DEMO real | BBB1-1 emitida; PDF y XML descargados y comprobados |
| Gmail real | Mensaje enviado y leído mediante Gmail OAuth; etiqueta INBOX confirmada |
| Caja con comprobante real | Boleta BBB1-1 visible con PDF y aviso sin valor tributario; captura a 390 px |
| `docker compose --profile boletas config --quiet` | Configuración válida; no se reinició el n8n existente |
| Revisión de Git autorizada | `dev/erick`, sin errores de espacios; implementación guardada en `ffeff94` y [PR #83](https://github.com/alexcrisdev/altoque/pull/83) hacia develop |

La primera ejecución de build encontró un `runtime` explícito incompatible con
Cache Components y una descarga de fuentes bloqueada por la red restringida.
Se retiró esa opción de la ruta (Node.js es el runtime de Cache Components) y
el build se repitió correctamente con acceso de red. No se modificó el diseño
ni la configuración de fuentes.

## Qué se verificó

### Unitarias, sin red

- Aviso v2 con saldo pendiente, reserva estable y correo exclusivamente opcional.
- Correo vacío/espacios, normalización, longitud máxima y formatos inválidos.
- HMAC del cuerpo exacto: válido, alterado, vencido, futuro, secreto incorrecto
  y firma mal formada. El resultado sin firma no accede a la base.
- JSON inválido firmado, tamaño máximo y enlaces inseguros rechazados.
- Callback llama a actualizar una reserva; un conflicto devuelve 409 sin crear
  series ni números nuevos. La persistencia idempotente se prueba en SQL real.
- Metadata de Checkout y lectura del webhook: el correo de Stripe se ignora.
- Tipo 2, VARIOS, reserva de serie/número, separación base/IGV, totales,
  fecha actual de Lima y restricción de importe menor de S/ 700.
- Pagos parciales, avisos v1, reservas ausentes o emitidas no pasan a emisión.
- Preparación y lectura del proveedor ejecutadas también con el código exacto
  exportado en el JSON de n8n, dentro de un sandbox sin acceso a red.

### SQL/RLS reales, exclusivamente locales

- Efectivo parcial sin reserva; Yape pendiente sin reserva; verificar Yape
  hasta saldo cero reserva BBB1-7 y avanza una sola vez el siguiente número.
- Correo inválido rechazado por CHECK; correo válido persistido.
- Llamada compatible sin correo y reintento idempotente del pago original.
- Firmas SQL antiguas ausentes, sin sobrecargas ambiguas.
- Caja ve su boleta; otro restaurante, visitante, cocina y mesero no la leen.
  Usuario autenticado no puede insertar ni ejecutar la actualización del callback.
- Servicio actualiza ERROR → EMITIDO; repetir EMITIDO devuelve la misma fila.
  Otro número o enlaces distintos de una boleta emitida se rechazan.
- Stripe reserva otra boleta con el siguiente número; un evento repetido
  conserva el mismo pago y no consume otro correlativo.

### Navegador, con proveedor simulado

La suite completa utilizó usuarios ficticios creados en Supabase local, con
contraseña efímera. La Mesa 5 y sus QR se prepararon **solo en esa instancia**;
no se regeneraron los códigos de la base compartida. Los avisos externos
estuvieron desactivados.

La E2E de US-088 confirmó un pedido local, completó el pago en caja, comprobó
la reserva PENDIENTE, rechazó un callback sin firma y aceptó dos callbacks
firmados idénticos. Confirmó una única boleta, enlace PDF, aviso sin valor
tributario y ausencia de desborde horizontal a 390 px. Después entregó y cerró
la cuenta mediante las pantallas existentes.

La comprobación ampliada habilitó el botón del cliente con una clave ficticia
de Stripe y escribió un correo inválido: el servidor lo rechazó antes de abrir
Checkout. No se contactó a Stripe ni se cobró dinero.

![Caja local con resultado simulado, no emitido por Nubefact](us088-caja-local-simulada.png)

**Esta captura usa enlaces `example.test`: no acredita una emisión real de
Nubefact ni un correo recibido.**

## Validación DEMO real — 14/11/2026

Se utilizó exclusivamente Supabase local y la empresa Nubefact DEMO confirmada
por el usuario. Se cargó BBB1 con el siguiente número libre comunicado: **1**.
El pedido ficticio tuvo un consumo de **S/ 6.00**, pagado en dos partes de
S/ 3.00. El primer pago no creó reserva; el segundo dejó saldo cero y reservó
una única fila PENDIENTE para BBB1-1.

El primer intento de ejecutar el flujo por consola falló y dejó la reserva
pendiente. Se adaptaron únicamente los nodos de respuesta HTTP de la copia
privada de prueba y se reenvió el aviso del **mismo pago**, con firma nueva,
sin registrar otro pago ni consumir otro número. La emisión se completó
aproximadamente a las **19:03, America/Lima**.

### Recorrido y límites de esta comprobación

- La interfaz real de caja registró los dos pagos locales. El reenvío posterior
  utilizó `enviarAvisoPago` y la reserva existente; no se construyó una boleta
  ficticia como respuesta del proveedor.
- El aviso firmado llegó a un receptor HTTP local de prueba, que lo entregó
  a una copia inactiva del flujo n8n ejecutada por CLI. Se conservaron la
  verificación HMAC, preparación, consulta/emisión HTTP, callback y Gmail.
  En esa copia, el nodo de entrada leyó el aviso capturado y los nodos
  Respond to Webhook se sustituyeron por NoOp, porque CLI no tiene una
  conexión HTTP de webhook a la que responder.
- Nubefact y Gmail fueron servicios **reales**, con sus credenciales almacenadas
  en n8n. El PDF contiene la marca **SIN VALOR LEGAL** y la observación de
  comprobante de prueba sin valor tributario. Se descargaron PDF y XML.
- El callback firmado actualizó la misma reserva a EMITIDO. La cuenta local
  quedó entregada, pagada y cerrada; caja muestra la boleta aun estando cerrada.
- Gmail devolvió el mensaje enviado y después se leyó ese mismo mensaje con
  su etiqueta **INBOX**, confirmando recepción en la cuenta propia autorizada
  de US-071. No se envió a terceros.
- No se publicaron ni cambiaron los flujos activos de US-071/US-086. La copia
  local de validación quedó inactiva y sin el secreto efímero ni el aviso capturado.
  La entrega al webhook publicado en un despliegue compartido sigue siendo
  una comprobación de despliegue posterior; no se presenta como ejecutada aquí.

Después se consultó **BBB1-2** directamente desde n8n, usando únicamente
`consultar_comprobante`: Nubefact respondió **HTTP 400, código 24** (documento
inexistente). Por tanto, al cierre de esta validación, el siguiente número
libre verificado era **2**. Esa consulta no emitió otra boleta ni envió correo.

### Evidencias reales

Primera página del PDF descargado directamente de Nubefact DEMO, renderizada
con el lector PDF de Windows; no es una boleta fabricada ni una simulación:

![Boleta DEMO BBB1-000001 con marca sin valor legal](us088-boleta-demo-real.png)

Mensaje real leído desde Gmail API mediante n8n. La captura representa su
contenido y la recepción INBOX; **no es una captura de la interfaz web de Gmail**.
Se ocultan la dirección del destinatario y los enlaces del comprobante:

![Correo real recibido y verificado en Gmail](us088-correo-demo-recibido.png)

Caja a 390 px, con la reserva real en EMITIDO, el PDF del proveedor y los dos pagos:

![Caja con boleta DEMO real y cuenta cerrada](us088-caja-demo-real.png)

## Criterios de aceptación

| Criterio | Estado y evidencia |
|---|---|
| 1. n8n → Nubefact DEMO → PDF/XML | Aprobado: emisión real BBB1-1 mediante la copia CLI local; PDF/XML descargados. Webhook publicado pendiente de comprobar al desplegar |
| 2. Correo opcional y envío Gmail | Aprobado: envío real y lectura del mismo mensaje con etiqueta INBOX |
| 3. Guardar serie/número/enlaces | Aprobado: callback real guardó EMITIDO en la misma reserva local; idempotencia adicional en SQL y E2E |
| 4. Boleta visible en caja | Aprobado: captura de caja con PDF real, además de las pruebas simuladas anteriores |
| 5. Aviso sin valor tributario | Aprobado en pantalla, flujo y guía |
| 6. Credencial fuera del repositorio | Aprobado: Header Auth y Gmail existentes utilizados solo por n8n; plantilla pública vacía, sin token ni ruta privada |
| 7. DEMO y rotación antes de emitir | Confirmados por el usuario antes de la emisión; PDF real con marca SIN VALOR LEGAL. La captura del panel se comparte con Alexander por privado |

## Pendientes de revisión y despliegue

1. Alexander revisa y aplica la migración en la base compartida. Confirma el
   correlativo libre de BBB1 y carga `receipt_series`: BBB1-1 ya está utilizado
   por la prueba DEMO; no volver a configurarlo como 1. En esta sesión
   **no se escribió en Supabase compartido**.
2. El UUID privado del endpoint se configuró en `infra/n8n/.env` y se inició
   únicamente el proxy adicional. `.env.local` quedó intacto: el secreto HMAC,
   las claves de Supabase local y las variables de la prueba se pasaron solo
   a los procesos aislados. Para el uso compartido, publicar el flujo original
   con las credenciales, secreto y callback definitivos y probar su webhook HTTP.
3. Erick comparte por privado con Alexander el correlativo que esté libre al
   aplicar la migración y la captura del panel DEMO. No compartir tokens.
4. Una emisión DEMO real sin correo y el reenvío real de un aviso ya EMITIDO
   no se ejecutaron para evitar consumir otro número o reenviar correo.
   Estas ramas están cubiertas por pruebas unitarias, SQL y E2E locales.

La validación real emitió una sola boleta y envió un solo correo.
No hay cola de entrega automática; la limitación de reintentos y el posible
reenvío de correo al reejecutar manualmente un evento antiguo están descritos
en [la guía](../../automatizacion/boleta.md).

## Archivos del avance

- Migración: `supabase/migrations/20261114223625_us088_boletas_prueba.sql`;
  prueba SQL: `supabase/tests/us088_boletas.sql`.
- Callback: `src/app/api/n8n/comprobantes/route.ts`,
  `src/features/pago-cierre/comprobante-actions.ts`, `comprobantes.ts`,
  `comprobante-logica.ts`.
- Aviso v2: `aviso-n8n.ts`, `aviso-n8n-logica.ts` en la misma funcionalidad.
- Correo y cobro: `correo-boleta.tsx`, `cobrar-cuenta.tsx`,
  `registrar-pago-efectivo.tsx`, `registrar-pago-yape.tsx`,
  `registrar-pago-tarjeta.tsx`, `actions.ts`, `pagos.ts`.
- Stripe: `boton-pagar-tarjeta.tsx`, `pago-online-actions.ts`,
  `pago-online.ts`, `stripe-logica.ts`.
- Lectura y pantalla de caja: `cuentas.ts`, `detalle-cuenta.tsx`.
- n8n: `infra/n8n/flujos/boleta-nubefact.json`, `boleta-logica.mjs`,
  `infra/n8n/nubefact.conf.template`, `docker-compose.yml`, `.env.example`,
  generador `scripts/generar-boleta.mjs`.
- Unitarias: `tests/unit/comprobantes.test.ts`, `aviso-n8n.test.ts`,
  `pago-online-actions.test.ts`, `pagos-caja.test.ts`.
- E2E: `tests/e2e/boleta.spec.ts`.
- Documentación: `docs/automatizacion/boleta.md`, `aviso-pago.md`,
  únicamente la fila US-088 añadida a `docs/pruebas/matriz-trazabilidad.md`,
  este informe y la captura local simulada.
  El avance de validación real agrega las tres capturas `us088-*-demo-*.png`
  y actualiza únicamente esta historia en la matriz.
