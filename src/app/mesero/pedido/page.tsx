import { Suspense } from "react";
import {
  BotonEnlace,
  EncabezadoPantalla,
  MensajeEstado,
} from "@/components/ui";
import { listarLocales } from "@/features/acceso-qr/mesas";
import { requerirPanel } from "@/features/auth/sesion";
import { obtenerCarta } from "@/features/carta/carta";
import { agruparPorCategoria } from "@/features/carta/formato";
import { listarMesasConSesion } from "@/features/mesero/sesiones";
import { FormularioPedidoAsistido } from "./formulario-pedido-asistido";

async function PedidoAsistido() {
  // US-106: solo el mesero registra pedidos asistidos.
  const { restauranteId } = await requerirPanel("mesero");

  const [carta, mesas, locales] = await Promise.all([
    obtenerCarta(restauranteId),
    listarMesasConSesion(restauranteId),
    listarLocales(restauranteId),
  ]);

  // Solo se ofrecen mesas con sesión abierta:
  // la base rechaza las demás.
  const mesasAbiertas = mesas
    .filter((mesa) => mesa.sesion !== null)
    .map((mesa) => ({
      id: mesa.id,
      numero: mesa.numero,
    }));

  return (
    <FormularioPedidoAsistido
      categorias={agruparPorCategoria(
        carta.categorias,
        carta.productos,
      )}
      mesas={mesasAbiertas}
      locales={locales}
    />
  );
}

export default function PedidoAsistidoPage() {
  return (
    <main id="contenido-principal" className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <BotonEnlace href="/mesero" variante="fantasma">
          ← Panel mesero
        </BotonEnlace>
      </div>

      <EncabezadoPantalla
        titulo="Pedido asistido"
        subtitulo="Para clientes sin celular o que prefieren que el mesero tome su pedido."
      />

      <Suspense
        fallback={
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando carta…"
          />
        }
      >
        <PedidoAsistido />
      </Suspense>
    </main>
  );
}
