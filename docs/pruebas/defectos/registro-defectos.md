# Registro de defectos — US-031

Última revisión: 05/11/2026, 00:11 (America/Lima). Rama `dev/alina` en `173953b`, actualizada por fast-forward desde `origin/develop` (incluye PR #50). Se conservaron los cambios locales y los tres stashes. Las confirmaciones de la comprobación visual de QR y de la aprobación del PO provienen de Alina en esta conversación; no se adjuntaron captura ni mensaje literal de Fabrizio.

## Severidad y prioridad

- **Crítica:** bloquea el flujo principal (pedir, cocina, cobrar), pierde/duplica pedidos o pagos, o rompe el aislamiento entre restaurantes / expone datos o claves.
- **Alta:** una función importante falla y no hay alternativa razonable, o hay riesgo de seguridad explotable.
- **Media:** falla con alternativa (workaround) o en un caso poco frecuente.
- **Baja:** texto, estilo o detalle visual sin impacto funcional.

Prioridad **P1–P3** indica cuándo corregirlo según severidad y tiempo a la entrega. No se asigna una prioridad final a candidatos sin confirmar.

## Seguimiento

Flujo: **Abierto → En corrección → Corregido (PR) → Verificado → Cerrado**. La alternativa **Aceptado con riesgo** solo aplica a severidad Media/Alta, con aprobación explícita del PO Fabrizio y riesgo documentado. Ninguna aprobación se presume.

| ID | Título | HU | Severidad | Prioridad | Responsable | Estado | PR | Re-prueba |
|---|---|---|---|---|---|---|---|---|
| DEF-001 | Observación compuesta solo por espacios | US-008 | No aplica | — | Verónica (HU afectada) | No aplica: SQL convierte la cadena vacía en `null` | — | Revisión de función y SQL, 04/11/2026 |
| DEF-002 | QR demo conocido en una base Supabase compartida por los entornos | US-001 / US-009 | Alta (provisional; mitigación verificada) | P1 | Alexander (entorno Supabase) | Verificado: Alina confirma que ambas rutas muestran «QR no válido» (05/11/2026); no se crearon pedidos | — | Verificación visual reportada por Alina; sin cambio de datos |
| DEF-003 | Función antigua `registrar_pedido_qr` permanece en una migración (deuda técnica) | US-002 | Baja (candidato de deuda) | P3 (candidato) | Responsable de US-002, por confirmar | Pendiente de decisión técnica; no es fallo funcional reproducido y no hay invocación desde el código actual localizada | — | Responsable de US-002 debe decidir si conservarla o retirarla; cualquier retiro requiere migración nueva y verificación de dependencias/grants |
| DEF-004 | Vulnerabilidades moderadas en dependencias de desarrollo | US-043 | Media (riesgo documentado) | P2 | Alexander (US-043); Fabrizio (PO) | Aceptado con riesgo: Alina reportó la aprobación explícita del PO el 05/11/2026; fecha original y mensaje literal no proporcionados | — | Aceptación indirecta; riesgo limitado a herramientas de desarrollo según evidencia US-043 |
| DEF-005 | TypeScript 7 rompió la verificación en CI (hallazgo de CI, no de producto) | US-043 / CI | Baja (hallazgo de CI) | P3 | Alexander (US-043) | Cerrado como hallazgo de CI: PR #44 no se integró y la línea base volvió a estar verde | PR #44 (cerrado, según evidencia US-043) | US-043 registra `verificar` verde con TypeScript 5; no es re-prueba de `dev/alina` |
| DEF-006 | Los subtítulos de tendencias usan nivel `h2` en lugar de `h3` | US-019 | Baja | P3 | Fabrizio (US-019) | Verificado por inspección JSX y lint en `173953b` | [PR #50](https://github.com/alexcrisdev/altoque/pull/50) | Productos más vendidos y Pedidos por estado son `h3`; no se hizo prueba en navegador |
| DEF-007 | El conteo de tendencias puede cambiar durante la paginación y fallar la consulta | US-019 | Media (candidata; hay alternativa de recargar) | P2 | Fabrizio (US-019) | Verificado por pruebas unitarias locales: 12/12 en `tendencias-servidor.test.ts`; sin reproducción real en Supabase | [PR #50](https://github.com/alexcrisdev/altoque/pull/50) | Reintento y descarte de la lectura anterior cubiertos con mocks; no se accedió a Supabase |
| DEF-008 | Las suites de pagos dejan datos ficticios confirmados que alteran ventas y tendencias de demo | US-019 / US-020 / US-022 / US-023 / US-030 / US-040 | Media | P2 | Fabrizio (PO/decisión de demo); Alexander y Erick (mitigación de suites) | Aceptado con riesgo: Alina reportó la aprobación explícita del PO el 05/11/2026; fecha original y mensaje literal no proporcionados | — | Riesgo para la demo: elegir y documentar el rango de fechas en la guía US-032; aislamiento real requiere una base de pruebas separada |

## Fichas y evidencia

### DEF-001 — Observación con solo espacios (No aplica)

- **HU/criterio:** US-008; normalización de observaciones y persistencia de `order_items.observation`.
- **Detección:** candidato provisto en el prompt; revisión de `src/features/pedidos/validacion.ts` y de la función `registrar_pedido_cliente` en `supabase/migrations/20261027230000_modalidad_de_consumo.sql`.
- **Entorno/commit:** revisión estática local, `04b542b`; sin conexión a base de datos.
- **Pasos:** validar un ítem cuya observación sea `"   "`; seguir el valor recortado al RPC y la expresión SQL de inserción.
- **Esperado:** una observación vacía se persiste como `null`.
- **Obtenido:** TypeScript recorta espacios a `""`; SQL ejecuta `nullif(left(trim(...), 140), '')`, que convierte `""` en `null`. No se reprodujo el defecto.
- **Severidad/prioridad/responsable/estado:** No aplica; no se registra como defecto.
- **Evidencia:** archivos citados; no hubo captura ni consulta a datos persistidos.
- **Corrección, PR, regresión y re-prueba:** no aplica.
- **Fecha/hora:** 04/11/2026, 12:18 (America/Lima).

### DEF-002 — QR demo en base compartida (verificado)

- **HU/criterio:** US-001/US-009; QR revocables y aislamiento entre restaurantes.
- **Detección:** `supabase/seed.sql` define activos `demo-mesa-1..3` y `demo-mostrador`. La evidencia de US-043 en `origin/develop` (`dc89187`) dice que todos los entornos usan la misma base Supabase.
- **Entorno/commit:** rama `dev/alina`, integrada con `origin/develop` en `173953b`; confirmación operativa de Alexander sobre la anulación (04/11/2026) y confirmación visual de Alina (05/11/2026).
- **Pasos/re-prueba:** Alina confirma que abrió `/m/demo-mesa-2` y `/m/demo-mesa-3` y ambas mostraron «QR no válido». No se crearon pedidos. No se modificó Supabase en esta revisión.
- **Esperado:** solo tokens autorizados en el entorno correspondiente permiten pedir y ningún entorno de producción comparte credenciales/base de pruebas.
- **Obtenido:** ambas rutas muestran «QR no válido», según la comprobación visual reportada por Alina el 05/11/2026.
- **Severidad/prioridad:** Alta/P1 provisionales por el riesgo de pedidos no autorizados si esos tokens siguen activos en el entorno compartido.
- **Responsable/estado:** Alexander anuló los tokens; estado **Verificado** tras la comprobación visual reportada por Alina.
- **Evidencia:** confirmaciones de Alexander (anulación, 04/11/2026) y Alina (rutas muestran «QR no válido», 05/11/2026); `supabase/seed.sql`; [evidencia US-043](https://github.com/alexcrisdev/altoque/blob/173953b/docs/pruebas/evidencias/us043-seguridad.md). No se adjuntó captura.
- **Corrección/PR/regresión/re-prueba:** corrección operativa de Alexander; re-prueba visual informada por Alina. Esta revisión no creó pedidos ni tocó Mesa 5 o el QR mostrador del E2E.
- **Fecha/hora:** 05/11/2026 (America/Lima; hora no proporcionada).

### DEF-003 — Función SQL antigua (deuda técnica candidata)

- **HU/criterio:** US-002; función reemplazada por `registrar_pedido_cliente`.
- **Detección:** búsqueda en migraciones; `registrar_pedido_qr` aparece en `20261026120000_registro_pedidos.sql` y el grant de esa migración limita ejecución a `service_role`.
- **Entorno/commit:** revisión de migraciones en `dev/alina` después de integrar develop, `173953b`.
- **Pasos:** buscar la definición antigua en la migración y revisar sus `REVOKE`/`GRANT`; no se intentó invocarla.
- **Esperado:** la función retirada no queda ejecutable por roles de cliente.
- **Obtenido:** la búsqueda en migraciones encuentra la definición en `20261026120000_registro_pedidos.sql` y una mención en comentario en `20261027230000_modalidad_de_consumo.sql`; la definición revoca `public`, `anon` y `authenticated`, y concede ejecución solo a `service_role`. No se intentó invocarla ni se reprodujo fallo funcional; queda como deuda candidata.
- **Severidad/prioridad/responsable/estado:** Baja/P3 solo como clasificación de deuda técnica; no es un defecto funcional reproducido. Responsable de US-002 por confirmar; Pendiente de decisión técnica.
- **Evidencia:** `supabase/migrations/20261026120000_registro_pedidos.sql`.
- **Decisión técnica pendiente:** la definición permanece en la migración histórica, que no se modifica. La búsqueda actual no localizó invocaciones ejecutables desde el código de la aplicación; hay una mención en comentario de otra migración. Mantenerla no produjo un fallo funcional observado y la migración registrada limita `EXECUTE` a `service_role`.
- **Recomendación para decisión del responsable de US-002:** conservarla si no hay una necesidad aprobada de retirarla; si se decide retirarla, crear una migración nueva y revisar primero las referencias y grants en los entornos desplegados. Esta revisión fue estática: no consultó la base ni ejecutó la función, por lo que no certifica los grants actuales de Supabase.
- **Corrección/PR/regresión/re-prueba:** sin cambio y sin PR. Responsable de US-002 por confirmar; decisión de conservar o retirar aún pendiente. No editar la migración histórica.
- **Fecha/hora:** 04/11/2026, 22:40 (America/Lima).

### DEF-004 — Vulnerabilidades moderadas en dependencias de desarrollo (bloqueado)

- **HU/criterio:** US-043; dependencias de desarrollo.
- **Detección:** la evidencia histórica de US-043 (PR #39) registra vulnerabilidades moderadas en la cadena ESLint/minimatch de desarrollo y 0 con `npm audit --omit=dev`.
- **Entorno/commit:** auditoría documentada en la revisión local del PR #39 de US-043; no se volvió a ejecutar en esta revisión.
- **Pasos:** revisar la salida registrada de `npm audit` para todas las dependencias y de `npm audit --omit=dev` para producción.
- **Esperado:** ninguna vulnerabilidad conocida en dependencias de producción; las vulnerabilidades de herramientas de desarrollo deben quedar evaluadas y aceptadas o corregidas explícitamente.
- **Obtenido:** el informe US-043 registra 16 moderadas en herramientas de desarrollo y 0 con `--omit=dev`; la corrección se aplazó hasta después de la entrega.
- **Severidad/prioridad:** Media/P2 como riesgo documentado de desarrollo.
- **Responsable/estado:** Fabrizio (PO) aceptó el riesgo, según confirmación indirecta de Alina del 05/11/2026. No se proporcionó la fecha original ni el texto literal de la aprobación.
- **Justificación/alcance:** el hallazgo afecta herramientas de desarrollo (ESLint); US-043 documenta 0 vulnerabilidades de producción con `npm audit --omit=dev`. La aceptación no afirma que las vulnerabilidades de desarrollo se hayan corregido.
- **Evidencia:** confirmación indirecta de Alina en esta conversación (05/11/2026); [informe US-043](https://github.com/alexcrisdev/altoque/blob/173953b/docs/pruebas/evidencias/us043-seguridad.md) y [validación US-043](https://github.com/alexcrisdev/altoque/blob/173953b/docs/pruebas/evidencias/us043-validacion.txt). No se recibió mensaje literal de Fabrizio.
- **Corrección/regresión/re-prueba:** no se corrigieron las dependencias; aceptación de riesgo para la entrega. Revisar nuevamente con cambios de dependencias.
- **Fecha/hora del registro indirecto:** 05/11/2026 (America/Lima; hora no proporcionada).

### DEF-005 — TypeScript 7 en CI (hallazgo resuelto, no es defecto de producto)

- **HU/criterio:** verificación de CI asociada a US-043.
- **Detección/revisión US-031 (05/11/2026):** se revisó la evidencia conservada de US-043; Dependabot propuso TypeScript 7 y PR #44 fue cerrado. No se volvió a ejecutar CI ni `npm audit` para esta ficha.
- **Entorno/commit/pasos/resultados:** US-043 documenta que Dependabot abrió PR #44 con TypeScript 7, falló `verificar`, se cerraron los PR de esa tanda y se retiró la configuración que los generaba. Develop conserva TypeScript 5.9.3.
- **Severidad/prioridad/estado:** No aplica al producto; Baja/P3 como hallazgo histórico de CI. Cerrado al no integrar la actualización incompatible; no se marca como defecto de producto verificado.
- **Responsable/evidencia/corrección/prueba/re-prueba:** Alexander, responsable de US-043. [Validación US-043](https://github.com/alexcrisdev/altoque/blob/173953b/docs/pruebas/evidencias/us043-validacion.txt) registra `verificar` verde en PR #39 con la versión mantenida; no es una ejecución en `dev/alina`. La revisión de US-031 no cambia ese resultado histórico.
- **Fecha/hora:** 04/11/2026, 22:40 (America/Lima).

### DEF-006 — Jerarquía de encabezados de tendencias (US-019, verificado)

- **HU/criterio:** US-019; jerarquía de encabezados accesible en `/admin/reportes`.
- **Detección:** revisión previa de PR #47; corrección en PR #50, integrada en `dev/alina` mediante fast-forward hasta `173953b`.
- **Entorno/commit:** inspección estática del JSX de `src/app/admin/reportes/page.tsx` en `173953b`; ESLint de esa página pasó. No se usó navegador ni existe prueba unitaria específica de jerarquía.
- **Pasos para reproducir:** entrar a `/admin/reportes` con OWNER/ADMIN e inspeccionar los niveles de encabezado en el DOM o lector de pantalla.
- **Esperado:** “Tendencias de pedidos” es `h2`; “Productos más vendidos” y “Pedidos por estado” son `h3` dentro de esa sección.
- **Obtenido:** los encabezados «Productos más vendidos» y «Pedidos por estado» ahora son `h3`, bajo la sección de tendencias. Inspección del JSX, no lector de pantalla.
- **Severidad/prioridad/responsable/estado:** Baja/P3; Fabrizio (US-019); **Verificado** por inspección estática y lint.
- **Evidencia:** [PR #50](https://github.com/alexcrisdev/altoque/pull/50), `src/app/admin/reportes/page.tsx` en `173953b`; `npm exec eslint -- src/app/admin/reportes/page.tsx` pasó. La captura no demuestra semántica DOM.
- **Corrección/regresión/re-prueba:** corrección integrada; inspección JSX y lint completados. No se ejecutó prueba de navegador.
- **Fecha/hora:** 05/11/2026, 00:02 (America/Lima).

### DEF-007 — Cambio concurrente durante paginación de tendencias (US-019, verificado)

- **HU/criterio:** US-019; consulta de tendencias ante escrituras concurrentes.
- **Detección:** resultado reportado en la revisión de PR #47; corrección y pruebas nuevas en PR #50, integrado hasta `173953b`.
- **Entorno/commit:** pruebas unitarias locales en `dev/alina`, commit `173953b`; no se accedió a Supabase.
- **Prueba ejecutada:** `npm exec vitest -- run tests/unit/tendencias-servidor.test.ts`.
- **Esperado:** el reporte se completa con datos consistentes o recupera la consulta sin obligar a recargar manualmente.
- **Obtenido:** la lectura reinicia desde la primera página una vez si cambia el conteo y descarta el intento incompleto. La prueba cubre cambio de conteo, reintento y límite; 12/12 pruebas del archivo pasaron. No se reprodujo la condición con pedidos reales en Supabase.
- **Severidad/prioridad/responsable/estado:** Media/P2; Fabrizio (US-019); **Verificado** mediante pruebas unitarias simuladas.
- **Evidencia:** [PR #50](https://github.com/alexcrisdev/altoque/pull/50); `tests/unit/tendencias-servidor.test.ts`; `npm exec vitest -- run tests/unit/tendencias-servidor.test.ts` (12/12). La suite no prueba una base real.
- **Corrección/regresión/re-prueba:** corrección integrada y verificada en el nivel unitario; la reproducción real en Supabase queda fuera del alcance.
- **Fecha/hora:** 05/11/2026, 00:01 (America/Lima).

### DEF-008 — Datos de pagos de pruebas alteran métricas de demo

- **HU/criterio:** US-019, US-020, US-022/023 y US-030/040; reportes deben reflejar el restaurante y documentar límites de la demo.
- **Detección:** revisión estática de workflows/suites en `origin/develop` (`dc89187`). El workflow E2E y el de integración usan la base demo compartida; E2E y RLS registran pagos confirmados, y la limpieza conserva históricos.
- **Entorno/commit:** configuración y código de develop; no se ejecutó contra la base ni se consultó el panel real.
- **Pasos para reproducir (no ejecutados):** correr E2E/RLS en el proyecto compartido y consultar ventas/tendencias del día en el dashboard.
- **Esperado:** métricas de demo excluyen o identifican datos de prueba, o muestran claramente que incluyen pagos/pedidos ficticios.
- **Obtenido por inspección:** las suites escriben pagos `CONFIRMED`; ventas suma pagos confirmados por `confirmed_at` y tendencias consulta pedidos del periodo. El impacto numérico del dashboard no se midió.
- **Severidad/prioridad/responsable/estado:** Media/P2 por distorsión de métricas demo; **Aceptado con riesgo** por Fabrizio (PO), según confirmación indirecta de Alina del 05/11/2026. No se proporcionaron fecha original ni mensaje literal.
- **Justificación y alcance aceptado:** para la demo se elegirá y anotará el rango de fechas según la guía de US-032. La corrección estructural requiere una base de pruebas separada y queda fuera del plazo. El impacto numérico real del dashboard no se midió en esta revisión.
- **Evidencia:** [workflow E2E](https://github.com/alexcrisdev/altoque/blob/dc89187/.github/workflows/e2e.yml), [workflow RLS](https://github.com/alexcrisdev/altoque/blob/dc89187/.github/workflows/integracion.yml), `tests/e2e/pago-y-cierre.spec.ts`, `tests/rls/pagos.test.ts`, `src/features/dashboard/ventas.ts` y `tendencias.ts` en develop (`dc89187`).
- **Corrección/regresión/re-prueba:** sin corrección estructural ni borrado de datos. Aceptación de riesgo para la entrega; hacer visible en la guía US-032 que el rango elegido puede incluir pagos de prueba.
- **Evidencia:** confirmación indirecta de Alina en esta conversación (05/11/2026); no se recibió mensaje literal de Fabrizio.
- **Fecha/hora del registro indirecto:** 05/11/2026 (America/Lima; hora no proporcionada).

## Resultados de US-030 (Erick)

En `origin/develop` (`dc89187`), el guion y la validación de Erick registran 13/13 casos de aceptación aprobados y no observan defectos funcionales. Su salida adjunta reporta 17/17 E2E, 615/615 unitarias, lint, typecheck y build aprobados en su ejecución local. No incluye enlace a una ejecución E2E de Actions ni corresponde a `dev/alina`. No se recibió ningún DEF-030-xx que registrar. Evidencia: [guion CP-030](https://github.com/alexcrisdev/altoque/blob/dc89187/docs/pruebas/casos/cp-us030-flujo-completo.md) y [validación US-030](https://github.com/alexcrisdev/altoque/blob/dc89187/docs/pruebas/evidencias/us030-validacion.txt).

## Hallazgo operativo resuelto: sesiones demo

Alexander cerró las sesiones de las Mesas 1, 2 y 3 el 04/11/2026. También informó que el pedido N.º 25 de la Mesa 3 fue cancelado y quedó un saldo a favor de S/ 37, asociado a pagos de prueba antiguos. Hallazgo operativo resuelto; no es defecto de código y no recibe ID DEF. Esta revisión no volvió a cancelar pedidos ni cerrar sesiones, y no comprobó ni alteró esos datos en la base.

## Regresión US-031

Ejecución local de línea base el 04/11/2026, commit `04b542b`, America/Lima. También se revisó como referencia —sin integrarla al árbol local— la regresión de US-030 en develop `dc89187`. Detalle y límites en [evidencia de regresión](../evidencias/us031-regresion.txt).

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm test`: 21 archivos, 378 casos aprobados, 0 fallidos.
- `npm run build` en `dev/alina` (`173953b`), 05/11/2026: fallido porque Next.js no pudo descargar Geist y Geist Mono desde `fonts.googleapis.com` para `next/font`. No se concluye que compile en un entorno con acceso de red.
- `npm run test:rls`: no ejecutado; el plan identifica Supabase compartido y riesgo de escritura, sin verificación de un proyecto aislado.
- `npm run test:e2e`: no disponible en el checkout local `04b542b`; sí está configurado en `origin/develop` (`dc89187`). Erick reporta 17/17 E2E aprobados, pero no hay enlace de Actions ni es una ejecución de `dev/alina`.
- `npm run test:integracion`: no ejecutado. El workflow apunta a Supabase compartido y la suite de pagos escribe registros confirmados.

## Informe de cierre

**US-031 sigue abierta.** Se revisaron 8 registros: por severidad hay 0 críticos, 1 alto (DEF-002, verificado), 3 medios (DEF-004 y DEF-008 aceptados con riesgo; DEF-007 verificado), 3 bajos (DEF-003 pendiente de decisión técnica; DEF-005 cerrado como hallazgo histórico de CI; DEF-006 verificado) y 1 No aplica (DEF-001). Por estado: 3 verificados (DEF-002/006/007), 2 aceptados con riesgo (DEF-004/008), 1 pendiente de decisión técnica (DEF-003), 1 cerrado como hallazgo de CI (DEF-005) y 1 No aplica (DEF-001). No hay defectos críticos abiertos. DEF-002, el único de severidad alta, consta como verificado por confirmación visual reportada por Alina; no hay aceptación de riesgo alto pendiente. Las aprobaciones de DEF-004 y DEF-008 se registraron indirectamente por confirmación de Alina; no se proporcionó el texto literal de Fabrizio ni la fecha original de aprobación.

La comprobación unitaria global fue 617/617 y la prueba dirigida de tendencias 12/12; TypeScript y ESLint aprobaron según los resultados registrados previamente. El build ejecutado el 05/11/2026 falló al descargar fuentes de Google; no queda compilación verificada. No se ejecutaron RLS, E2E ni integración contra Supabase compartido. Erick reporta para US-030 13/13 casos de aceptación y 17/17 E2E, además de 615 unitarias; son resultados locales de Erick, no evidencia de CI de `dev/alina`.

DEF-003 requiere una decisión del responsable de US-002; no se editó ni eliminó su función o migración. La búsqueda documental no encontró una guía/entregable específico de US-032 en `docs/`. La limitación de DEF-008 debe añadirse en la guía o guion de demostración US-032, junto al paso donde se selecciona el rango de fechas del dashboard y su interpretación; no se modificó documentación de US-032. El workflow `.github/workflows/ci.yml` solo se activa con PR dirigidos a `develop`/`main` o pushes a esas ramas. Para obtener evidencia verde de esta rama, el flujo existente es abrir o actualizar un PR `dev/alina` → `develop` y conservar el enlace de la ejecución `verificar`; no se creó PR, no se hizo push y no hay ejecución de Actions registrada aquí.

**Pendiente para completar US-031:** obtener un resultado de build en un entorno con acceso a Google Fonts; generar y enlazar CI verde mediante PR; documentar la limitación en el entregable de US-032 cuando esté disponible; y resolver la decisión técnica de DEF-003 si el alcance de cierre la exige. Las pruebas con Supabase compartido siguen excluidas. No se atribuyen aprobaciones directas ni verificaciones que no consten en evidencia.
