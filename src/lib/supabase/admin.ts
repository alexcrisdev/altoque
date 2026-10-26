import "server-only";
import {createClient} from "@supabase/supabase-js";

// Cliente con la clave secreta: salta RLS.
// Solo para el servidor y para casos sin usuario logueado (ej. cliente que escanea un QR).
export function crearClienteAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const claveSecreta = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!url || !claveSecreta) {
        throw new Error(
            "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
        );
    }

    return createClient(url, claveSecreta, {
        auth: {persistSession: false, autoRefreshToken: false},
    });
}