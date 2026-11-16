"use client";
import { dimensionesCaptura, OBJETIVO_CAPTURA } from "./capturas-logica";

export async function comprimirCaptura(archivo: File): Promise<{ imagen: Blob; huella: string }> {
  if (!archivo.type.startsWith("image/") || archivo.size === 0 || archivo.size > 25 * 1024 * 1024) {
    throw new Error("Elige una imagen de hasta 25 MB.");
  }
  const hash = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
  const huella = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  let imagen: ImageBitmap;
  try { imagen = await createImageBitmap(archivo); }
  catch { throw new Error("No pudimos abrir esa imagen. Prueba una captura JPEG o PNG."); }
  try {
    const { ancho, alto } = dimensionesCaptura(imagen.width, imagen.height);
    const canvas = document.createElement("canvas");
    canvas.width = ancho; canvas.height = alto;
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Este navegador no pudo preparar la imagen.");
    contexto.fillStyle = "white"; contexto.fillRect(0, 0, ancho, alto);
    contexto.drawImage(imagen, 0, 0, ancho, alto);
    for (const calidad of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", calidad));
      if (blob && blob.size <= OBJETIVO_CAPTURA) return { imagen: blob, huella };
    }
    throw new Error("La imagen sigue siendo muy grande. Recorta la captura y vuelve a intentar.");
  } finally { imagen.close(); }
}
