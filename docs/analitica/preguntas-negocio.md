# Preguntas de negocio y KPIs del dueño

US-074 · Sprint 5 · 09/11/2026

Este documento define qué necesita saber el dueño del restaurante y cómo medirlo. Servirá de base para el mapa de calor de US-084 y el modelo de predicción de US-087.

| Pregunta del dueño | KPI y cómo se calcula | Fuente de datos | Gráfico o visualización | Tipo de datos |
|---|---|---|---|---|
| ¿Qué día y a qué hora vendo más o menos? | **Ventas confirmadas (S/):** suma de los pagos confirmados, agrupados por día de la semana y hora de confirmación. | `payments`: `amount`, `status`, `confirmed_at`. | Mapa de calor de día × hora, con el importe vendido por franja. | Registros de la aplicación. Para la demo se podrá usar el CSV sintético. |
| ¿Cuándo conviene lanzar una promoción? | **Pedidos promedio por franja:** pedidos no cancelados divididos entre el número de veces que el local estuvo abierto en esa franja durante el periodo. Si se filtra por plato, cada pedido que lo incluye cuenta una vez. | `orders`: `id`, `status`, `created_at`; `order_items`: `order_id`, `product_id`. El horario de atención está pendiente de confirmar. | Mapa de calor de pedidos, con las franjas de menor demanda destacadas. | Registros de la aplicación y horario del local. Para la demo se podrá usar el CSV sintético. |
| ¿Qué platos se piden más? | **Unidades pedidas por plato:** suma de las cantidades en pedidos no cancelados, agrupadas por producto. Incluye pedidos que aún no se han pagado. | `orders`: `id`, `status`, `created_at`; `order_items`: `order_id`, `product_id`, `product_name`, `quantity`. | Barras horizontales con los cinco platos más pedidos. | Registros de la aplicación. Para la demo se podrá usar el CSV sintético. |
| ¿Cuánto demora la cocina en preparar un pedido? | **Mediana de minutos de preparación:** diferencia entre el inicio de preparación (`IN_PROGRESS`) y el momento en que el pedido queda listo (`READY`). Solo se incluyen pedidos con ambos eventos válidos. | `order_status_history`: `order_id`, `event`, `to_status`, `created_at`. | Línea de la mediana por día, con el número de pedidos medidos. | Registros de la aplicación. |
| ¿Cómo cambia el ticket promedio? | **Ticket promedio (S/):** ventas confirmadas divididas entre cuentas distintas con al menos un pago confirmado en el periodo. Una sesión de mesa o un pedido para llevar cuenta una vez, aunque tenga varios pagos. Si no hay cuentas, se muestra S/ 0,00. | `payments`: `amount`, `status`, `confirmed_at`, `table_session_id`, `order_id`. | Línea semanal del ticket promedio, con el número de cuentas por semana. | Registros de la aplicación. |
| ¿Cuántas unidades de cada plato debería preparar mañana? | **Unidades previstas por plato:** estimación del modelo a partir del historial diario. Se debe distinguir si un plato se agotó, porque en ese caso las unidades vendidas pueden ser menores que la demanda. | CSV de ventas sintéticas de US-074 y salida del modelo de US-087, ambos pendientes. | Tarjeta por plato con la cantidad prevista para mañana (US-090). | Datos sintéticos para el primer entrenamiento. |

## Reglas de lectura

- Filtrar por restaurante y usar la hora de Lima (`America/Lima`).
- Para ventas, usar la fecha de confirmación del pago. Para demanda de pedidos, usar la fecha de creación del pedido.
- Una franja abierta sin pedidos cuenta como cero. Un local cerrado, un horario desconocido o un plato agotado no se deben interpretar como señales de baja demanda.
- Mantener separados los datos sintéticos y los registros de la aplicación. Los CSV sintéticos no se cargan en Supabase.

## Pendientes

Revisar las preguntas y los datos con el equipo antes de US-084 y US-087.
