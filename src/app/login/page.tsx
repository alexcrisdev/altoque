import { Suspense } from "react";
import {
  Boton,
  EncabezadoPantalla,
  MensajeEstado,
  Tarjeta,
} from "@/components/ui";
import { iniciarSesion } from "@/features/auth/actions";
import { Marca } from "@/components/marca";
import Link from "next/link";

async function LoginForm({
  searchParams,
}: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main id="contenido-principal" className="mx-auto grid min-h-screen w-full max-w-6xl content-center items-center gap-8 px-5 py-8 sm:px-8 lg:grid-cols-2 lg:gap-24">
      <section className="lg:py-12">
        <Link href="/" aria-label="AlToque · Inicio" className="inline-flex rounded-lg"><Marca /></Link>
        <div className="mt-10 hidden lg:block">
          <p className="font-semibold text-exito-texto">Un equipo conectado.</p>
          <h2 className="mt-3 text-5xl font-bold leading-tight tracking-tight">Cada mesa cuenta.<br />Cada detalle también.</h2>
          <p className="mt-6 max-w-sm text-lg text-texto-suave">Coordina la sala, la cocina y los cobros para que cada pedido llegue a buen puerto.</p>
          <div className="mt-10 flex gap-3 text-sm font-medium text-texto-suave"><span>Sala</span><span aria-hidden="true">/</span><span>Cocina</span><span aria-hidden="true">/</span><span>Caja</span></div>
        </div>
      </section>
      <Tarjeta relleno="destacado" className="w-full">
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
        <p className="mt-6 border-t border-borde pt-5 text-sm text-texto-suave">¿Necesitas acceso? Solicita tu cuenta al administrador del restaurante.</p>
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
        <main id="contenido-principal" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
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
