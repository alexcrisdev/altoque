import { Suspense } from "react";
import { Boton, BotonEnlace, EncabezadoPantalla, MensajeEstado, Tarjeta } from "@/components/ui";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";

const secciones = [
  { href: "/admin/mesas", titulo: "Mesas y códigos QR", texto: "Organiza el salón y los accesos a la carta de cada mesa.", grupo: "Sala" },
  { href: "/admin/productos", titulo: "Administrar productos", texto: "Actualiza platos, precios, detalles y disponibilidad de la carta.", grupo: "Carta" },
  { href: "/admin/stock", titulo: "Registrar stock del día", texto: "Define las unidades disponibles para la jornada de hoy.", grupo: "Inventario" },
  { href: "/admin/para-llevar", titulo: "Pedidos para llevar", texto: "Configura la información solicitada al cliente del mostrador.", grupo: "Mostrador" },
  { href: "/admin/pedidos", titulo: "Pedidos", texto: "Consulta el historial y los detalles de cada pedido.", grupo: "Operación" },
  { href: "/admin/reportes", titulo: "Reportes de ventas", texto: "Revisa ventas, tendencias y tiempos para tomar decisiones.", grupo: "Análisis" },
] as const;

async function AdminPanel() {
  await requerirRol(["OWNER", "ADMIN"]);
  return <main id="contenido-principal" className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
    <EncabezadoPantalla titulo="Panel administrador" subtitulo="Todo lo que necesitas para preparar y gestionar la jornada."
      acciones={<form action={cerrarSesion}><Boton type="submit" variante="secundario">Cerrar sesión</Boton></form>} />
    <section className="mb-8 flex flex-col justify-between gap-6 rounded-2xl bg-marino p-6 text-white sm:flex-row sm:items-center sm:p-8">
      <div><p className="text-sm font-semibold text-acento">Tu restaurante, en perspectiva</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Decisiones claras para cada jornada.</h2><p className="mt-2 max-w-xl text-sm text-white/80">Consulta los resultados del negocio o prepara la carta y las mesas antes de atender.</p></div>
      <BotonEnlace href="/admin/reportes" variante="secundario" className="shrink-0">Consultar reportes</BotonEnlace>
    </section>
    <nav aria-label="Administración"><ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {secciones.map(({ href, titulo, texto, grupo }) => <li key={href}><Tarjeta className="flex h-full flex-col p-6">
        <span className="mb-3 w-fit rounded-lg bg-marca-suave px-2.5 py-1 text-xs font-semibold text-marca">{grupo}</span>
        <h2 className="text-lg font-bold">{titulo}</h2><p className="mb-6 mt-2 flex-1 text-sm text-texto-suave">{texto}</p>
        <BotonEnlace href={href} variante="secundario" className="w-full">{titulo}</BotonEnlace>
      </Tarjeta></li>)}
    </ul></nav>
  </main>;
}
export default function AdminPage() {
  return <Suspense fallback={<main id="contenido-principal" className="mx-auto w-full max-w-7xl p-6"><MensajeEstado tipo="cargando" titulo="Cargando panel…" /></main>}><AdminPanel /></Suspense>;
}
