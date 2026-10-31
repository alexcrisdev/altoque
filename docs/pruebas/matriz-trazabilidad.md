# Matriz de trazabilidad de historias y pruebas

US-038 · Línea base del **30/10/2026 (America/Lima)**, inicio del Sprint 3. Ver [plan de pruebas](plan-de-pruebas.md).

## Cómo interpretar la matriz

- Alcance de Sprints 1 y 2 proporcionado para US-038: US-001–US-009, US-025–US-028 y US-033–US-036. Los títulos de la tabla corresponden a Jira, confirmados por el equipo; la selección de pruebas indica el alcance comprobado y sus límites.
- **Casos** cuenta ejecuciones de `it`/`test`, incluyendo cada variante de `it.each`; no cuenta los `expect`. Un archivo puede cubrir varias historias. Los subconjuntos y casos compartidos se indican para no sumar la misma prueba dos veces.
- **Aprobado (parcial)** significa que pasaron los casos citados, no que todos los criterios de la historia ni su flujo E2E estén cubiertos.
- **Pendiente de ejecución** significa que existe la prueba, pero no se ejecutó en esta revisión. **Sin prueba directa** no equivale a aprobado; la presencia de código o de fixtures no demuestra cobertura funcional.
- Resultado unitario observado: **13 archivos, 192 casos, 192 aprobados, 0 fallidos**. Se puede reproducir con `npm test`; el [reporte de cobertura](evidencias/cobertura-sprint3-inicio.txt) conserva la ejecución con instrumentación. RLS: **2 archivos, 9 casos definidos; no ejecutados en US-038**.

## Sprints 1 y 2

Las rutas se expresan desde la raíz del repositorio. Las tareas de configuración se acreditan con evidencia de ejecución; no requieren inventar pruebas unitarias.

| Historia | Título | Archivo(s) / selección que la cubre | Nivel | Cantidad de casos | Resultado y límite |
|---|---|---|---|---|---|
| US-001 | Generar código QR único por mesa | Sin archivo dedicado de acceso/generación QR. `tests/unit/registrar-pedido.test.ts`: caso «rechaza un QR inválido…» como apoyo compartido con US-009 | Unitaria, apoyo indirecto | 0 directos; 1 compartido | Apoyo aprobado; pendiente probar resolución/generación/desactivación del QR y recorrido completo |
| US-002 | Seleccionar modalidad de consumo | `tests/unit/modalidad.test.ts`; los 3 casos con prefijo «US-002» de `tests/unit/registrar-pedido.test.ts` | Unitaria con mocks de dependencias | 9 + 3 = 12 | Aprobado (parcial): modalidad, datos de cliente y límites QR mostrador; falta E2E |
| US-003 | Solicitar asistencia para realizar un pedido | `tests/unit/pedido-asistido.test.ts` | Unitaria con mocks | 9 | Aprobado (parcial): contrato de solicitud, errores, rol/contexto e idempotencia de la acción; falta persistencia real/E2E |
| US-004 | Visualizar la carta digital | `tests/unit/carta.test.ts`; `tests/unit/carta-disponibilidad.test.ts` | Unitaria; consulta mock y render estático | 10 + 1 = 11 | Aprobado (parcial): formato, categorías, filtrado y agotados; falta navegación en navegador |
| US-005 | Consultar detalles de los productos | `tests/unit/carta.test.ts`, caso «conserva productos agotados y campos opcionales» | Unitaria, compartida con US-004 | 1 compartido | Aprobado como apoyo de datos; falta comprobar detalle de ingredientes y alérgenos en la interfaz |
| US-006 | Agregar y personalizar productos | `tests/unit/carrito.test.ts`, todos los grupos excepto `aItemsPedido` | Unitaria | 35 | Aprobado (parcial): cantidades/límites, agregar, quitar, observaciones y totales; falta E2E |
| US-007 | Revisar y confirmar el carrito | `tests/unit/carrito.test.ts`, grupo `aItemsPedido`; `tests/unit/confirmacion-carrito.test.ts`; `tests/unit/confirmar-pedido-cliente.test.ts` | Unitaria; render estático y callbacks con mocks | 7 + 5 + 6 = 18 | Aprobado (parcial): conversión, resumen, bloqueo, reintentos, errores y éxito; no prueba registro real desde navegador |
| US-008 | Validar disponibilidad y datos del pedido | `tests/unit/validacion-pedido.test.ts`; `tests/unit/validar-pedido-servidor.test.ts` | Unitaria; consultas mock | 54 + 8 = 62 | Aprobado (parcial): contrato, recálculo, cambios de producto/precio y filtros; no acredita RLS/SQL real |
| US-009 | Registrar y generar un número de pedido | `tests/unit/registrar-pedido.test.ts`, los 5 casos sin prefijo US-002 | Unitaria con mocks | 5 | Aprobado (parcial): registro, QR inválido, clave, rechazo y reintento; falta verificar concurrencia y numeración contra base real |
| US-025 | Configurar el entorno de desarrollo | No aplica prueba unitaria (tarea de configuración); evidencia: CI `verificar` con `npm ci`, lint, typecheck y build | Verificación de configuración | No aplica | Aprobado: [job verificar del PR #21](https://github.com/alexcrisdev/altoque/actions/runs/41160648215/job/124417223231) |
| US-026 | Gestionar el acceso según los roles | `tests/unit/permisos.test.ts`; apoyo de `tests/rls/acceso-cruzado.test.ts` para acceso anónimo, escalamiento y borrado (3 casos) | Unitaria directa / Integración RLS de apoyo | 3 unitarios + 3 RLS compartidos | Unitarios aprobados (parcial); apoyo RLS pendiente de ejecución; falta recorrido de paneles por rol |
| US-027 | Administrar productos y disponibilidad | `tests/unit/validar-producto.test.ts`; `tests/unit/carta-disponibilidad.test.ts` | Unitaria; validación, consulta mock y render estático | 21 + 1 = 22 | Aprobado (parcial): validación de productos y disponibilidad; falta E2E del formulario administrativo |
| US-028 | Proteger la información del restaurante | `tests/rls/acceso-cruzado.test.ts` y apoyo de aislamiento/roles en `tests/rls/sesiones.test.ts` | Integración RLS real | 4 + 5 = 9, compartidos con otras historias | Pendiente de ejecución; cubre escenarios concretos, no todas las políticas y tablas |
| US-033 | Configurar CI/CD y staging | `.github/workflows/ci.yml`, job `verificar`; evidencia del [PR #21](https://github.com/alexcrisdev/altoque/pull/21) | Verificación de infraestructura | 0 casos dedicados; ejecuta la suite de 192 unitarios | Aprobado: [ejecución en verde de verificar](https://github.com/alexcrisdev/altoque/actions/runs/41160648215/job/124417223231). Evidencia de esa revisión del PR; los commits posteriores deben volver a pasar CI |
| US-034 | Crear el esquema de base de datos y migraciones | Migraciones y seed como precondición de `tests/rls/acceso-cruzado.test.ts` y `tests/rls/sesiones.test.ts`; sin suite completa de esquema | Integración indirecta | 9 RLS compartidos; 0 dedicados al esquema completo | Pendiente de ejecución; faltan contratos/constraints de todas las entidades |
| US-035 | Generar el QR de mostrador para pedidos para llevar | Los 3 casos con prefijo «US-002» de `tests/unit/registrar-pedido.test.ts`; `tests/unit/modalidad.test.ts`, caso «un QR de mostrador no permite elegir en el local» | Unitaria con mocks; compartida con US-002 | 3 + 1 = 4 compartidos | Aprobado (parcial): modalidad para llevar y restricciones de mostrador; falta probar generación/persistencia del QR y E2E |
| US-036 | Abrir y gestionar la sesión de mesa | `tests/rls/sesiones.test.ts`; apoyo de los casos de mesa sin sesión en `tests/unit/confirmacion-carrito.test.ts` y `tests/unit/confirmar-pedido-cliente.test.ts` | Integración RLS / Unitaria compartida | 5 RLS + 2 unitarios compartidos | Unitarios aprobados como apoyo; RLS pendiente de ejecución; falta recorrido mesero → cliente |

No sumar esta tabla para obtener 192: hay casos compartidos entre historias y pruebas de Sprint 3. La fuente del total de casos únicos es el inventario de ejecución siguiente.

## Inventario unitario observado

Todos estos archivos se ejecutan con `npm test`. La instrumentación de cobertura no transforma sus mocks en integración real.

| Archivo en `tests/unit/` | Casos ejecutados | Resultado | Atribución/observación |
|---|---:|---|---|
| `carrito.test.ts` | 42 | Aprobado | 35 US-006; 7 US-007 |
| `carta-disponibilidad.test.ts` | 1 | Aprobado | US-027; compartido con US-004; consulta simulada y render estático |
| `carta.test.ts` | 10 | Aprobado | US-004; un caso de apoyo compartido con US-005 |
| `confirmacion-carrito.test.ts` | 5 | Aprobado | US-007 |
| `confirmar-pedido-cliente.test.ts` | 6 | Aprobado | US-007 |
| `estados-pedido.test.ts` | 16 | Aprobado | US-010; transiciones y roles; falta E2E |
| `modalidad.test.ts` | 9 | Aprobado | US-002; un caso de mostrador compartido con US-035 |
| `pedido-asistido.test.ts` | 9 | Aprobado | US-003 |
| `permisos.test.ts` | 3 | Aprobado | US-026; acceso según roles |
| `registrar-pedido.test.ts` | 8 | Aprobado | 5 US-009 y 3 US-002, estos últimos compartidos con US-035 |
| `validacion-pedido.test.ts` | 54 | Aprobado | US-008 |
| `validar-pedido-servidor.test.ts` | 8 | Aprobado | US-008 |
| `validar-producto.test.ts` | 21 | Aprobado | US-027; validación del formulario administrativo |
| **Total de casos únicos** | **192** | **192 aprobados** | **13 archivos** |

En `tests/rls/`: `acceso-cruzado.test.ts` define 4 casos y `sesiones.test.ts` define 5. No se ejecutaron; no hay evidencia nueva para declararlos aprobados.

## Historias de Sprints 3 y 4

Asignación y títulos confirmados por el equipo para Sprint 3 (30/10–01/11/2026) y Sprint 4 (02–04/11/2026). Se completa US-010 con sus 16 casos unitarios y US-029 con la evidencia smoke indicada. Cada responsable completará las demás filas al finalizar su historia; sus celdas vacías no afirman ausencia de implementación.

| Historia | Sprint | Título | Responsable | Archivo(s)/caso(s) | Nivel | Cantidad | Resultado | Evidencia |
|---|---|---|---|---|---|---|---|---|
| US-010 | 3 | Consultar el historial de estados del pedido | Alina | `tests/unit/estados-pedido.test.ts` | Unitaria | 16 | Aprobado (parcial; falta E2E) | `npm test`; [ejecución unitaria con cobertura](evidencias/cobertura-sprint3-inicio.txt) |
| US-011 | 3 | Modificar o cancelar pedidos | Alina | | | | | |
| US-012 | 3 | Visualizar mesas y pedidos activos | Erick | | | | | |
| US-013 | 3 | Recibir alertas de nuevos pedidos y solicitudes de ayuda | Erick | | | | | |
| US-014 | 3 | Confirmar la entrega y registrar incidencias | Alina | | | | | |
| US-015 | 3 | Visualizar pedidos en la pantalla de cocina | Verónica | | | | | |
| US-016 | 3 | Actualizar el estado de preparación | Verónica | | | | | |
| US-017 | 3 | Identificar incidencias durante la preparación | Verónica | | | | | |
| US-021 | 3 | Consultar el importe pendiente de pago | Alexander | | | | | |
| US-029 | 3 | Preparar la publicación de la plataforma | Alexander | `scripts/smoke.mjs` | Funcional/smoke | 9 comprobaciones | Aprobado | [Smoke en GitHub Actions](https://github.com/alexcrisdev/altoque/actions/runs/41140071382) |
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
