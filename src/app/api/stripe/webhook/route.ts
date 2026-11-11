import { crearClienteStripe } from "../../../../features/pago-cierre/stripe";
import { procesarEventoStripe } from "../../../../features/pago-cierre/webhook-stripe";
import { programarAvisoPago } from "../../../../features/pago-cierre/aviso-n8n";

// US-076: Stripe avisa aquí cuando un pago se completa. Solo se acepta si la
// firma (cabecera stripe-signature) es válida con STRIPE_WEBHOOK_SECRET.
// Sin firma válida: 400 y no se toca la base.
export async function POST(request: Request): Promise<Response> {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto || !process.env.STRIPE_SECRET_KEY) {
    console.error("[stripe] faltan STRIPE_WEBHOOK_SECRET o STRIPE_SECRET_KEY");
    return Response.json({ error: "Webhook no configurado" }, { status: 500 });
  }

  const firma = request.headers.get("stripe-signature");
  if (!firma) return Response.json({ error: "Falta la firma" }, { status: 400 });

  // La firma se calcula sobre el cuerpo exacto: se lee como texto, sin parsear.
  const cuerpo = await request.text();
  let evento;
  try {
    evento = await crearClienteStripe().webhooks.constructEventAsync(cuerpo, firma, secreto);
  } catch {
    return Response.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    const respuesta = await procesarEventoStripe(evento);
    // US-086: avisa a n8n después de responder a Stripe (no retrasa el 200).
    if (respuesta.pagoNuevo) programarAvisoPago(respuesta.pagoNuevo);
    return Response.json({ recibido: true, detalle: respuesta.detalle }, { status: respuesta.estado });
  } catch {
    console.error(`[stripe] error procesando ${evento.id}`);
    return Response.json({ error: "Error temporal" }, { status: 500 });
  }
}
