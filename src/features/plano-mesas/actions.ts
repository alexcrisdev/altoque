"use server";

import { refresh } from "next/cache";
import { requerirRol } from "@/features/auth/sesion";
import { listarLocales, listarMesas } from "@/features/acceso-qr/mesas";
import { estadoQrAdmin } from "@/features/acceso-qr/imagen-qr";
import { listarMostradores } from "@/features/acceso-qr/mostrador";
import { listarMesasConSesion } from "@/features/mesero/sesiones";
import { listarCuentasAbiertas } from "@/features/pago-cierre/cuentas";
import { requerirCaja } from "@/features/pago-cierre/acceso-caja";
import { guardarPlanoMesas, listarMesasDelPlano, type ResultadoPlano } from "./mesas-del-plano";
import { prepararPlano } from "./preparar-plano";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAJES: Record<Exclude<ResultadoPlano, "OK">, string> = {
  CAMBIADO: "Otra persona cambió el plano o agregó una mesa. Cancela y vuelve a intentarlo.",
  SIN_PERMISO: "Solo el dueño o el administrador pueden editar el plano.",
  INVALIDO: "La distribución no es válida. Cancela y vuelve a intentarlo.",
  ERROR: "No se pudo guardar el plano. Tus cambios siguen en edición.",
};

export async function obtenerSalonesCaja() {
  return listarMesasDelPlano(await requerirCaja());
}

export async function guardarPlanoMesasAction(
  localId: string,
  posiciones: Record<string, number>,
  base: Record<string, number>,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  await requerirRol(["OWNER", "ADMIN"]);
  if (!UUID.test(localId)) return { ok: false, mensaje: MENSAJES.INVALIDO };
  const resultado = await guardarPlanoMesas(localId, posiciones, base);
  if (resultado !== "OK") return { ok: false, mensaje: MENSAJES[resultado] };
  refresh();
  return { ok: true };
}

export async function obtenerPanelMesasAdmin(conPlano: boolean) {
  const sesion = await requerirRol(["OWNER", "ADMIN"]);
  const restauranteId = sesion.membresias.find(m => m.rol === "OWNER" || m.rol === "ADMIN")!.restaurantId;
  const [mesasBase, locales, mostradoresBase, plano] = await Promise.all([
    listarMesas(restauranteId), listarLocales(restauranteId), listarMostradores(restauranteId),
    conPlano ? Promise.all([
      listarMesasDelPlano(restauranteId), listarMesasConSesion(restauranteId), listarCuentasAbiertas(restauranteId),
    ]).then(([mesas, sesiones, cuentas]) => prepararPlano(mesas, sesiones, cuentas)) : [],
  ]);
  const [mesas, mostradores] = await Promise.all([
    Promise.all(mesasBase.map(async ({ qrActivo, ...mesa }) => ({ ...mesa, qr: await estadoQrAdmin(qrActivo) }))),
    Promise.all(mostradoresBase.map(async ({ qrActivo, ...mostrador }) => ({ ...mostrador, qr: await estadoQrAdmin(qrActivo) }))),
  ]);
  return { restauranteId, locales, mesas, mostradores, plano };
}
