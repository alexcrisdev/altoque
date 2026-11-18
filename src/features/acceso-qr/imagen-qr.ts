import "server-only";
import QRCode from "qrcode";
import { recuperarTokenQr } from "./token";

export type QrMostrable = { url: string; imagen: string };

// Estado del QR activo para el panel admin (US-096).
// "visible": se puede ver, copiar y descargar. "antiguo": se creó antes de US-096 y hay que
// regenerarlo una vez. null: no tiene QR activo.
export type EstadoQrAdmin = ({ estado: "visible" } & QrMostrable) | { estado: "antiguo" } | null;

// Arma el enlace /m/<token> y su imagen QR.
export async function armarQr(token: string): Promise<QrMostrable> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${base}/m/${token}`;
  const imagen = await QRCode.toDataURL(url, { width: 512, margin: 2 });
  return { url, imagen };
}

// Decide qué mostrar para el QR activo de una mesa o mostrador.
export async function estadoQrAdmin(
  qr: { id: string; token_hash: string } | null,
): Promise<EstadoQrAdmin> {
  if (!qr) return null;
  const token = recuperarTokenQr(qr.id, qr.token_hash);
  if (!token) return { estado: "antiguo" };
  return { estado: "visible", ...(await armarQr(token)) };
}
