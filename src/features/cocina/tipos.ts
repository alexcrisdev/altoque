import type { EstadoPedido } from "@/features/pedidos/estados";
import type { Modalidad } from "@/features/pedidos/modalidad";

export type PedidoCocina = {
  id: string;
  numero: number;
  creadoEn: string;
  estado: EstadoPedido;
  modalidad: Modalidad;
  asistido: boolean;
  mesaNumero: number | null;
  nombreCliente: string | null;
  telefono: string | null;
  items: { nombre: string; cantidad: number; observacion: string | null }[];
};
