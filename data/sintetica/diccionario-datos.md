# Diccionario de datos sintéticos — US-074

Datos ficticios de un restaurante simulado, del 1 de mayo al 31 de octubre de 2026. Las horas se expresan en hora local de Lima. Los importes están en céntimos de sol: divide entre 100 para obtener soles.

| Archivo | Qué representa cada fila | Filas con la semilla 74 |
|---|---|---:|
| `pedidos.csv` | Un pedido atendido | 12 305 |
| `lineas_pedido.csv` | Un plato dentro de un pedido | 16 713 |
| `pagos.csv` | Un pago confirmado de un pedido | 12 305 |
| `demanda_diaria.csv` | Un plato en un día | 920 (184 días × 5 platos) |

## pedidos.csv

| Campo | Descripción |
|---|---|
| `pedido_id` | Identificador ficticio y único del pedido. |
| `creado_en` | Fecha y hora de creación. Úsala para medir demanda por franja. |
| `modalidad` | `DINE_IN` para mesa o `TAKEAWAY` para llevar. |
| `estado` | `DELIVERED`: el generador incluye pedidos atendidos y entregados. |
| `inicio_cocina_en` | Fecha y hora de inicio de preparación. |
| `listo_en` | Fecha y hora en que terminó la preparación. |
| `total_centimos` | Suma de los subtotales de sus líneas. |

## lineas_pedido.csv

| Campo | Descripción |
|---|---|
| `pedido_id` | Referencia a `pedidos.csv`. |
| `producto_id` | Código ficticio del plato. |
| `producto` | Nombre del plato. |
| `cantidad` | Unidades atendidas de ese plato en el pedido. |
| `precio_centimos` | Precio unitario. |
| `subtotal_centimos` | Cantidad multiplicada por el precio unitario. |

## pagos.csv

| Campo | Descripción |
|---|---|
| `pago_id` | Identificador ficticio y único del pago. |
| `pedido_id` | Referencia a `pedidos.csv`. |
| `cuenta_id` | Identificador ficticio de la cuenta. En la simulación hay una cuenta por pedido. |
| `metodo` | `CASH` (efectivo), `YAPE` o `CARD` (tarjeta). |
| `estado` | `CONFIRMED`: el generador solo incluye pagos confirmados. |
| `confirmado_en` | Fecha y hora de confirmación. Úsala para medir ventas por franja. |
| `monto_centimos` | Importe cobrado; coincide con el total del pedido. |

## demanda_diaria.csv

| Campo | Descripción |
|---|---|
| `fecha` | Día de la observación, en formato `AAAA-MM-DD`. |
| `producto_id` | Mismo código de plato que en `lineas_pedido.csv`. |
| `producto` | Nombre del plato. |
| `dia_semana` | Número del día: lunes = 0, domingo = 6. |
| `feriado` | `1` si el generador marcó ese día como feriado; `0` si no. Se usa una selección de feriados. |
| `evento` | Nombre del evento ficticio; vacío si no hubo evento. |
| `stock_inicial` | Unidades disponibles al empezar el día. |
| `unidades_solicitadas` | Demanda simulada: incluye solicitudes que no pudieron atenderse. |
| `unidades_vendidas` | Unidades atendidas; coincide con la suma de las líneas del plato en ese día. |
| `unidades_no_atendidas` | Unidades solicitadas menos unidades vendidas. |
| `agotado_desde` | Fecha y hora en que el stock llegó a cero; vacío si no se agotó. |

Para US-084, cruza pedidos y líneas por `pedido_id` si necesitas filtrar por plato. Para US-087, `unidades_solicitadas` permite simular una predicción de demanda. Las ventas, las unidades no atendidas y la hora de agotamiento del día que se quiere predecir solo se conocen después de operar: no deben usarse como entradas para predecir ese mismo día.