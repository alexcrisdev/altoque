import { obtenerSesion } from "../../../../../features/auth/sesion";
import { obtenerFilasVentasCsv } from "../../../../../features/dashboard/ventas-csv";
import { crearCsvVentas, fechaNombreCsv } from "../../../../../features/dashboard/ventas-csv-logica";
import { validarRango } from "../../../../../features/dashboard/ventas-logica";

export async function GET(request: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("Inicia sesión para descargar el reporte.", { status: 401 });
  const membresia = sesion.membresias.find((m) => m.rol === "OWNER");
  if (!membresia) return new Response("No tienes permiso para descargar este reporte.", { status: 403 });

  const parametros = new URL(request.url).searchParams;
  const valores = (nombre: string) => parametros.getAll(nombre);
  const desdeValores = valores("desde");
  const hastaValores = valores("hasta");
  const desde = desdeValores.length === 1 ? desdeValores[0] : "";
  const hasta = hastaValores.length === 1 ? hastaValores[0] : "";
  if (validarRango(desde, hasta)) {
    return new Response("Selecciona un rango de fechas válido.", { status: 400 });
  }

  try {
    const filas = await obtenerFilasVentasCsv(membresia.restaurantId, desde, hasta);
    if (filas.length === 0) {
      return new Response("No hay ventas confirmadas para las fechas seleccionadas.", {
        status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    const contenido = crearCsvVentas(filas);
    return new Response(contenido, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="altoque-ventas-${fechaNombreCsv(new Date())}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("No se pudo consultar el reporte. Intenta de nuevo.", {
      status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
