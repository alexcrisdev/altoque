import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ENCABEZADO_RUTA } from "./features/auth/registro-accesos-logica";

// US-106 (Fase C): pasa la ruta (sin parámetros) al servidor para registrar accesos
// denegados. Se reemplaza siempre: el navegador no puede imponer su propio valor.
function continuar(request: NextRequest) {
  const encabezados = new Headers(request.headers);
  encabezados.set(ENCABEZADO_RUTA, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: encabezados } });
}

export async function proxy(request: NextRequest) {
  let response = continuar(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.redirect(new URL("/login", request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = continuar(request);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/mesero/:path*", "/cocina/:path*", "/caja/:path*"],
};
