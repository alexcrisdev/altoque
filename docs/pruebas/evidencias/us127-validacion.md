# US-127: ir al seguimiento después de confirmar

Fecha: 22/11/2026 (Lima). Responsable: Erick. Rama: `dev/erick`.
Base integrada: `origin/develop` en `5367192`.

## Comportamiento

Después de registrar el pedido, el carrito muestra una vista de éxito con su número y
el enlace **Ver el estado de mi pedido** en un pie que permanece visible. El enlace
usa el token y la misma clave de idempotencia del pedido confirmado para abrir
`/m/[token]/pedido/[clave]` a un toque, sin cerrar antes el carrito ni buscarlo con scroll.

La vista de éxito no muestra modalidad, productos ni preguntas de alergias del pedido
ya enviado. Indica que el seguimiento permite consultar el saldo y las opciones de
pago, y que también se puede pagar en caja. La página existente conserva la línea de
tiempo de US-092 y su mensaje de pago pendiente.

Se mantienen **Cerrar** y el enlace exterior para el recorrido anterior. Agregar desde
el detalle sigue dejándolo abierto; no se reintroduce la apertura automática del carrito.
Se retiró el prop `dialogoRef` sin consumidores; el carrito conserva su referencia interna.

## Criterios y resultados

| Criterio | Comprobación | Resultado |
|---|---|---|
| Seguimiento a un toque sin scroll | E2E: enlace con la clave del pedido guardado, dentro del viewport, tocable, área mínima de 44 px y con foco; navegación con un toque | Aprobado |
| Reutilizar US-092 | E2E: página existente, encabezado Línea de tiempo y barra Avance del pedido | Aprobado; sin cambios en la línea de tiempo |
| No repetir alergias | Unitaria y E2E: formulario ausente tras confirmar y en seguimiento | Aprobado |
| Mostrar cómo pagar si falta | Unitaria: orientación en la confirmación; E2E: Esperando pago e instrucciones de caja/tarjeta en el ticket existente | Aprobado; sin ejecutar pagos |
| Evitar duplicados | E2E: dos toques reales consecutivos, exactamente un pedido antes y después de navegar | Aprobado |

## Validaciones finales

- `npm run lint`: aprobado.
- `npm run typecheck`: aprobado.
- `npm test`: **1445/1445**, 90 archivos; cuatro casos nuevos de US-127.
- `npm run build`: aprobado, restaurando la compilación con la configuración habitual.
- Playwright, solo `tests/e2e/seguimiento-confirmacion.spec.ts`: **2/2** en Chromium,
  confirmación normal y doble toque. Ambos revisan **360×640, 390×844 y 1440×900**.
- No se editaron pruebas existentes ni `tests/e2e/ayuda.ts`.

La primera ejecución detectó un selector ambiguo del mensaje de pago (aparece en el
anuncio accesible y en el ticket); el selector de la prueba nueva se acotó al ticket.
También hubo un aviso de limpieza por no observar la confirmación temporal de
cancelación, aunque la captura mostraba el pedido cancelado. Las pruebas nuevas
usan el mecanismo `alLimpiar` existente para cancelar sus propios pedidos mediante
`cambiar_estado_pedido`, con el usuario normal autenticado, verifican `CANCELLED` y
dejan que el fixture existente restaure el stock. Las dos ejecuciones finales de la
selección E2E terminaron en verde; la última incluye los tres tamaños y las capturas.

## Entorno y límites

La aplicación y los workers E2E apuntaron exclusivamente a **Supabase local**,
comprobado antes de arrancar. Se usaron el QR de seed y usuarios demo locales ya
disponibles, sin regenerar QR ni cambiar usuarios. El worker utiliza el usuario normal
con RLS; la clave de servidor se reserva para Next.js.

Los pedidos propios se cancelaron y se verificó su estado; el stock se restauró mediante
el fixture. Se conserva el historial cancelado local. No hubo pagos, correos ni llamadas
a n8n/Nubefact. No se modificaron la base compartida, `.env.local`, permisos, migraciones
ni dependencias. No se ejecutó el E2E completo.

La revisión usa Chromium con viewport móvil y escritorio; no acredita una prueba
con teclado virtual de un celular físico.

## Capturas

- [Confirmación a 390 px](us127-confirmacion-390.png).
- [Confirmación en escritorio](us127-confirmacion-escritorio.png).

## Cómo probar en el navegador

1. Abrir una carta de pruebas con QR válido y agregar un plato desde su detalle.
2. Cerrar el detalle, abrir el carrito y completar modalidad y alergias.
3. Confirmar: aparecen el número del pedido y el enlace de seguimiento sin scroll;
   ya no aparece la pregunta de alergias de ese pedido.
4. Pulsar **Ver el estado de mi pedido** una vez: comprobar número, línea de tiempo
   y, si corresponde, el aviso de pago pendiente con sus instrucciones.
5. Para repetir pruebas que creen pedidos, usar únicamente Supabase local y finalizar
   los pedidos propios mediante la limpieza prevista.
