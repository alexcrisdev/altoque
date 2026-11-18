import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Solo letras, números, guion y guion bajo (formato base64url)
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

// Token aleatorio: 32 bytes → 43 caracteres. Imposible de adivinar.
// US-096: solo se usa si falta QR_TOKEN_SECRET (el QR funciona, pero no se puede volver a mostrar).
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

// Huella SHA-256 del token: es lo único que se guarda en la base.
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Descarta basura antes de ir a la base.
export function tokenConFormatoValido(token: string): boolean {
  return FORMATO_TOKEN.test(token);
}

// US-096: secreto del servidor para calcular los tokens. Mínimo 32 caracteres.
function secretoQr(): string | null {
  const secreto = process.env.QR_TOKEN_SECRET;
  if (!secreto || secreto.length < 32 || secreto !== secreto.trim()) return null;
  return secreto;
}

// US-096: el token de un QR se calcula con HMAC(QR_TOKEN_SECRET, id del QR).
// Así el servidor lo puede volver a mostrar sin guardarlo: en la base sigue solo el hash.
// Devuelve null si el secreto no está configurado.
export function tokenDeQr(qrId: string): string | null {
  const secreto = secretoQr();
  if (!secreto) return null;
  return createHmac("sha256", secreto).update(qrId, "utf8").digest("base64url");
}

// US-096: recupera el token de un QR guardado solo si fue creado con el secreto actual.
// Los QR antiguos (token aleatorio) devuelven null: hay que regenerarlos una vez.
export function recuperarTokenQr(qrId: string, tokenHashGuardado: string): string | null {
  const token = tokenDeQr(qrId);
  if (!token) return null;
  const calculado = Buffer.from(hashToken(token), "utf8");
  const guardado = Buffer.from(tokenHashGuardado, "utf8");
  if (calculado.length !== guardado.length || !timingSafeEqual(calculado, guardado)) return null;
  return token;
}
