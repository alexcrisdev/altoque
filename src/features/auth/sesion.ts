import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Permiso, Rol } from "./permisos";
import { tieneAlgunoDeLosRoles, tienePermiso } from "./permisos";

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

export async function requerirPermiso(permiso: Permiso) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!sesion.membresias.some((m) => tienePermiso(m.rol, permiso))) redirect("/sin-acceso");
  return sesion;
}
