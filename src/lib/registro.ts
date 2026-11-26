// US-106 (Fase C): registro de errores y accesos SIN datos personales ni secretos.
// Nunca se registra el mensaje de un error externo (puede traer correos, tokens o datos
// de clientes): solo el origen, el tipo de error y un código corto si lo tiene.

const CODIGO_SEGURO = /^[A-Za-z0-9_.-]{1,40}$/;

export type EntradaError = { evento: "error"; origen: string; tipo: string; codigo: string | null };

export function entradaError(origen: string, error: unknown): EntradaError {
  const tipo = error instanceof Error ? error.name : typeof error;
  const posible = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  return {
    evento: "error",
    origen: origen.slice(0, 80),
    tipo: CODIGO_SEGURO.test(tipo) ? tipo : "desconocido",
    codigo: posible && CODIGO_SEGURO.test(posible) ? posible : null,
  };
}

export function registrarError(origen: string, error: unknown): void {
  console.error(JSON.stringify(entradaError(origen, error)));
}
