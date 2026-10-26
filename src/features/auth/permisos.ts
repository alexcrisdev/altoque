export type Rol = "OWNER" | "ADMIN" | "WAITER" | "KITCHEN" | "CASHIER";
export type Permiso = "gestionar_restaurante" | "atender_mesas" | "gestionar_pedidos" | "registrar_pagos";

const permisosPorRol: Record<Rol, readonly Permiso[]> = {
  OWNER: ["gestionar_restaurante", "atender_mesas", "gestionar_pedidos", "registrar_pagos"],
  ADMIN: ["gestionar_restaurante", "atender_mesas", "gestionar_pedidos", "registrar_pagos"],
  WAITER: ["atender_mesas", "registrar_pagos"],
  KITCHEN: ["gestionar_pedidos"],
  CASHIER: ["registrar_pagos"],
};

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return permisosPorRol[rol].includes(permiso);
}

export function tieneAlgunoDeLosRoles(roles: readonly Rol[], permitidos: readonly Rol[]): boolean {
  return roles.some((rol) => permitidos.includes(rol));
}
