# US-152: Toqui del administrador (chat con métricas): validación

Fecha: 27/11/2026, 22:55 (hora de Lima). Entorno: `npm run dev` local con la clave de
Alexander, sesión del **dueño de la demo** (`dueno@polleria.demo`). Prueba real hecha
**una sola vez** (4 preguntas): 2 en escritorio y 2 en celular de 360 px.

## Respuestas reales y tokens (Claude Haiku 5.5)

| # | Pregunta (chip) | Respuesta de Toqui (resumen) | Entrada | Salida |
|---|---|---|---|---|
| 1 | ¿Cómo me fue hoy? | Hoy hasta las 22:55 no hay datos de ventas; ofrece los últimos 30 días: S/ 22.00, 1 pedido de Cuarto de pollo. | 2 109 | 129 |
| 2 | ¿Qué vendí menos esta semana? | Últimos 7 días (21/11 al 27/11) sin datos; en 30 días el menos vendido fue Cuarto de pollo (1 unidad). | 2 255 | 133 |
| 3 | ¿Cuál es mi hora pico? | Últimos 30 días: de 20:00 a 21:00; la franja más fuerte, los martes a esa hora. Aclara que hay solo 1 pedido. | 2 110 | 145 |
| 4 | ¿Cuánto debo preparar mañana? | Sábado 28/11: la predicción no tiene platos, así que no recomienda una cantidad. | 2 273 | 125 |

Promedio por pregunta: **≈ 2 190 tokens de entrada y 133 de salida**, unos **US$ 0.0003**.
La entrada incluye la foto de métricas (~1 400 tokens) y las instrucciones fijas.

## Comparación con el Dashboard y Reportes

| Dato | Toqui | Pantalla | ¿Coincide? |
|---|---|---|---|
| Ventas de hoy | sin datos | Dashboard: S/ 0.00, 0 pedidos | Sí |
| Ventas de los últimos 7 días (21/11 al 27/11) | sin datos | Reportes: S/ 0.00, 0 cuentas | Sí |
| Ventas de los últimos 30 días (29/10 al 27/11) | S/ 22.00, 1 pedido | Reportes: S/ 22.00 | Sí |
| Predicción de mañana | sin platos | Dashboard: «Aún no hay predicción para mañana» | Sí |

Toqui no inventó números: con pocos datos dijo «no tengo datos» y ofreció otro período.
La demo tiene muy pocos pedidos, así que solo se verificó la comparación con datos casi vacíos.

## Capturas

- `us152-toqui-escritorio.png`: chat en escritorio (preguntas 1 y 2).
- `us152-toqui-360.png`: chat en celular de 360 px (preguntas 3 y 4).
- `us152-admin-360-toqui-cerrado.png`: Toqui asomado desde el borde, sin scroll horizontal.
- `us152-stock-360.png`: en Stock del día, Toqui queda sobre la barra «Guardar» sin taparla.
- `us152-dashboard-referencia.png`: Dashboard usado para comparar.

El botón rojo «N · 1 Issue» de las capturas es el aviso de Next en modo desarrollo. Viene de
un error que ya existía en `src/features/dashboard/actividad.ts` (PGRST201 en la consulta de
pagos de «Actividad del día»). No es de US-152.

## Notas

- Cada pregunta real anotó una fila de conteo en `ai_usage` de la base compartida (US-151:
  restaurante, usuario, HU y tokens; **sin** el texto). Fueron 4 filas.
- Después de la prueba se agregó `pedidos` (total) a la hora pico de la foto: en la
  pregunta 3 Toqui tuvo que explicar un promedio redondeado a 0.
- Pruebas automáticas: `tests/unit/toqui-admin-foto.test.ts`, `tests/unit/toqui-admin-actions.test.ts`,
  `tests/e2e/toqui-admin.spec.ts` (modo simulado).
