import "server-only";

import { hashToken, tokenConFormatoValido } from "../acceso-qr/token";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esClavePedido } from "../pedidos/calificacion-logica";

export type EleccionCaja = {
  solicitado: boolean;
  disponible: boolean;
  numero: number;
  saldoCentimos: number;
  limitePago: string;
};

export type PedidoPagoCaja = {
  pedido_id: string;
  mesa_sesion_id: string | null;
  mesa_numero: number | null;
  numero: number;
  dia: string;
  solicitado_en: string;
  saldo_centimos: number;
};

function credenciales(token: unknown, clave: unknown) {
  if (typeof token !== "string" || !tokenConFormatoValido(token) || !esClavePedido(clave)) return null;
  return { p_token_hash: hashToken(token), p_clave: clave };
}

export async function leerEleccionCaja(token: string, clave: string): Promise<EleccionCaja | null> {
  const entrada = credenciales(token, clave);
  if (!entrada) return null;
  const { data, error } = await crearClienteAdmin().rpc("leer_pago_en_caja_cliente", entrada);
  if (error) throw new Error("No se pudo consultar la opción de pagar en caja.");
  return data as EleccionCaja | null;
}

export async function guardarEleccionCaja(token: unknown, clave: unknown, elegir: unknown) {
  const entrada = credenciales(token, clave);
  if (!entrada || typeof elegir !== "boolean") return { estado: null, codigo: "ORDER_NOT_FOUND" };
  const { data, error } = await crearClienteAdmin().rpc("elegir_pago_en_caja_cliente", { ...entrada, p_elegir: elegir });
  return { estado: data as EleccionCaja | null, codigo: error?.message ?? "" };
}

export async function listarPedidosPagoCaja(restauranteId: string, pedidoId?: string): Promise<PedidoPagoCaja[]> {
  const cliente = await crearClienteServidor();
  const { data, error } = await cliente.rpc("listar_pedidos_pago_en_caja", {
    p_restaurante: restauranteId, ...(pedidoId ? { p_pedido: pedidoId } : {}),
  });
  // El flujo actual de caja sigue disponible antes de aplicar la migración.
  if (error?.code === "PGRST202") return [];
  if (error || !Array.isArray(data)) throw new Error("No se pudieron cargar los pedidos que pagan en caja.");
  return data as PedidoPagoCaja[];
}
