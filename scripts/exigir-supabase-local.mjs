// US-106: corta las pruebas antes de empezar si Supabase no es la base local desechable.
// Uso: node scripts/exigir-supabase-local.mjs  (sale con código 1 si no es local).
// Nunca imprime claves ni la URL completa: solo el host cuando es local.
export const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost"]);

export function esSupabaseLocal(url) {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

const esScript = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/exigir-supabase-local.mjs");

if (esScript) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!esSupabaseLocal(url)) {
    console.error("NEXT_PUBLIC_SUPABASE_URL no apunta a Supabase local (127.0.0.1 o localhost). No se ejecutan pruebas.");
    process.exit(1);
  }
  console.log(`Supabase local confirmado: ${new URL(url).host}`);
}
