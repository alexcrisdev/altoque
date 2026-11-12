"use server";

import { requerirCaja } from "./acceso-caja";
import { listarCuentasAbiertas } from "./cuentas";
import { listarMesasConSesion } from "../mesero/sesiones";

// Solo lectura. El restaurante procede del acceso autorizado, no del navegador.
export async function obtenerPanelCaja() {
  const restauranteId = await requerirCaja();
  const [cuentas, mesas] = await Promise.all([
    listarCuentasAbiertas(restauranteId),
    listarMesasConSesion(restauranteId),
  ]);
  return { cuentas, mesas };
}
