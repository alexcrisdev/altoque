"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NOMBRE_PANEL, type Panel } from "@/features/auth/permisos";
import { Marca } from "./marca";

// US-106: cada panel muestra solo sus propios destinos.
const destinos: Record<Panel, readonly (readonly [string, string])[]> = {
  admin: [["/admin", "Resumen"], ["/admin/mesas", "Mesas y QR"], ["/admin/productos", "Productos"], ["/admin/stock", "Stock del día"], ["/admin/para-llevar", "Para llevar"], ["/admin/pedidos", "Pedidos"], ["/admin/cuentas", "Cuentas y pagos"], ["/admin/reportes", "Reportes"]],
  mesero: [["/mesero", "Mesas y pedidos"], ["/mesero/pedido", "Pedido asistido"]],
  caja: [["/caja", "Cuentas y mesas"]],
  cocina: [["/cocina", "Tablero de pedidos"]],
};

// `paneles`: los paneles a los que entra esta cuenta. Si cubre dos puestos, ve un
// selector solo con esos paneles; nunca enlaces a paneles ajenos.
export function NavegacionPanel({ area, paneles = [] }: { area: Panel; paneles?: readonly Panel[] }) {
  const pathname = usePathname();
  const parametros = useSearchParams();
  // El modo TV conserva toda la pantalla para los pedidos.
  if (area === "cocina" && parametros.get("modo") === "tv") return null;
  const otrosPaneles = paneles.filter((panel) => panel !== area);
  return <div className={`navegacion-panel navegacion-${area} ${area === "cocina" ? "navegacion-oscura" : ""}`}>
    <div className="navegacion-interior mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
      <Link href={`/${area}`} aria-label={`AlToque · ${area}`} className="shrink-0 rounded-lg"><Marca inversa={area === "cocina"} /></Link>
      <nav aria-label={`Navegación de ${area}`} className="min-w-0 flex-1 overflow-x-auto p-1">
        <ul className="flex w-max min-w-full gap-1">
          {destinos[area].map(([href, texto]) => {
            const activo = href === `/${area}`
              ? pathname === href || (area === "caja" && pathname.startsWith("/caja/")) || (area === "mesero" && pathname.startsWith("/mesero/pedidos/"))
              : pathname === href || pathname.startsWith(`${href}/`);
            return <li key={href}><Link href={href} aria-current={activo ? "page" : undefined}
              className="enlace-panel">{texto}</Link></li>;
          })}
        </ul>
      </nav>
      {otrosPaneles.length > 0 && <nav aria-label="Cambiar de panel" className="selector-paneles p-1">
        <ul className="flex flex-wrap gap-1">
          {otrosPaneles.map((panel) => <li key={panel}>
            <Link href={`/${panel}`} className="enlace-panel">Ir a {NOMBRE_PANEL[panel]}</Link>
          </li>)}
        </ul>
      </nav>}
      <span className="hidden text-xs font-medium text-texto-suave xl:block">{area === "admin" ? "Gestión del restaurante" : area === "cocina" ? "Estación de cocina" : area === "mesero" ? "Atención en sala" : "Cobros y cierre"}</span>
    </div>
  </div>;
}
