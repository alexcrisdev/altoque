"use client";

import { Boton, MensajeEstado } from "../components/ui";

// Next.js entrega retry para volver a consultar el segmento que falló.
// No mostrar mensajes internos del servidor ni datos de la sesión.
export default function ErrorPantalla({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-lg space-y-4 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-texto">No pudimos cargar esta pantalla</h1>
      <MensajeEstado tipo="error" titulo="Ocurrió un problema al cargar los datos."
        descripcion="Revisa tu conexión y vuelve a intentarlo. Si el problema continúa, pide ayuda al personal." />
      <Boton type="button" tamano="lg" className="w-full" onClick={retry}>Reintentar</Boton>
    </main>
  );
}
