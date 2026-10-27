import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type MesaConSesion = {
  id: string;
  numero: number;
  sesion: { id: string; abiertaDesde: string } | null;
};

type FilaMesa = { id: string; number: number };
type FilaSesion = { id: string; dining_table_id: string; opened_at: string };
type FilaSesionAbierta = { id: string; opened_at: string };

export type SesionAbiertaCliente = { id: string; abiertaDesde: string };

type ResultadoOperacion =
  | { ok: true }
  | { ok: false; motivo: "MESA_NO_DISPONIBLE" | "SESION_DUPLICADA" | "NO_ENCONTRADA" | "ERROR" };

// El cliente QR es anónimo, por eso esta consulta de solo lectura se resuelve
// en el servidor con el cliente admin y únicamente devuelve datos necesarios.
export async function buscarSesionAbierta(
  mesaId: string,
): Promise<SesionAbiertaCliente | null> {
  const supabase = crearClienteAdmin();
  const { data, error } = await supabase
    .from("table_sessions")
    .select("id, opened_at")
    .eq("dining_table_id", mesaId)
    .is("closed_at", null)
    .maybeSingle()
    .overrideTypes<FilaSesionAbierta | null, { merge: false }>();

  if (error) {
    console.error("buscarSesionAbierta", error.code);
    throw new Error("No se pudo verificar si la mesa tiene una sesión abierta");
  }

  return data ? { id: data.id, abiertaDesde: data.opened_at } : null;
}

export async function listarMesasConSesion(restauranteId: string): Promise<MesaConSesion[]> {
  const supabase = await crearClienteServidor();
  const { data: filasMesas, error: errorMesas } = await supabase
    .from("dining_tables")
    .select("id, number")
    .eq("restaurant_id", restauranteId)
    .eq("active", true)
    .order("number")
    .overrideTypes<FilaMesa[], { merge: false }>();

  if (errorMesas) {
    console.error("listarMesasConSesion", errorMesas.code);
    throw new Error("No se pudieron cargar las mesas");
  }

  if (filasMesas.length === 0) return [];

  const idsMesas = filasMesas.map((mesa) => mesa.id);
  const { data: filasSesiones, error: errorSesiones } = await supabase
    .from("table_sessions")
    .select("id, dining_table_id, opened_at")
    .eq("restaurant_id", restauranteId)
    .in("dining_table_id", idsMesas)
    .is("closed_at", null)
    .overrideTypes<FilaSesion[], { merge: false }>();

  if (errorSesiones) {
    console.error("listarMesasConSesion", errorSesiones.code);
    throw new Error("No se pudieron cargar las sesiones de mesa");
  }

  const sesionesPorMesa = new Map(
    filasSesiones.map((sesion) => [sesion.dining_table_id, sesion]),
  );

  return filasMesas.map((mesa) => {
    const sesion = sesionesPorMesa.get(mesa.id);
    return {
      id: mesa.id,
      numero: mesa.number,
      sesion: sesion ? { id: sesion.id, abiertaDesde: sesion.opened_at } : null,
    };
  });
}

export async function abrirSesion(
  restauranteId: string,
  mesaId: string,
  usuarioId: string,
): Promise<ResultadoOperacion> {
  const supabase = await crearClienteServidor();
  const { data: mesa, error: errorMesa } = await supabase
    .from("dining_tables")
    .select("branch_id")
    .eq("id", mesaId)
    .eq("restaurant_id", restauranteId)
    .eq("active", true)
    .maybeSingle()
    .overrideTypes<{ branch_id: string } | null, { merge: false }>();

  if (errorMesa) {
    console.error("abrirSesion", errorMesa.code);
    return { ok: false, motivo: "ERROR" };
  }
  if (!mesa) return { ok: false, motivo: "MESA_NO_DISPONIBLE" };

  const { error } = await supabase.from("table_sessions").insert({
    restaurant_id: restauranteId,
    branch_id: mesa.branch_id,
    dining_table_id: mesaId,
    opened_by: usuarioId,
  });

  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, motivo: "SESION_DUPLICADA" };
  if (error.code === "23514") return { ok: false, motivo: "MESA_NO_DISPONIBLE" };
  console.error("abrirSesion", error.code);
  return { ok: false, motivo: "ERROR" };
}

export async function cerrarSesion(
  restauranteId: string,
  sesionId: string,
  usuarioId: string,
): Promise<ResultadoOperacion> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("table_sessions")
    .update({ closed_at: new Date().toISOString(), closed_by: usuarioId })
    .eq("id", sesionId)
    .eq("restaurant_id", restauranteId)
    .is("closed_at", null)
    .select("id");

  if (error) {
    console.error("cerrarSesion", error.code);
    return { ok: false, motivo: "ERROR" };
  }
  if (data.length === 0) return { ok: false, motivo: "NO_ENCONTRADA" };
  return { ok: true };
}
