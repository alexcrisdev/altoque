# US-102 — Pago con Yape/Plin mediante captura

Fecha de revisión: 16/11/2026 (America/Lima). Rama: `dev/veronica` (PR #88).

## Alcance implementado

- El cliente ve titular, saldo y Copiar monto; selecciona billetera, corrige el monto declarado y adjunta una imagen de cámara o galería. Sin titular configurado no se ofrece esta opción. Stripe conserva su flujo independiente.
- El navegador calcula SHA-256 del original y recodifica sus píxeles como JPEG, hasta 1280 px y objetivo de 300 KB. El servidor verifica tamaño máximo de 400 KB, MIME y primeros bytes JPEG/WebP; además decodifica y recodifica a JPEG con sharp (dependencia ya incluida por Next.js), limita dimensiones y elimina metadatos y bytes agregados; resuelve la cuenta mediante token QR y clave, nunca mediante un ID de cuenta elegido por el cliente.
- La migración crea el bucket privado y `payment_proofs`. El método contable continúa siendo YAPE; PLIN se guarda solo como billetera en el comprobante. No se modifican reportes, CSV, Stripe ni n8n.
- Registro transaccional, clave idempotente y aviso de duplicados por restaurante durante 24 horas. Una huella ya confirmada no puede respaldar otro pago del mismo restaurante: bloqueo transaccional por huella e índice único parcial, sin límite de 24 horas para esta prohibición. Un reintento no elimina la foto original; un error de respuesta se comprueba antes de eliminar la subida.
- Caja muestra pendientes, importes esperado/declarado, foto, antigüedad y duplicados; usa Realtime y consultas de respaldo cada 10 segundos. Las URL duran 60 segundos y se renuevan cada 45 segundos, tras verificar rol y restaurante.
- Llegó completo confirma el importe declarado; Llegó otro monto confirma el importe escrito por caja; No llegó exige un motivo de 5 a 120 caracteres y registra FAILED con rejection_reason. La base vuelve a comprobar saldo y bloquea cuenta, pago y comprobante. El navegador espera 10 segundos; Deshacer cancela la llamada antes de escribir.
- El RPC manual no puede confirmar pagos vinculados a capturas; el flujo manual de número de operación se conserva. Se registra quién verificó y cuándo. El dinero solo cuenta después de la verificación humana.
- Mesero recibe una alerta a partir de 3 minutos, sin enlaces de fotos. El resumen de caja y del cierre muestra Yape/Plin confirmado hoy, con inicio del día en Lima e incluyendo los Yape manuales.
- Limpieza al cerrar la cuenta y al consultar caja; `deleted_at` se marca después de eliminar el archivo. Un endpoint protegido y un trabajo programado cada hora reintentan la limpieza sin una pantalla abierta.

## Migración y compatibilidad

Archivo: `supabase/migrations/20261116010000_us102_capturas_pago.sql`.

Probada en Supabase local sobre `develop` y aplicada a la base compartida el 16/11/2026. Solo agrega estructura (columna `restaurants.wallet_holder_name`, bucket privado `capturas-pago`, tabla `payment_proofs`, columna `payments.payment_proof_id`, trigger y dos funciones); no elimina funciones ni columnas, por lo que el código anterior en producción sigue funcionando.

La restricción anterior de `payments` solo permitía pagos sin usuario para Stripe. Se añade `payment_proof_id` con clave foránea diferida, y se permite la variante YAPE sin usuario únicamente cuando tiene un comprobante relacionado. La fila de pago y la captura se crean en la misma transacción. Storage no participa en esa transacción: el servidor compensa los fallos y conserva archivos cuyo registro pudo completarse aunque se perdiera la respuesta.

La tabla permite SELECT a CASHIER/OWNER/ADMIN/WAITER del restaurante, sin INSERT/UPDATE de authenticated. El mesero puede leer metadatos, pero no descargar objetos ni solicitar enlaces firmados. Storage no tiene políticas para anon/authenticated. La acción que firma exige CASHIER/OWNER/ADMIN y filtra por restaurante.

Se conservan los triggers de US-094 y los cambios posteriores de US-097 y US-088.

Configuración de datos para la demostración: titular de la Cevichería demo cargado como «Cevichería AlToque (demo)» (`restaurants.wallet_holder_name`).

## Verificaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| `npm test` | 1313/1313 pruebas aprobadas, 79 archivos (16/11) |
| `npm run lint` | Aprobado |
| `npm run typecheck` | Aprobado |
| `npm run build` | Aprobado; incluye la nueva ruta de limpieza |
| Integración en Supabase local (`tests/rls`, dos ejecuciones seguidas) | 126/126 aprobadas en ambas; `tests/rls/capturas-pago.test.ts` 10/10 |
| CI del PR #88 (lint, typecheck, unitarias, build) | Aprobado |
| Integración del PR #88 | Aprobada |
| E2E del PR #88 (Playwright) | 20/20 aprobadas (las 4 fallas del primer intento ocurrieron antes de aplicar la migración; el reintento pasó completo) |
| Seguridad (Gitleaks, CodeQL, npm audit, revisión de dependencias) | Aprobado |

Pruebas nuevas:

- `tests/unit/capturas-logica.test.ts`: dimensiones, firmas de archivos, reloj de 3 minutos, espera y cancelación de 10 segundos, día de Lima.
- `tests/unit/comprimir-captura.test.ts`: huella del original, recodificación con canvas simulado, reducción de calidad y errores de formato/navegador.
- `tests/unit/capturas-actions.test.ts`: permisos, aislamiento de restaurante, respuesta al QR inválido, tamaño/contenido, ausencia de confirmación automática y aviso de pago sin incluir la captura.
- `tests/unit/capturas-datos.test.ts`: compensación, respuestas perdidas, reintentos, enlaces, vencimiento, eliminación al cerrar, errores de Storage, paginación, barrido de huérfanos antiguos y autenticación del trabajo programado.
- `tests/unit/validar-imagen-captura.test.ts`: JPEG/WebP reales en memoria, MIME incorrecto, truncamiento, orientación, EXIF, dimensiones y contenido agregado.
- `tests/rls/capturas-pago.test.ts`: diez escenarios de base de datos y Storage (otro restaurante no ve la foto, anon no descarga, monto distinto deja saldo, «No llegó» no manda a cocina, no se confirma dos veces, motivo obligatorio y aprobación concurrente de la misma imagen en dos cuentas). Solo se ejecuta contra Supabase local.

## Criterios y evidencia disponible

| Criterio | Estado y comprobación |
| --- | --- |
| 1. Monto, Copiar monto y titular | Implementado; titular configurado para la demostración. Recorrido de navegador pendiente. |
| 2. Cámara/galería y monto editable | Implementado con `accept="image/*"` sin `capture`. Recorrido de navegador y celular real pendientes. |
| 3. Compresión, recodificación y solo imágenes | Pruebas unitarias aprobadas con archivos reales generados en memoria (incluida eliminación de EXIF). Recorrido en dispositivo pendiente. |
| 4. Bucket privado, tabla y RLS | Migración aplicada; bucket privado comprobado; pruebas RLS/Storage 10/10 en Supabase local. |
| 5. Caja en tiempo real | Implementado con Realtime, respaldo y temporizador. Recorrido con dos navegadores pendiente. |
| 6. Confirmación humana, única, deshacer y auditoría | Confirmación única, concurrencia y registro de quién verificó probados en integración; Deshacer probado en unitarias. |
| 7. Huella y alerta de 3 minutos | Hash, umbral y duplicados en SQL probados. Alerta entre pantallas pendiente de recorrido. |
| 8. Borrado y total diario | Borrado al cerrar y día de Lima probados con dobles de prueba. Trabajo programado cada hora, pendiente de configurar secreto y URL. |
| 9. Aislamiento, pago parcial, rechazo y no duplicación | Probados en integración contra Supabase local (10/10). |

## Activación de limpieza programada

1. Configurar `CAPTURAS_CRON_SECRET` de al menos 32 caracteres en Vercel (Production y Preview) y como secreto de GitHub Actions. No escribirlo en este documento ni en archivos versionados.
2. Configurar la variable de Actions `CAPTURAS_APP_URL` con la URL HTTPS del despliegue correcto.
3. El calendario se activa al unir el workflow a la rama predeterminada (`develop`). Corre cada hora (minuto 17). Mientras falte el secreto o la URL, el trabajo termina sin error e indica «limpieza no configurada».
4. Ejecutar manualmente el trabajo (workflow_dispatch) y comprobar el borrado.

**Límite operativo:** el borrado principal ocurre al cerrar la cuenta; el trabajo programado es un respaldo para capturas de más de 24 horas y GitHub puede retrasarlo. Después de 24 horas el servidor deja de emitir enlaces para esa captura. Los enlaces ya emitidos tienen una vida máxima de 60 segundos.

La huella original es una advertencia, no una prueba de autenticidad: viene del navegador. La foto tampoco prueba la recepción del dinero; caja debe comprobar siempre el ingreso real en su billetera. No se presenta esta implementación como certificación de cumplimiento legal.

## Recorrido de navegador pendiente

En staging o en el preview del PR, con la Mesa 2 de la Cevichería demo (nunca la Mesa 5 ni el mostrador, reservados para el E2E):

1. Cliente (vista de celular 390 × 844): pedir, elegir Yape, comprobar titular y Copiar monto, y subir una captura ficticia sin datos reales.
2. Caja: ver la captura en «Por verificar» y probar «Llegó otro monto» (queda saldo), «No llegó» (con motivo) y «Llegó completo».
3. Mesero: comprobar el aviso a los 3 minutos sin verificar.
4. Cerrar la cuenta desde caja y comprobar que la captura deja de mostrarse.

## Capturas de pantalla

**Pendientes:** cliente y caja con datos de demostración, y prueba en celular real. No se generaron ni inventaron imágenes de evidencia.
