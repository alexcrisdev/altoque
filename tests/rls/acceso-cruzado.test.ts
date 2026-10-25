import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;
const cevicheriaId = "10000000-0000-0000-0000-000000000001";
const polleriaId = "10000000-0000-0000-0000-000000000002";
let owner: SupabaseClient;

beforeAll(async () => {
  if (!url || !anonKey || !password) throw new Error("Configura URL, clave pública y DEMO_PASSWORD");
  owner = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await owner.auth.signInWithPassword({ email: "dueno@demo.altoque.pe", password });
  if (error) throw new Error("No se pudo iniciar sesión con el dueño demo");
}, 30_000);

afterAll(async () => { await owner?.auth.signOut(); });

describe("aislamiento por restaurante", () => {
  it("permite lo propio y bloquea lectura y cambios en Pollería", async () => {
    const ownProducts = await owner.from("products").select("id").eq("restaurant_id", cevicheriaId);
    expect(ownProducts.error).toBeNull();
    expect(ownProducts.data?.length).toBeGreaterThan(0);
    const ownTables = await owner.from("dining_tables").select("id").eq("restaurant_id", cevicheriaId);
    expect(ownTables.error).toBeNull();
    expect(ownTables.data?.length).toBeGreaterThan(0);
    const otherProducts = await owner.from("products").select("id").eq("restaurant_id", polleriaId);
    expect(otherProducts.error).toBeNull();
    expect(otherProducts.data).toEqual([]);
    const otherTables = await owner.from("dining_tables").select("id").eq("restaurant_id", polleriaId);
    expect(otherTables.error).toBeNull();
    expect(otherTables.data).toEqual([]);

    const productUpdate = await owner.from("products").update({ name: "Cambio no autorizado" }).eq("restaurant_id", polleriaId).select("id");
    expect(productUpdate.error).toBeNull();
    expect(productUpdate.data).toEqual([]);
    const tableUpdate = await owner.from("dining_tables").update({ number: 99 }).eq("restaurant_id", polleriaId).select("id");
    expect(tableUpdate.error).toBeNull();
    expect(tableUpdate.data).toEqual([]);
  }, 30_000);

  it("no permite leer datos con la clave pública sin iniciar sesión", async () => {
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const products = await anon.from("products").select("id");
    const tables = await anon.from("dining_tables").select("id");
    expect(products.error).toBeNull();
    expect(products.data).toEqual([]);
    expect(tables.error).toBeNull();
    expect(tables.data).toEqual([]);
  });

  it("impide que ADMIN se ascienda a OWNER", async () => {
    const admin = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await admin.auth.signInWithPassword({ email: "admin@demo.altoque.pe", password: password! });
    expect(loginError).toBeNull();
    const { data: { user } } = await admin.auth.getUser();
    expect(user).not.toBeNull();

    const { data: roles, error: rolesError } = await admin.from("roles").select("id,code");
    expect(rolesError).toBeNull();
    const adminRoleId = roles?.find((role) => role.code === "ADMIN")?.id;
    const ownerRoleId = roles?.find((role) => role.code === "OWNER")?.id;
    expect(adminRoleId).toBeDefined();
    expect(ownerRoleId).toBeDefined();

    const { data: membership, error: membershipError } = await admin
      .from("staff_memberships")
      .select("id")
      .eq("user_id", user!.id)
      .eq("restaurant_id", cevicheriaId)
      .eq("role_id", adminRoleId!)
      .single();
    expect(membershipError).toBeNull();

    const attempt = await admin.from("staff_memberships")
      .update({ role_id: ownerRoleId! })
      .eq("id", membership!.id)
      .select("id");
    expect(attempt.error !== null || (attempt.data?.length ?? 0) === 0).toBe(true);

    const { data: unchanged } = await admin.from("staff_memberships")
      .select("role_id")
      .eq("id", membership!.id)
      .single();
    expect(unchanged?.role_id).toBe(adminRoleId);
    await admin.auth.signOut();
  }, 30_000);

  it("impide que ADMIN borre el restaurante", async () => {
    const admin = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await admin.auth.signInWithPassword({ email: "admin@demo.altoque.pe", password: password! });
    expect(loginError).toBeNull();

    const attempt = await admin.from("restaurants")
      .delete()
      .eq("id", cevicheriaId)
      .select("id");
    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]);

    const { data: restaurant, error } = await admin.from("restaurants")
      .select("id")
      .eq("id", cevicheriaId)
      .single();
    expect(error).toBeNull();
    expect(restaurant?.id).toBe(cevicheriaId);
    await admin.auth.signOut();
  }, 30_000);
});
