# US-104: rellenar el stock con la predicción

Fecha: 17/11/2026.
Rama: dev/fabrizio.
Pull Request: #100.

## Implementación

- Consulta las predicciones de hoy en hora de Lima para el restaurante autorizado.
- Muestra «Rellenar con la predicción» cuando existen sugerencias para productos activos.
- El relleno modifica únicamente los productos que tienen predicción, sin guardar automáticamente.
- Muestra la cantidad sugerida, su rango orientativo y el origen del valor.
- La edición manual cambia la marca a «Editado por ti».
- «Deshacer relleno» recupera los valores y marcas anteriores al último relleno.
- Los productos sin predicción conservan su valor y origen, tengan o no ventas.
- El formulario identifica esos productos como «Sin predicción».
- Un campo vacío conserva su significado de stock ilimitado; el relleno no vacía cantidades registradas.
- El guardado reutiliza guardarStockAction y la RPC guardar_stock_diario, con autorización OWNER/ADMIN.
- Un formulario de una fecha anterior se rechaza al guardar.

## Corrección: conservar productos sin predicción

Se corrigió rellenarStockConPrediccion para devolver una copia del campo
sin modificarlo cuando no existe una sugerencia para ese producto.

Esto evita que el relleno borre el stock registrado de bebidas u otros
productos y que, al guardar, se conviertan accidentalmente en ilimitados.

La suite tests/unit/rellenar-stock.test.ts contiene 30 casos e incluye:

- Conservación del stock sin predicción, con y sin ventas.
- Conservación de ediciones manuales previas.
- Conservación del stock cero.
- Conservación de campos que ya estaban vacíos.
- Relleno y redondeo de productos con predicción.
- Recuperación de valores y marcas al deshacer.
- Validaciones e inmutabilidad de los datos recibidos.

## Predicciones regeneradas

Se reutilizó el modelo XGBoost de US-087, conservando su entrenamiento
y cambiando el periodo de predicción al 16–20/11/2026.

Resultado: 25 filas, correspondientes a cinco platos durante cinco días.
El escenario utiliza feriado=0 y hay_evento=0.

Las bebidas sin predicción permanecen identificadas como «Sin predicción»
y mantienen sus cantidades al rellenar.

El rango mostrado es orientativo: cantidad prevista ±5 unidades,
limitado a valores válidos. El margen corresponde al MAE documentado
de US-087, 4.26, redondeado hacia arriba. No es un intervalo de confianza.

## Simulacro de carga

Comando ejecutado:

```powershell
node --env-file=.env.local scripts/analitica/cargar-predicciones.mjs --restaurante 10000000-0000-0000-0000-000000000001
```

Resultado:

```text
Modo: SIMULACRO (sin escrituras)
CSV: 25 filas. Coinciden: 25. Omitidas: 0.
No se escribió ninguna predicción.
```

La carga del CSV regenerado en la base compartida corresponde a Alexander.
El simulacro no demuestra que esa carga se haya realizado.

## Validación automática de la corrección

Ejecutada el 17/11/2026:

- npx vitest run tests/unit: 84 archivos y 1396 pruebas aprobadas.
- tests/unit/rellenar-stock.test.ts: 30 casos aprobados.
- npx tsc --noEmit: sin errores.
- npm run lint: sin errores.
- npm run build: compilación correcta.
- git diff --check: sin errores.

Las pruebas comprueban que los productos sin predicción conservan
su stock, incluidos valores cero, campos ilimitados y ediciones manuales.

## Comprobación de la corrección

Ejecutar antes de publicar el commit:

```powershell
npx vitest run tests/unit
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

La suite de relleno contiene 30 casos y la del cargador contiene 38.
Los resultados de esta nueva ejecución se registrarán cuando termine.

## Evidencia visual

![Formulario de stock con relleno](us104-stock-relleno.png)

![Predicciones disponibles](us104-predicciones.png)

La etiqueta «Demo», cuando aparece, identifica predicciones cuyo modelo
termina en -demo; no acredita la carga del CSV regenerado.
