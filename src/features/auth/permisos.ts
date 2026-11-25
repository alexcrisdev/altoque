export type Rol = "OWNER" | "ADMIN" | "WAITER" | "KITCHEN" | "CASHIER";
export type Panel = "admin" | "mesero" | "cocina" | "caja";

// US-106: cada panel tiene sus propios roles. Nadie entra a un panel ajeno,
// tampoco el dueño o el admin. Quien cubre dos puestos recibe los dos roles.
export const ROLES_POR_PANEL: Readonly<Record<Panel, readonly Rol[]>> = {
  admin: ["OWNER", "ADMIN"],
  mesero: ["WAITER"],
  cocina: ["KITCHEN"],
  caja: ["CASHIER"],
};

// Orden en que se elige el panel al iniciar sesión y en el selector de paneles.
export const PANELES: readonly Panel[] = ["admin", "mesero", "cocina", "caja"];

export const NOMBRE_PANEL: Readonly<Record<Panel, string>> = {
  admin: "Administración",
  mesero: "Mesero",
  cocina: "Cocina",
  caja: "Caja",
};

export function puedeEntrar(roles: readonly Rol[], panel: Panel): boolean {
  return tieneAlgunoDeLosRoles(roles, ROLES_POR_PANEL[panel]);
}

export function panelesDisponibles(roles: readonly Rol[]): Panel[] {
  return PANELES.filter((panel) => puedeEntrar(roles, panel));
}

// Adónde llega cada cuenta al iniciar sesión.
export function rutaInicial(roles: readonly Rol[]): string {
  const [primero] = panelesDisponibles(roles);
  return primero ? `/${primero}` : "/sin-acceso";
}

// Panel al que pertenece una ruta (o null si no es de ningún panel).
export function panelDeRuta(ruta: string): Panel | null {
  return PANELES.find((panel) => ruta === `/${panel}` || ruta.startsWith(`/${panel}/`)) ?? null;
}

export function tieneAlgunoDeLosRoles(roles: readonly Rol[], permitidos: readonly Rol[]): boolean {
  return roles.some((rol) => permitidos.includes(rol));
}
