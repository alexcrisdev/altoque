# US-088: boleta de prueba y correo

**Comprobante de prueba, sin valor tributario.** Esta integración se prepara
exclusivamente para una empresa Nubefact en modo DEMO. No activar producción.

## Qué hace

1. AlToque registra el pago con sus reglas habituales. Un pago parcial o un Yape
   pendiente no generan una boleta.
2. Cuando un pago confirmado deja el saldo en cero, un trigger reserva en
   `receipts` una fila `PENDIENTE`. Bloquea `receipt_series` para obtener e
   incrementar el número. Hay una única reserva por cuenta (sesión o pedido).
3. El aviso firmado v2 lleva esa reserva, el saldo y, únicamente si se escribió
   voluntariamente al pagar, `cliente.correo`. En Stripe se usa
   `metadata.receipt_email` de Checkout; no `customer_details.email` ni el correo
   que Stripe pudiera pedir. No se añade al PaymentIntent.
4. n8n consulta primero la misma serie y número en Nubefact. Solo emite si
   Nubefact devuelve código **24** (documento inexistente) con HTTP 400. Un error
   de autenticación, transporte o respuesta desconocida no autoriza emitir.
5. La solicitud usa tipo **2**, cliente `VARIOS` sin documento (`-`), un ítem por
   plato e importes menores de S/ 700. Los precios de AlToque incluyen IGV:
   se separan base e IGV al 18 % del ejemplo de integración y se conservan los
   importes brutos de cada línea. No se activa el envío automático a SUNAT ni
   el correo de Nubefact. No usar para casos tributarios reales.
   La fecha de emisión es la fecha actual de Lima, incluso al reintentar un
   aviso de un pago anterior; la serie y el número reservado se mantienen.
6. El resultado firmado vuelve a AlToque. La ruta actualiza exclusivamente la
   reserva existente a `EMITIDO` o `ERROR`. Repetirlo conserva su ID y número;
   un número distinto o cambiar enlaces ya emitidos se rechaza.
7. Si existe correo y se guardó un resultado emitido, Gmail envía los enlaces
   PDF/XML con asunto «Tu boleta de prueba – nombre del restaurante».
8. Caja muestra «Boleta BBB1-N (prueba) · Ver PDF» y el aviso sin valor tributario.
   Una reserva pendiente o con error conserva el pago y explica su estado.

## Aplicación de la migración (Alexander)

Archivo nuevo: `supabase/migrations/20261115221935_us088_boletas_prueba.sql`.
Se probó primero en Supabase local. No ejecutar `supabase db push` desde esta guía.
Alexander revisa y aplica la migración en la base compartida antes de publicar
la app modificada.

La migración agrega el correo opcional y sustituye las firmas antiguas de
`registrar_pago` y `registrar_pago_stripe` por las nuevas con el último parámetro
`p_receipt_email text default null`; conserva las reglas anteriores y vuelve a
declarar permisos. Las llamadas que omiten el correo siguen funcionando.

La revisión del 15/11/2026 parte del `registrar_pago_stripe` de
`20261115190000_us097_stripe_checkout_snapshot_refunds.sql`: conserva validación
OPEN, vencimiento, monto, snapshot, CHECKOUT_STALE, bloqueos e idempotencia.
Solo añade firma y guardado del correo. No redefine `iniciar_checkout_stripe`
de `20261115210000` ni los triggers de preparación de US-094/US-097.
El archivo anterior `20261114223625_us088_boletas_prueba.sql`, que no se aplicó
a la base compartida, se retiró para que no haya dos definiciones incompatibles.

Alexander carga **una configuración por restaurante** en `receipt_series`:
`restaurant_id`, `series`, `next_number`, `is_test=true`. Debe comprobar el próximo
número libre en Nubefact para la serie **BBB1**. No asumir que es 1 por no haber
emitido desde AlToque, ni copiar el correlativo de las pruebas locales.
Configurar la serie antes del primer pago que vaya a emitir boleta.

No se reservan boletas sin configuración, con serie agotada, con importe cero o desde S/ 700.
El cobro sigue funcionando. No se incluye emisión con DNI/RUC, factura,
percepciones, retenciones ni comprobantes reales en esta historia.

`receipts` solo permite lectura a CASHIER/OWNER/ADMIN del restaurante.
El visitante, cocina, mesero y miembros de otro restaurante no pueden leerla.
El navegador no puede escribir resultados ni modificar correlativos.

## Docker y credenciales

1. Confirmar en el panel de Nubefact **DEMO**, rotar cualquier token expuesto y
   guardar el nuevo únicamente en una credencial **Header Auth** de n8n:
   nombre `Authorization`, valor según la autenticación del manual de Nubefact.
   No escribir el token en archivos, chats, capturas ni exportaciones.
2. En `infra/n8n/.env` privado configurar `NUBEFACT_EMPRESA_ID`: únicamente el
   UUID final de la ruta API de esa empresa DEMO. La URL privada completa no va
   en el JSON. El proxy interno, acordado para esta instalación, construye la
   ruta usando esa variable y fija el destino `api.nubefact.com` con TLS verificado.
3. Desde `infra/n8n`, iniciar `docker compose --profile tunel --profile boletas up -d`.
   `nubefact-demo` no publica puertos ni se añade al túnel. El editor permanece
   en `http://localhost:5678`. No se habilita el acceso de Code a las variables
   del servidor; solo está permitido el módulo `crypto`.
4. En la credencial Header Auth permitir el destino interno `nubefact-demo`
   si se restringen dominios. Seleccionarla en **Consultar boleta** y
   **Emitir boleta DEMO**. El proxy reenvía Authorization al destino fijo;
   no guarda el token y no registra el cuerpo ni la cabecera.
5. Seleccionar la credencial Gmail OAuth ya usada en US-071 en
   **Enviar boleta de prueba**. No se crea otra cuenta ni otro envío de prueba.

La variable privada cambia únicamente la ruta de la empresa; no detecta su modo
DEMO. Esa comprobación humana es obligatoria antes de habilitar el flujo.

## Importar y conectar

- Importar `infra/n8n/flujos/boleta-nubefact.json` como flujo desactivado.
  Sustituye al flujo publicado de US-086: ambos usan el mismo path, por lo que
  no deben publicarse simultáneamente. El punto para US-089 se conserva.
- En **Secreto compartido**, configurar un secreto nuevo de 32+ caracteres,
  igual a `N8N_WEBHOOK_SECRET` del servidor AlToque. La plantilla está vacía.
  Cambiar `demo_confirmado` a `true` solo después de verificar el modo DEMO y
  la configuración de serie/correlativo. Su valor inicial es `false`.
- En **Guardar en AlToque**, el destino local es
  `http://host.docker.internal:3000/api/n8n/comprobantes`. Para un servidor
  desplegado usar su URL HTTPS. No utilizar una dirección enviada en el evento.
- En AlToque, `N8N_WEBHOOK_URL` es la ruta completa
  `https://<tunel-vigente>/webhook/altoque-pago-confirmado`.
  El túnel cambia al recrearse; actualizar la variable y reiniciar/republicar
  AlToque cuando cambie. El callback apunta a AlToque, no al túnel de n8n.
- Guardar y publicar solo tras configurar las credenciales. Se desactiva el
  guardado de ejecuciones en la plantilla porque contienen el correo opcional.
  No exportar una instancia configurada sin retirar secretos y credenciales.

El flujo importable se regenera con `node scripts/generar-boleta.mjs`.
La lógica de importes vive en `infra/n8n/flujos/boleta-logica.mjs` y está cubierta
por Vitest; no hay que instalar librerías adicionales.

## Contrato del resultado

`POST /api/n8n/comprobantes`, JSON con `pago_id`, `serie`, `numero`,
`estado` (`EMITIDO` o `ERROR`), `enlace_pdf` y `enlace_xml` (HTTPS para emitidos;
`null` en error). Cabeceras `X-AlToque-Timestamp` y `X-AlToque-Firma`:
`sha256=` + HMAC-SHA256 del texto exacto `<timestamp>.<cuerpo>`.

Ventana de cinco minutos, comparación constante y límite de 16 KiB. La firma
se comprueba antes de interpretar el JSON y acceder a Supabase. Respuestas:
200 guardado/repetido, 400 formato, 401 firma, 409 reserva incompatible o
inexistente, 413 tamaño, 503 fallo temporal. No devuelve correos ni errores internos.

## Cómo probar

1. Ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
2. En Supabase **local**, ejecutar el SQL de
   `supabase/tests/us088_boletas.sql` con `psql -v ON_ERROR_STOP=1`. Todo ocurre
   en una transacción que termina con rollback; no conectarlo a la base compartida.
3. La E2E `tests/e2e/boleta.spec.ts` solo se habilita con Supabase local, usuarios
   demo locales, serie configurada y secreto HMAC efímero. Comprueba el correo,
   pago, reserva, rechazo sin firma, callback repetido y caja a 390 px usando
   enlaces simulados. No llama a Nubefact ni envía correo.
4. Tras revisión de Alexander y configuración DEMO, acordar una prueba real
   controlada: crear un pedido ficticio menor de S/ 700 y pagar parcialmente.
   No debe reservar ni emitir todavía. Completar el pago con un correo propio
   voluntario; comprobar una reserva, PDF/XML y el correo recibido.
5. En caja recargar la cuenta: verificar serie/número, «Ver PDF» y el aviso
   sin valor tributario. Repetir el aviso con firma nueva: debe reutilizar la
   misma reserva y consultar la misma boleta, sin consumir otro correlativo.
6. Repetir sin correo: se obtiene boleta sin enviar Gmail. Simular fallo del
   proveedor/callback solo en local; el pago no se revierte.

La entrega del aviso sigue siendo el mecanismo de US-086: no hay cola ni reintento
automático. Si falla, revisar la reserva y reenviar el aviso desde el servidor
con HMAC y fecha nuevos, conservando pago/serie/número. Nunca incrementar el
número manualmente para reintentar. Un reenvío ya emitido se omite; si se reejecuta
manualmente una ejecución anterior completa, podría volver a enviar el correo,
aunque no duplique la boleta. No se garantiza envío de correo exactamente una vez.

Los resultados y pendientes reales se registran en
[la evidencia de US-088](../pruebas/evidencias/us088-validacion.md).

El 14/11/2026 se completó una emisión DEMO real **BBB1-1**, con PDF/XML,
callback guardado en Supabase local, visualización en caja y correo recibido
con etiqueta INBOX. Se probó una copia inactiva del flujo mediante CLI, sin
modificar los flujos publicados del equipo; el informe distingue ese recorrido
de la comprobación posterior del webhook compartido. BBB1-1 ya no está libre:
verificar el siguiente correlativo antes de configurar el entorno compartido.

El 15/11/2026 se repitió el recorrido sobre US-097 con la migración nueva:
**BBB1-2** emitida, PDF/XML, callback EMITIDO, caja y recepción Gmail INBOX
confirmados. El último documento emitido es BBB1-2; BBB1-3 se consultó y estaba
libre. Alexander debe reconfirmar ese valor antes de configurar la base compartida.
