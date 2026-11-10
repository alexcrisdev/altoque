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

async function AdminPanel() {
  await requerirRol(["OWNER", "ADMIN"]);

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
