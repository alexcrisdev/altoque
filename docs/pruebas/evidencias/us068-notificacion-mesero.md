# US-068: prueba manual de notificación al mesero

Realizar esta prueba en una instancia local o aislada de Supabase que ya tenga aplicada la migración de US-068. No usar `altoque-dev` compartido. La migración agrega `orders` a `supabase_realtime`; no cambia sus políticas RLS.

## Preparación

1. Iniciar AlToque local (`npm run dev`) con una instancia aislada de Supabase configurada en `.env.local`.
2. Abrir dos navegadores o dispositivos: uno con usuario `WAITER` del restaurante de prueba y otro con `KITCHEN` del mismo restaurante.
3. Dejar abierta una segunda sesión de mesero de otro restaurante para comprobar el aislamiento.
4. En el panel `/mesero`, pulsar **Activar avisos**. Aceptar el audio del navegador si pregunta.

## Casos

- [ ] Cocina cambia un pedido de `IN_PROGRESS` a `READY`. El mesero recibe de inmediato `Mesa X: pedido #N listo`, sin actualizar manualmente.
- [ ] En Android con vibración disponible, el dispositivo vibra y reproduce el tono. En iPhone, verificar el aviso visual y el sonido cuando Safari lo permita después de pulsar **Activar avisos**.
- [ ] La sesión del otro restaurante no recibe el aviso.
- [ ] En las herramientas de desarrollo, bloquear solo la conexión WebSocket de Supabase Realtime, manteniendo la conexión HTTP. Cocina marca otro pedido como listo: el panel lo detecta en la siguiente actualización periódica (máximo 10 segundos) y muestra un solo aviso.
- [ ] Rehabilitar WebSocket. El estado indica que Realtime se conectó; el mismo pedido no genera un segundo aviso.
- [ ] Dentro del plazo permitido por el flujo actual, cocina deshace «Listo» y luego vuelve a marcar el mismo pedido como `READY`. Se muestra un nuevo aviso, con su nuevo `ready_at`.

Registrar aquí navegador/dispositivo, hora de ejecución y resultado. Esta guía no crea ni modifica pedidos por sí sola.
