"use server";

import { obtenerSesion } from "../../auth/sesion";
import { preguntarAClaude } from "../claude";
import { MENSAJE_LIMITE, esModoSimulado } from "../reglas";
import { INSTRUCCIONES_AUTOCOMPLETAR } from "./instrucciones";
import { buscarBebidaOpenFoodFacts } from "./open-food-facts";
import {
  ESQUEMA_AUTOCOMPLETAR, MENSAJE_NO_PUDE, MENSAJE_NOMBRE, NOMBRE_MAXIMO, NOMBRE_MINIMO,
  RESPUESTA_SIMULADA_PRODUCTO, mlDelNombre, pareceBebidaEnvasada, validarSugerencia, type Sugerencia,
} from "./reglas";

// US-156: «✨ Autocompletar» del formulario de productos. Solo SUGIERE: nada se guarda aquí.

export type ResultadoAutocompletar =
  | { ok: true; sugerencia: Sugerencia; simulada: boolean; openFoodFacts: boolean }
  | { ok: false; motivo: string; codigo?: "FORBIDDEN" | "NOMBRE_INVALIDO" };

const MAX_TOKENS_AUTOCOMPLETAR = 500;

export async function autocompletarProducto(nombre: string): Promise<ResultadoAutocompletar> {
  // Rol y restaurante salen de la SESIÓN. Sin OWNER o ADMIN no se llama a nadie.
  const sesion = await obtenerSesion();
  const membresia = sesion?.membresias.find((m) => m.rol === "OWNER") ?? sesion?.membresias.find((m) => m.rol === "ADMIN");
  if (!sesion || !membresia) return { ok: false, codigo: "FORBIDDEN", motivo: "Solo el dueño o el administrador pueden autocompletar productos." };

  const limpio = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ") : "";
  if (limpio.length < NOMBRE_MINIMO || limpio.length > NOMBRE_MAXIMO) return { ok: false, codigo: "NOMBRE_INVALIDO", motivo: MENSAJE_NOMBRE };

  // Paso 1: bebidas envasadas → Open Food Facts (gratis). En modo simulado no se sale a internet.
  const bebida = pareceBebidaEnvasada(limpio) && !esModoSimulado(process.env)
    ? await buscarBebidaOpenFoodFacts(limpio)
    : null;

  // Paso 2: Claude, con salida estructurada (JSON con el esquema).
  const datos = bebida
    ? `\nDatos de Open Food Facts: ${JSON.stringify({ nombre: bebida.nombre, ml: bebida.ml, porcentajeAlcohol: bebida.porcentajeAlcohol, alergenos: bebida.alergenos })}`
    : "";
  const respuesta = await preguntarAClaude({
    instrucciones: INSTRUCCIONES_AUTOCOMPLETAR,
    mensajes: [{ rol: "usuario", texto: `Producto: ${limpio}${datos}` }],
    maxTokens: MAX_TOKENS_AUTOCOMPLETAR,
    esfuerzo: "low",
    formato: { esquema: ESQUEMA_AUTOCOMPLETAR },
    respuestaSimulada: RESPUESTA_SIMULADA_PRODUCTO,
    uso: { restauranteId: membresia.restaurantId, usuarioId: sesion.usuario.id, funcion: "autocompletar-producto" },
  });

  let json: unknown = null;
  if (respuesta.ok) {
    try {
      json = JSON.parse(respuesta.texto);
    } catch {
      json = null; // se valida abajo: un JSON roto no llena nada
    }
  } else if (!bebida) {
    // El límite de uso se avisa tal cual; cualquier otra falla de la IA: llenarlo a mano.
    return { ok: false, motivo: respuesta.motivo === MENSAJE_LIMITE ? MENSAJE_LIMITE : MENSAJE_NO_PUDE };
  }

  // Siempre se valida en el servidor; si Claude falló, igual sirven los datos de Open Food Facts.
  const sugerencia = validarSugerencia(json, { bebida, mlNombre: mlDelNombre(limpio) });
  if (!sugerencia) return { ok: false, motivo: MENSAJE_NO_PUDE };
  return { ok: true, sugerencia, simulada: respuesta.ok && respuesta.simulada, openFoodFacts: bebida !== null };
}
