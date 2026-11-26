# Del dato a la decisión: preguntas de negocio del dueño

US-112 / US-143 · 26/11/2026

Referencia unificada del panel del dueño. Relaciona **pregunta → dato → cálculo → pantalla → decisión**.
Complementa el documento histórico [US-074](preguntas-negocio.md); para la comparación en vivo
rige el corte definido aquí. El mapa de calor compacto ya integrado no se modifica en US-112.

## Comparación justa: hoy y ayer hasta la misma hora

El servidor captura un solo instante por carga. Obtiene el día de Lima (`America/Lima`, UTC−5)
y compara desde las 00:00 de hoy hasta ese instante, contra desde las 00:00 de ayer hasta
la misma hora, minuto, segundo y milisegundo. Los inicios son inclusivos y los cortes exclusivos.
A medianoche ambos intervalos están vacíos. La interfaz muestra el corte como HH:mm de Lima;
por ejemplo, «+20 % vs. ayer hasta las 15:30». No depende del reloj del navegador.

La variación es `redondear((hoy − ayer) / abs(ayer) × 100)`. Si ayer vale cero no se divide:
en ventas aparece «Ayer sin ventas hasta las 15:30», sin porcentaje. Un error de consulta
es distinto de cero: se muestra «Comparación no disponible». Sin opiniones o pedidos
finalizados no se inventan cero estrellas ni cero minutos.

## Indicadores y preguntas

| Pregunta del dueño | Dato | Cálculo y exclusiones | Pantalla | Decisión |
|---|---|---|---|---|
| ¿Cuánto vendí hasta esta hora frente a ayer? | `payments.amount/status/confirmed_at`, relación con `orders` | Suma en céntimos de pagos CONFIRMED en cada intervalo comparable. Se excluyen cuentas de prueba y canceladas según la regla inferior. | Ventas en `/admin` | Saber si el ritmo de cobros mejora o empeora |
| ¿Cuántos pedidos recibí hasta esta hora frente a ayer? | `orders.id/status/created_at` | Número de pedidos creados en cada intervalo, sin CANCELLED ni pruebas. Incluye pedidos todavía sin pagar. Paginación por ID en lotes de 500. | Pedidos en `/admin` | Distinguir cambios de demanda de cambios de importe |
| ¿Cuánto se pagó en promedio por cuenta hasta esta hora? | Pagos confirmados, `table_session_id` y `order_id` | Ventas del intervalo / cuentas distintas con algún pago confirmado, redondeado al céntimo. Varios pagos de una cuenta cuentan una sola vez; puede tratarse de pagos parciales. Sin cuentas: 0, sin porcentaje si ayer fue 0. | Ticket promedio en `/admin` | Evaluar el importe cobrado por cuenta |
| ¿Cuánto tardó la cocina en los pedidos listos al corte? | `order_status_history` STATUS y estado actual de `orders` | Promedio desde el primer IN_PROGRESS del día hasta el último READY no deshecho al corte. Solo estados READY/DELIVERED conocidos antes del corte; no usa finales posteriores. Excluye cancelados actuales y pruebas. Redondeo a minutos para el indicador. | Tiempo de cocina en `/admin` | Detectar retrasos; una reducción del tiempo es favorable |
| ¿Cómo calificaron el servicio hasta esta hora? | `order_ratings.service_stars/created_at/order_id` | Promedio de opiniones recibidas antes del corte, sin pruebas ni pedidos actualmente cancelados; un decimal. Sin opiniones: —. No representa a todos los clientes ni muestra comentarios. | Satisfacción en `/admin` | Identificar cambios en la experiencia del servicio |
| ¿En qué horas cobré más o menos hoy? | Pagos confirmados válidos del intervalo de hoy | Suma por hora de confirmación en Lima. El gráfico existente muestra de 08:00 a 23:00. Las horas futuras o cerradas no demuestran baja demanda; un cero no basta para decidir una promoción. | Ventas por hora en `/admin` | Observar la concentración de cobros |
| ¿Qué franjas abiertas tienen poca demanda? | Pedidos, productos, periodo y horario seleccionados | Pedidos no cancelados ni de prueba por franja, considerando días abiertos y filtros del reporte existente. No interpretar cierre o agotamiento como ausencia de demanda. | Mapa de calor compacto en `/admin/reportes` | Evaluar cuándo lanzar una promoción; implementación existente de ALTOQUE-142 |
| ¿Qué platos se piden más hoy? | `orders`, `order_items.quantity/product_id` | Unidades de pedidos no cancelados ni de prueba del día de Lima. Incluye pedidos aún no pagados. No es una comparación contra ayer. | Top 5 en `/admin` | Priorizar preparación y reposición |
| ¿Cómo me pagaron hasta ahora? | `payments.method/amount` | Importe confirmado por método sobre las mismas ventas filtradas de hoy; porcentaje del total. | Pagos por método en `/admin` | Entender la distribución de cobros |
| ¿Qué mesas necesitan atención ahora? | `dining_tables`, `table_sessions`, pedidos PENDING | Libre: sin sesión abierta; ocupada: sesión abierta; espera pago: pedidos PENDING reales. Se excluyen sesiones solo de prueba. Es estado actual, no comparación histórica. | Mesas y alertas en `/admin` | Organizar la atención y el cobro |
| ¿Qué platos debo reponer o dejar de ofrecer? | `product_daily_stock.quantity/sold`, `products.available` | Disponibilidad = cantidad − vendidos; bajo: 1–3; agotado: 0 o marcado no disponible. Es stock actual. | Alertas en `/admin` | Reponer o informar un agotamiento |
| ¿Cuánto preparar mañana? | Predicciones y stock del día | Sugerencias existentes, con su origen, fecha y límites documentados en [modelo](modelo.md). No se cambia el algoritmo en US-112. | «Prepara mañana» en `/admin` | Planificar compra y preparación |
| ¿Cuánto tarda cada etapa y quién hizo qué? | Historial, pagos, cierres y usuarios | Métricas y actividad de las secciones existentes; no se les atribuye el nuevo corte de las cinco tarjetas. Sin teléfonos, correos ni datos de tarjeta. | Actividad y tiempos en `/admin` | Detectar cuellos de botella y revisar incidencias |

## Reglas de pertenencia y cuentas mixtas

- Todas las consultas mantienen restaurante y RLS. No se modifican permisos ni roles.
- Se reutiliza `pedidos-de-prueba.ts`: los prefijos compartidos en nombre del cliente
  u observación identifican pedidos de prueba. Si no puede obtenerse la clasificación,
  el panel no presenta cifras como si la exclusión hubiera funcionado.
- Los pedidos actualmente CANCELLED quedan fuera del conteo, cocina y satisfacción.
- Un pago de un pedido cancelado queda fuera. Una sesión solo cancelada, solo de
  prueba o sin ningún pedido real vigente no aporta pagos al panel.
- Una cuenta con pedidos reales vigentes y cancelados conserva su importe confirmado
  completo: no existe una asignación del pago por línea que permita repartirlo con rigor.
  La misma limitación se aplica a cuentas que mezclan pedidos reales y de prueba.
  Esta regla no afirma que se haya reconstruido el ingreso histórico anterior a cancelaciones.
- Cocina reconstruye el estado registrado antes del corte, manteniendo la exclusión
  de cancelados actuales. Los reportes de cocina sin corte siguen pudiendo incluir un
  final posterior al rango cuando el inicio pertenece al periodo (US-081).

## Verificación de US-112

Pruebas unitarias en `panel-vivo-corte.test.ts` y `panel-vivo-corte-servidor.test.ts`:
cambio de día en Lima, cambio de mes/año, año bisiesto, base cero, límite horario,
cancelados, pruebas, cuentas mixtas, fallos, más de 500 filas y estados de cocina al corte.
Las consultas se comprueban con dobles deterministas; no equivalen a pruebas RLS reales.
La revisión visual debe cubrir escritorio y 360 px; sus resultados se reportan por separado.
