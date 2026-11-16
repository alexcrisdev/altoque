# US-102 — Pago con Yape/Plin mediante captura

Fecha de revisión: 15/11/2026 (America/Lima). Rama: `dev/veronica`.

## Alcance implementado

- El cliente ve titular, saldo y Copiar monto; selecciona billetera, corrige el monto declarado y adjunta una imagen de cámara o galería. Sin titular configurado no se ofrece esta opción. Stripe conserva su flujo independiente.
- El navegador calcula SHA-256 del original y recodifica sus píxeles como JPEG, hasta 1280 px y objetivo de 300 KB. El servidor verifica tamaño máximo de 400 KB, MIME y primeros bytes JPEG/WebP; además decodifica y recodifica a JPEG con sharp (dependencia ya instalada de Next.js), limita dimensiones y elimina metadatos y bytes agregados; resuelve la cuenta mediante token QR y clave, nunca mediante un ID de cuenta elegido por el cliente.
- La migración crea el bucket privado y `payment_proofs`. El método contable continúa siendo YAPE; PLIN se guarda solo como billetera en el comprobante. No se modifican reportes, CSV, Stripe ni n8n.
- Registro transaccional, clave idempotente y aviso de duplicados por restaurante durante 24 horas. Una huella ya confirmada no puede respaldar otro pago del mismo restaurante: bloqueo transaccional por huella e índice único parcial, sin límite de 24 horas para esta prohibición. Un reintento no elimina la foto original; un error de respuesta se comprueba antes de eliminar la subida.
- Caja muestra pendientes, importes esperado/declarado, foto, antigüedad y duplicados; usa Realtime y consultas de respaldo cada 10 segundos. Las URL duran 60 segundos y se renuevan cada 45 segundos, tras verificar rol y restaurante.
- Llegó completo confirma el importe declarado; Llegó otro monto confirma el importe escrito por caja; No llegó exige un motivo de 5 a 120 caracteres y registra FAILED con rejection_reason. La base vuelve a comprobar saldo y bloquea cuenta, pago y comprobante. El navegador espera 10 segundos; Deshacer cancela la llamada antes de escribir.
- El RPC manual no puede confirmar pagos vinculados a capturas; el flujo manual de número de operación se conserva. Se registra quién verificó y cuándo. El dinero solo cuenta después de la verificación humana.
- Mesero recibe una alerta a partir de 3 minutos, sin enlaces de fotos. El resumen de caja y del cierre muestra Yape/Plin confirmado hoy, con inicio del día en Lima e incluyendo los Yape manuales.
- Limpieza al cerrar la cuenta y consultar caja; `deleted_at` se marca después de eliminar el archivo. Se preparó un endpoint protegido y un trabajo programado para reintentar la limpieza sin una pantalla abierta.

## Migración y compatibilidad

Archivo: `supabase/migrations/20261116010000_us102_capturas_pago.sql`.

**Preparada, no aplicada ni validada contra PostgreSQL en esta sesión.** No se modificó Supabase compartido, `.env.local` ni los QR existentes.

La restricción anterior de `payments` solo permitía pagos sin usuario para Stripe. Se añade `payment_proof_id` con clave foránea diferida, y se permite la variante YAPE sin usuario únicamente cuando tiene un comprobante relacionado. La fila de pago y la captura se crean en la misma transacción. Storage no participa en esa transacción: el servidor compensa los fallos y conserva archivos cuyo registro pudo completarse aunque se perdiera la respuesta.

La tabla permite SELECT a CASHIER/OWNER/ADMIN/WAITER del restaurante, sin INSERT/UPDATE de authenticated. El mesero puede leer metadatos, pero no descargar objetos ni solicitar enlaces firmados. Storage no tiene políticas para anon/authenticated. La acción que firma exige CASHIER/OWNER/ADMIN y filtra por restaurante.

US-094 está presente en el código. Se conservan sus triggers y los cambios posteriores de US-097 y US-088. No se ejecutó `git pull`, merge, commit ni push.

## Verificaciones ejecutadas

| Verificación | Resultado |
| --- | --- |
| `npm.cmd test -- --reporter=dot` | 1313/1313 pruebas aprobadas, 79 archivos (15/11, tras integrar develop con US-091) |
| `npm.cmd run lint` | Aprobado |
| `npx.cmd tsc --noEmit` | Aprobado; el build posterior también verificó los tipos de la versión final |
| `npm.cmd run build` | Aprobado, 27 páginas generadas; incluye la nueva ruta de limpieza |
| `npx.cmd vitest run tests/rls/capturas-pago.test.ts --reporter=verbose` | 10 escenarios omitidos: no hay entorno Supabase local configurado. **No son pruebas aprobadas.** |
| `git diff --check` | Sin errores de espacios; Git advierte conversión LF/CRLF en un archivo y falta de acceso a su ignore global |

Los primeros intentos detectaron mocks de permisos desactualizados, una regla de renderizado de ESLint y tipos faltantes en las pruebas de integración. Se corrigieron; los fallos iniciales no se presentan como verificaciones finales aprobadas.

Pruebas nuevas:

- `tests/unit/capturas-logica.test.ts`: dimensiones, firmas de archivos, reloj de 3 minutos, espera y cancelación de 10 segundos, día de Lima.
- `tests/unit/comprimir-captura.test.ts`: huella del original, recodificación con canvas simulado, reducción de calidad y errores de formato/navegador. No sustituye una prueba real de EXIF en celular.
- `tests/unit/capturas-actions.test.ts`: permisos, aislamiento de restaurante, respuesta al QR inválido, tamaño/contenido, ausencia de confirmación automática y aviso de pago sin incluir la captura.
- `tests/unit/capturas-datos.test.ts`: compensación, respuestas perdidas, reintentos, enlaces, vencimiento, eliminación al cerrar, errores de Storage, paginación, barrido de huérfanos antiguos y autenticación del trabajo programado.
- `tests/rls/capturas-pago.test.ts`: diez escenarios de base de datos/Storage preparados; el archivo omite toda ejecución si la URL no es localhost o 127.0.0.1.

## Criterios y evidencia disponible

| Criterio | Estado y comprobación |
| --- | --- |
| 1. Monto, Copiar monto y titular | Implementado. Recorrido de navegador pendiente. |
| 2. Cámara/galería y monto editable | Implementado con `accept="image/*"` sin `capture`. Celular real pendiente. |
| 3. Compresión, recodificación y solo imágenes | Pruebas unitarias aprobadas. Decodificación y eliminación de EXIF probadas con archivos reales generados en memoria; recorrido en dispositivo pendiente. |
| 4. Bucket privado, tabla y RLS | Migración y permisos preparados; pruebas de acciones aprobadas. Aplicación y pruebas RLS/Storage pendientes. |
| 5. Caja en tiempo real | Implementado con Realtime, respaldo y temporizador. Dos navegadores/reconexión pendientes. |
| 6. Confirmación humana, única, deshacer y auditoría | Temporizador/cancelación probados en unitarias. Transacción concurrente y auditoría pendientes de integración. |
| 7. Huella y alerta de 3 minutos | Hash y umbral probados. Duplicados en SQL y alerta entre pantallas pendientes. |
| 8. Borrado y total diario | Rutas de limpieza y día de Lima probados con dobles de prueba. Activación del programador y borrado real pendientes. |
| 9. Aislamiento, pago parcial, rechazo y no duplicación | Casos RLS preparados, no ejecutados. No afirmar cierre funcional de estos criterios todavía. |

## Activación de limpieza programada

1. Configurar `CAPTURAS_CRON_SECRET` de al menos 32 caracteres en el servidor de despliegue y como secreto de GitHub Actions. No escribirlo en este documento ni en archivos versionados.
2. Configurar la variable de Actions `CAPTURAS_APP_URL` con la URL HTTPS del despliegue correcto.
3. Publicar el endpoint y habilitar `.github/workflows/limpieza-capturas.yml` en la rama predeterminada. El calendario de GitHub no se activa solamente por existir en una rama personal.
4. Ejecutar manualmente el trabajo sobre un entorno aislado y comprobar el borrado, reintentos y alertas por fallo.

**Límite operativo:** el calendario propuesto es cada cinco minutos y GitHub puede retrasarlo. La limpieza al abrir caja tampoco garantiza un instante exacto de 24 horas. No se ha demostrado un plazo máximo estricto de eliminación; debe acordarse y verificarse el servicio de programación antes de producción. Después de 24 horas el servidor deja de emitir enlaces para esa captura. Los enlaces ya emitidos tienen una vida máxima de 60 segundos.

La huella original es una advertencia, no una prueba de autenticidad: viene del navegador. La foto tampoco prueba la recepción del dinero. No se presenta esta implementación como certificación de cumplimiento legal.

## Recorrido pendiente en un entorno aislado

1. Aplicar todas las migraciones y el seed a Supabase local. Configurar exclusivamente variables locales en la terminal; no usar el comando `test:rls` que carga `.env.local` compartido.
2. Ejecutar `npx.cmd vitest run tests/rls/capturas-pago.test.ts --reporter=verbose`. Los casos crean sucursal, mesas y QR propios del entorno local y limpian sus datos; no utilizan los QR de demostración existentes.
3. Configurar un titular de prueba. Iniciar la aplicación apuntando a esa base local y abrir cliente, caja y mesero en sesiones separadas.
4. Subir una captura ficticia con importe completo y otra con importe parcial; comprobar montos, alerta de duplicado y espera de tres minutos.
5. Probar Deshacer a los nueve segundos, luego No llegó: el pedido con prepago debe continuar PENDING. Confirmar un pago parcial: debe conservar saldo. Completar el saldo: debe entrar a cocina.
6. Intentar confirmar desde dos cajas y mediante el RPC manual; comprobar que solo una verificación sea válida.
7. Cerrar la cuenta y comprobar eliminación física y `deleted_at`; repetir con una captura vencida y con un fallo temporal de Storage.
8. Probar Android/iOS reales: cámara, galería, orientación, legibilidad, tamaño resultante, EXIF, copiar monto y reconexión.

## Capturas de pantalla

**Pendientes:** cliente y caja con datos de demostración autorizados, y prueba en celular real. No se generaron ni inventaron imágenes de evidencia. No se ejecutaron E2E contra datos compartidos.

## Ampliación autorizada tras el nuevo diagnóstico

- Motivo obligatorio de rechazo validado en interfaz, acción y SQL; se conserva para auditoría.
- Bloqueo de aprobación de una huella previamente confirmada, incluida concurrencia entre cuentas distintas. La huella del original sigue llegando del navegador: el bloqueo no demuestra autenticidad ni impide alteraciones deliberadas de la imagen o de su huella. Caja debe comprobar siempre el ingreso real.
- Nuevo archivo `validar-imagen-captura.ts` y `tests/unit/validar-imagen-captura.test.ts`: JPEG/WebP reales en memoria, MIME incorrecto, truncamiento, orientación, EXIF, dimensiones y contenido agregado. No se instalaron librerías ni se cambiaron package.json/package-lock.json.
- Las pruebas RLS añaden motivo obligatorio y aprobación concurrente de la misma imagen en dos cuentas. Son casos preparados, todavía no ejecutados contra PostgreSQL.
- Copia inicial de los 31 archivos locales en una carpeta temporal `altoque-us102-respaldo-*`, con manifiesto SHA-256 y verificación de contenido.
- La rama conserva 0 commits exclusivos y está 6 commits detrás de la referencia local origin/develop. US-091 consta integrada mediante PR #86. La actualización de rama queda pendiente: la matriz tiene cambios locales y cambios de develop. No se descartaron archivos, no se hizo stash ni merge y no se crearon commits.
