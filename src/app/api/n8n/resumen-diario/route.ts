import { timingSafeEqual } from "node:crypto";
import {
  fechaActualLima,
} from "../../../../features/carta/validar-stock";
import {
  fechaSiguienteResumen,
} from "../../../../features/dashboard/resumen-diario-logica";
import {
  obtenerResumenDiario,
  RestauranteResumenNoEncontrado,
} from "../../../../features/dashboard/resumen-diario";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responder(datos: unknown, status = 200) {
  return Response.json(datos, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Vary: "Authorization",
    },
  });
}

export async function GET(request: Request) {
  const secreto = process.env.RESUMEN_DIARIO_TOKEN;

  if (
    !secreto ||
    secreto.trim().length < 32 ||
    secreto !== secreto.trim()
  ) {
    return responder(
      { error: "El resumen diario no está configurado." },
      503,
    );
  }

  const cabecera =
    request.headers.get("authorization") ?? "";

  const token =
    /^Bearer ([^\s]+)$/i.exec(cabecera)?.[1] ?? "";

  const recibido = Buffer.from(token, "utf8");
  const esperado = Buffer.from(secreto, "utf8");

  if (
    recibido.length !== esperado.length ||
    !timingSafeEqual(recibido, esperado)
  ) {
    return responder({ error: "No autorizado." }, 401);
  }

  const parametros = new URL(request.url).searchParams;
  const restaurantes = parametros.getAll("restaurante");
  const fechas = parametros.getAll("fecha");

  if (
    restaurantes.length !== 1 ||
    !UUID.test(restaurantes[0]) ||
    fechas.length > 1
  ) {
    return responder(
      {
        error:
          "Indica un restaurante válido y una sola fecha.",
      },
      400,
    );
  }

  const fecha =
    fechas.length === 0
      ? fechaActualLima()
      : fechas[0];

  try {
    fechaSiguienteResumen(fecha);
  } catch {
    return responder(
      {
        error:
          "La fecha debe ser válida y tener formato AAAA-MM-DD.",
      },
      400,
    );
  }

  try {
    const resumen = await obtenerResumenDiario(
      restaurantes[0].toLowerCase(),
      fecha,
    );

    return responder(resumen);
  } catch (error) {
    if (error instanceof RestauranteResumenNoEncontrado) {
      return responder(
        { error: "El restaurante no existe." },
        404,
      );
    }

    return responder(
      {
        error:
          "No se pudo consultar el resumen diario. Intenta de nuevo.",
      },
      500,
    );
  }
}
