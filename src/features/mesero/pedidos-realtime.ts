"use client";

import { crearClienteNavegador } from "@/lib/supabase/client";
import type { EstadoPedido } from "../pedidos/estados";
import type { Modalidad } from "../pedidos/modalidad";
import type { PedidoActivo } from "./pedidos-activos";

type FilaPedidoRealtime = {
  id: string;
  restaurant_id: string;
  order_number: number;
  status: EstadoPedido;
  ready_at: string | null;
  modality: Modalidad;
  dining_table_id: string | null;
  customer_name: string | null;
};

export type EstadoCanalPedidos = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

export function suscribirPedidosRestaurante(
  restauranteId: string,
  obtenerNumeroMesa: (mesaId: string) => number | null,
  alCambiar: (pedido: PedidoActivo) => void,
  alCambiarEstado: (estado: EstadoCanalPedidos) => void,
): () => void {
  const supabase = crearClienteNavegador();
  const canal = supabase.channel(`mesero-pedidos:${restauranteId}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "orders",
      filter: `restaurant_id=eq.${restauranteId}`,
    }, (cambio) => {
      const fila = cambio.new as FilaPedidoRealtime;
      if (!fila.id || fila.restaurant_id !== restauranteId) return;
      alCambiar({
        id: fila.id,
        numero: Number(fila.order_number),
        creadoEn: "",
        estado: fila.status,
        listoEn: fila.ready_at,
        modalidad: fila.modality,
        mesaId: fila.dining_table_id,
        mesaNumero: fila.dining_table_id ? obtenerNumeroMesa(fila.dining_table_id) : null,
        nombreCliente: fila.customer_name,
        asistido: false,
      });
    })
    .subscribe((estado) => {
      if (estado === "SUBSCRIBED" || estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
        alCambiarEstado(estado);
      }
    });

  return () => { void supabase.removeChannel(canal); };
}
