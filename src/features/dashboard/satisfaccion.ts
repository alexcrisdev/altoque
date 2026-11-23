import "server-only";
import { crearClienteServidor } from "../../lib/supabase/server";
import { esPedidoDePrueba, obtenerIdsPedidosDePrueba } from "./pedidos-de-prueba";
import { rangoLimaAUtc } from "./ventas-logica";

// Contrato para US-099: promedio de calificaciones recibidas en el día de Lima.
// Usa sesión/RLS: solo OWNER/ADMIN pueden leer. Sin opiniones devuelve null,
// nunca cero estrellas. No expone comentarios ni datos de pedidos al dashboard.
export async function obtenerSatisfaccionDia(
  restauranteId: string, fecha: string, idsDePrueba?: ReadonlySet<string>,
): Promise<{
  cantidad: number; servicio: number | null; mesero: number | null;
}> {
  const { desdeUtc, hastaUtcExclusivo } = rangoLimaAUtc(fecha, fecha);
  if (!restauranteId.trim()) throw new Error("Restaurante inválido.");
  const db = await crearClienteServidor();
  const marcas = idsDePrueba ?? await obtenerIdsPedidosDePrueba(db, restauranteId);
  let posicion = 0;
  let cantidad = 0;
  let servicio = 0;
  let mesero = 0;
  while (true) {
    const { data, error } = await db.from("order_ratings").select("service_stars,waiter_stars,order_id")
      .eq("restaurant_id", restauranteId).gte("created_at", desdeUtc).lt("created_at", hastaUtcExclusivo)
      .order("id").range(posicion, posicion + 499);
    if (error || data === null) throw new Error("No se pudo consultar la satisfacción.");
    for (const fila of data) {
      if (esPedidoDePrueba(fila.order_id, marcas)) continue;
      servicio += fila.service_stars;
      mesero += fila.waiter_stars;
      cantidad++;
    }
    posicion += data.length;
    if (data.length < 500) break;
  }
  return { cantidad, servicio: cantidad ? servicio / cantidad : null, mesero: cantidad ? mesero / cantidad : null };
}
