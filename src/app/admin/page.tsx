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

async function AdminPanel() {
  await requerirRol(["OWNER", "ADMIN"]);
  // US-099: panel en vivo + «Prepara mañana» (US-090) + actividad del día, en paralelo.
  const [resultado, prediccion, actividad] = await Promise.all([
    consultarPanelVivoAction(),
    consultarPrediccionMananaAction(),
    consultarActividadDiaAction(),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <EncabezadoPantalla
        titulo="Panel administrador"
        acciones={
          <form action={cerrarSesion}>
            <Boton type="submit" variante="secundario">
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
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-exito-texto motion-safe:animate-pulse" />
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

      <section aria-labelledby="actividad-titulo" className="space-y-3">
        <h2 id="actividad-titulo" className="text-xl font-bold">
          Actividad y tiempos
        </h2>
        <ActividadVista resultado={actividad} />
      </section>

      <nav aria-label="Administración">
        <ul className="grid gap-4 sm:grid-cols-2">
          <li>
            <Tarjeta>
              <BotonEnlace
                href="/admin/mesas"
                variante="secundario"
                className="w-full"
              >
                Mesas y códigos QR
              </BotonEnlace>
            </Tarjeta>
          </li>

          <li>
            <Tarjeta>
              <BotonEnlace
                href="/admin/productos"
                variante="secundario"
                className="w-full"
              >
                Administrar productos
              </BotonEnlace>
            </Tarjeta>
          </li>

          <li>
            <Tarjeta>
              <BotonEnlace
                href="/admin/stock"
                variante="secundario"
                className="w-full"
              >
                Registrar stock del día
              </BotonEnlace>
            </Tarjeta>
          </li>

          <li>
            <Tarjeta>
              <BotonEnlace
                href="/admin/para-llevar"
                variante="secundario"
                className="w-full"
              >
                Pedidos para llevar
              </BotonEnlace>
            </Tarjeta>
          </li>

          <li>
            <Tarjeta>
              <BotonEnlace
                href="/admin/pedidos"
                variante="secundario"
                className="w-full"
              >
                Pedidos
              </BotonEnlace>
            </Tarjeta>
          </li>

          <li>
            <Tarjeta>
              <BotonEnlace
                href="/admin/reportes"
                variante="secundario"
                className="w-full"
              >
                Reportes por fechas
              </BotonEnlace>
            </Tarjeta>
          </li>
        </ul>
      </nav>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
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
