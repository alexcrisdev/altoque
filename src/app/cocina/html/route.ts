import { NextResponse, type NextRequest } from "next/server";
import { obtenerPanelCocina } from "@/features/cocina/actions";
import { renderizarCocinaHtml } from "@/features/cocina/html";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const resultado = await obtenerPanelCocina();
  const contenido = renderizarCocinaHtml(resultado.ok ? resultado.pedidos : [], request.nextUrl.searchParams.get("estado"),
    resultado.ok ? resultado.actualizadoEn : new Date().toISOString(), !resultado.ok);
  return new Response(contenido, {
    status: resultado.ok ? 200 : 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

// Formulario nativo: cerrar sesión también debe funcionar sin JavaScript.
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new Response("Solicitud no permitida", { status: 403 });
  }
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signOut();
  if (error) return new Response("No se pudo cerrar la sesión. Intenta de nuevo.", { status: 503 });
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
