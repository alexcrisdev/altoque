import {
  BotonEnlace,
  EncabezadoPantalla,
  Tarjeta,
} from "@/components/ui";
import "../acceso.css";

export default function SinAccesoPage() {
  return (
    <main id="contenido-principal" className="acceso-denegado mx-auto flex min-h-dvh w-full max-w-lg flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Tarjeta>
        <EncabezadoPantalla
          titulo="Sin acceso"
          subtitulo="Tu cuenta no tiene permiso para abrir esta sección."
        />

        <BotonEnlace
          href="/login"
          variante="primario"
          className="w-full"
        >
          Volver al inicio de sesión
        </BotonEnlace>
      </Tarjeta>
    </main>
  );
}
