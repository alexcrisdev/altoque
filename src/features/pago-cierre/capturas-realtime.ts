"use client";
import { crearClienteNavegador } from "../../lib/supabase/client";
export function suscribirCapturas(restauranteId: string, actualizar: () => void) {
  const db = crearClienteNavegador();
  const canal = db.channel(`capturas:${restauranteId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs", filter: `restaurant_id=eq.${restauranteId}` }, actualizar)
    .subscribe(estado => { if (estado === "SUBSCRIBED") actualizar(); });
  return () => { void db.removeChannel(canal); };
}
