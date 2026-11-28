import "server-only";
import { crearClienteAdmin } from "../../../lib/supabase/admin";
import { embeberTextos } from "./embeber";
import {
  COMENTARIOS_POR_VEZ, limpiarComentario, MAX_TEXTOS_EMBEBER, vectorATexto,
  type FragmentoEncontrado, type FuenteIA,
} from "./reglas";

// US-153: única capa que toca la tabla ai_fragments (con funciones fijas de la base, nunca SQL
// armado por la IA). El texto que se guarda ya va limpio: sin correos, teléfonos ni nombres.

type ComentarioPendiente = {
  rating_id: string;
  comentario: string;
  service_stars: number;
  waiter_stars: number;
  fecha: string;
  nombres: string[] | null;
};

/**
 * Indexa los comentarios del restaurante que aún no tienen fragmento (máximo 50 por vez).
 * Así los comentarios nuevos entran solos antes de cada búsqueda, sin proceso nocturno.
 * Devuelve cuántos guardó. Lanza si la base o los vectores fallan (quien llama decide).
 */
export async function indexarComentariosPendientes(restauranteId: string): Promise<number> {
  const supabase = crearClienteAdmin();
  const { data, error } = await supabase.rpc("comentarios_sin_indexar_ia", {
    p_restaurante: restauranteId, p_limite: COMENTARIOS_POR_VEZ,
  });
  if (error) throw new Error("No se pudieron leer los comentarios pendientes.");
  const pendientes = ((data ?? []) as ComentarioPendiente[])
    .map((c) => ({ ...c, limpio: limpiarComentario(c.comentario, c.nombres ?? []) }))
    .filter((c): c is ComentarioPendiente & { limpio: string } => c.limpio !== null);

  let guardados = 0;
  for (let i = 0; i < pendientes.length; i += MAX_TEXTOS_EMBEBER) {
    const lote = pendientes.slice(i, i + MAX_TEXTOS_EMBEBER);
    const vectores = await embeberTextos(lote.map((c) => c.limpio));
    if (!vectores) throw new Error("No se pudieron calcular los vectores.");
    const fragmentos = lote.map((c, j) => ({
      restaurant_id: restauranteId,
      source: "REVIEW",
      source_id: c.rating_id,
      content: c.limpio,
      service_stars: c.service_stars,
      waiter_stars: c.waiter_stars,
      source_date: c.fecha,
      embedding: vectorATexto(vectores[j]),
    }));
    const resultado = await supabase.rpc("guardar_fragmentos_ia", { p_fragmentos: fragmentos });
    if (resultado.error) throw new Error("No se pudieron guardar los fragmentos.");
    guardados += lote.length;
  }
  return guardados;
}

/** Los fragmentos más parecidos a la pregunta (las opiniones, solo de ese restaurante). */
export async function buscarFragmentos(
  restauranteId: string,
  fuente: FuenteIA,
  vector: readonly number[],
  cantidad: number,
  similitudMinima: number,
): Promise<FragmentoEncontrado[]> {
  const { data, error } = await crearClienteAdmin().rpc("buscar_fragmentos_ia", {
    p_restaurante: restauranteId,
    p_fuente: fuente,
    p_embedding: vectorATexto(vector),
    p_cantidad: cantidad,
    p_similitud_minima: similitudMinima,
  });
  if (error) throw new Error("No se pudo buscar en la base vectorial.");
  return ((data ?? []) as FragmentoEncontrado[]).map((f) => ({ ...f, similitud: Number(f.similitud) }));
}
