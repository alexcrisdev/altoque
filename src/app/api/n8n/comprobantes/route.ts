import { recibirSolicitudComprobante } from "../../../../features/pago-cierre/comprobante-actions";

export async function POST(request: Request) {
  return recibirSolicitudComprobante(request);
}
