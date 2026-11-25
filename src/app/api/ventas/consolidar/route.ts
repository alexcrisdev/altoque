import { ejecutarConsolidacionVentas } from "../../../../features/dashboard/ventas-diarias";

// US-145: la llama .github/workflows/ventas-diarias.yml con "Authorization: Bearer <secreto>".
// No está en el matcher de proxy.ts: no se redirige al login.
export async function POST(request: Request) {
  const dias = new URL(request.url).searchParams.get("dias");
  const resultado = await ejecutarConsolidacionVentas(request.headers.get("authorization"), dias);
  return Response.json(resultado.cuerpo, { status: resultado.estado, headers: { "Cache-Control": "no-store" } });
}
