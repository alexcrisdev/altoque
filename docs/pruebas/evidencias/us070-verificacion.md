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

## Prueba real del recorrido (10/11/2026)

Ejecutada por Alexander en el Preview de Vercel de la rama `dev/veronica`
(conectado a `altoque-dev`), con el cliente en una ventana de incógnito y el
personal en otra ventana. Sin capturas, por acuerdo del equipo.

| Caso | Pedido | Pasos | Resultado | Estado |
|---|---|---|---|---|
| En mesa (Cevichería Demo, Mesa 3) | N.º 626 | Pedido desde el QR de la mesa, «Activar sonido del aviso», cocina lo pasa a Listo | Sin recargar apareció «Tu pedido está listo, el mesero te lo lleva» en ~5 s; sonó un pitido una sola vez y no se repitió en los refrescos siguientes | APROBADO |
| Para llevar (Pollería Demo, mostrador) | N.º 627 | Pedido desde el QR del mostrador, «Activar sonido del aviso», cocina lo pasa a Listo | Apareció el aviso grande «Recógelo en el mostrador» con el pedido en «Listo»; sonó un pitido una sola vez | APROBADO |
| En mesa desde un celular (iPhone, Mesa 3) | N.º 640 | Mismo recorrido abriendo el QR en el iPhone | Apareció «Tu pedido está listo, el mesero te lo lleva» y sonó el pitido. No vibró: iOS no permite vibrar a las páginas web, y el criterio pide vibración solo «si el navegador lo permite» | APROBADO |

Notas:
- El QR de la Mesa 3 y el del mostrador de la Pollería se generaron para esta
  prueba. No se tocaron la Mesa 5 ni el mostrador de la Cevichería (los usa el E2E).
- Vibración: en iPhone no está disponible para páginas web (limitación de iOS).
  En Android con Chrome el código la llama; está cubierta por las pruebas unitarias.

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

- Vibración en un celular Android real (opcional; el código ya la llama si el
  navegador lo permite).
- No existe una fila US-070 en `docs/pruebas/matriz-trazabilidad.md`; la matriz
  se conservó intacta.
