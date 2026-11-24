import { Suspense } from "react";
import {
  Boton,
  BotonEnlace,
  EncabezadoPantalla,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";
import { ActualizacionAutomatica } from "@/components/actualizacion-automatica";
import { consultarPanelVivoAction } from "@/features/dashboard/panel-vivo-actions";
import { PanelVivoVista } from "@/features/dashboard/panel-vivo-vista";
import { consultarPrediccionMananaAction } from "@/features/dashboard/prediccion-actions";
import { TarjetaPrediccion } from "@/features/dashboard/tarjeta-prediccion";
import { consultarActividadDiaAction } from "@/features/dashboard/actividad-actions";
import { ActividadVista } from "@/features/dashboard/actividad-vista";

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
  // US-099: panel en vivo + «Prepara mañana» (US-090) + actividad del día, en paralelo.
  const [resultado, prediccion, actividad] = await Promise.all([
    consultarPanelVivoAction(),
    consultarPrediccionMananaAction(),
    consultarActividadDiaAction(),
  ]);

  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <EncabezadoPantalla
        titulo="Panel administrador"
        subtitulo="La jornada en vivo, la actividad y los próximos pasos de tu restaurante."
        acciones={
          <form action={cerrarSesion}>
            <Boton type="submit" variante="secundario" className="boton-cerrar-sesion">
              Cerrar sesión
            </Boton>
          </form>
        }
      />

      <section aria-labelledby="panel-vivo-titulo" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="panel-vivo-titulo" className="text-xl font-bold">
            Hoy en tu restaurante
          </h2>
          <span className="inline-flex items-center gap-2 rounded-full bg-exito-fondo px-3 py-1 text-sm font-semibold text-exito-texto">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-exito-texto" />
            En vivo
          </span>
        </div>
        <ActualizacionAutomatica segundos={20} />
        {resultado.ok ? (
          <PanelVivoVista panel={resultado.panel} />
        ) : (
          <MensajeEstado tipo="error" titulo={resultado.mensaje} />
        )}
      </section>

      <Tarjeta>
        <TarjetaPrediccion resultado={prediccion} />
      </Tarjeta>

      <details className="ayuda-discreta actividad-desplegable">
        <summary>Ver actividad y tiempos</summary>
        <section aria-labelledby="actividad-titulo" className="space-y-3">
        <h2 id="actividad-titulo" className="text-xl font-bold">
          Actividad y tiempos
        </h2>
        <ActividadVista resultado={actividad} />
        </section>
      </details>

      <nav className="admin-accesos" aria-label="Administración"><ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {secciones.map(({ href, titulo, texto, grupo }) => <li key={href}><Tarjeta relleno="amplio" className="flex h-full flex-col">
        <h2 className="text-base font-bold"><BotonEnlace href={href} variante="secundario" className="w-full justify-start text-left">{titulo}</BotonEnlace></h2>
        <details className="ayuda-discreta">
          <summary>{grupo} · Detalles</summary>
          <p className="pb-1 text-sm text-texto-suave">{texto}</p>
        </details>
      </Tarjeta></li>)}
    </ul></nav>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main id="contenido-principal" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando panel…"
          />
        </main>
      }
    >
      <AdminPanel />
    </Suspense>
  );
}
