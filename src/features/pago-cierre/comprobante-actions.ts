"use server";

import { CABECERA_FIRMA, CABECERA_TIEMPO, verificarFirmaAviso } from "./aviso-n8n-logica";
import { leerResultadoComprobante } from "./comprobante-logica";
import { guardarResultadoComprobante } from "./comprobantes";

// No usa la sesión del navegador: la identidad de n8n se acredita por HMAC.
export async function recibirComprobanteAction(cuerpo: string, tiempo: string | null, firma: string | null): Promise<number> {
  const secreto = process.env.N8N_WEBHOOK_SECRET ?? "";
  if (!verificarFirmaAviso(cuerpo, secreto, tiempo, firma)) return 401;
  if (Buffer.byteLength(cuerpo, "utf8") > 16384) return 413;
  let entrada: unknown;
  try { entrada = JSON.parse(cuerpo); } catch { return 400; }
  const dato = leerResultadoComprobante(entrada);
  if (!dato) return 400;
  try {
    const resultado = await guardarResultadoComprobante(dato);
    return resultado === "ok" ? 200 : resultado === "conflicto" ? 409 : 503;
  } catch { return 503; }
}

export async function recibirSolicitudComprobante(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length")) > 16384) return Response.json({ ok: false }, { status: 413 });
  // Límite también para solicitudes sin Content-Length.
  const lector = request.body?.getReader();
  if (!lector) return Response.json({ ok: false }, { status: 400 });
  const partes: Uint8Array[] = [];
  let tamano = 0;
  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    tamano += value.length;
    if (tamano > 16384) { await lector.cancel(); return Response.json({ ok: false }, { status: 413 }); }
    partes.push(value);
  }
  const estado = await recibirComprobanteAction(Buffer.concat(partes).toString("utf8"), request.headers.get(CABECERA_TIEMPO), request.headers.get(CABECERA_FIRMA));
  return Response.json({ ok: estado === 200 }, { status: estado });
}
