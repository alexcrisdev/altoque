import "server-only";
import { crearClienteAdmin } from "../../lib/supabase/admin";
import { registrarError } from "../../lib/registro";
import { autorizacionValida, LARGO_MINIMO_SECRETO, leerDias, rangoConsolidacion } from "./ventas-diarias-logica";

type Respuesta = { estado: number; cuerpo: Record<string, unknown> };

// US-145: la llama el workflow programado (GitHub Actions) cada madrugada. Recalcula
// los últimos días terminados de todos los restaurantes en daily_product_sales.
// Solo responde con conteos y fechas: nunca datos de pedidos ni de clientes.
export async function ejecutarConsolidacionVentas(
  autorizacion: string | null,
  diasPedidos: string | null,
  ahora = Date.now(),
): Promise<Respuesta> {
  const secreto = process.env.VENTAS_CRON_SECRET;
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO) {
    return { estado: 503, cuerpo: { error: "Consolidación no configurada" } };
  }
  if (!autorizacionValida(autorizacion, secreto)) return { estado: 401, cuerpo: { error: "No autorizado" } };
  const dias = leerDias(diasPedidos);
  if (dias === null) return { estado: 400, cuerpo: { error: "dias debe ser un entero entre 1 y 35" } };

  const { desde, hasta } = rangoConsolidacion(ahora, dias);
  try {
    const { data, error } = await crearClienteAdmin()
      .rpc("consolidar_ventas_diarias", { p_desde: desde, p_hasta: hasta });
    if (error) throw error;
    return { estado: 200, cuerpo: { desde, hasta, filasActualizadas: Number(data) } };
  } catch (error) {
    registrarError("US-145: consolidación de ventas pendiente", error);
    return { estado: 500, cuerpo: { error: "Consolidación pendiente de reintento" } };
  }
}
