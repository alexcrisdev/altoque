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
let cocina: SupabaseClient;
let duenoPolleria: SupabaseClient;
let pagoConfirmadoId: string;

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
  cocina = await iniciarSesion("cocina@demo.altoque.pe");
  duenoPolleria = await iniciarSesion("dueno@polleria.demo");

  // Exigimos un pago real visible para admin.
  // Así, las pruebas de aislamiento no pasan solo porque la tabla esté vacía.
  const { data, error } = await admin
    .from("payments")
    .select("id")
    .eq("restaurant_id", restauranteId)
    .eq("status", "CONFIRMED")
    .limit(1);

  if (error) {
    throw new Error(
      "No se pudo consultar el pago de referencia con admin.",
    );
  }

  if (!data?.[0]) {
    throw new Error(
      "Se necesita al menos un pago confirmado en Cevichería Demo. " +
      "Esta prueba no crea datos.",
    );
  }

  pagoConfirmadoId = data[0].id;
}, 30_000);

afterAll(async () => {
  await Promise.all(
    clientes.map((cliente) => cliente.auth.signOut()),
  );
}, 30_000);

describe("lectura de ventas con RLS US-018", () => {
  it("admin puede leer un pago confirmado de su restaurante", async () => {
    const { data, error } = await admin
      .from("payments")
      .select("id, restaurant_id, status, amount, confirmed_at")
      .eq("restaurant_id", restauranteId)
      .eq("id", pagoConfirmadoId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      id: pagoConfirmadoId,
      restaurant_id: restauranteId,
      status: "CONFIRMED",
    });
    expect(Number(data![0].amount)).toBeGreaterThan(0);
    expect(data![0].confirmed_at).toBeTruthy();
  });

  it("el dueño de Pollería no ve pagos de Cevichería", async () => {
    const { data, error } = await duenoPolleria
      .from("payments")
      .select("id, restaurant_id")
      .eq("restaurant_id", restauranteId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("cocina no ve pagos de su propio restaurante", async () => {
    const { data, error } = await cocina
      .from("payments")
      .select("id, restaurant_id")
      .eq("restaurant_id", restauranteId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
