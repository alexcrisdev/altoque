import { Toqui } from "@/components/toqui";
import { obtenerSesion } from "../../auth/sesion";
import { preguntarAToquiAdmin } from "./actions";

// US-152: Toqui en todas las pantallas del admin, solo para OWNER y ADMIN.
export const SALUDO_TOQUI_ADMIN = "¡Hola! Soy Toqui. Pregúntame cómo va tu restaurante.";
export const SUGERENCIAS_TOQUI_ADMIN = [
  "¿Cómo me fue hoy?",
  "¿Qué vendí menos esta semana?",
  "¿Cuál es mi hora pico?",
  "¿Qué se agotó?",
  "¿Cuánto debo preparar mañana?",
];

export async function ToquiAdmin() {
  const sesion = await obtenerSesion();
  const puede = sesion?.membresias.some((m) => m.rol === "OWNER" || m.rol === "ADMIN");
  if (!puede) return null;
  return (
    <Toqui
      responder={preguntarAToquiAdmin}
      saludo={SALUDO_TOQUI_ADMIN}
      sugerencias={SUGERENCIAS_TOQUI_ADMIN}
      descripcion="Te explico cómo va tu restaurante"
      clavePosicion="altoque:toqui-posicion:admin"
    />
  );
}
