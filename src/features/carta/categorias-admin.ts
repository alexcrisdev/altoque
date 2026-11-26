// US-148: tarjetas de categoría en "Administrar productos" (lógica pura, sin Supabase).

// Catálogo estándar, en el orden que crea la migración 20261126210000_us148.
export const CATALOGO_CATEGORIAS = [
  { nombre: "Entradas", imagen: "entradas" },
  { nombre: "Sopas y caldos", imagen: "sopas-y-caldos" },
  { nombre: "Ensaladas", imagen: "ensaladas" },
  { nombre: "Platos de fondo", imagen: "platos-de-fondo" },
  { nombre: "Guarniciones", imagen: "guarniciones" },
  { nombre: "Postres", imagen: "postres" },
  { nombre: "Menú infantil", imagen: "menu-infantil" },
  { nombre: "Bebidas sin alcohol", imagen: "bebidas-sin-alcohol" },
  { nombre: "Bebidas calientes", imagen: "bebidas-calientes" },
  { nombre: "Bebidas con alcohol", imagen: "bebidas-con-alcohol" },
] as const;

export function imagenCategoria(nombre: string): string {
  const estandar = CATALOGO_CATEGORIAS.find((categoria) => categoria.nombre === nombre);
  return `/categorias/${estandar?.imagen ?? "otras"}.svg`;
}

type CategoriaBase = { id: string; name: string; active: boolean };
type ProductoBase = { category_id: string; active: boolean; agotado: boolean };

export type TarjetaCategoria<C extends CategoriaBase> = C & {
  platos: number;
  agotados: number;
  resumen: string;
  imagen: string;
};

export function textoConteo(platos: number, agotados: number): string {
  const texto = `${platos} ${platos === 1 ? "plato" : "platos"}`;
  return agotados ? `${texto} · ${agotados} ${agotados === 1 ? "agotado" : "agotados"}` : texto;
}

// Cuenta solo los platos activos en la carta; "agotado" es lo mismo que el candado de la carta
// (marcado agotado o sin stock hoy). Una categoría inactiva sin platos no se muestra.
export function tarjetasCategorias<C extends CategoriaBase>(
  categorias: readonly C[],
  productos: readonly ProductoBase[],
): TarjetaCategoria<C>[] {
  return categorias.flatMap((categoria) => {
    const propios = productos.filter((producto) => producto.category_id === categoria.id);
    if (!categoria.active && !propios.length) return [];
    const activos = propios.filter((producto) => producto.active);
    const agotados = activos.filter((producto) => producto.agotado).length;
    return [{
      ...categoria,
      platos: activos.length,
      agotados,
      resumen: textoConteo(activos.length, agotados),
      imagen: imagenCategoria(categoria.name),
    }];
  });
}

// El selector solo ofrece categorías activas (vienen en orden del catálogo). Al editar, también
// la categoría actual del plato aunque esté inactiva, para que guardar no lo mueva sin querer.
export function categoriasParaFormulario<C extends CategoriaBase>(
  categorias: readonly C[],
  categoriaActual?: string,
): C[] {
  return categorias.filter((categoria) => categoria.active || categoria.id === categoriaActual);
}
