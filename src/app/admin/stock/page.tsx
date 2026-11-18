import { Suspense } from "react";
import { EncabezadoPantalla, MensajeEstado } from "@/components/ui";
import { consultarStockConPrediccionAction } from "@/features/carta/stock-prediccion-actions";
import { FormularioStock } from "./formulario-stock";

export default function StockPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Suspense
        fallback={
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando stock del día…"
          />
        }
      >
        <ContenidoStock />
      </Suspense>
    </main>
  );
}

async function ContenidoStock() {
  const resultado = await consultarStockConPrediccionAction();

  if (!resultado.ok) {
    return (
      <MensajeEstado
        tipo="error"
        titulo="No pudimos mostrar el stock"
        descripcion={resultado.mensaje}
      />
    );
  }

  const { fecha, productos, sugerencias, avisoPrediccion } = resultado;
  const fechaLegible = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "long",
  }).format(new Date(`${fecha}T12:00:00-05:00`));

  return (
    <>
      <EncabezadoPantalla
        titulo="Stock del día"
        subtitulo={`Registra cuántas unidades de platos y bebidas puedes ofrecer hoy, ${fechaLegible}.`}
      />

      {avisoPrediccion && (
        <div className="mt-4" role="status">
          <p className="rounded-xl border border-borde bg-superficie p-4 text-sm text-texto">
            {avisoPrediccion}
          </p>
        </div>
      )}

      <FormularioStock
        key={JSON.stringify([fecha, productos])}
        fecha={fecha}
        productos={productos}
        sugerencias={sugerencias}
      />
    </>
  );
}
