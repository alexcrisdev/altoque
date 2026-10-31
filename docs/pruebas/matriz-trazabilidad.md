# Matriz de trazabilidad de historias y pruebas

US-038 · Línea base del **30/10/2026 (America/Lima)**, inicio del Sprint 3. Ver [plan de pruebas](plan-de-pruebas.md).

## Cómo interpretar la matriz

- Alcance de Sprints 1 y 2 proporcionado para US-038: US-001–US-009, US-025–US-028 y US-033–US-036. Los títulos/criterios oficiales se consultan en Jira; las descripciones siguientes identifican lo verificable en el código, no sustituyen el backlog.
- **Casos** cuenta ejecuciones de `it`/`test`, incluyendo cada variante de `it.each`; no cuenta los `expect`. Un archivo puede cubrir varias historias. Los subconjuntos y casos compartidos se indican para no sumar la misma prueba dos veces.
- **Aprobado (parcial)** significa que pasaron los casos citados, no que todos los criterios de la historia ni su flujo E2E estén cubiertos.
- **Pendiente de ejecución** significa que existe la prueba, pero no se ejecutó en esta revisión. **Sin prueba directa** no equivale a aprobado; la presencia de código o de fixtures no demuestra cobertura funcional.
- Resultado unitario observado: **13 archivos, 192 casos, 192 aprobados, 0 fallidos**. Se puede reproducir con `npm test`; el [reporte de cobertura](evidencias/cobertura-sprint3-inicio.txt) conserva la ejecución con instrumentación. RLS: **2 archivos, 9 casos definidos; no ejecutados en US-038**.

## Sprints 1 y 2

Las rutas se expresan desde la raíz del repositorio. Las filas sin atribución verificable requieren contrastar el criterio de Jira y añadir pruebas, no asignarles un archivo por semejanza de nombre.

| Historia | Archivo(s) / selección que la cubre | Nivel | Cantidad de casos | Resultado y límite |
|---|---|---|---|---|
| US-001 | Sin archivo dedicado de acceso/generación QR. `tests/unit/registrar-pedido.test.ts`: caso «rechaza un QR inválido…» como apoyo compartido con US-009 | Unitaria, apoyo indirecto | 0 directos; 1 compartido | Apoyo aprobado; pendiente probar resolución/generación/desactivación del QR y recorrido completo |
| US-002 | `tests/unit/modalidad.test.ts`; los 3 casos con prefijo «US-002» de `tests/unit/registrar-pedido.test.ts` | Unitaria con mocks de dependencias | 9 + 3 = 12 | Aprobado (parcial): modalidad, datos de cliente y límites QR mostrador; falta E2E |
| US-003 | `tests/unit/pedido-asistido.test.ts` | Unitaria con mocks | 9 | Aprobado (parcial): contrato de solicitud, errores, rol/contexto e idempotencia de la acción; falta persistencia real/E2E |
| US-004 | `tests/unit/carta.test.ts`; `tests/unit/carta-disponibilidad.test.ts` | Unitaria; consulta mock y render estático | 10 + 1 = 11 | Aprobado (parcial): formato, categorías, filtrado y agotados; falta navegación en navegador |
| US-005 | `tests/unit/carta.test.ts`, caso «conserva productos agotados y campos opcionales» | Unitaria, compartida con US-004 | 1 compartido | Aprobado como apoyo de datos; falta comprobar detalle de ingredientes y alérgenos en la interfaz |
| US-006 | `tests/unit/carrito.test.ts`, todos los grupos excepto `aItemsPedido` | Unitaria | 35 | Aprobado (parcial): cantidades/límites, agregar, quitar, observaciones y totales; falta E2E |
| US-007 | `tests/unit/carrito.test.ts`, grupo `aItemsPedido`; `tests/unit/confirmacion-carrito.test.ts`; `tests/unit/confirmar-pedido-cliente.test.ts` | Unitaria; render estático y callbacks con mocks | 7 + 5 + 6 = 18 | Aprobado (parcial): conversión, resumen, bloqueo, reintentos, errores y éxito; no prueba registro real desde navegador |
| US-008 | `tests/unit/validacion-pedido.test.ts`; `tests/unit/validar-pedido-servidor.test.ts` | Unitaria; consultas mock | 54 + 8 = 62 | Aprobado (parcial): contrato, recálculo, cambios de producto/precio y filtros; no acredita RLS/SQL real |
| US-009 | `tests/unit/registrar-pedido.test.ts`, los 5 casos sin prefijo US-002 | Unitaria con mocks | 5 | Aprobado (parcial): registro, QR inválido, clave, rechazo y reintento; falta verificar concurrencia y numeración contra base real |
| US-025 | Sin caso atribuible directamente al ID/criterio con la información local | Pendiente de confirmar en Jira | 0 identificados | Sin prueba directa atribuida; revisar criterio de la historia antes de asignar casos |
| US-026 | No hay prueba directa de login/sesión; `tests/unit/permisos.test.ts` apoya los permisos, y `tests/rls/acceso-cruzado.test.ts` usa login real como precondición | Unitaria indirecta / Integración | 0 directos de autenticación; 3 unitarios compartidos de permisos | Apoyo unitario aprobado; integración no ejecutada. Login, logout y sesión necesitan casos propios |
| US-027 | `tests/unit/permisos.test.ts`; apoyo de `tests/rls/acceso-cruzado.test.ts` para acceso anónimo, escalamiento y borrado (3 casos) | Unitaria / Integración RLS | 3 unitarios + 3 RLS compartidos | Unitarios aprobados (parcial); RLS pendiente de ejecución; no se han recorrido todos los paneles por rol |
| US-028 | `tests/rls/acceso-cruzado.test.ts` y apoyo de aislamiento/roles en `tests/rls/sesiones.test.ts` | Integración RLS real | 4 + 5 = 9, compartidos con otras historias | Pendiente de ejecución; cubre escenarios concretos, no todas las políticas y tablas |
| US-033 | `.github/workflows/ci.yml` define el job `verificar`; no existe test unitario dedicado al YAML | Verificación de infraestructura | 0 casos dedicados; ejecuta la suite de 192 unitarios | Pendiente validar Actions del PR de US-038; checks locales no certifican una ejecución remota |
| US-034 | Migraciones y seed como precondición de `tests/rls/acceso-cruzado.test.ts` y `tests/rls/sesiones.test.ts`; sin suite completa de esquema | Integración indirecta | 9 RLS compartidos; 0 dedicados al esquema completo | Pendiente de ejecución; faltan contratos/constraints de todas las entidades |
| US-035 | `supabase/seed.sql` y `scripts/usuarios-demo.mjs` son fixtures/preparación; no hay test dedicado atribuible al ID | Preparación, no prueba por sí misma | 0 dedicados | Pendiente contrastar alcance en Jira; no marcar seed/usuarios como prueba aprobada |
| US-036 | `tests/rls/sesiones.test.ts`; apoyo de los casos de mesa sin sesión en `tests/unit/confirmacion-carrito.test.ts` y `tests/unit/confirmar-pedido-cliente.test.ts` | Integración RLS / Unitaria compartida | 5 RLS + 2 unitarios compartidos | Unitarios aprobados como apoyo; RLS pendiente de ejecución; falta recorrido mesero → cliente |

No sumar esta tabla para obtener 192: hay casos compartidos y casos de archivos existentes cuya asignación a las historias solicitadas no se puede asegurar. La fuente del total es el inventario de ejecución siguiente.

## Inventario unitario observado

Todos estos archivos se ejecutan con `npm test`. La instrumentación de cobertura no transforma sus mocks en integración real.

| Archivo en `tests/unit/` | Casos ejecutados | Resultado | Atribución/observación |
|---|---:|---|---|
| `carrito.test.ts` | 42 | Aprobado | 35 US-006; 7 US-007 |
| `carta-disponibilidad.test.ts` | 1 | Aprobado | US-004; consulta simulada y render estático |
| `carta.test.ts` | 10 | Aprobado | US-004; un caso de apoyo compartido con US-005 |
| `confirmacion-carrito.test.ts` | 5 | Aprobado | US-007 |
| `confirmar-pedido-cliente.test.ts` | 6 | Aprobado | US-007 |
| `estados-pedido.test.ts` | 16 | Aprobado | Transiciones y roles; asignación exacta a historia/sprint pendiente de Jira |
| `modalidad.test.ts` | 9 | Aprobado | US-002 |
| `pedido-asistido.test.ts` | 9 | Aprobado | US-003 |
| `permisos.test.ts` | 3 | Aprobado | Apoyo compartido para permisos/autenticación |
| `registrar-pedido.test.ts` | 8 | Aprobado | 5 US-009 y 3 US-002 |
| `validacion-pedido.test.ts` | 54 | Aprobado | US-008 |
| `validar-pedido-servidor.test.ts` | 8 | Aprobado | US-008 |
| `validar-producto.test.ts` | 21 | Aprobado | Validación del formulario administrativo; asociación exacta al ID de historia pendiente de Jira |
| **Total de casos únicos** | **192** | **192 aprobados** | **13 archivos** |

En `tests/rls/`: `acceso-cruzado.test.ts` define 4 casos y `sesiones.test.ts` define 5. No se ejecutaron; no hay evidencia nueva para declararlos aprobados.

## Historias pendientes de Sprints 3 y 4

Asignación y títulos confirmados por el equipo para Sprint 3 (30/10–01/11/2026) y Sprint 4 (02–04/11/2026). Cada responsable completará la trazabilidad al finalizar su historia. Aunque ya exista implementación (por ejemplo US-029) o este documento trate US-038, las celdas de archivos, nivel, cantidad, resultado y evidencia se dejan vacías como reserva, no como afirmación de ausencia de trabajo.

| Historia | Sprint | Título | Responsable | Archivo(s)/caso(s) | Nivel | Cantidad | Resultado | Evidencia |
|---|---|---|---|---|---|---|---|---|
| US-010 | 3 | Consultar el historial de estados del pedido | Alina | | | | | |
| US-011 | 3 | Modificar o cancelar pedidos | Alina | | | | | |
| US-012 | 3 | Visualizar mesas y pedidos activos | Erick | | | | | |
| US-013 | 3 | Recibir alertas de nuevos pedidos y solicitudes de ayuda | Erick | | | | | |
| US-014 | 3 | Confirmar la entrega y registrar incidencias | Alina | | | | | |
| US-015 | 3 | Visualizar pedidos en la pantalla de cocina | Verónica | | | | | |
| US-016 | 3 | Actualizar el estado de preparación | Verónica | | | | | |
| US-017 | 3 | Identificar incidencias durante la preparación | Verónica | | | | | |
| US-021 | 3 | Consultar el importe pendiente de pago | Alexander | | | | | |
| US-029 | 3 | Preparar la publicación de la plataforma | Alexander | | | | | |
| US-037 | 3 | Consultar el estado de mi pedido | Fabrizio | | | | | |
| US-038 | 3 | Definir el plan de pruebas del sistema | Erick | | | | | |
| US-039 | 3 | Automatizar las pruebas de integración | Alina | | | | | |
| US-041 | 3 | Unificar el diseño de la interfaz | Fabrizio | | | | | |
| US-018 | 4 | Consultar las ventas y el ticket promedio | Fabrizio | | | | | |
| US-019 | 4 | Identificar los productos más vendidos | Fabrizio | | | | | |
| US-020 | 4 | Cerrar la cuenta después del pago | Alexander | | | | | |
| US-022 | 4 | Registrar pagos en efectivo | Alexander | | | | | |
| US-023 | 4 | Registrar pagos mediante Yape | Alexander | | | | | |
| US-024 | 4 | Registrar pagos con tarjeta | Alexander | | | | | |
| US-030 | 4 | Validar el flujo completo de pedidos | Erick | | | | | |
| US-031 | 4 | Registrar y verificar la corrección de errores | Alina | | | | | |
| US-032 | 4 | Preparar la demostración final del MVP | Fabrizio | | | | | |
| US-040 | 4 | Automatizar las pruebas funcionales del flujo principal | Erick | | | | | |
| US-042 | 4 | Adaptar la interfaz a celular y tablet con accesibilidad | Verónica | | | | | |

## Actualización al cerrar una historia

Relacionar sus criterios con casos CP-xxx o nombres de tests; anotar los archivos y subconjuntos exactos, el número de variantes ejecutadas, resultado, versión y evidencia. Registrar fallos/bloqueos y su defecto asociado. No copiar el estado verde de otra ejecución ni presentar un caso compartido como cobertura completa de una historia.
