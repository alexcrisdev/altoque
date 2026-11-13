import type { EstadoPedido } from "@/features/pedidos/estados";
import type { Modalidad } from "@/features/pedidos/modalidad";
import type { TipoIncidencia } from "../pedidos/incidencias";

export type PedidoCocina = {
  id: string;
  numero: number;
  creadoEn: string;
  estado: EstadoPedido;
  listoEn?: string | null;
  modalidad: Modalidad;
  asistido: boolean;
  mesaNumero: number | null;
  nombreCliente: string | null;
  items: { nombre: string; cantidad: number; observacion: string | null; alergenos?: string[] }[];
  incidenciasAbiertas: { id: string; tipo: TipoIncidencia; descripcion: string; creadaEn: string }[];
};
