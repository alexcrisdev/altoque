import { ejecutarLimpiezaCapturas } from "../../../../features/pago-cierre/limpieza-capturas";
export async function POST(request: Request) {
  const resultado = await ejecutarLimpiezaCapturas(request.headers.get("authorization"));
  return Response.json(resultado.cuerpo, { status: resultado.estado, headers: { "Cache-Control": "no-store" } });
}
