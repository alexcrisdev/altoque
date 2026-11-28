import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";
import { SILLAS_POR_DEFECTO, type FormaMesa } from "../plano-mesas/sillas";

// Capa de datos de mesas y QR para el panel admin.
// Usa la sesión del usuario (no la clave secreta): así RLS también protege cada operación.

export type MesaAdmin = {
    id: string;
    numero: number;
    activa: boolean;
    local: string;
    tieneQrActivo: boolean;
    // US-096: QR activo (id y hash) para decidir en el servidor si se puede volver a mostrar.
    // Nunca se envía al navegador.
    qrActivo: { id: string; token_hash: string } | null;
}

export type Local = { id: string; nombre: string };

type FilaMesa = {
  id: string;
  number: number;
  active: boolean;
  branches: { name: string } | null;
  qr_codes: { id: string; active: boolean; token_hash: string }[];
};

export async function listarMesas(restauranteId: string): Promise<MesaAdmin[]> {
    const supabase = await crearClienteServidor();
    const {data, error} = await supabase
        .from("dining_tables")
        .select("id, number, active, branches(name), qr_codes(id, active, token_hash)")
        .eq("restaurant_id", restauranteId)
        .order("number")
        .overrideTypes<FilaMesa[], {merge: false}>();

    if(error) {
        console.error("listarMesas", error.code);
        throw new Error("No se pudieron cargar las mesas");
    }

    return data.map((fila) => ({
        id: fila.id,
        numero: fila.number,
        activa: fila.active,
        local: fila.branches?.name ?? "",
        tieneQrActivo: fila.qr_codes.some((qr) => qr.active),
        qrActivo: activoDe(fila.qr_codes),
    }));
}

function activoDe(qrs: { id: string; active: boolean; token_hash: string }[]) {
    const qr = qrs.find((q) => q.active);
    return qr ? { id: qr.id, token_hash: qr.token_hash } : null;
}

export async function listarLocales(restauranteId: string): Promise<Local[]> {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase
        .from("branches")
        .select("id, name")
        .eq("restaurant_id", restauranteId)
        .eq("active", true)
        .order("name");

    if(error){
        console.error("listarLocales", error.code);
        throw new Error("No se pudieron cargar los locales");
    }

    return data.map((fila) => ({id: fila.id, nombre: fila.name}));
}

export async function crearMesa(
    restauranteId: string,
    localId: string,
    numero: number,
    forma: FormaMesa = "ROUND",
    sillas: number = SILLAS_POR_DEFECTO,
): Promise<"OK" | "DUPLICADO" | "ERROR"> {
    const supabase = await crearClienteServidor();
    // Redonda es el valor por defecto de la base: solo se envía la forma si es cuadrada.
    const { error } = await supabase
        .from("dining_tables")
        .insert({
            restaurant_id: restauranteId, branch_id: localId, number: numero, capacity: sillas,
            ...(forma === "SQUARE" ? { shape: forma } : {}),
        });

    if(!error) return "OK";
    if(error.code === "23505") return "DUPLICADO";
    console.error("crearMesa", error.code);
    return "ERROR";
}

// Plano: cambia la forma y las sillas. RLS solo deja actualizar a dueño o admin del restaurante.
export async function editarFormaMesa(
    restauranteId: string,
    mesaId: string,
    forma: FormaMesa,
    sillas: number,
): Promise<"OK" | "NO_ENCONTRADA" | "ERROR"> {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase
        .from("dining_tables")
        .update({ shape: forma, capacity: sillas })
        .eq("id", mesaId)
        .eq("restaurant_id", restauranteId)
        .select("id");

    if (error) {
        console.error("editarFormaMesa", error.code);
        return "ERROR";
    }
    return data.length === 1 ? "OK" : "NO_ENCONTRADA";
}

export async function cambiarEstadoMesa(
    restauranteId: string,
    mesaId: string,
    activa: boolean,
): Promise<boolean> {
    const supabase = await crearClienteServidor();
    const {data, error} = await supabase
        .from("dining_tables")
        .update({ active: activa })
        .eq("id", mesaId)
        .eq("restaurant_id", restauranteId)
        .select("id");

    if(error) console.error("cambiarEstadoMesa", error.code);
    return !error && data.length === 1;
}

// Anula el QR activo de la mesa (si hay uno). El QR impreso deja de funcionar.
export async function desactivarQr(restauranteId: string, mesaId: string): Promise<boolean> {
    const supabase = await crearClienteServidor();
    const {error} = await supabase
        .from("qr_codes")
        .update({active: false, revoked_at: new Date().toISOString()})
        .eq("dining_table_id", mesaId)
        .eq("restaurant_id", restauranteId)
        .eq("active", true);

    if(error) console.error("desactivarQr", error.code);
    return !error;
}

export type ResultadoReemplazo = 
  | {ok: true; numero: number}
  | { ok: false; motivo: "MESA_NO_DISPONIBLE" | "ERROR" };

// Genera o regenera: primero anula el QR viejo y luego guarda el hash del nuevo.
// El orden importa: la base solo permite un QR activo por mesa.
// US-096: el id del QR llega calculado de antes, porque el token depende de él.
export async function reemplazarQr(
    restauranteId: string,
    mesaId: string,
    qrId: string,
    tokenHash: string,
):Promise<ResultadoReemplazo> {
    const supabase = await crearClienteServidor();
    const {data: mesa, error} = await supabase
        .from("dining_tables")
        .select("id, number, active, branch_id")
        .eq("id", mesaId)
        .eq("restaurant_id", restauranteId)
        .maybeSingle();

    if(error) {
        console.error("reemplazarQr", error.code);
        return {ok: false, motivo: "ERROR"};
    }    
    if (!mesa || !mesa.active) return { ok: false, motivo: "MESA_NO_DISPONIBLE" };

    if (!(await desactivarQr(restauranteId, mesaId))) return { ok: false, motivo: "ERROR" };

    const { error: errorInsert } = await supabase.from("qr_codes").insert({
        id: qrId,
        restaurant_id: restauranteId,
        branch_id: mesa.branch_id,
        dining_table_id: mesa.id,
        purpose: "DINE_IN",
        token_hash: tokenHash,
    });

    if (errorInsert) {
        console.error("reemplazarQr", errorInsert.code);
        return { ok: false, motivo: "ERROR" };
    }
    return { ok: true, numero: mesa.number };
}