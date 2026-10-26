import type { Categoria, CategoriaConProductos, Producto } from "./tipos";

const moneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export function formatearPrecio(n: number): string {
  return moneda.format(n);
}

export function agruparPorCategoria(
  categorias: readonly Categoria[],
  productos: readonly Producto[],
): CategoriaConProductos[] {
  const grupos = new Map<string, Producto[]>();
  for (const producto of productos) {
    const grupo = grupos.get(producto.category_id) ?? [];
    grupo.push(producto);
    grupos.set(producto.category_id, grupo);
  }

  return categorias.flatMap((categoria) => {
    const productos = grupos.get(categoria.id) ?? [];
    return productos.length ? [{ ...categoria, productos }] : [];
  });
}
