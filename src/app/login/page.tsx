import { Suspense } from "react";
import {
  Boton,
  EncabezadoPantalla,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { iniciarSesion } from "@/features/auth/actions";

async function LoginForm({
  searchParams,
}: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Tarjeta>
        <EncabezadoPantalla
          titulo="Iniciar sesión en AlToque"
          subtitulo="Acceso para el equipo del restaurante."
        />

        {error && (
          <MensajeEstado
            tipo="error"
            titulo="Correo o contraseña incorrectos."
          />
        )}

        <form
          action={iniciarSesion}
          className="mt-6 grid gap-4"
        >
          <label className="grid gap-2 text-sm font-medium">
            Correo

            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="min-h-11 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Contraseña

            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="min-h-11 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            />
          </label>

          <Boton
            type="submit"
            variante="primario"
            tamano="lg"
            className="w-full"
          >
            Entrar
          </Boton>
        </form>
      </Tarjeta>
    </main>
  );
}

export default function LoginPage(
  props: PageProps<"/login">,
) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
          <MensajeEstado
            tipo="cargando"
            titulo="Cargando…"
          />
        </main>
      }
    >
      <LoginForm {...props} />
    </Suspense>
  );
}
