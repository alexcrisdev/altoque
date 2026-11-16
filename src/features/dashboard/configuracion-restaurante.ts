import "server-only";

import { crearClienteServidor } from "../../lib/supabase/server";

export async function obtenerCobroAnticipado(restauranteId: string): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("restaurants")
    .select("prepay_dine_in")
    .eq("id", restauranteId)
    .maybeSingle()
    .overrideTypes<{ prepay_dine_in: boolean } | null, { merge: false }>();

  if (error || !data) {
    console.error("obtenerCobroAnticipado", error?.code);
    throw new Error("No se pudo consultar la configuración del restaurante.");
  }
  return data.prepay_dine_in;
}

export async function guardarCobroAnticipado(restauranteId: string, activo: boolean): Promise<void> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("restaurants")
    .update({ prepay_dine_in: activo })
    .eq("id", restauranteId)
    .select("id")
    .maybeSingle()
    .overrideTypes<{ id: string } | null, { merge: false }>();

  if (error || !data) {
    console.error("guardarCobroAnticipado", error?.code);
    throw new Error("No se pudo guardar la configuración del restaurante.");
  }
}
