import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { LIMITE_POR_RESTAURANTE_DIA, LIMITE_POR_USUARIO_HORA, type ResultadoCupo, type TokensIA, type UsoIA } from "./reglas";

// US-151: única capa que toca la tabla ai_usage. Nunca guarda el texto de las preguntas.

/** Revisa el límite y, si hay cupo, anota la consulta. Si la base falla, lanza (claude.ts lo atrapa). */
export async function reservarConsulta(uso: UsoIA): Promise<{ resultado: ResultadoCupo; usoId: number | null }> {
  const { data, error } = await crearClienteAdmin().rpc("reservar_consulta_ia", {
    p_restaurante: uso.restauranteId,
    p_usuario: uso.usuarioId,
    p_funcion: uso.funcion,
    p_limite_usuario_hora: LIMITE_POR_USUARIO_HORA,
    p_limite_restaurante_dia: LIMITE_POR_RESTAURANTE_DIA,
  });
  if (error) throw new Error("No se pudo revisar el límite de IA");
  const fila = (Array.isArray(data) ? data[0] : data) as { resultado: ResultadoCupo; uso_id: number | null } | null;
  if (!fila) throw new Error("No se pudo revisar el límite de IA");
  return { resultado: fila.resultado, usoId: fila.uso_id };
}

/** Guarda los tokens que gastó la consulta (para ver el consumo por restaurante). */
export async function anotarTokens(usoId: number, tokens: TokensIA): Promise<void> {
  const { error } = await crearClienteAdmin()
    .from("ai_usage")
    .update({ input_tokens: tokens.entrada, output_tokens: tokens.salida })
    .eq("id", usoId);
  if (error) throw new Error("No se pudieron anotar los tokens de IA");
}
