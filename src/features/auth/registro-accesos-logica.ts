import type { Rol } from "./permisos";

// US-106 (Fase C): un acceso denegado se registra con ruta, roles y hora. Sin id de
// usuario, correo, nombre ni datos de la petición. La ruta la pone proxy.ts en esta
// cabecera (sin parámetros de búsqueda); si falta o no es una ruta limpia, "desconocida".
export const ENCABEZADO_RUTA = "x-altoque-ruta";

const ROLES_VALIDOS: ReadonlySet<string> = new Set<Rol>(["OWNER", "ADMIN", "WAITER", "KITCHEN", "CASHIER"]);
const RUTA_LIMPIA = /^\/[A-Za-z0-9/_-]{0,200}$/;

export type EntradaAccesoDenegado = {
  evento: "acceso_denegado";
  ruta: string;
  roles: string[];
  hora: string;
};

export function rutaParaRegistro(valor: string | null): string {
  const ruta = (valor ?? "").split("?")[0];
  return RUTA_LIMPIA.test(ruta) ? ruta : "desconocida";
}

export function entradaAccesoDenegado(
  ruta: string | null,
  roles: readonly string[],
  ahora: Date = new Date(),
): EntradaAccesoDenegado {
  return {
    evento: "acceso_denegado",
    ruta: rutaParaRegistro(ruta),
    roles: [...new Set(roles.filter((rol) => ROLES_VALIDOS.has(rol)))].sort(),
    hora: ahora.toISOString(),
  };
}
