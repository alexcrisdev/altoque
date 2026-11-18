# US-092: validación

**Fecha:** 17/11/2026

**Rama:** `dev/alexander`

## Implementación

- El seguimiento del cliente (`/m/[token]/pedido/[clave]`) muestra un ticket con el número del pedido, su estado, el tiempo estimado y una barra de avance. Debajo muestra la línea de tiempo con los pasos **Pedido enviado → Pago confirmado → En cocina → Listo → Entregado**, cada uno con su hora (HH:MM, America/Lima).
- Las horas salen de `order_status_history`, que ya existe; no hubo migración. Se lee con el cliente admin, solo para el pedido validado por QR + clave. Al navegador llegan únicamente el paso y la hora, nunca quién hizo el cambio ni los motivos internos. Si la consulta del historial falla, el seguimiento se muestra sin horas en vez de caerse.
- "Pago confirmado" es la hora del cambio `PENDING → IN_PROGRESS` que registra el trigger de pago. Por eso tiene la misma hora que "En cocina". Si el pedido no nació en `PENDING` (pedido del mesero o pedido antiguo), el paso se oculta.
- "Listo" usa el último `READY`. Si cocina deshace un "Listo", ese paso vuelve a pendiente.
- Pedido cancelado o vencido sin pago: se ven los pasos que alcanzó más un paso "Cancelado" con su hora. No se muestra tiempo estimado.
- El paso actual (el último alcanzado) resalta en coral con un anillo. La página ya se refrescaba cada 5 s (`ActualizacionAutomatica`), así que la línea de tiempo se actualiza sola.
- Tiempo estimado: promedio de preparación (En cocina → Listo) de los pedidos del restaurante en los últimos 7 días, calculado con la lógica pura de US-081 (`calcularTiemposCocina`). Se usa solo si hay al menos 3 pedidos y el promedio llega a 3 minutos o más. Si no, se usa un valor fijo de 15 min y el texto dice "aprox.". Mientras el pedido espera pago, el texto es "Estará listo aprox. X min después de pagar". En cocina se resta el tiempo ya transcurrido. Si falta 1 min o menos, dice "Ya casi está".
- Colores: solo tokens semánticos existentes. No se editó `globals.css`.

## Archivos

- `src/features/pedidos/linea-tiempo.ts`: lógica pura (pasos, horas, paso actual, avance, tiempo estimado).
- `src/features/pedidos/linea-tiempo-datos.ts`: lectura del historial del pedido y del promedio de cocina.
- `src/features/pedidos/linea-tiempo-cliente.tsx`: ticket y línea de tiempo.
- `src/features/pedidos/estado-cliente-servidor.ts` y `src/app/m/[token]/pedido/[clave]/page.tsx`.
- Pruebas: `tests/unit/linea-tiempo.test.ts` (23), `tests/unit/linea-tiempo-datos.test.ts` (4) y `tests/unit/estado-cliente-servidor.test.ts` (18, actualizada).

## Verificaciones

- `npx tsc --noEmit`: aprobado.
- `npx eslint` sobre `src`, `tests` y `scripts`, y sobre los archivos cambiados: sin errores.
- `npx vitest run tests/unit`: 1365/1365 aprobadas en 83 archivos. 45 de ellas cubren US-092: orden de los pasos y sus horas, paso actual, pedido sin `PENDING`, cancelado, vencido, Listo deshecho, tiempo estimado con datos, sin datos y con un promedio irreal, y que no se lean datos del personal.
- `npm run build`: compila y genera las 28 páginas. El primer intento termina con el aviso `SecurityFatalError` de Next (vulnerabilidad conocida, actualización pendiente) y el reintento termina bien.

## Prueba en navegador

Se usó el servidor de desarrollo local (`localhost:3000`) contra la base compartida, con un solo pedido de prueba en **Mesa 3**: **N.º 1711**, 1 × Ceviche clásico, observación `PRUEBA US-092`. Mesa 3 ya tenía una sesión abierta con pedidos pagados (saldo 0). Antes de cobrar se comprobó que el saldo era exactamente el del pedido de prueba, y se pagó en efectivo desde caja. No se tocaron Mesa 5 ni el mostrador de la Cevichería, no se cerró la sesión de Mesa 3 y no se tocaron pedidos ajenos. El pedido quedó `DELIVERED` y pagado.

| Paso | Estado | Línea de tiempo observada | Capturas (390 × 844 / 1280 × 900) |
|---|---|---|---|
| 1 | PENDING | Enviado 15:52 (actual); el resto pendiente. Ticket: "Estará listo aprox. … después de pagar" | `captura-us092-1-pendiente-celular.png`, `captura-us092-1-pendiente-escritorio.png` |
| 2 | IN_PROGRESS | Enviado 15:52 · Pago 15:52 · En cocina 15:52 (actual). Ticket: "Faltan …" | `captura-us092-2-en-cocina-celular.png`, `captura-us092-2-en-cocina-escritorio.png` |
| 3 | READY | … · Listo 15:54 (actual). Sin tiempo estimado | `captura-us092-3-listo-celular.png`, `captura-us092-3-listo-escritorio.png` |
| 4 | DELIVERED | … · Listo 15:54 · Entregado 15:55 (actual), barra al 100 % | `captura-us092-4-entregado-celular.png`, `captura-us092-4-entregado-escritorio.png` |

**Hallazgo corregido durante la prueba:** en las capturas 1 y 2 el estimado dice "aprox. 1 min" y "Faltan unos 1 min (promedio de la cocina)". El promedio real del restaurante era menor a 1 minuto porque las pruebas E2E marcan "Listo" a los pocos segundos. Se corrigió en el commit `US-092: no usar promedios de cocina irreales en el tiempo estimado`: un promedio menor a 3 min ahora se trata como dato no confiable y se usa el valor fijo de 15 min ("aprox."). Además, "1 min" se muestra como "Ya casi está". La corrección está cubierta por pruebas unitarias. Las capturas son anteriores a ella; para no crear otro pedido en la base compartida, no se repitieron.

La burbuja "1 Insight" de las capturas es el indicador del modo desarrollo de Next.js y no aparece en producción.
