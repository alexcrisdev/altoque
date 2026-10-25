import { Suspense } from "react";
import { iniciarSesion } from "@/features/auth/actions";

async function LoginForm({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-bold">Iniciar sesión en AlToque</h1>
      <p className="mt-2 text-zinc-600">Acceso para el equipo del restaurante.</p>
      {error && <p role="alert" className="mt-4 text-red-700">Correo o contraseña incorrectos.</p>}
      <form action={iniciarSesion} className="mt-6 grid gap-4">
        <label className="grid gap-1">Correo<input name="email" type="email" autoComplete="username" required className="rounded border p-2" /></label>
        <label className="grid gap-1">Contraseña<input name="password" type="password" autoComplete="current-password" required className="rounded border p-2" /></label>
        <button className="rounded bg-teal-700 px-4 py-2 font-semibold text-white">Entrar</button>
      </form>
    </main>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return <Suspense fallback={<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">Cargando…</main>}><LoginForm {...props} /></Suspense>;
}
