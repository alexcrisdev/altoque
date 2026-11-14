# Predicciones del dashboard (US-090)

La tarjeta de `/admin/reportes` muestra los tres platos con mayor cantidad prevista
para mañana, calculado en `America/Lima`. No depende del filtro de fechas de ventas.

## Carga del CSV US-087

Desde la raíz del proyecto:

```powershell
node --env-file=.env.local scripts/analitica/cargar-predicciones.mjs --restaurante 10000000-0000-0000-0000-000000000001 --desplazar-dias 14
```

El modo predeterminado es SIMULACRO: consulta el catálogo y muestra las filas
que cargaría, sin escribir. Requiere las variables `NEXT_PUBLIC_SUPABASE_URL`
y `SUPABASE_SERVICE_ROLE_KEY`, que no deben subirse al repositorio.

El CSV `analitica/prediccion_7_dias.csv` contiene `fecha`, `producto_id`, `producto`,
`cantidad_prevista` y `modelo`. Los identificadores P01, P02, etc. pertenecen al
modelo. La carga busca el producto real por nombre dentro del restaurante;
normaliza mayúsculas y espacios y omite los nombres ausentes o ambiguos.

`--desplazar-dias 14` mueve el 01–07/11/2026 al 15–21/11/2026, conservando los
días de la semana. Un desplazamiento distinto de cero añade el sufijo `-demo`
al modelo. Estas fechas desplazadas sirven para demostración, no equivalen a
una nueva predicción real ni a un reentrenamiento.

Solo Alexander, con su aprobación, ejecuta el mismo comando agregando `--aplicar`.
Ese modo hace upsert por `restaurant_id,product_id,forecast_date,model` para que
repetir la carga no duplique registros. La migración debe estar aplicada antes.
Esta historia no ejecuta esa carga contra la base compartida.

## Cálculos y presentación

- Cantidades: entero más cercano; una fracción de 0,5 redondea hacia arriba.
- Top N reutilizable: `topPlatosPrevistos` en `src/features/dashboard/prediccion-logica.ts`.
- Se selecciona un solo modelo para la fecha: se prefiere uno real frente a una demo;
  entre modelos de la misma categoría se elige el más reciente por `created_at`.
  No se suman cantidades de distintos modelos.
- Orden: cantidad descendente; empates por nombre y luego identificador del producto.
- Stock: `product_daily_stock.quantity` de la fecha prevista. No se utiliza el stock
  de hoy ni se descuenta `sold` para esta comparación de preparación.
- Faltante: `max(0, cantidad prevista redondeada - stock registrado)`.
- Ausencia de stock: sin límite y sin alerta. Stock cero sí puede generar alerta.
- Sin filas: «Aún no hay predicción para mañana». Si falla la consulta, se muestra
  un error, sin confundirlo con ausencia de predicciones.

El formulario de stock US-067 sigue gestionando el día actual. US-090 no amplía
ese formulario para registrar días futuros.

## Validación visual con ejemplos locales

Con Supabase local, usuarios demo y variables de esa misma base configurados en
la terminal, sin modificar `.env.local`:

```powershell
node scripts/analitica/demo-predicciones-local.mjs preparar
```

Se crean tres ejemplos manuales para mañana: alerta (46 frente a 30), suficiente
(36 frente a 50) y sin stock registrado (28). Son fixtures de interfaz, no resultados
del CSV US-087. El script no reemplaza predicciones ni stock que ya existan para
los productos y fecha consultados. Guarda en `.altoque/us090`, dentro de la carpeta
personal del usuario y fuera del repositorio, los UUID necesarios para eliminar
únicamente sus filas. Crea el directorio con modo `0700` y el archivo con modo
`0600` en sistemas que admiten esos permisos; mantiene la creación exclusiva `wx`.

Después de revisar `/admin/reportes` y guardar las capturas:

```powershell
node scripts/analitica/demo-predicciones-local.mjs limpiar
```

Si falla una preparación o limpieza, conservar el registro de limpieza y repetir
`limpiar` desde la misma carpeta y con el mismo destino local.
