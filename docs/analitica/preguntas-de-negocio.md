# Del dato a la decisión: preguntas de negocio del dueño

US-099 · Sprint 8 · 17/11/2026

Este documento sigue el recorrido que pidió el profesor: **pregunta de negocio → datos → limpieza → consumo (pantalla) → modelo/decisión**. Las fórmulas exactas de cada KPI están en [Preguntas de negocio y KPIs del dueño (US-074)](preguntas-negocio.md); aquí se explica de dónde sale cada respuesta, qué se limpia y dónde la ve el dueño.

| Pregunta del dueño | Tablas | Limpieza | Pantalla / HU | Decisión que habilita |
|---|---|---|---|---|
| ¿Cuánto vendí hoy y cómo me pagaron? | `payments` (`amount`, `status`, `method`, `confirmed_at`, `table_session_id`, `order_id`) | Solo pagos `CONFIRMED`. Se fechan por `confirmed_at` en hora de Lima. Una mesa o un pedido para llevar cuenta como una sola cuenta para el ticket. | `/admin` panel en vivo (US-099), `/admin/reportes` (US-018), CSV de ventas (US-079) | Cuánta caja esperar, qué métodos de pago promover, si el día va mejor o peor que ayer |
| ¿Qué platos se venden más? | `orders`, `order_items` | Se excluyen los pedidos `CANCELLED`. Se suman unidades por producto. | Top 5 en `/admin` (US-099) y `/admin/reportes` (US-019) | Qué reponer primero y qué destacar en la carta |
| ¿Cuánto demora la cocina? | `order_status_history` (`event = 'STATUS'`) | Va del primer `IN_PROGRESS` al último `READY`, solo en pedidos `READY` o `DELIVERED`. Un "Listo" deshecho no cuenta. | Indicador en `/admin` (US-099), reporte (US-081), estimado del cliente (US-092) | Reforzar la cocina en las horas lentas y prometer tiempos realistas |
| ¿Qué horas tienen poca demanda para lanzar promociones? | `payments`, `orders`, `order_items` | Hora de Lima. Una franja abierta sin pedidos cuenta como 0. Si el local estaba cerrado o el plato agotado, no se lee como baja demanda. | Mapa de calor (US-084) y ventas por hora del día en `/admin` (US-099) | En qué franja lanzar una promoción |
| ¿Cuánto preparar mañana? | `demand_forecasts`, `product_daily_stock` | El modelo entrena con datos sintéticos (US-087) y no se mezclan con los reales. Las predicciones de demo se marcan como tales. | «Prepara mañana» en `/admin` (US-090, US-099), rellenar el stock con la predicción (US-104) | Cuánto comprar y preparar, y el stock del día |
| ¿Los clientes salen contentos? | `order_ratings` (`service_stars`, `waiter_stars`) | Calificación opcional. Si no hay opiniones se muestra "—", nunca 0 estrellas. Los comentarios no llegan al panel. | Indicador de satisfacción en `/admin` (US-093, US-099) | Reconocer o capacitar al personal y detectar días problemáticos |
| ¿El salón está fluyendo ahora? | `dining_tables`, `table_sessions`, `orders` (`PENDING`), `product_daily_stock`, `products` | Mesa ocupada = sesión abierta. "Espera pago" = la sesión tiene pedidos `PENDING` (US-094). Stock bajo = quedan 1–3 unidades. | Mapa de mesas y alertas en `/admin` (US-099) | Mandar al mesero a cobrar, reponer o marcar un plato como agotado |
| ¿Cuánto tarda cada etapa y quién hizo qué? | `order_status_history`, `payments`, `account_closures`, `users` | Solo pedidos completos. Promedio y mediana por etapa (pago, cocina, entrega). Nunca teléfonos, correos ni datos de tarjeta (US-028). | Sección "Actividad y tiempos" (planificada en US-099, Parte 2; no implementada al corte) | Encontrar el cuello de botella y auditar cancelaciones y cierres con excepción |

## Trabajo futuro (no implementado)

- **Quiebres de stock:** registrar la hora en que se agotó cada plato y estimar la demanda perdida, porque hoy un plato agotado temprano parece "poco vendido".
- **Predicción con ventas reales:** usar el promedio por día de la semana con datos de la aplicación, excluyendo los pedidos de prueba (observación `PRUEBA E2E…`) y los días en que el plato se agotó.
- **Bitácora `audit_logs`:** registrar los cambios de precio, de stock y de QR (quién, cuándo, valor anterior y nuevo) para auditar al personal.
