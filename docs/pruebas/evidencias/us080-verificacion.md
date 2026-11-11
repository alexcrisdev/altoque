# US-080 — Pantalla única de cocina (KDS)

Fecha: 11/11/2026, America/Lima. Rama: `dev/veronica`.

## Alcance

La página `/cocina` usa dos columnas permanentes, resumen de preparación,
colores de espera y tarjetas que marcan Listo sin confirmación. Conserva los
formularios de incidencias fuera de la tarjeta clicable. `/cocina?modo=tv`
muestra letras grandes y no presenta botones ni activa atajos de pedidos.

Se reutiliza el flujo IN_PROGRESS → READY de US-069. La acción específica del
KDS verifica el rol, restaurante, día y estado, y rechaza Deshacer cuando han
transcurrido cinco segundos desde `ready_at`. La función SQL compartida de
US-069 conserva su límite de cinco minutos para los consumidores anteriores;
no se alteró ni se creó una migración. El plazo propio del KDS se comprueba en
el servidor antes de invocar esa función. El botón y la tecla 0 revierten el
último pedido marcado desde esta pantalla mientras su plazo siga vigente.

La consulta utiliza la sesión del personal y RLS, filtra por restaurante y por
el intervalo del día de Lima (05:00 UTC inclusive a 05:00 UTC del día siguiente
exclusive). Recupera alérgenos del producto actual, no una instantánea histórica.
No se consulta Supabase directamente desde el componente del navegador.

## Resultados reales

| Verificación | Resultado |
|---|---|
| `npm.cmd run lint` | Aprobado |
| `npm.cmd test` | 767 pruebas aprobadas, 44 archivos |
| `npx.cmd tsc --noEmit` | Aprobado |
| `npm.cmd run build` | Aprobado |
| Playwright local, Edge, 1366×768 | 14 casos aprobados y 1 caso adicional aprobado en una segunda ejecución |
| Inspección con CSS compilado de Next.js | Columnas lado a lado en ambos modos; modo TV sin botones |

Comandos para repetir las pruebas aisladas:

```powershell
npx.cmd playwright test --config tests/kds-local/playwright.config.ts
```

La configuración es independiente de `playwright.config.ts`: no carga
`.env.local`. Utiliza Vite ya instalado con las herramientas de pruebas,
sustituye las acciones del KDS y los formularios de incidencias por simulaciones,
y bloquea conexiones del navegador fuera de 127.0.0.1. No escribe en Supabase.
No se instalaron dependencias. En esta máquina se utilizó Microsoft Edge.
Durante la ejecución se cerró manualmente el proceso propio de Vite después
de finalizar los casos porque Playwright demoraba en cerrar el servidor en Windows.

## Criterios comprobados

1. **Dos columnas y FIFO:** lógica unitaria, DOM en navegador y comprobación de
   posición de columnas con CSS compilado. Listos indica «Esperando al mesero».
2. **Resumen:** suma cantidades de pedidos IN_PROGRESS; pruebas de 6× y 20×
   Ceviche clásico. Excluye listos, entregados y cancelados.
3. **Colores:** verde antes de 10 minutos, amarillo desde 10 y rojo desde 20.
   Pruebas de límites y de clases aplicadas en navegador; reloj local continuo.
4. **Observaciones y alérgenos:** resaltados en la tarjeta; comprobados en
   navegador y en el mapeo de la consulta simulada.
5. **Un toque y Deshacer:** botón que abarca el contenido de la tarjeta, sin
   confirmación. Pruebas del clic, vencimiento y rechazo en servidor a los 5000 ms.
6. **Teclado:** pruebas individuales de teclas 1–9 y 0 en Edge, más Numpad1 y
   Numpad0. Las primeras nueve tarjetas reciben atajos; las siguientes muestran
   su turno y se pueden pulsar. Ignora repeticiones de tecla, modificadores y
   campos editables. Se corrigió un retraso del reloj que impedía deshacer
   inmediatamente tras marcar Listo.
7. **Día, entregados y cancelados:** filtro del servidor y protección visual
   al cambiar el día. Los entregados salen al consultar. Si un pedido conocido
   cambia a CANCELLED, aparece un aviso rojo pulsante durante cinco segundos;
   no se repite ni reaparecen cancelaciones antiguas al abrir la pantalla.
   Con reducción de movimiento del sistema, el aviso rojo no parpadea.
8. **TV:** comprobado sin botones ni acciones de teclado, con texto mayor.
9. **Nuevos pedidos:** consulta automática cada 3 segundos mientras la página
   está visible y conectada; conserva datos ante fallos y reintenta. Un nuevo
   pedido en preparación reproduce un tono una sola vez. Prueba de navegador
   con AudioContext simulado y prueba sin API de audio. No suena por los pedidos
   ya presentes al abrir la pantalla.

Los plazos de consulta dependen de la red y no se superponen consultas o
escrituras en curso. El sonido puede requerir interacción previa: botón
«Activar sonido» en modo normal o toque en la pantalla en modo TV.

## Capturas

Capturas reales del componente en navegador, con datos y acciones simulados y
CSS compilado del proyecto. No son evidencia de pedidos reales:

- [Modo normal](us080-kds-normal-simulado.png)
- [Modo TV](us080-kds-tv-simulado.png)

## Pendientes de comprobación integrada y física

- Abrir `/cocina` con sesión demo autorizada y comprobar pedidos nuevos de QR
  entrando directamente en preparación desde US-069.
- Verificar marcado, Deshacer, cancelación y entrega con pedidos demo propios
  y dos sesiones autorizadas. Estas operaciones escriben en la base compartida
  y no se ejecutaron.
- Probar los formularios reales de incidencias dentro del nuevo tablero; en las
  pruebas de navegador se sustituyeron por campos locales. Sus pruebas unitarias
  existentes siguen aprobadas.
- Escuchar el sonido en una laptop real, probar el teclado físico de esa laptop
  y un teclado numérico USB. Playwright automatizó eventos de teclado en Edge;
  no equivale a accionar esos dispositivos físicos.
- Verificar restricciones de audio y legibilidad a la distancia real del televisor.

No se crearon commits ni se hizo push o PR durante esta implementación.
