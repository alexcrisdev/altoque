import { estaAgotado } from "../pedidos/carrito-logica";
import type { Producto } from "./tipos";

const comparador = new Intl.Collator("es-PE", { sensitivity: "base", numeric: true });

export function ordenarProductos(productos: readonly Producto[]): Producto[] {
  return [...productos].sort((a, b) =>
    Number(estaAgotado(a)) - Number(estaAgotado(b)) ||
    comparador.compare(a.name, b.name) || a.id.localeCompare(b.id),
  );
}
