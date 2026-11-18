# US-099: validación

**Fecha:** 17/11/2026

**Rama:** `dev/fabrizio` (implementación apoyada por Alexander por el corte del Sprint 8)

## Implementación

- `/admin` ahora abre con el panel **"Hoy en tu restaurante"** y el indicador **En vivo**. Se refresca solo cada 20 s, reutilizando `ActualizacionAutomatica`.
- **5 indicadores del día con comparación contra ayer:**
  - **Ventas:** suma de pagos `CONFIRMED` por `confirmed_at`, con la lógica de US-018.
  - **Pedidos:** pedidos creados en el día, sin contar los `CANCELLED`.
  - **Ticket promedio:** ventas entre cuentas pagadas.
  - **Tiempo de cocina:** promedio de US-081.
  - **Satisfacción:** `obtenerSatisfaccionDia` de US-093. Muestra "—" si no hay calificaciones.

  La variación se muestra como "+X % vs ayer". Si ayer fue 0 o no hay dato, no se divide.
- **Ventas por hora** de hoy (8:00–23:00) en barras SVG, con un texto alternativo para lectores de pantalla.
- **Top 5 platos** de hoy, reutilizando `obtenerTendencias` de US-019.
- **Mapa de mesas:** libre (sin sesión abierta), ocupada, o espera pago (la sesión tiene pedidos `PENDING`, US-094).
- **Alertas:** pedidos esperando pago, stock bajo (quedan 1–3) y agotados (sin unidades o marcados no disponibles).
- **Pagos por método** (efectivo, Yape, tarjeta) con su porcentaje.
- **«Prepara mañana»:** reutiliza `consultarPrediccionMananaAction` y `TarjetaPrediccion` de US-090.
- Todo se lee con el cliente de servidor (sesión + RLS) y solo con rol OWNER/ADMIN. No hay migraciones ni escrituras.
- Si una sección falla, muestra "—" y el resto del panel sigue funcionando.
- Solo se usaron tokens v2 existentes y componentes de `src/components/ui`.
- `/admin/reportes` no se tocó; en el menú ahora se llama "Reportes por fechas".

## Parte 2b: "Actividad y tiempos"

- **Tiempos por etapa del día:** espera de pago (`PENDING → IN_PROGRESS`), cocina (primer `IN_PROGRESS` → último `READY`), entrega (`READY → DELIVERED`) y total (creación → `DELIVERED`). Muestra promedio y mediana, solo de pedidos completos (entregados). La fuente es `order_status_history` con `event = 'STATUS'`.
- **Registro de actividad del día:**
  - Une `order_status_history`, `payments` (método, monto, estado, registrado/verificado por) y `account_closures` (ordinario o excepción, motivo, quién).
  - Muestra hora, quién (`users.full_name`), qué y detalle.
  - Se puede filtrar por tipo (pedidos, pagos, cierres) y por persona.
  - Resalta las cancelaciones, los cierres con excepción y los pagos rechazados (`FAILED`).
- Solo se consultan columnas necesarias. Nunca se leen teléfonos ni correos de clientes, `receipt_email`, comprobantes ni datos de tarjeta (US-028). Lectura con sesión + RLS, solo OWNER/ADMIN.
- Archivos: `actividad-logica.ts` (pura), `actividad.ts` (datos), `actividad-actions.ts`, `actividad-vista.tsx`, `registro-actividad.tsx` (filtros en el navegador). Pruebas: `tests/unit/actividad.test.ts` (8).

## Archivos

- `src/features/dashboard/panel-vivo-logica.ts`: lógica pura, con imports relativos.
- `src/features/dashboard/panel-vivo.ts` (capa de datos), `panel-vivo-actions.ts` (verifica el rol), `panel-vivo-vista.tsx`.
- `src/app/admin/page.tsx`.
- `tests/unit/panel-vivo.test.ts`: 11 casos. Cubren la comparación con ayer, la división entre cero, los días sin datos, el ticket promedio, las ventas por hora en Lima, el mapa de mesas, las alertas de stock y las fechas de Lima.

## Verificaciones

- `npx next typegen && npx tsc --noEmit`: aprobado.
- `npx vitest run tests/unit`: 1437/1437 en 88 archivos (19 casos de US-099: 11 del panel y 8 de actividad).
- `npx eslint` sobre los archivos tocados: sin errores.
- `npm run build`: compila y genera las 28 páginas. El primer intento termina con el aviso `SecurityFatalError` conocido de Next y el reintento sale bien.

## Prueba en navegador (solo lectura)

Se hizo con el build de producción local (`next start`, puerto 3100) contra la base compartida, iniciando sesión como `dueno@demo.altoque.pe`. Solo se miró: no se guardó nada ni se crearon pedidos.

- Escritorio 1280 px: `captura-us099-panel-escritorio.png`.
- Celular 390 px: `captura-us099-panel-celular.png`. `scrollWidth` = 390, sin scroll horizontal y sin errores en la consola de la página.
- Valores observados: ventas S/ 619.00 (−46 % vs ayer), 100 pedidos (−40 %), ticket S/ 6.19 (−9 %), tiempo de cocina "0 min" y satisfacción "—" (no hay calificaciones hoy). Mapa: Mesas 2 y 3 ocupadas, 1 y 5 libres. Alerta: "Agotado: Leche de tigre". «Prepara mañana» muestra las predicciones de US-090.
- Actividad y tiempos: `captura-us099-actividad-escritorio.png` y `captura-us099-actividad-celular.png`. Con datos reales se vieron los tiempos de 100 pedidos entregados (78 con espera de pago), el registro con los nombres del personal ("Caja Demo", "Mesero Demo", "Cocina Demo"…) y el filtro "Cierres" con 59 filas. A 390 px no hay scroll horizontal, la página no dio errores y el servidor no registró errores de consulta.
- Los números bajos (ticket, cocina) reflejan los datos de las pruebas E2E del día. Después de la captura, un tiempo de cocina menor a 1 min se muestra como "< 1 min".

## Pendiente (no entró por el corte)

- **Predicción como línea en el gráfico por hora.** `demand_forecasts` predice por día y plato, no por hora, así que no hay un dato honesto que dibujar. La predicción se muestra en «Prepara mañana».
- **Capturas en staging.** Se tomaron en local con la base compartida, no en staging.
- La Parte 2 se completó (2a: `docs/analitica/preguntas-de-negocio.md`; 2b: sección "Actividad y tiempos").
