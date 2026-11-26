import "server-only";
import { NavegacionPanel } from "@/components/navegacion-panel";
import { panelesDisponibles, type Panel } from "./permisos";
import { obtenerSesion } from "./sesion";

// US-106: la navegación del panel con los paneles propios de quien inició sesión.
// No bloquea el acceso (eso lo hace cada página con requerirPanel); si la sesión no
// se puede leer, muestra el menú sin selector de paneles.
export async function NavegacionDelPanel({ area }: { area: Panel }) {
  const sesion = await obtenerSesion().catch(() => null);
  const paneles = sesion ? panelesDisponibles(sesion.membresias.map((m) => m.rol)) : [];
  return <NavegacionPanel area={area} paneles={paneles} />;
}
