import { MAX_FOTO_PRODUCTO } from "./foto-producto";

export async function prepararFotoProducto(archivo: File): Promise<File> {
  if (archivo.size <= MAX_FOTO_PRODUCTO) return archivo;
  const imagen = await createImageBitmap(archivo);
  try {
    const escala = Math.min(1, 1280 / Math.max(imagen.width, imagen.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(imagen.width * escala));
    lienzo.height = Math.max(1, Math.round(imagen.height * escala));
    const dibujo = lienzo.getContext("2d", { alpha: false });
    if (!dibujo) throw new Error("No se pudo preparar la foto.");
    dibujo.fillStyle = "white";
    dibujo.fillRect(0, 0, lienzo.width, lienzo.height);
    dibujo.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    for (const calidad of [0.88, 0.7, 0.5]) {
      const foto = await new Promise<Blob | null>((resolver) => {
        lienzo.toBlob(resolver, "image/jpeg", calidad);
      });
      if (foto && foto.size <= MAX_FOTO_PRODUCTO) {
        return new File([foto], "producto.jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("La foto es demasiado grande incluso después de reducirla.");
  } finally {
    imagen.close();
  }
}
