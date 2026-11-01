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
import { formatearPrecio } from "@/features/carta/formato";
import { listarPedidosRecientes } from "@/features/mesero/pedidos-recientes";
import { listarMesasConSesion } from "@/features/mesero/sesiones";
import { describirDestino } from "@/features/pedidos/modalidad";
import {
  BotonAbrirSesion,
  BotonCerrarSesion,
} from "./acciones-sesion";

async function MeseroPanel() {
  const sesion = await requerirRol(["WAITER", "OWNER", "ADMIN"]);

  const membresia = sesion.membresias.find((m) =>
    ["WAITER", "OWNER", "ADMIN"].includes(m.rol),
  );

  if (!membresia) return null;

  const [mesas, pedidos] = await Promise.all([
    listarMesasConSesion(membresia.restaurantId),
    listarPedidosRecientes(membresia.restaurantId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <EncabezadoPantalla
        titulo="Panel mesero"
        acciones={
          <form action={cerrarSesion}>
            <Boton type="submit" variante="secundario">
              Cerrar sesión
            </Boton>
          </form>
        }
      />

      <BotonEnlace href="/mesero/pedido">
        Registrar pedido asistido
      </BotonEnlace>

      <section aria-labelledby="mesero-mesas" className="mt-8">
        <h2
          id="mesero-mesas"
          className="mb-4 text-xl font-semibold text-texto"
        >
          Mesas
        </h2>

        {mesas.length === 0 ? (
          <MensajeEstado
            tipo="vacio"
            titulo="No hay mesas activas en este restaurante."
          />
        ) : (
          <ul className="grid gap-3">
            {mesas.map((mesa) => {
              const ocupadaDesde = mesa.sesion
                ? new Date(
                    mesa.sesion.abiertaDesde,
                  ).toLocaleTimeString("es-PE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Lima",
                  })
                : null;

              return (
                <li key={mesa.id}>
                  <Tarjeta className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">
                        Mesa {mesa.numero}
                      </h3>

                      <Insignia
                        tono={ocupadaDesde ? "aviso" : "exito"}
                      >
                        {ocupadaDesde
                          ? `Ocupada desde ${ocupadaDesde}`
                          : "Libre"}
                      </Insignia>
                    </div>

                    {mesa.sesion ? (
                      <BotonCerrarSesion
                        sesionId={mesa.sesion.id}
                      />
                    ) : (
                      <BotonAbrirSesion mesaId={mesa.id} />
                    )}
                  </Tarjeta>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="mesero-pedidos"
        className="mt-8"
      >
        <h2
          id="mesero-pedidos"
          className="mb-4 text-xl font-semibold text-texto"
        >
          Pedidos recientes
        </h2>

        {pedidos.length === 0 ? (
          <MensajeEstado
            tipo="vacio"
            titulo="Todavía no hay pedidos."
          />
        ) : (
          <ul className="grid gap-3">
            {pedidos.map((pedido) => (
              <li key={pedido.numero}>
                <Tarjeta className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      N.º {pedido.numero}
                      {" · "}
                      {describirDestino(pedido)}
                    </h3>

                    <p className="mt-2 text-sm text-texto-suave">
                      {new Date(
                        pedido.creadoEn,
                      ).toLocaleTimeString("es-PE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/Lima",
                      })}
                      {" · "}
                      {pedido.modalidad === "TAKEAWAY"
                        ? "Para llevar"
                        : "En el local"}
                      {pedido.asistido
                        ? " · Registrado por mesero"
                        : " · Desde QR"}
                    </p>
                  </div>

                  <p className="font-semibold">
                    {formatearPrecio(pedido.totalCentimos / 100)}
                  </p>
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default function MeseroPage() {
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
      <MeseroPanel />
    </Suspense>
  );
}
