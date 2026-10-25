import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Lo que devuelve la base para un QR (con su local, restaurante y mesa)
export type QrConUbicacion = {
  id: string;
  purpose: "DINE_IN" | "TAKEAWAY";
  active: boolean;
  restaurant_id: string;
  branch_id: string;
  dining_table_id: string | null;
  branches: {
    name: string;
    active: boolean;
    restaurants: { name: string; active: boolean };
  };
  dining_tables: { number: number; active: boolean } | null;
};

// Capa de datos: busca un QR por la huella de su token. No aplica reglas.
export async function buscarQrPorHash(
  tokenHash: string,
): Promise<QrConUbicacion | null> {
  const supabase = crearClienteAdmin();

  const { data, error } = await supabase
    .from("qr_codes")
    .select(
      `id, purpose, active, restaurant_id, branch_id, dining_table_id,
       branches ( name, active, restaurants ( name, active ) ),
       dining_tables ( number, active )`,
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<QrConUbicacion>();

  if (error) {
    // Nunca registrar el token ni su hash
    console.error("Error al buscar QR:", error.code);
    throw new Error("No se pudo validar el código QR");
  }

  return data;
}