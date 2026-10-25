const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;

if (!baseUrl || !anonKey || !serviceKey || !password) {
  throw new Error("Configura las variables de Supabase y DEMO_PASSWORD en .env.local");
}

async function api(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Supabase rechazó una operación de datos (${response.status})`);
  const responseText = await response.text();
  if (!responseText.trim()) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error("Supabase devolvió una respuesta de datos inválida");
  }
}

async function buscarUsuario(email) {
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/auth/v1/admin/users?page=${page}&per_page=1000`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!response.ok) throw new Error(`No se pudo consultar Auth (${response.status})`);
    const { users = [] } = await response.json();
    const existing = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing;
    if (users.length < 1000) return null;
  }
}

async function crearUsuario(email, fullName) {
  let user = await buscarUsuario(email);
  if (!user) {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
    });
    if (response.ok) {
      user = await response.json();
    } else {
      // Si otra ejecución lo creó a la vez, reutilízalo en vez de fallar por duplicado.
      user = await buscarUsuario(email);
      if (!user) throw new Error(`No se pudo crear un usuario demo (${response.status})`);
    }
  }
  await api("users?on_conflict=id", {
    method: "POST",
    body: { id: user.id, full_name: fullName },
    prefer: "resolution=merge-duplicates",
  });
  return user.id;
}

async function main() {
  const restaurants = await api("restaurants?select=id,slug&slug=in.(cevicheria-demo,polleria-demo)");
  const restaurantBySlug = Object.fromEntries(restaurants.map((r) => [r.slug, r.id]));
  if (!restaurantBySlug["cevicheria-demo"] || !restaurantBySlug["polleria-demo"])
    throw new Error("Faltan los restaurantes demo; carga antes supabase/seed.sql");
  const roles = await api("roles?select=id,code");
  const roleIds = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  const demos = [
    ["dueno@demo.altoque.pe", "Dueño Demo", "cevicheria-demo", "OWNER"],
    ["admin@demo.altoque.pe", "Admin Demo", "cevicheria-demo", "ADMIN"],
    ["mesero@demo.altoque.pe", "Mesero Demo", "cevicheria-demo", "WAITER"],
    ["cocina@demo.altoque.pe", "Cocina Demo", "cevicheria-demo", "KITCHEN"],
    ["caja@demo.altoque.pe", "Caja Demo", "cevicheria-demo", "CASHIER"],
    ["dueno@polleria.demo", "Dueño Pollería Demo", "polleria-demo", "OWNER"],
  ];

  for (const [email, fullName, slug, role] of demos) {
    const userId = await crearUsuario(email, fullName);
    const restaurantId = restaurantBySlug[slug];
    const existing = await api(`staff_memberships?select=id,active&user_id=eq.${userId}&restaurant_id=eq.${restaurantId}&role_id=eq.${roleIds[role]}&branch_id=is.null`);
    if (existing.length && !existing[0].active) {
      await api(`staff_memberships?id=eq.${existing[0].id}`, {
        method: "PATCH",
        body: { active: true },
      });
    } else if (!existing.length) {
      await api("staff_memberships", {
        method: "POST",
        body: { user_id: userId, restaurant_id: restaurantId, role_id: roleIds[role], active: true },
      });
    }
  }
  console.log("Los seis usuarios demo están listos.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "No se pudieron preparar los usuarios demo.");
  process.exitCode = 1;
});
