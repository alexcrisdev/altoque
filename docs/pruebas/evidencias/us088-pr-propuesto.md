# Texto propuesto para la reapertura del PR #83

Usar después de que Alexander revise la migración nueva, la pruebe y la aplique
en la base compartida. Este documento no abre ni reabre el PR.

**Título:** US-088: emitir boletas de prueba con Nubefact y correo opcional

Actualicé US-088 sobre US-094 y US-097 para conservar las protecciones de Checkout
y añadir la boleta de prueba con correo opcional.

- Conservé snapshot, monto, expiración, CHECKOUT_STALE, idempotencia bajo bloqueo,
  pagos tardíos y reembolsos de Alina. El correo se toma solo de la metadata de
  la sesión, no del email solicitado por Stripe.
- Sustituí la migración anterior, no aplicada en la base compartida, por
  `supabase/migrations/20261115221935_us088_boletas_prueba.sql`.
  La función `registrar_pago_stripe` parte de la versión de Alina de
  `20261115190000`; solo añade `p_receipt_email text default null` y su guardado
  normalizado. Se elimina la firma antigua y se conservan los permisos exclusivos
  de service_role. No redefiní `iniciar_checkout_stripe` ni los triggers US-094/US-097.
- AlToque reserva serie/número cuando el saldo llega a cero. n8n reutiliza la
  reserva, consulta/emite en Nubefact DEMO y devuelve el resultado firmado.
  Caja muestra la boleta con PDF y el aviso sin valor tributario.

Criterios verificados:

- [x] Nubefact DEMO genera PDF/XML: BBB1-2 emitida con el código integrado.
- [x] Correo voluntario y envío Gmail; el mismo mensaje se confirmó en INBOX.
- [x] Callback HMAC guarda EMITIDO en la reserva existente, sin duplicados.
- [x] Caja muestra BBB1-2 y el PDF real; captura a 390 px.
- [x] Pantalla, correo, PDF y documentación indican que es de prueba/sin valor legal.
- [x] Token solo en credencial n8n y ruta privada en configuración del proxy.
- [x] El usuario reconfirmó DEMO antes de la emisión.

Validación:

- `supabase db reset --local`: base limpia con todas las migraciones en orden.
- Usuarios preparados exclusivamente en Supabase local.
- `npm run test:integracion`: 109/109 en dos vueltas consecutivas, incluidos
  `vencimiento-pedidos.test.ts` y la prueba SQL de US-088 con rollback.
- `npm test`: 1111/1111.
- `npm run typecheck`, `npm run build` y `npx eslint src tests scripts`: aprobados.
- Recorrido real local caja → n8n CLI → Nubefact DEMO → callback → caja → Gmail: 1/1.

La copia n8n de validación estuvo inactiva y se ejecutó por CLI con entrada y
respuesta adaptadas únicamente para ese modo. Los proveedores y el callback
fueron reales; no se modificaron los flujos publicados. El webhook compartido
se comprobará al desplegar, no se presenta como validado por esta prueba.

Para Alexander:

- [ ] Revisar, probar y aplicar únicamente la migración nueva; la antigua se retiró.
- [ ] Configurar `receipt_series` con el siguiente número libre de BBB1 confirmado
  en Nubefact. Última emitida: **BBB1-2**. La consulta posterior confirmó BBB1-3
  libre, pero debe reconfirmarse al configurar la base compartida.
- [ ] Verificar el entorno compartido y recién entonces reabrir el PR y ejecutar CI/E2E.

Evidencias: `docs/pruebas/evidencias/us088-validacion.md`, con capturas nuevas del
PDF real, del mensaje recibido leído por Gmail API y de caja. No se escribió en
la base compartida ni se hizo push o reapertura del PR durante esta revisión.
