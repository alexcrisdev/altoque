# Plan de pruebas del sistema AlToque

Historia: **US-038**. Línea base: **30/10/2026, inicio del Sprint 3**. Responsable de esta documentación: Erick. La [matriz de trazabilidad](matriz-trazabilidad.md) relaciona historias, casos y resultados.

Calendario confirmado por el equipo: Sprint 3, Mesero y cocina, del 30/10 al 01/11/2026; Sprint 4, Pagos y entrega, del 02/11 al 04/11/2026. US-039 (Alina) está prevista para el 01/11; US-040 (Erick), para el 02–03/11; US-030 (Erick), para el 04/11; US-031 (Alina), para el 03–04/11. US-041 (diseño) y US-042 (adaptación móvil/tablet y accesibilidad) deben incorporar sus comprobaciones visuales, de teclado y responsive en sus propios casos.

## Objetivo y alcance

Comprobar progresivamente el MVP de pedidos por QR para restaurantes MYPE: acceso QR, modalidad de consumo, carta, carrito, confirmación y registro, sesiones de mesa, atención asistida, estados del pedido, roles y aislamiento entre restaurantes. Los flujos de cocina, entrega, pago/cierre y consulta administrativa se incorporan a las pruebas conforme se implementen sus historias; este plan no los declara aprobados por anticipado.

Las reglas prioritarias son: precios y totales recalculados en servidor, permisos comprobados en servidor, filtros por restaurante y RLS, tokens QR persistidos solo como hash e idempotencia del registro. También se revisan cantidades y observaciones límite, disponibilidad de productos, errores de conexión y bloqueo de doble clic.

Se excluyen del MVP pruebas de cobros reales con bancos/Yape, datos personales reales y pruebas de carga o penetración exhaustivas. Un resultado unitario verde no acredita por sí solo el flujo completo ni la seguridad de todas las tablas.

## Estrategia bottom-up

Se empieza por funciones y contratos, luego se comprueba su integración con Supabase, después los recorridos del navegador y finalmente la aceptación por usuarios. Los defectos se convierten en casos de regresión en el nivel más bajo que los reproduzca; se añade un caso superior cuando el fallo depende de la interacción entre capas.

| Nivel | Herramienta | Quién escribe/revisa | Ubicación | Cuándo se ejecuta |
|---|---|---|---|---|
| 1. Unitarias | Vitest 5; mocks para dependencias externas cuando corresponda | Cada responsable de historia escribe; otro integrante revisa en el PR | `tests/unit/` | Localmente antes de cada commit; automáticamente en cada PR hacia `develop`/`main` y push a esas ramas, job `verificar` de CI |
| 2. Integración | Vitest contra Supabase del entorno staging de pruebas | Responsable de la integración y del esquema/RLS; Alina automatiza en US-039 | `tests/rls/` | Actualmente manual con `npm run test:rls`; antes de aceptar cambios de roles, esquema, RLS y sesiones. US-039 definirá su ejecución automática |
| 3. Funcionales E2E | Playwright, previsto; todavía no instalado | Erick implementa la infraestructura en US-040, Sprint 4; cada responsable agrega sus recorridos | `tests/e2e/`, prevista | En US-040 se configurará ejecución local y en CI contra un entorno de pruebas. Priorizar flujo QR → carrito → pedido y accesos por rol |
| 4. Aceptación/manual | Guion CP-xxx, navegador y evidencias | Equipo ejecutor y representante del usuario/PO validan; responsables según Jira | `docs/pruebas/casos/` y `docs/pruebas/evidencias/`, según se creen | US-030, Sprint 4: aceptación antes de la entrega. US-031: repetir defectos corregidos y recorridos afectados en cada regresión |

**Estado de partida:** 13 archivos unitarios, 192 casos ejecutados correctamente; 2 archivos RLS con 9 casos definidos, no ejecutados en US-038. No hay suite E2E. Existe además un smoke test de publicación de US-029 (`scripts/smoke.mjs` y `.github/workflows/smoke.yml`), documentado en [despliegue](../despliegue.md): no equivale a recorrer y confirmar un pedido desde el navegador.

El CI actual no se cambia en US-038. El workflow `CI` ejecuta instalación, lint, tipos, unitarias y build. No se activa por un push aislado a `dev/<nombre>` sin PR abierto hacia las ramas configuradas. La automatización de integración corresponde a US-039; la de E2E a US-040.

## Criterios de entrada, salida y suspensión

| Nivel | Entrada | Salida |
|---|---|---|
| Unitarias | Criterios de aceptación y contrato definidos; dependencias instaladas; casos positivos, negativos y límites identificados | Todos los casos aplicables pasan; se revisan los caminos sin cobertura y no se ocultan fallos con mocks que sustituyan la lógica comprobada |
| Integración | Unitarias aprobadas; migraciones aplicadas por el responsable; entorno y URL verificados; seed y usuarios demo preparados; una mesa demo libre para `sesiones.test.ts` | Todos los casos aplicables pasan con RLS real; se verifica aislamiento y se cierra la sesión creada por las pruebas; se conserva el historial y se registran incidencias de limpieza |
| E2E | Niveles inferiores relevantes aprobados; aplicación accesible; roles y datos de prueba disponibles; implementación de US-040 | Recorridos críticos pasan en los navegadores acordados en US-040; se verifica persistencia del pedido, errores y ausencia de duplicados; se guardan evidencias |
| Aceptación | Versión identificada, CI verde, casos trazados y entorno preparado; criterios funcionales disponibles | Usuario/PO registra conformidad; todos los casos críticos aprobados y sin defectos bloqueantes o de severidad alta abiertos; excepciones menores documentadas con responsable y seguimiento |

Suspender pruebas dependientes si faltan variables, el entorno no está identificado, la base está inaccesible o los datos no permiten ejecutar el caso. Registrar **Bloqueado**, no **Aprobado**. Ante un fallo funcional, registrar **Fallido**, crear la incidencia y repetir el caso después de la corrección junto con la regresión afectada. Una prueba no ejecutada permanece **Pendiente**.

El porcentaje de cobertura es una línea base para localizar riesgos, no un criterio único de aceptación. US-038 no impone un umbral nuevo de CI. Cualquier umbral posterior debe acordarse y medir un conjunto de archivos explícito.

## Entornos y datos

| Uso | Configuración y límites |
|---|---|
| Unitarias/cobertura | Node.js 22, instalación desde `package-lock.json`, Vitest y V8 en versiones compatibles. No deben necesitar credenciales reales ni conexiones a Supabase |
| Integración objetivo | Supabase del staging de pruebas, con datos ficticios y aislamiento de producción; ejecutar con usuarios de los roles que se comprueban |
| E2E y aceptación | Aplicación local/Preview/staging conectada a datos de pruebas; registrar URL, versión, rol, fecha y navegador en la evidencia |

**Limitación actual:** [la guía de despliegue](../despliegue.md#entornos) registra que desarrollo, Preview, staging y producción comparten `altoque-dev`. El nombre de la URL staging no garantiza aislamiento de datos. Antes de automatizar integración en US-039, el equipo debe resolver o acordar explícitamente esta limitación y la preparación/limpieza de datos. US-038 no ejecuta pruebas RLS ni cambia la base.

Datos disponibles:

- `supabase/seed.sql`: Cevichería Demo y Pollería Demo, mesas, categorías, productos y QR ficticios para comprobar pertenencia e intentos cruzados.
- `scripts/usuarios-demo.mjs`: prepara seis usuarios demo y sus membresías; requiere las variables de Supabase y `DEMO_PASSWORD`. No se ejecuta como parte de las unitarias.
- Roles: OWNER y ADMIN, WAITER, KITCHEN y CASHIER en Cevichería; OWNER de Pollería para probar aislamiento.
- QR demo: `/m/demo-mesa-1` a `/m/demo-mesa-3`, `/m/demo-mesa-4` desactivado y `/m/demo-mostrador` para llevar, siempre que esos registros sigan vigentes.
- Antes de cada prueba con persistencia, verificar restaurante, sesión y disponibilidad inicial; identificar los registros creados para no modificar datos ajenos al caso. No ejecutar un reset para limpiar automáticamente un entorno compartido.

La preparación del esquema/seed es una operación de base de datos y corresponde al responsable del entorno, siguiendo las migraciones y la guía del proyecto. No es un efecto de ejecutar `npm test`.

Las pruebas RLS leen `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `DEMO_PASSWORD` de `.env.local` mediante el script de npm. **El destino real es esa URL**, no el proyecto que figure enlazado en la CLI. La clave de servidor se usa solo para preparación autorizada de usuarios; las pruebas de permisos usan clientes autenticados normales y anónimos, sin saltarse RLS.

No subir `.env.local`, contraseñas, tokens, claves ni capturas con credenciales. En futuras automatizaciones, las credenciales privadas irán en secretos del entorno correspondiente, nunca en el repositorio. Redactar las evidencias antes de publicarlas y usar únicamente datos ficticios.

## Ejecución reproducible y evidencias

Desde la raíz del proyecto, después de instalar las dependencias:

```bash
npm test
npm run test:rls
npm run test:cobertura
```

Ejecutar `test:rls` **solo después** de verificar el entorno y preparar los datos descritos arriba. Puede escribir datos: `sesiones.test.ts` abre y cierra una sesión; `acceso-cruzado.test.ts` intenta operaciones que deben ser rechazadas. Una configuración equivocada de RLS puede permitir esos cambios, por lo que no deben probarse sobre datos reales.

Cada ejecución registrada debe indicar comando, fecha/hora y zona, versión/commit o estado local, entorno (sin secretos), responsable, resultado y enlace a su evidencia. Para CI, conservar el enlace de Actions y del PR; para pruebas manuales, capturas o video con los pasos y resultado; para defectos, enlazar Jira y su caso de regresión.

La evidencia inicial de cobertura se guarda en [cobertura-sprint3-inicio.txt](evidencias/cobertura-sprint3-inicio.txt). La salida predeterminada de V8 mide los archivos importados durante las unitarias; no es el porcentaje de todas las pantallas ni de todo `src/`. Los módulos sustituidos por mocks y los caminos no ejecutados deben analizarse por separado. No incluye RLS real, SQL, E2E ni aceptación. Los reportes generados en `coverage/` se mantienen ignorados por Git.

Referencia de configuración: [cobertura de Vitest](https://vitest.dev/guide/coverage.html). Para regenerar el texto en PowerShell, sin perder la salida de errores:

```powershell
$env:NO_COLOR = '1'
npm.cmd run test:cobertura 2>&1 | Tee-Object -FilePath docs/pruebas/evidencias/cobertura-sprint3-inicio.txt
if ($LASTEXITCODE -ne 0) { throw 'La cobertura falló; no registrar esta ejecución como aprobada.' }
```

Al reemplazar la evidencia, actualizar también la fecha, versión y conteos de la matriz; un resultado antiguo no acredita cambios posteriores.

## Plantilla de caso de prueba

Copiar esta ficha por caso. Los IDs CP-xxx deben ser únicos y mantenerse aunque cambie la implementación. Un mismo caso puede trazar más de una historia si se declara expresamente.

| Campo | Contenido a completar |
|---|---|
| ID | CP-xxx |
| Historia | US-xxx y criterio de aceptación relacionado |
| Nivel | Unitaria / Integración / Funcional E2E / Aceptación-manual |
| Precondiciones | Entorno, versión, rol, sesión y datos ficticios necesarios |
| Pasos | Lista numerada de acciones y datos de entrada; comando o test automatizado si aplica |
| Resultado esperado | Comportamiento observable y comprobación de persistencia cuando corresponda |
| Resultado obtenido | Comportamiento observado, sin copiar el esperado por defecto |
| Estado | Pendiente / Aprobado / Fallido / Bloqueado / No aplica (con justificación) |
| Evidencia | Ruta de captura/log o URL de Actions; sin secretos |
| Ejecución | Responsable, fecha/hora y zona horaria |
| Defecto/regresión | Incidencia Jira, versión corregida y resultado de repetición, si aplica |

## Definición de Hecho

Para cerrar una historia:

1. Cumple los criterios de aceptación de Jira y las reglas de negocio del MVP.
2. Incluye pruebas unitarias de su lógica, con escenarios correctos, errores y límites; si no introduce lógica ejecutable (por ejemplo documentación), registra la justificación y su revisión en el PR.
3. Actualiza la matriz y añade integración/E2E/manual cuando el riesgo y la funcionalidad lo requieran; documenta los huecos pendientes.
4. Pasa localmente `npm run lint`, `npm run typecheck`, `npm test` y `npm run build` antes de cada commit de este avance, y mantiene CI `verificar` en verde para la versión del PR.
5. Guarda avances en commits `US-xxx: descripción en español` en `dev/<nombre>`, sin credenciales ni datos reales.
6. Tiene PR hacia `develop` con al menos una aprobación del compañero; el autor no realiza el merge por su cuenta.
7. Actualiza Jira con estado, evidencia de pruebas, incidencias pendientes y enlace al PR. No declarar actualizaciones de Jira ni aprobaciones que todavía no se hayan realizado.

## Mantenimiento

Cada responsable completa su fila al terminar una historia y adjunta la evidencia. En cada sprint el equipo revisa huecos de trazabilidad, defectos y cobertura. Alina actualiza este plan con la automatización real de US-039; Erick con los comandos, navegadores y recorridos de US-040. US-030 y US-031 incorporarán los guiones de aceptación y el registro de regresión.
