import { ejecutarSugerenciaStock } from "../../../../features/dashboard/sugerencia-stock";

// US-146: la llama .github/workflows/ventas-diarias.yml después de consolidar las ventas,
// con "Authorization: Bearer <VENTAS_CRON_SECRET>". No está en el matcher de proxy.ts.
export async function POST(request: Request) {
  const resultado = await ejecutarSugerenciaStock(request.headers.get("authorization"));
  return Response.json(resultado.cuerpo, { status: resultado.estado, headers: { "Cache-Control": "no-store" } });
}
