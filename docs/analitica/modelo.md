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