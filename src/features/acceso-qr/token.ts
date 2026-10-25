import "server-only";
import { createHash, randomBytes } from "crypto";

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{8,128}$/;

export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenConFormatoValido(token: string): boolean {
  return FORMATO_TOKEN.test(token);
}
