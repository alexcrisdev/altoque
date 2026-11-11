# US-070: aviso al cliente cuando su pedido está listo

Fecha: 10/11/2026 (America/Lima). Rama: `dev/veronica`.

## Resultados ejecutados

| Comprobación | Resultado |
|---|---|
| `npm.cmd run lint` | Aprobado, sin errores |
| `npm.cmd test` | 41 de 41 archivos de pruebas correctos; 722 de 722 pruebas aprobadas |
| `npx.cmd tsc --noEmit` | Aprobado |
| `npm.cmd run build` | Aprobado |
| Edge con `npm.cmd run dev -- --port 3100` | Una carga del documento, dos refrescos RSC, intervalo observado de 4997 ms; conservó una variable de contexto en `window` |

Los resultados de pruebas unitarias, ESLint, TypeScript y build corresponden
a las últimas verificaciones ejecutadas tras integrar `develop`. Esta
actualización del informe no implica una nueva ejecución de pruebas funcionales.

La comprobación de Edge utilizó `/m/token-invalido/pedido/clave-invalida`.
Mostró «No encontramos este pedido.» y siguió actualizando sin recargar el
documento. No creó ni modificó pedidos y no demuestra la transición real a READY.
Los 5 segundos corresponden al temporizador de consulta; la respuesta también
depende de la red y del servidor. El componente existente pausa la consulta con
la pestaña oculta o sin conexión y evita superponer consultas pendientes.

## Cobertura de US-070

- `tests/unit/estado-cliente.test.ts`: mensajes exactos READY para DINE_IN y
  TAKEAWAY; conserva los textos compartidos de todos los demás estados.
- `tests/unit/aviso-estado-cliente.test.ts`: presentación destacada y región
  accesible; ausencia de aviso especial y notificación en otros estados;
  sonido y vibración una sola vez tras refrescos y una consulta fallida;
  APIs ausentes o que lanzan errores; audio suspendido sin sonido pendiente;
  presencia del botón para habilitar audio.
- `tests/unit/actualizacion-pedido-cliente.test.ts`: configuración de 5 segundos
  en la página, ejecución del temporizador y llamada a `router.refresh()` sin
  `location.reload()`.
- `tests/unit/estado-cliente-servidor.test.ts`: validación de clave y QR,
  filtros por restaurante/QR/clave y rechazo de pedidos ajenos.

Las pruebas unitarias del componente simulan efectos y referencias de React y
las APIs multimedia. No sustituyen una prueba de reproducción física ni una
comprobación completa del ciclo de vida en navegador.

La consulta y el cliente administrativo mantienen `server-only`. El QR se
resuelve por hash y el restaurante proviene de ese QR validado. El componente
del navegador no importa Supabase ni recibe credenciales. No se modificaron
migraciones ni políticas RLS; no se ejecutaron pruebas contra la base compartida.

## Pendientes

1. Autorizar y ejecutar el recorrido con dos pedidos demo propios: confirmar
   desde QR, abrir seguimiento y cambiar a READY desde la cuenta demo de cocina.
2. Capturar los dos avisos reales y guardar las imágenes en esta carpeta.
3. Comprobar que no se repite la notificación en sucesivos refrescos y tras un
   error temporal de consulta en navegador.
4. Comprobar audio tras pulsar «Activar sonido del aviso» y vibración en un
   dispositivo compatible; comprobar restricciones en Android/iOS.
5. Aprobar los commits antes de crearlos. No se hizo push ni se creó un PR.

No existe una fila US-070 en `docs/pruebas/matriz-trazabilidad.md`; la matriz se
conservó intacta según el alcance acordado.
