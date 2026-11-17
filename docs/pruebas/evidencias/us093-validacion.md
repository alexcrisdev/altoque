# US-093: calificación opcional del servicio y del mesero

Fecha: 17/11/2026, America/Lima. Rama: `dev/erick`.
Base integrada: US-092, commit `008078e` de develop.

## Qué cambia

- Tarjeta «¿Qué tal te atendimos?» en el seguimiento `/m/[token]/pedido/[clave]`,
  conservando ticket y línea de tiempo de US-092.
- Servicio y mesero tienen dos grupos independientes de 1–5 estrellas.
  El comentario es opcional, con máximo 200 caracteres y rechazo de controles.
- Se ofrece si el pedido está entregado o su cuenta está completamente pagada
  con al menos un pago confirmado. Un pedido cancelado no admite opinión.
- La X recuerda el cierre por clave de pedido en localStorage. No envía una
  acción de servidor ni escribe en la base. Si el navegador bloquea almacenamiento,
  se conserva el cierre en memoria durante esa visita.
- Al guardar o detectar una calificación previa se deja de ofrecer la tarjeta.
  La base tiene unicidad por `order_id` y no sobrescribe la primera opinión.

## Migración nueva: pendiente de Alexander

`supabase/migrations/20261117212438_us093_calificacion_opcional.sql`.

No se editan migraciones anteriores. No se aplica a Supabase compartido.
`public.order_ratings` contiene `restaurant_id`, `order_id` único,
`service_stars`, `waiter_stars`, `comment`, `created_at` e identificador interno.

RLS activo: solo OWNER/ADMIN del restaurante leen. Anónimo no lee ni inserta;
mesero, cocina, caja y otro restaurante no leen. La escritura usa una acción
de servidor que resuelve el QR y valida la clave. Los RPC exclusivos de
service_role vuelven a validar QR activo, clave, restaurante y elegibilidad;
el restaurante del registro se deriva del pedido. La función de guardado bloquea
el pedido y la restricción única impide duplicados concurrentes.

## Contrato de satisfacción para Fabrizio (US-099)

Capa de datos: `src/features/dashboard/satisfaccion.ts`, función
`obtenerSatisfaccionDia(restauranteId, fechaISO)`.
Devuelve `{ cantidad, servicio, mesero }`: promedio aritmético independiente
de cada columna, sobre calificaciones **recibidas** durante el día de Lima
(00:00 inclusiva hasta 00:00 del día siguiente exclusiva). Sin datos, promedios
`null`; nunca se interpreta como cero estrellas. Pagina todas las opiniones.

Utiliza la sesión normal y RLS. El consumidor de US-099 debe verificar
OWNER/ADMIN en su acción y obtener de allí el restaurante autorizado. No recibe
comentarios ni contactos en el resumen. `waiter_stars` valora la atención
percibida; no se atribuye a una persona concreta porque la historia no incluye
un identificador de mesero.

## Validación local

- Base reconstruida con `npx supabase db reset --local` y usuarios demo locales.
- URL/clave local fijadas en el proceso antes de cargar `.env.local`;
  comprobado destino loopback. El archivo privado original queda intacto.
- Unitarias: 1387/1387, 85 archivos. Incluyen 18 casos de acción/validación/decisión
  de cierre y cuatro del promedio diario.
- SQL/RLS US-093: 11/11 casos transaccionales con ROLLBACK: guardado, duplicado,
  aislamiento entre restaurantes, roles de lectura, permisos anónimos, estrellas,
  comentario, pedido sin pagar, pagado, QR/clave incorrectos y cancelación.
- Integración completa: 148/148, 19 archivos, en dos vueltas consecutivas.
- Verificación final: `npm run lint`, `npm run typecheck`, `npm test` y
  `npm run build` aprobados. El build final terminó con código 0.
- E2E Chromium: 1/1 aprobado en Supabase local. Comprueba ausencia antes del
  pago, aparición al pagar, X sin petición de guardado, persistencia al recargar,
  envío de 5/4 estrellas y unicidad después de recargar.
- La primera ejecución del E2E detectó que el radio visualmente oculto no admite
  clic directo. Se corrigió la interacción de la prueba para usar teclado y la
  etiqueta visible; la segunda ejecución pasó sin cambiar el componente.
- Captura real a 390 px: [Mesa 2 y calificación](us093-calificacion.png).
- En un build local anterior Next.js 16.4.3 mostró su aviso de seguridad;
  no se actualizaron dependencias dentro de esta historia.

Las pruebas SQL usan un local propio con Mesa 2. El navegador utiliza únicamente
la Mesa 2 del seed LOCAL, nunca Mesa 5 ni el mostrador. No se regeneran QR.
El pago de navegador es efectivo ficticio sin correo para no reservar boletas.
No se contactan n8n, Stripe, Nubefact ni Gmail.

## Cómo probar después de revisión y despliegue

1. Alexander prueba y aplica la migración nueva antes de integrar/desplegar.
2. Con un pedido propio y su enlace privado, abrir el seguimiento del cliente.
3. Antes de pagar/entregar no se ofrece la tarjeta. Tras completar el pago o
   confirmar entrega aparece «¿Qué tal te atendimos?».
4. Cerrar con X y recargar: no reaparece para ese pedido ni se guarda una fila.
5. Con otro pedido propio, elegir ambos puntajes y comentario opcional, enviar
   y recargar: no se vuelve a ofrecer. Repetir la solicitud no crea otra fila.
6. OWNER/ADMIN pueden consultar opiniones de su restaurante; otros roles y
   miembros de otro restaurante no pueden leerlas.

La captura de aceptación se guarda como `us093-calificacion.png`.
US-083 permanece pausada; no se añade `web-push` ni ninguna dependencia.
