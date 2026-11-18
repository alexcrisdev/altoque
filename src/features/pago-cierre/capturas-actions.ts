"use server";
import { revalidatePath } from "next/cache";
import { obtenerSesion } from "../auth/sesion";
import { esUuid } from "../mesero/solicitud-asistida";
import { resolverCuentaOnline } from "./pago-online";
import { parsearSoles } from "./pago-logica";
import { MAX_CAPTURA, motivoRechazoCaptura, type ResultadoCaptura } from "./capturas-logica";
import { validarImagenCaptura } from "./validar-imagen-captura";
import { guardarCaptura, firmarCaptura, listarCapturas, limpiarCapturas, titularBilletera, totalBilleteraHoy, verificarCaptura } from "./capturas";
import { programarAvisoPago } from "./aviso-n8n";

export async function subirCapturaAction(token: unknown, clavePedido: unknown, formulario: FormData) {
  try {
    if (typeof token !== "string" || (clavePedido !== null && typeof clavePedido !== "string")) throw new Error("Cuenta no válida.");
    const clave = formulario.get("clave"), wallet = formulario.get("wallet"), huella = formulario.get("huella");
    const monto = parsearSoles(formulario.get("monto"));
    const imagen = formulario.get("imagen");
    if (!esUuid(clave) || (wallet !== "YAPE" && wallet !== "PLIN") || typeof huella !== "string" || !/^[a-f0-9]{64}$/.test(huella)
      || monto === null || monto <= 0 || !(imagen instanceof File) || imagen.size === 0 || imagen.size > MAX_CAPTURA) {
      return { ok: false as const, mensaje: "Revisa el monto y elige una imagen válida de hasta 400 KB." };
    }
    const cuenta = await resolverCuentaOnline(token, clavePedido);
    if (!cuenta || !(await titularBilletera(cuenta.restauranteId))) return { ok: false as const, mensaje: "Esta cuenta no ofrece pago con captura." };
    const bytes = new Uint8Array(await imagen.arrayBuffer());
    const segura = await validarImagenCaptura(bytes, imagen.type);
    await guardarCaptura(cuenta, { clave, wallet, monto, huella, imagen: segura, tipo: "image/jpeg" });
    revalidatePath("/caja"); revalidatePath("/mesero");
    return { ok: true as const, mensaje: "Captura enviada. Caja verificará el ingreso en su Yape/Plin; tu pago aún no está confirmado." };
  } catch (error) {
    return { ok: false as const, mensaje: error instanceof Error ? error.message : "No se pudo enviar la captura." };
  }
}
async function accesoCapturas(restauranteId: string, foto = true) {
  const sesion = await obtenerSesion();
  const roles = foto ? ["CASHIER", "OWNER", "ADMIN"] : ["CASHIER", "OWNER", "ADMIN", "WAITER"];
  if (!esUuid(restauranteId) || !sesion?.membresias.some(m => m.restaurantId === restauranteId && roles.includes(m.rol))) throw new Error("No tienes permiso para ver estas capturas.");
}
export async function consultarCapturasAction(restauranteId: string, mesero = false) {
  await accesoCapturas(restauranteId, !mesero);
  // Un fallo de limpieza no debe ocultar pagos por verificar.
  if (!mesero) await limpiarCapturas(restauranteId).catch(() => console.error("US-102: limpieza pendiente"));
  return listarCapturas(restauranteId);
}
export async function fotoCapturaAction(restauranteId: string, id: string) {
  await accesoCapturas(restauranteId);
  if (!esUuid(id)) return null;
  return firmarCaptura(restauranteId, id);
}
export async function verificarCapturaAction(restauranteId: string, id: string, resultado: ResultadoCaptura, monto: unknown, motivo: unknown = null) {
  try {
    await accesoCapturas(restauranteId);
    if (!esUuid(id) || !["COMPLETE", "OTHER", "NOT_RECEIVED"].includes(resultado)) throw new Error("Datos no válidos.");
    const centimos = resultado === "OTHER" ? parsearSoles(monto) : null;
    if (resultado === "OTHER" && (centimos === null || centimos <= 0)) throw new Error("Escribe el monto recibido.");
    const rechazo = resultado === "NOT_RECEIVED" ? motivoRechazoCaptura(motivo) : null;
    if (resultado === "NOT_RECEIVED" && !rechazo) throw new Error("Escribe un motivo de rechazo de 5 a 120 caracteres.");
    // RLS y el RPC vuelven a comprobar el restaurante real del comprobante.
    const disponibles = await listarCapturas(restauranteId);
    if (!disponibles.some(c => c.id === id)) throw new Error("La captura ya fue verificada o no pertenece a este restaurante.");
    const pago = await verificarCaptura(id, resultado, centimos, rechazo);
    if (resultado !== "NOT_RECEIVED") programarAvisoPago(pago);
    revalidatePath("/caja", "layout"); revalidatePath("/mesero");
    return { ok: true as const, mensaje: "Verificación registrada." };
  } catch (error) {
    return { ok: false as const, mensaje: error instanceof Error ? error.message : "No se pudo verificar." };
  }
}
export async function totalBilleteraAction(restauranteId: string) {
  await accesoCapturas(restauranteId, false);
  return totalBilleteraHoy(restauranteId);
}
