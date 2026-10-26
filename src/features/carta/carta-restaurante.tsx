import "server-only";
import { Suspense } from "react";
import { obtenerCarta } from "./carta";
import { agruparPorCategoria } from "./formato";
import { CartaInteractiva } from "./carta-interactiva";

export function CartaRestaurante({ restauranteId }: { restauranteId: string }) {
  return (
    <Suspense fallback={<p role="status" className="py-6">Cargando la carta...</p>}>
      <ContenidoCarta restauranteId={restauranteId} />
    </Suspense>
  );
}

async function ContenidoCarta({ restauranteId }: { restauranteId: string }) {
  let carta;
  try {
    carta = await obtenerCarta(restauranteId);
  } catch {
    return (
      <p role="alert" className="my-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
        No pudimos cargar la carta. Intenta de nuevo o pide ayuda al personal.
      </p>
    );
  }

  const categorias = agruparPorCategoria(carta.categorias, carta.productos);
  if (!categorias.length) {
    return <p className="py-6">Este restaurante aún no tiene productos en la carta.</p>;
  }

  return <CartaInteractiva categorias={categorias} />;
}
