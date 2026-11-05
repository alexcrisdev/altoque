import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.DEMO_PASSWORD;

const restauranteId = "10000000-0000-0000-0000-000000000001";
const clientes: SupabaseClient[] = [];

let admin: SupabaseClient;
let duenoPolleria: SupabaseClient;
let pedidoId: string;

async function iniciarSesion(
  correo: string,
): Promise<SupabaseClient> {
  const cliente = createClient(url!, anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  clientes.push(cliente);

  const { error } = await cliente.auth.signInWithPassword({
    email: correo,
    password: password!,
  });

  if (error) {
    throw new Error(`No se pudo iniciar sesión con ${correo}.`);
  }

  return cliente;
}

beforeAll(async () => {
  if (!url || !anonKey || !password) {
    throw new Error(
      "Configura URL, clave pública y DEMO_PASSWORD en .env.local.",
    );
  }

  admin = await iniciarSesion("admin@demo.altoque.pe");
  duenoPolleria = await iniciarSesion("dueno@polleria.demo");

  // Necesitamos un pedido con productos para que las comprobaciones
  // de aislamiento no pasen simplemente porque no existen datos.
  const { data, error } = await admin
    .from("orders")
    .select("id, order_items!inner(product_id)")
    .eq("restaurant_id", restauranteId)
    .order("id")
    .limit(1);

  if (error) {
    throw new Error("No se pudo consultar el pedido de referencia.");
  }

  if (!data?.[0]?.order_items.length) {
    throw new Error(
      "Se necesita al menos un pedido con productos en Cevichería Demo. " +
      "Esta prueba no crea datos.",
    );
  }

  pedidoId = data[0].id;
}, 30_000);

afterAll(async () => {
  await Promise.all(
    clientes.map((cliente) => cliente.auth.signOut()),
  );
}, 30_000);

describe("aislamiento de tendencias US-019", () => {
  it("admin lee un pedido y sus productos del restaurante", async () => {
    const { data, error } = await admin
      .from("orders")
      .select(
        "id, restaurant_id, status, created_at, order_items(product_id, product_name, quantity)",
      )
      .eq("restaurant_id", restauranteId)
      .eq("id", pedidoId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].restaurant_id).toBe(restauranteId);
    expect(data![0].order_items.length).toBeGreaterThan(0);
  });

  it("admin puede leer directamente los items de ese pedido", async () => {
    const { data, error } = await admin
      .from("order_items")
      .select("order_id, product_id, product_name, quantity")
      .eq("order_id", pedidoId);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    for (const item of data!) {
      expect(item.order_id).toBe(pedidoId);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  it("el dueño de Pollería no ve pedidos de Cevichería", async () => {
    const { data, error } = await duenoPolleria
      .from("orders")
      .select("id, order_items(product_id, quantity)")
      .eq("restaurant_id", restauranteId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("el dueño de Pollería tampoco ve los items del pedido", async () => {
    const { data, error } = await duenoPolleria
      .from("order_items")
      .select("order_id, product_id, quantity")
      .eq("order_id", pedidoId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
