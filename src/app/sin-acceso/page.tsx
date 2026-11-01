import {
  BotonEnlace,
  EncabezadoPantalla,
  Tarjeta,
} from "@/components/ui";

export default function SinAccesoPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
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
