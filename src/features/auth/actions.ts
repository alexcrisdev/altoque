"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=credenciales");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credenciales");
  const { data } = await supabase
    .from("staff_memberships")
    .select("roles(code)")
    .eq("active", true);
  const roles = (data ?? []).flatMap((membership) => {
    const relation = membership.roles as unknown as { code: string } | { code: string }[] | null;
    return Array.isArray(relation) ? relation.map((role) => role.code) : relation ? [relation.code] : [];
  });
  if (roles.includes("OWNER") || roles.includes("ADMIN")) redirect("/admin");
  if (roles.includes("WAITER")) redirect("/mesero");
  if (roles.includes("KITCHEN")) redirect("/cocina");
  if (roles.includes("CASHIER")) redirect("/caja");
  redirect("/sin-acceso");
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
