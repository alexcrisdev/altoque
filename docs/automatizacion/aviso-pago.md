# US-086: aviso a n8n cuando un pago queda confirmado

Cada vez que un pago queda **confirmado**, el servidor de AlToque envía un POST
firmado a n8n. Es la base para automatizar la boleta (US-088) y el resumen diario
(US-089). La infraestructura de n8n (Docker + túnel) es la de [US-071](n8n.md).

## Cuándo se envía

| Pago | ¿Avisa? | Dónde |
|---|---|---|
| Efectivo registrado en caja | Sí | `registrarPagoEfectivoAction` |
| Tarjeta en POS **aprobada** | Sí | `registrarPagoTarjetaAction` |
| Tarjeta en POS rechazada | No | — |
| Yape registrado (por verificar) | No | — |
| Yape **confirmado** por caja | Sí | `verificarPagoAction` |
| Yape rechazado por caja | No | — |
| Stripe (pago online) nuevo | Sí | `POST /api/stripe/webhook` |
| Stripe reenviando un pago ya registrado | No | — |

El aviso sale **después** de responder (`after()` de Next.js): el cobro no espera
a n8n. Si n8n está apagado, lento (más de 5 s) o responde con error, el pago ya
está guardado y solo queda una línea `[n8n] ...` en el log del servidor (Vercel →
Logs). No se reintenta: la información sigue en la base y se puede reenviar.

Si faltan `N8N_WEBHOOK_URL` o `N8N_WEBHOOK_SECRET`, el aviso está apagado (así
funcionan local, CI y los previews sin configurar).

## Contrato del aviso

`POST <N8N_WEBHOOK_URL>` con estas cabeceras:

| Cabecera | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `X-AlToque-Evento` | `pago_confirmado` |
| `X-AlToque-Timestamp` | Hora del envío en segundos Unix |
| `X-AlToque-Firma` | `sha256=` + HMAC-SHA256 en hex de `"<timestamp>.<cuerpo>"` con el secreto compartido |

Cuerpo (ejemplo con datos ficticios):

```json
{
  "evento": "pago_confirmado",
  "version": 1,
  "id": "id-del-pago",
  "restaurante": { "id": "uuid", "nombre": "Cevichería Demo" },
  "cuenta": { "tipo": "MESA", "id": "uuid-de-la-sesion", "mesa": 3, "pedido": null },
  "pago": { "metodo": "CASH", "canal": "CAJA", "monto": "62.50", "moneda": "PEN", "confirmado_en": "2026-11-11T15:30:00.000Z" },
  "platos": [
    { "nombre": "Ceviche clásico", "cantidad": 2, "precio_unitario": "31.25", "subtotal": "62.50" }
  ]
}
```

- `cuenta.tipo`: `MESA` (con `mesa`) o `PARA_LLEVAR` (con `pedido` = número de pedido).
- `pago.metodo`: `CASH`, `YAPE` o `CARD`; `pago.canal`: `CAJA` u `ONLINE` (Stripe).
- `platos`: todos los pedidos no cancelados de la cuenta, con platos iguales sumados.
  Es el detalle de la cuenta, no del pago: en un pago parcial, `monto` es lo pagado.
- Montos como texto con 2 decimales, en soles.
- **No** incluye teléfono ni nombre del cliente, observaciones de los platos,
  referencias de voucher/Yape, datos de Stripe ni claves.

`id` es el id del pago: un reintento de caja puede generar el mismo aviso dos
veces y n8n lo marca como `duplicado`.

## Verificación en n8n

El flujo [aviso-pago-confirmado.json](../../infra/n8n/flujos/aviso-pago-confirmado.json):

1. **Webhook** `POST /webhook/altoque-pago-confirmado`.
2. **Secreto compartido**: se escribe en el editor (la plantilla va vacía).
3. **Verificar firma** (nodo Code): rechaza si la hora tiene más de 5 minutos de
   diferencia, si falta la firma, si el contenido no es un `pago_confirmado` o si la
   firma no coincide (comparación en tiempo constante). Recuerda los últimos 500
   ids para marcar repetidos. Sin secreto configurado, el nodo falla y no acepta nada.
4. Válido → **200** `{ "ok": true, "duplicado": false }` y sigue al nodo donde se
   conectarán US-088/US-089. Inválido → **401** `{ "ok": false }`.

`docker-compose.yml` habilita solo el módulo `crypto` para el nodo Code
(`NODE_FUNCTION_ALLOW_BUILTIN=crypto`); el acceso a variables de entorno sigue
bloqueado. `nginx.conf` publica por el túnel solo esta ruta y la de US-071.

## Configurar

1. Generar un secreto de 32+ caracteres sin mostrarlo en pantalla, por ejemplo:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | clip`
   (queda en el portapapeles). No pegarlo en chats ni commits.
2. **n8n** (editor local `http://localhost:5678`): después de `git pull`, recrear n8n
   y el filtro para tomar los cambios: `docker compose --profile tunel up -d`.
   Import from File → `infra/n8n/flujos/aviso-pago-confirmado.json`, pegar el secreto
   en **Secreto compartido**, guardar y **publicar**.
3. **AlToque**: en `.env.local` (local) o en Vercel (Settings → Environment Variables,
   tipo Secret en el secreto):
   - `N8N_WEBHOOK_URL` = `https://<url-del-tunel>/webhook/altoque-pago-confirmado`
   - `N8N_WEBHOOK_SECRET` = el mismo secreto del paso 1.
   En Vercel, hacer Redeploy para que tomen efecto.
4. La URL del Quick Tunnel **cambia cada vez que se recrea**: actualizar
   `N8N_WEBHOOK_URL` en Vercel y volver a desplegar. La PC con Docker debe estar
   encendida; si no, los cobros siguen funcionando y solo falla el aviso.

## Probar

1. Con n8n publicado y las variables configuradas, registrar un pago en efectivo
   de prueba en caja (o pagar con Stripe `4242`).
2. En n8n → **Executions**: la ejecución pasa por **Aviso aceptado** y muestra el
   aviso sin teléfono ni claves.
3. Repetir la petición con una firma falsa (ver evidencia) → 401 y rama **Aviso rechazado**.

Pruebas automáticas: `tests/unit/aviso-n8n.test.ts` (firma, contenido, configuración,
fallas de red), `tests/unit/pagos-caja.test.ts` y `tests/unit/webhook-stripe.test.ts`
(qué pagos avisan).
