# US-068: prueba manual de notificación al mesero

Validación manual ejecutada en `altoque-dev`, con cuentas y pedidos de prueba. No se usó la URL de producción. Según `docs/despliegue.md`, los entornos comparten el proyecto `altoque-dev`; los pedidos usados deben ser ficticios y su limpieza debe coordinarse para no afectar datos ajenos a la prueba. La migración agrega `orders` a `supabase_realtime`; no cambia sus políticas RLS.

## Preparación

1. Abrir la aplicación de staging/preview conectada a `altoque-dev`.
2. Abrir dos navegadores o dispositivos: uno con usuario `WAITER` del restaurante de prueba y otro con `KITCHEN` del mismo restaurante.
3. Dejar abierta una segunda sesión de mesero de otro restaurante para comprobar el aislamiento.
4. En el panel `/mesero`, pulsar **Activar avisos**. Aceptar el audio del navegador si pregunta.

## Casos

- [x] Cocina cambia un pedido de `IN_PROGRESS` a `READY`. El mesero recibe el aviso visual `Mesa X: pedido #N listo` sin actualizar manualmente.
- [x] Al activar avisos, se reproduce el sonido automáticamente.
- [x] En un dispositivo compatible, se produce vibración.
- [x] La sesión de mesero de otro restaurante no recibe el aviso.
- [x] Al bloquear solo la conexión WebSocket de Supabase Realtime y mantener HTTP, el panel detecta el pedido en la actualización periódica en un máximo de 10 segundos.
- [x] Al rehabilitar WebSocket, Realtime vuelve a conectarse y el mismo pedido no genera un segundo aviso.
- [x] Dentro del plazo permitido por el flujo actual, cocina deshace «Listo» y vuelve a marcar el mismo pedido como `READY`; se genera una nueva notificación sin duplicados y con un nuevo `ready_at`.

## Registro de ejecución manual

Fecha de ejecución: 2026-11-10
Entorno: `altoque-dev` (staging/preview; no se usó producción).

| Escenario | Resultado esperado | Resultado obtenido | Estado | Captura |
|---|---|---|---|---|
| Notificación visual al pasar a `READY` | Aviso «Mesa X: pedido #N listo» sin recargar. | La notificación visual apareció al marcar el pedido como listo. | APROBADO | Pendiente de captura; no hay imagen real disponible. |
| Sonido | Reproducción de sonido con avisos activados. | El sonido se reprodujo automáticamente. | APROBADO | Pendiente de captura; no hay imagen real disponible. |
| Aislamiento entre restaurantes | El otro restaurante no recibe el aviso. | El mesero del otro restaurante no recibió ninguna notificación. | APROBADO | Pendiente de captura; no hay imagen real disponible. |
| Respaldo con WebSocket bloqueado | Aviso por actualización periódica en máximo 10 segundos. | El aviso llegó en 10 segundos con WebSocket bloqueado. | APROBADO | Pendiente de captura; no hay imagen real disponible. |
| Vibración | Vibración en dispositivo compatible. | Se observó vibración. | APROBADO | Pendiente de captura; no hay imagen real disponible. |
| Deshacer y volver a marcar listo | Nueva notificación al pasar otra vez a `READY`, sin duplicados. | Se recibió una nueva notificación sin duplicados. | APROBADO | Pendiente de captura; no hay imagen real disponible. |
| Reconexión de Realtime tras retirar el bloqueo | Estado `SUBSCRIBED` y sin aviso duplicado del mismo pedido. | Realtime volvió a conectarse con el panel del mesero abierto; el pedido 583 no generó una notificación duplicada. | APROBADO | Pendiente de captura; no hay imagen real disponible. |

Las capturas no se inventaron: no se encontraron imágenes de US-068 en `docs/pruebas/evidencias/` al actualizar este registro. Los resultados funcionales anteriores corresponden a lo informado para esta ejecución manual.
