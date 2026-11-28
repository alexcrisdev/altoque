"use client";

import { useActionState } from "react";
import { Boton } from "@/components/ui";
import { editarFormaMesaAction, type EstadoFormaMesa } from "@/features/acceso-qr/actions";
import type { FormaMesa } from "@/features/plano-mesas/sillas";
import { CamposFormaMesa } from "./campos-forma-mesa";

const inicial: EstadoFormaMesa = { tipo: "inicial", mensaje: "" };

// Plano: cambiar forma y sillas desde "Más opciones". Al guardar, el plano se actualiza solo.
export function FormularioFormaMesa({ mesaId, forma, sillas }: { mesaId: string; forma?: FormaMesa; sillas?: number }) {
  const [estado, accion, pendiente] = useActionState(editarFormaMesaAction, inicial);
  return <form action={accion} className="flex flex-wrap items-end gap-3">
    <input type="hidden" name="mesaId" value={mesaId} />
    <CamposFormaMesa forma={forma} sillas={sillas} />
    <Boton type="submit" variante="secundario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar forma y sillas"}</Boton>
    {estado.mensaje && <p role={estado.tipo === "error" ? "alert" : "status"}
      className={`w-full text-sm ${estado.tipo === "error" ? "text-peligro-texto" : "text-exito-texto"}`}>{estado.mensaje}</p>}
    <p className="w-full text-xs text-texto-suave">Con 5 o 6 sillas se dibujan 2 mesas juntas y con 7 u 8, 3 juntas (siempre cuadradas). Sigue siendo una sola mesa con su QR y su cuenta.</p>
  </form>;
}
