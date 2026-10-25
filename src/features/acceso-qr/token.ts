import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Solo letras, números, guion y guion bajo (formato base64url)
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

// Token nuevo: 32 bytes aleatorios → 43 caracteres. Imposible de adivinar.
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