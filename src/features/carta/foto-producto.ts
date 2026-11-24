export const BUCKET_FOTOS_PRODUCTOS = "fotos-productos";
export const MAX_FOTO_PRODUCTO = 800 * 1024;
export const TIPOS_FOTO_PRODUCTO = ["image/jpeg", "image/png", "image/webp"] as const;

export function esUrlImagenProducto(url: URL): boolean {
  if (!url.hostname || url.username || url.password) return false;
  if (url.protocol === "https:") return true;

  // Supabase local sirve las fotos bajo HTTP. Solo se admite ese almacén local.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || url.protocol !== "http:" ||
    (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) return false;
  try {
    return url.origin === new URL(base).origin &&
      url.pathname.startsWith(`/storage/v1/object/public/${BUCKET_FOTOS_PRODUCTOS}/`);
  } catch {
    return false;
  }
}
