import "server-only";
import { randomUUID } from "node:crypto";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BUCKET_FOTOS_PRODUCTOS, MAX_FOTO_PRODUCTO, TIPOS_FOTO_PRODUCTO } from "./foto-producto";

const formatos = {
  "image/jpeg": { extension: "jpg", firma: [255, 216, 255] },
  "image/png": { extension: "png", firma: [137, 80, 78, 71, 13, 10, 26, 10] },
  "image/webp": { extension: "webp", firma: [82, 73, 70, 70] },
};

export async function subirFotoProducto(restauranteId: string, archivo: File) {
  if (archivo.size > MAX_FOTO_PRODUCTO) {
    return { ok: false, mensaje: "La foto debe pesar como máximo 800 KB." } as const;
  }
  const tipo = TIPOS_FOTO_PRODUCTO.find((admitido) => admitido === archivo.type);
  if (!tipo) return { ok: false, mensaje: "Elige una foto JPG, PNG o WebP." } as const;

  const formato = formatos[tipo];
  const cabecera = new Uint8Array(await archivo.slice(0, 12).arrayBuffer());
  const webpValido = tipo !== "image/webp" ||
    [87, 69, 66, 80].every((byte, indice) => cabecera[indice + 8] === byte);
  if (!webpValido || !formato.firma.every((byte, indice) => cabecera[indice] === byte)) {
    return { ok: false, mensaje: "No se pudo reconocer el formato de la foto." } as const;
  }

  const supabase = await crearClienteServidor();
  const bucket = supabase.storage.from(BUCKET_FOTOS_PRODUCTOS);
  const ruta = `${restauranteId}/${randomUUID()}.${formato.extension}`;
  const { error } = await bucket.upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (error) return { ok: false, mensaje: "No se pudo subir la foto del producto." } as const;

  return { ok: true, url: bucket.getPublicUrl(ruta).data.publicUrl, ruta } as const;
}

export async function descartarFotoProducto(ruta: string) {
  const supabase = await crearClienteServidor();
  const { error } = await supabase.storage.from(BUCKET_FOTOS_PRODUCTOS).remove([ruta]);
  if (error) console.error("No se pudo retirar una foto de producto no guardada.");
}
