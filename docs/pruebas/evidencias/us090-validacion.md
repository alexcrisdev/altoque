# US-090: predicción de platos en el dashboard

Fecha de validación: 14/11/2026 (America/Lima).
Rama de trabajo: `dev/fabrizio`.

## Alcance

Se agrega `demand_forecasts` y una tarjeta en `/admin/reportes` con los tres
platos previstos para mañana en hora de Lima. La comparación usa el stock
registrado para esa misma fecha. Sin stock registrado se considera ilimitado
y no se muestra alerta.

La RLS permite lectura a OWNER y ADMIN de su restaurante. No se agrega ANALYST:
ese rol no existe en la aplicación y la indicación específica de US-090 establece
OWNER/ADMIN. Las escrituras se reservan a la cuenta de servicio.

## Resultados de ejecución

Resultados comunicados por el desarrollador mediante la salida de su terminal
en Windows, en `C:\Proyecto\altoque`.

| Comprobación | Resultado observado |
|---|---|
| `npm run lint` | Sin errores |
| `npm run typecheck` | Sin errores |
| `npm test` | 63 archivos, 1065 casos aprobados |
| `npm run build` | Compilación de producción correcta |
| `git diff --check` | Sin errores de espacios; aviso LF a CRLF en `page.tsx` |
| Unitarias del cargador | 37 casos aprobados |
| Unitarias de predicción, datos, acción y tarjeta | 44 + 23 + 9 + 10 = 86 casos aprobados |
| Pruebas propias unitarias de US-090 | 37 + 86 = 123 casos; incluidos en los 1065 de la suite completa |
| `tests/rls/prediccion.test.ts` | 11 casos aprobados en Supabase local |

No se cambiaron flujos del cliente; no se ejecutaron E2E para esta historia.

## Migración y permisos

Migración nueva: `supabase/migrations/20261114213439_demand_forecasts.sql`.
Se aplicó con `npx supabase migration up --local`, contra la API local
`http://127.0.0.1:54321`.

Las 11 pruebas de integración comprueban lectura de OWNER/ADMIN, ausencia de
lectura de otros restaurantes y cocina, bloqueo del visitante anónimo,
denegación de insertar/actualizar/eliminar para OWNER/ADMIN, upsert sin duplicados,
clave foránea del producto/restaurante y rechazo de cantidades negativas.
Los fixtures se eliminan en `afterAll`.

La migración no se ha aplicado a la base compartida en esta validación.
Su aplicación corresponde al revisor.

## Simulacro del CSV del modelo

Comando ejecutado por el desarrollador:

```powershell
node --env-file=.env.local scripts/analitica/cargar-predicciones.mjs --restaurante 10000000-0000-0000-0000-000000000001 --desplazar-dias 14
```

Resultado observado: modo SIMULACRO, 35 filas leídas, 35 coincidencias por nombre,
0 omitidas. El destino fue la base compartida, exclusivamente en modo de lectura.
Las fechas se desplazaron del 01–07/11/2026 al 15–21/11/2026 y el modelo se mostró
como `xgboost-calendario-v1-demo`.

Ejemplo de la salida del modelo para el 15/11: Ceviche clásico ~51, Ceviche mixto
~41 y Chicharrón de pescado ~28. El simulacro informó que no escribió ninguna
predicción. No se ejecutó `--aplicar`.

## Fixtures para la revisión visual local

El script `scripts/analitica/demo-predicciones-local.mjs` es independiente del
cargador CSV. Solo admite una API HTTP local en el puerto 54321 y crea ejemplos
manuales para capturas. No representa la salida de US-087.

Salida comunicada de `preparar`:

```text
Destino LOCAL: http://127.0.0.1:54321. Fecha prevista: 2026-11-15.
Ceviche clásico: previsto 46, stock 30, faltarían 16.
Ceviche mixto: previsto 36, stock 50, suficiente.
Chicha morada: previsto 28, sin stock registrado, sin alerta.
Son fixtures manuales para capturas, no resultados del modelo US-087.
```

Salida comunicada de `limpiar`:

```text
Fixtures eliminados. No se modificaron las filas que existían antes de esta preparación.
```

Capturas guardadas:

- [Tarjeta con alerta](captura-us090-con-alerta.png).
- [Sin predicción](captura-us090-sin-prediccion.png).

## Criterios de aceptación

| Criterio | Evidencia disponible y límite |
|---|---|
| Tabla con restaurante, producto, fecha, cantidad, modelo y RLS | Migración aplicada y 11 pruebas de integración aprobadas en local; base compartida pendiente del revisor |
| Cargador del CSV US-087 | Simulacro real de 35 filas y 37 unitarias; aplicación real reservada al revisor |
| Tarjeta «Mañana [día]: prepara ~N [plato]» | Render estático, consulta, acción y selección de top 3 probados; capturas pendientes de confirmar |
| Alerta por stock menor a la predicción | Comparación pura y render probados; fixtures locales creados y eliminados; captura pendiente de confirmar |
| Pruebas unitarias stock frente a predicción | Casos sin stock, menor, igual, mayor, cero, ausencia de predicción y redondeo aprobados |
