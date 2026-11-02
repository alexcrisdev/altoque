import "server-only";

import { Suspense } from "react";
import { MensajeEstado } from "@/components/ui";
import { obtenerCarta } from "./carta";
import { agruparPorCategoria } from "./formato";
import {
  CartaInteractiva,
  type DatosPedidoCliente,
} from "./carta-interactiva";

type Props = {
  restauranteId: string;
  token: string;
  pedidosHabilitados: boolean;
  pedido: DatosPedidoCliente;
};

export function CartaRestaurante(props: Props) {
  return (
    <Suspense
      fallback={
        <MensajeEstado
          tipo="cargando"
          titulo="Cargando la carta..."
        />
      }
    >
      <ContenidoCarta {...props} />
    </Suspense>
  );
}

async function ContenidoCarta({
  restauranteId,
  token,
  pedidosHabilitados,
  pedido,
}: Props) {
  let carta;

  try {
    carta = await obtenerCarta(restauranteId);
  } catch {
    return (
      <MensajeEstado
        tipo="error"
        titulo="No pudimos cargar la carta."
        descripcion="Intenta de nuevo o pide ayuda al personal."
      />
    );
  }

  const categorias = agruparPorCategoria(
    carta.categorias,
    carta.productos,
  );

  if (!categorias.length) {
    return (
      <MensajeEstado
        tipo="vacio"
        titulo="Este restaurante aún no tiene productos en la carta."
      />
    );
  }

  return (
    <CartaInteractiva
      categorias={categorias}
      token={token}
      pedidosHabilitados={pedidosHabilitados}
      pedido={pedido}
      observacionesHabilitadas={true}
    />
  );
}
