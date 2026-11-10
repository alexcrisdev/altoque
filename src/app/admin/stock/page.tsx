import { Suspense } from "react";
import { EncabezadoPantalla } from "@/components/ui";
import { MensajeEstado } from "@/components/ui";
import { requerirRol } from "@/features/auth/sesion";
import { fechaActualLima } from "@/features/carta/validar-stock";
import { listarProductosConStock } from "@/features/carta/stock-diario";
import { FormularioStock } from "./formulario-stock";

export default function StockPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Suspense fallback={<MensajeEstado tipo="cargando" titulo="Cargando stock del día…" />}>
        <ContenidoStock />
      </Suspense>
    </main>
  );
}

async function ContenidoStock() {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!membresia) return null;

  const fecha = fechaActualLima();
  const productos = await listarProductosConStock(membresia.restaurantId, fecha);
  const fechaLegible = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "long",
  }).format(new Date(`${fecha}T12:00:00-05:00`));

  return (
    <>
      <EncabezadoPantalla titulo="Stock del día" subtitulo={`Registra cuántos platos puedes preparar hoy, ${fechaLegible}.`} />
      <FormularioStock productos={productos} />
    </>
  );
}
