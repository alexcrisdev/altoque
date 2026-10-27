import type { ResultadoRegistroPedido } from "@/features/pedidos/actions";

export function obtenerEstadoCarrito(
  cantidadLineas: number,
  resultado: ResultadoRegistroPedido | null,
) {
  const vacio = cantidadLineas === 0;
  const exitoso = resultado?.ok === true;
  return {
    mostrarConfirmacion: vacio && exitoso,
    mostrarVacio: vacio && !exitoso,
    mostrarFormulario: !vacio,
  };
}
