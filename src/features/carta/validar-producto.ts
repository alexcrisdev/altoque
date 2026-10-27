export type EntradaProducto = {
  nombre: unknown;
  precio: unknown;
  categoriaId: unknown;
  descripcion: unknown;
  ingredientes: unknown;
  alergenos: unknown;
  imageUrl: unknown;
};

export type ProductoValidado = {
  name: string;
  price: number;
  categoryId: string;
  description: string | null;
  ingredients: string | null;
  allergens: string[];
  imageUrl: string | null;
};

export type CampoProducto = keyof EntradaProducto;
export type ResultadoValidacionProducto =
  | { ok: true; producto: ProductoValidado }
  | { ok: false; errores: Partial<Record<CampoProducto, string>> };

// Forma de UUID sin exigir versión: los IDs del seed no son v4 y Postgres valida el resto.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRECIO_SOLES = /^\d+(?:\.\d{1,2})?$/;
const PRECIO_MAXIMO = 99_999_999.99;

function textoOpcional(valor: unknown): string | null | undefined {
  if (typeof valor !== "string") return undefined;
  const texto = valor.trim();
  return texto || null;
}

export function validarProducto(entrada: EntradaProducto): ResultadoValidacionProducto {
  const errores: Partial<Record<CampoProducto, string>> = {};

  const nombre = typeof entrada.nombre === "string" ? entrada.nombre.trim() : "";
  if (!nombre) errores.nombre = "Escribe el nombre del producto.";
  else if (nombre.length > 80) errores.nombre = "El nombre no puede superar 80 caracteres.";

  const precioTexto = typeof entrada.precio === "string" ? entrada.precio.trim() : "";
  const precio = PRECIO_SOLES.test(precioTexto) ? Number(precioTexto) : Number.NaN;
  if (!Number.isFinite(precio) || precio <= 0 || precio > PRECIO_MAXIMO) {
    errores.precio = "Escribe un precio mayor que 0 con hasta 2 decimales.";
  }

  const categoriaId = typeof entrada.categoriaId === "string" ? entrada.categoriaId.trim() : "";
  if (!UUID.test(categoriaId)) errores.categoriaId = "Selecciona una categoría válida.";

  const descripcion = textoOpcional(entrada.descripcion);
  if (descripcion === undefined) errores.descripcion = "La descripción no es válida.";

  const ingredientes = textoOpcional(entrada.ingredientes);
  if (ingredientes === undefined) errores.ingredientes = "Los ingredientes no son válidos.";

  const alergenosTexto = typeof entrada.alergenos === "string" ? entrada.alergenos : "";
  if (typeof entrada.alergenos !== "string") errores.alergenos = "Los alérgenos no son válidos.";
  const vistos = new Set<string>();
  const alergenos = alergenosTexto
    .split(",")
    .map((alergeno) => alergeno.trim())
    .filter((alergeno) => {
      if (!alergeno) return false;
      const clave = alergeno.toLocaleLowerCase("es-PE");
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  if (alergenos.length > 14) errores.alergenos = "Registra como máximo 14 alérgenos.";

  const imageTexto = typeof entrada.imageUrl === "string" ? entrada.imageUrl.trim() : "";
  let imageUrl: string | null = imageTexto || null;
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
        errores.imageUrl = "La imagen debe tener una URL HTTPS válida.";
      } else {
        imageUrl = url.toString();
      }
    } catch {
      errores.imageUrl = "La imagen debe tener una URL HTTPS válida.";
    }
  }

  if (Object.keys(errores).length) return { ok: false, errores };

  return {
    ok: true,
    producto: {
      name: nombre,
      price: precio,
      categoryId: categoriaId,
      description: descripcion ?? null,
      ingredients: ingredientes ?? null,
      allergens: alergenos,
      imageUrl,
    },
  };
}
