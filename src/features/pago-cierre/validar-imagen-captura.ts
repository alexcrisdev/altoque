import "server-only";
// Sharp ya forma parte de las dependencias instaladas de Next.js.
import sharp from "sharp";
import { MAX_CAPTURA, tipoImagen } from "./capturas-logica";

export async function validarImagenCaptura(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  if (!bytes.length || bytes.length > MAX_CAPTURA || tipoImagen(bytes) !== mime || !["image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("Solo se aceptan imágenes JPEG o WebP de hasta 400 KB.");
  }
  try {
    const imagen = sharp(bytes, { failOn: "warning", limitInputPixels: 1280 * 1280 });
    const datos = await imagen.metadata();
    if (!datos.width || !datos.height || datos.width > 1280 || datos.height > 1280 || (datos.pages ?? 1) !== 1) throw new Error("Dimensiones inválidas");
    // toBuffer decodifica los píxeles. metadata() por sí sola no detecta truncados.
    // No conservar EXIF, XMP ni bytes agregados al archivo original.
    const salida = await imagen.rotate().jpeg({ quality: 85 }).toBuffer();
    if (salida.length > MAX_CAPTURA) throw new Error("Imagen demasiado grande");
    return salida;
  } catch { throw new Error("La imagen está dañada o no es compatible. Elige otra captura."); }
}
