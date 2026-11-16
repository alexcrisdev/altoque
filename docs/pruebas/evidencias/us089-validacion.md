# US-089: validación del resumen diario de ventas

Fecha: 15/11/2026, America/Lima.
Rama: dev/fabrizio.
Base incorporada antes de comenzar: develop, commit 37e7bc7.

## Alcance

Ruta protegida de consulta del resumen diario, cálculos reutilizados
de ventas y predicciones, y flujo n8n con correo Gmail OAuth.

No se crearon migraciones ni se escribieron datos en Supabase.

## Pruebas observadas

Resultados compartidos por el desarrollador desde Windows:

| Comprobación | Resultado |
|---|---|
| resumen-diario.test.ts | 37 pruebas aprobadas |
| resumen-diario-servidor.test.ts | 22 pruebas aprobadas |
| resumen-diario-ruta.test.ts | 23 pruebas aprobadas |
| resumen-diario-mensaje.test.ts | 17 pruebas aprobadas |
| Total de pruebas propias | 99 aprobadas |
| npm run lint | Sin errores en las ejecuciones compartidas |
| npm run typecheck | Sin errores en las ejecuciones compartidas |
| git diff --check | Sin errores en las ejecuciones compartidas |

Validación final: npm test aprobó 1210 casos en 71 archivos.
npm run lint, npm run typecheck, npm run build y git diff --check
terminaron sin errores.

## Comprobación de la ruta

Aplicación local: http://localhost:3007.
n8n local en Docker: http://localhost:5678.

La consulta sin Authorization respondió HTTP 401.
La consulta con el token configurado respondió con el resumen JSON.

En la ejecución compartida para el 15/11/2026 se observaron:

- Total vendido: S/ 228.
- Pedidos no cancelados: 38.
- Efectivo: S/ 202.
- Yape: S/ 13.
- Tarjeta en caja: S/ 13.
- Tarjeta en línea: S/ 0.
- Plato más vendido: Inca Kola 500 ml, 37 unidades.
- Cierres con excepción: 13.

Comprobación del desglose: 202 + 13 + 13 + 0 = 228.

Predicciones devueltas para el 16/11/2026:

- Ceviche clásico: 51.
- Ceviche mixto: 36.
- Chicharrón de pescado: 26.

El modelo fue xgboost-calendario-v1-demo.
Estas cantidades proceden de la demostración desplazada de US-090.

## Ejecución n8n

Se configuraron Header Auth y Gmail OAuth.
El desarrollador confirmó que dispone de las capturas tras la prueba
manual de envío y recepción.

Evidencias:

- [Ruta sin token](captura-us089-ruta-401.png).
- [Correo recibido](captura-us089-correo-recibido.png).
- [Flujo ejecutado](captura-us089-flujo-ejecutado.png).

Workflow publicado con programación diaria a las 23:00, America/Lima.
Ejecución manual y recepción del correo comprobadas.
No se esperó una ejecución automática para esta validación.

## Corrección durante la validación

Next.js rechazó export const runtime = "nodejs" por ser incompatible
con cacheComponents. Se eliminó esa declaración de la ruta.

Se reinició AlToque con RESUMEN_DIARIO_TOKEN configurado y después
se comprobó la respuesta 401 sin token y la respuesta autorizada.

## Cobertura y límites

Las unitarias comprueban día vacío, métodos de pago, cancelados,
límites horarios de Lima, agrupación por nombre, excepciones,
predicciones, paginación, autorización y formato del correo.

El flujo generado no contiene credenciales, tokens ni destinatarios reales.
El HTML escapa nombres y motivos antes de incorporarlos al mensaje.

El envío manual no demuestra por sí solo una ejecución automática.
El funcionamiento programado local requiere mantener los servicios encendidos.