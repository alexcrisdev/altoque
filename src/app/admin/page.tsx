import { Suspense } from "react";
import {
  Boton,
  BotonEnlace,
  EncabezadoPantalla,
  Insignia,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { cerrarSesion } from "@/features/auth/actions";
import { requerirRol } from "@/features/auth/sesion";
import {
  actualizarCobroAnticipadoAction,
  consultarCobroAnticipadoAction,
} from "@/features/dashboard/configuracion-actions";

async function AdminPanel() {
  await requerirRol(["OWNER", "ADMIN"]);
  const cobroAnticipado = await consultarCobroAnticipadoAction();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
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

      <Tarjeta className="my-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-texto">Cobro anticipado en mesa</h2>
          <p className="mt-1 text-sm text-texto-suave">
            Si está activo, los pedidos por QR esperan el pago completo de la mesa antes de entrar a cocina.
          </p>
          <Insignia tono={cobroAnticipado ? "exito" : "neutro"} className="mt-2">
            {cobroAnticipado ? "Activo" : "Apagado"}
          </Insignia>
        </div>
        <form action={actualizarCobroAnticipadoAction}>
          <input type="hidden" name="activo" value={String(!cobroAnticipado)} />
          <Boton type="submit" variante="secundario">
            {cobroAnticipado ? "Apagar" : "Activar"} cobro anticipado
          </Boton>
        </form>
      </Tarjeta>

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
                Reportes de ventas
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
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
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
