import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { esPedidoDePrueba, obtenerIdsPedidosDePrueba } from "./pedidos-de-prueba";
import { rangoLimaAUtc } from "./ventas-logica";

// Contrato para US-099: promedio de calificaciones recibidas en el día de Lima.
// Usa sesión/RLS: solo OWNER/ADMIN pueden leer. Sin opiniones devuelve null,
// nunca cero estrellas. No expone comentarios ni datos de pedidos al dashboard.
export async function obtenerSatisfaccionDia(
  restauranteId: string, fecha: string, idsDePrueba?: ReadonlySet<string>,
  corteUtc?: string,
): Promise<{
  cantidad: number; servicio: number | null; mesero: number | null;
}> {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(fecha, fecha);
  if (corteUtc !== undefined && (!Number.isFinite(Date.parse(corteUtc)) || Date.parse(corteUtc) < Date.parse(desdeUtc))) {
    throw new Error("Corte de satisfacción inválido.");
  }
  const fin = corteUtc && Date.parse(corteUtc) < Date.parse(hastaUtcExclusivo) ? corteUtc : hastaUtcExclusivo;
  if (!restauranteId.trim()) throw new Error("Restaurante inválido.");
  const db = await crearClienteServidor();
  const marcas = idsDePrueba ?? await obtenerIdsPedidosDePrueba(db, restauranteId);
  let posicion = 0;
  let cantidad = 0;
  let servicio = 0;
  let mesero = 0;
  while (true) {
    const { data, error } = await db.from("order_ratings").select("service_stars,waiter_stars,order_id")
      .eq("restaurant_id", restauranteId).gte("created_at", desdeUtc).lt("created_at", fin)
      .order("id").range(posicion, posicion + 499);
    if (error || data === null) throw new Error("No se pudo consultar la satisfacción.");
    const vigentes = new Set<string>();
    if (corteUtc !== undefined) {
      const ids = [...new Set(data.map((fila) => fila.order_id))].filter((id) => !esPedidoDePrueba(id, marcas));
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        const pedidos = await db.from("orders").select("id")
          .eq("restaurant_id", restauranteId).neq("status", "CANCELLED")
          .in("id", ids.slice(inicio, inicio + 100)).order("id").limit(100);
        if (pedidos.error || pedidos.data === null) throw new Error("No se pudieron verificar las opiniones.");
        for (const pedido of pedidos.data) vigentes.add(pedido.id);
      }
    }
    for (const fila of data) {
      if (esPedidoDePrueba(fila.order_id, marcas)) continue;
      if (corteUtc !== undefined && !vigentes.has(fila.order_id)) continue;
      servicio += fila.service_stars;
      mesero += fila.waiter_stars;
      cantidad++;
    }
    posicion += data.length;
    if (data.length < 500) break;
  }
  return { cantidad, servicio: cantidad ? servicio / cantidad : null, mesero: cantidad ? mesero / cantidad : null };
}
