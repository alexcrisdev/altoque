"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Marca } from "./marca";

const destinos = {
  admin: [["/admin", "Resumen"], ["/admin/mesas", "Mesas y QR"], ["/admin/productos", "Productos"], ["/admin/stock", "Stock del día"], ["/admin/para-llevar", "Para llevar"], ["/admin/pedidos", "Pedidos"], ["/admin/reportes", "Reportes"]],
  mesero: [["/mesero", "Mesas y pedidos"], ["/mesero/pedido", "Pedido asistido"]],
  caja: [["/caja", "Cuentas y mesas"]],
  cocina: [["/cocina", "Tablero de pedidos"]],
} as const;

export function NavegacionPanel({ area }: { area: keyof typeof destinos }) {
  const pathname = usePathname();
  const parametros = useSearchParams();
  // El modo TV conserva toda la pantalla para los pedidos.
  if (area === "cocina" && parametros.get("modo") === "tv") return null;
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
      <span className="hidden text-xs font-medium text-texto-suave xl:block">{area === "admin" ? "Gestión del restaurante" : area === "cocina" ? "Estación de cocina" : area === "mesero" ? "Atención en sala" : "Cobros y cierre"}</span>
    </div>
  </div>;
}
