# US-087: Modelo de predicción de demanda

Predice cuántas unidades de cada plato se pedirán en los próximos 7 días para que el
dueño prepare lo justo: ni quedarse sin stock ni desperdiciar.

Notebook: [analitica/prediccion_demanda.ipynb](../../analitica/prediccion_demanda.ipynb) ·
Salida: [analitica/prediccion_7_dias.csv](../../analitica/prediccion_7_dias.csv) (para US-090)

## Datos

- `data/sintetica/demanda_diaria.csv` (US-075): 5 platos × 184 días (01/05 – 31/10/2026) = 920 filas.
- **Se predice `unidades_solicitadas`, no `unidades_vendidas`.** Cuando un plato se agota, las ventas
  se cortan pero la gente lo sigue pidiendo: 221 de 920 días-plato (24%) se agotaron y quedaron
  1997 unidades sin atender. Entrenar con ventas haría que el modelo recomiende preparar poco.
- Patrón observado: lunes, sábado y domingo se pide ~31 unidades por plato; martes a viernes ~23.

## Variables

| Tipo | Variables | Por qué |
|---|---|---|
| Calendario | día de la semana, feriado, evento, plato | Se conocen por adelantado |
| Historia (lags) | lo pedido hace 7 y 14 días, promedio de 7 días | Solo miran 7+ días atrás para no usar información que todavía no existe al predecir |

**Hora:** los datos son diarios, y la decisión del dueño (cuánto preparar) también es diaria.
La demanda por hora ya se muestra en el mapa de calor (US-084).

## Entrenamiento y prueba

Separación **por fecha** (no al azar, para no entrenar con el futuro):
entrenamiento 15/05 – 03/10 (710 filas) · prueba 04/10 – 31/10 (140 filas, incluye 1 feriado y 1 evento).

## Resultados

| Modelo | MAE | RMSE | MAPE % |
|---|---|---|---|
| **XGBoost (solo calendario)** | **4.26** | **5.51** | **18.9** |
| Prophet (con feriado y evento) | 4.41 | 5.66 | 19.6 |
| Random Forest (solo calendario) | 4.63 | 6.71 | 19.5 |
| Promedio por día de la semana (base) | 4.67 | 6.77 | 19.6 |
| Random Forest (todas las pistas) | 4.97 | 6.92 | 21.0 |

- **MAE:** error promedio en platos. **RMSE:** castiga más los errores grandes. **MAPE:** error en porcentaje.
- **Más pistas no siempre es mejor:** con los lags, Random Forest empeoró (4.97), porque lo pedido
  la semana pasada trae mucho ruido. Con solo el calendario mejoró (4.63).
- **Día del evento (24/10, Feria gastronómica):** se pidieron 82 ceviches. El promedio base y
  Random Forest predijeron 52; XGBoost 65 y Prophet 66. Solo los dos últimos aprendieron el efecto del evento.

## Modelo elegido: XGBoost

En promedio falla por **4.26 platos**, el menor error de los 5 modelos y un **9% menos** que el
promedio por día de la semana (4.67). También tiene el RMSE más bajo (5.51): es el que menos se
equivoca en los días difíciles, como feriados y eventos. Además, como solo usa variables de
calendario, puede predecir cualquier día futuro sin esperar datos recientes.

## Limitaciones

- Los datos son simulados: con datos reales del restaurante hay que volver a entrenar y comparar.
- Con solo 2 eventos en el historial, el modelo se queda corto esos días: en un día de evento
  conviene preparar un poco más de lo predicho.

## Predicción entregada (01/11 – 07/11/2026)

Modelo final entrenado con los 6 meses. El 01/11 (Todos los Santos) se marcó como feriado.
`prediccion_7_dias.csv`: `fecha, producto_id, producto, cantidad_prevista, modelo`
(35 filas, modelo `xgboost-calendario-v1`).

| Plato | Dom 01 | Lun 02 | Mar 03 | Mié 04 | Jue 05 | Vie 06 | Sáb 07 |
|---|---|---|---|---|---|---|---|
| Ceviche clásico | 51 | 51 | 38 | 39 | 39 | 39 | 51 |
| Ceviche mixto | 41 | 36 | 26 | 26 | 26 | 27 | 36 |
| Chicharrón de pescado | 28 | 26 | 20 | 20 | 19 | 20 | 26 |
| Chicharrón de pota | 21 | 18 | 13 | 14 | 14 | 13 | 19 |
| Leche de tigre | 23 | 22 | 17 | 16 | 16 | 15 | 21 |

## Cómo reproducir

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r analitica/requirements.txt
```
Abrir el notebook con el kernel `.venv` → **Restart** → **Run All**.

## Actualización US-104: semana del demo

El 17/11/2026 se regeneró `analitica/prediccion_7_dias.csv` para
el periodo 16–20/11/2026, reutilizando el entrenamiento y los parámetros
de XGBoost de US-087.

El CSV contiene 25 filas: cinco platos por cinco días, con modelo
`xgboost-calendario-v1`. Se utilizó un escenario sin feriados ni eventos
adicionales. Aunque conserva su nombre histórico, esta entrega cubre
cinco días.

El simulacro del cargador reconoció las 25 filas sin omisiones.
La aplicación en la base compartida queda a cargo de Alexander.
## US-146: sugerencia automática de stock (`promedio-ponderado-v1`)

Cada madrugada (00:20 de Lima) el workflow `ventas-diarias.yml` consolida las ventas (US-145) y
luego llama a `/api/ventas/sugerir-stock`, que guarda en `demand_forecasts` la sugerencia de **hoy y
mañana** de cada plato activo con el modelo `promedio-ponderado-v1`. Repetirla actualiza las mismas
filas (clave única restaurante + plato + fecha + modelo), así que no duplica. Para la demo se lanza a
mano con **Run workflow** en GitHub. Solo sugiere: el dueño aplica con "Rellenar con la predicción".

**Cálculo** (`src/features/dashboard/sugerencia-stock-logica.ts`), solo con días terminados de
`daily_product_sales` de las últimas 4 semanas:

- Si hay 3 o más días válidos del mismo día de la semana: promedio ponderado con pesos 4, 3, 2 y 1
  (de la semana más reciente a la más antigua).
- Si no alcanza: los últimos días válidos (hasta 7), con más peso en los recientes.
- Con menos de 3 días válidos no hay sugerencia propia: el plato conserva la demo, si existe.
- `BLOQUEADO` y `LOCAL_CERRADO` no cuentan como demanda. Un día `AGOTADO` entra con lo vendido o con
  el promedio de los días completos, el que sea mayor: nunca baja la sugerencia.
- Mínimo 1 (0 pondría candado al plato).

"Rellenar con la predicción" y la tarjeta de mañana usan la misma selección por plato: primero la
sugerencia propia, luego otro modelo real y al final la demo (con insignia "Demo").

### Evaluación

`node scripts/analitica/evaluar-sugerencia-stock.mjs` aplica la misma lógica de la app a
`data/sintetica/demanda_diaria.csv`, en el periodo de prueba de US-087 (04/10 – 31/10, 140 días-plato).
Cada día solo ve los días anteriores y, como en la app, solo conoce lo **vendido** (un día agotado queda
marcado `AGOTADO`); se compara contra lo **solicitado**.

| Modelo | MAE | RMSE | Sesgo |
|---|---|---|---|
| Promedio simple por día de la semana (US-087, referencia) | **4.67** | 6.77 | — |
| **Sugerencia US-146 (`promedio-ponderado-v1`)** | **5.45** | 7.77 | −1.92 |
| Mismo promedio ponderado, si se conociera lo solicitado (sin agotados) | 5.12 | — | −0.02 |

- **Es 16.7% peor que el promedio simple de US-087.** La diferencia principal es la cantidad de
  historia: US-087 promedió 5 meses de entrenamiento; US-146 usa solo las últimas 4 semanas (como
  mucho 4 datos por día de la semana). Aun con la demanda real sin cortes, 4 semanas dan MAE 5.12.
- **Los agotados explican el resto (5.12 → 5.45):** el 26% de los días-plato de la ventana se agotaron,
  y lo vendido esos días es menor que lo pedido. La regla "un agotado no baja" evita el peor caso,
  pero la sugerencia aún queda en promedio ~2 platos corta (sesgo −1.92).
- Sin el feriado ni el evento del periodo, el MAE baja a 4.77.
- **Por qué igual se usa:** se adapta a las ventas reales de cada restaurante sin reentrenar, y cubre
  cualquier plato con 3 días de historia. XGBoost (4.26) sigue siendo mejor con datos sintéticos, pero
  necesita reentrenarse con datos reales.
- **Mejora posible (no aplicada):** ampliar la ventana a 8 semanas o sumar un margen a los días
  agotados. Habría que validarla con datos reales, no ajustarla con este mismo periodo de prueba.
