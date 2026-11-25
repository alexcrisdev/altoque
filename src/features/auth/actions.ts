"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { rutaInicial, type Rol } from "./permisos";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=credenciales");
  const supabase = await crearClienteServidor();
  const { data: acceso, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credenciales");
  // Solo los roles propios: RLS deja que dueño y admin lean también los de su equipo.
  const { data } = await supabase
    .from("staff_memberships")
    .select("roles(code)")
    .eq("user_id", acceso.user.id)
    .eq("active", true);
  const roles = (data ?? []).flatMap((membership) => {
    const relation = membership.roles as unknown as { code: Rol } | { code: Rol }[] | null;
    return Array.isArray(relation) ? relation.map((role) => role.code) : relation ? [relation.code] : [];
  });
  // US-106: cada cuenta llega a su propio panel.
  redirect(rutaInicial(roles));
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
