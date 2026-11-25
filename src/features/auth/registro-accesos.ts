// Solo servidor: usa next/headers (no puede llegar al navegador).
import { headers } from "next/headers";
import { ENCABEZADO_RUTA, entradaAccesoDenegado } from "./registro-accesos-logica";

// US-106 (Fase C): deja en los logs del servidor (Vercel) cada acceso denegado por rol.
// Solo ruta, roles y hora: nunca quién era ni datos de la petición.
export async function registrarAccesoDenegado(roles: readonly string[]): Promise<void> {
  let ruta: string | null = null;
  try {
    ruta = (await headers()).get(ENCABEZADO_RUTA);
  } catch {
    // Fuera de una petición (por ejemplo en pruebas) no hay cabeceras: ruta desconocida.
  }
  console.warn(JSON.stringify(entradaAccesoDenegado(ruta, roles)));
}
