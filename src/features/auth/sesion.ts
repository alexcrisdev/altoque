import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Panel, Rol } from "./permisos";
import { ROLES_POR_PANEL, tieneAlgunoDeLosRoles } from "./permisos";

export async function obtenerSesion() {
  await connection(); // la sesión depende de la hora actual: solo se calcula en cada petición real
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("staff_memberships")
    .select("restaurant_id, branch_id, roles(code)")
    .eq("user_id", user.id)
    .eq("active", true);
  if (error) throw new Error("No se pudo verificar el acceso");
  const membresias = (data ?? []).flatMap((m) => {
    const relacion = m.roles as unknown as { code: Rol } | { code: Rol }[] | null;
    const rol = Array.isArray(relacion) ? relacion[0]?.code : relacion?.code;
    return rol ? [{ restaurantId: m.restaurant_id, branchId: m.branch_id, rol }] : [];
  });
  return { usuario: user, membresias };
}

export async function requerirRol(permitidos: readonly Rol[]) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!tieneAlgunoDeLosRoles(sesion.membresias.map((m) => m.rol), permitidos)) redirect("/sin-acceso");
  return sesion;
}

// US-106: deja pasar solo a quien tiene un rol de este panel. Devuelve el restaurante
// donde trabaja en ese panel y sus roles ahí (solo los del panel, aunque tenga otros).
export async function requerirPanel(panel: Panel) {
  const permitidos = ROLES_POR_PANEL[panel];
  const sesion = await requerirRol(permitidos);
  const membresia = sesion.membresias.find((m) => permitidos.includes(m.rol))!;
  const roles = sesion.membresias
    .filter((m) => m.restaurantId === membresia.restaurantId && permitidos.includes(m.rol))
    .map((m) => m.rol);
  return { ...sesion, restauranteId: membresia.restaurantId, roles };
}
