import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ConfigParaLlevar } from "./modalidad";

// Capa de datos de la configuración "para llevar" de cada restaurante.

type FilaConfig = { takeaway_requires_name: boolean; takeaway_requires_phone: boolean };

// Para el cliente del QR (anónimo): se lee en el servidor con el cliente admin
// y solo estas dos columnas. Ante cualquier duda se pide el nombre.
export async function obtenerConfigParaLlevar(restauranteId: string): Promise<ConfigParaLlevar> {
  const supabase = crearClienteAdmin();
  const { data, error } = await supabase
    .from("restaurants")
    .select("takeaway_requires_name, takeaway_requires_phone")
    .eq("id", restauranteId)
    .maybeSingle<FilaConfig>();

  if (error) {
    console.error("obtenerConfigParaLlevar", error.code);
    throw new Error("No se pudo cargar la configuración del restaurante.");
  }
  return {
    pideNombre: data?.takeaway_requires_name ?? true,
    pideTelefono: data?.takeaway_requires_phone ?? false,
  };
}

// Para el panel admin: usa la sesión del usuario, así RLS solo deja editar
// a OWNER o ADMIN de ese restaurante.
export async function guardarConfigParaLlevar(
  restauranteId: string,
  config: ConfigParaLlevar,
): Promise<boolean> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      takeaway_requires_name: config.pideNombre,
      takeaway_requires_phone: config.pideTelefono,
    })
    .eq("id", restauranteId)
    .select("id");

  if (error) console.error("guardarConfigParaLlevar", error.code);
  return !error && data.length === 1;
}
