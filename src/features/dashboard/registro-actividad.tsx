"use client";

// US-099 (Parte 2b): registro de actividad del día con filtro por tipo y persona.
import { useMemo, useState } from "react";
import {
  filtrarActividad,
  personasDeActividad,
  type Actividad,
  type TipoActividad,
} from "./actividad-logica";

const TIPOS: { valor: TipoActividad | "TODOS"; texto: string }[] = [
  { valor: "TODOS", texto: "Todo" },
  { valor: "PEDIDO", texto: "Pedidos" },
  { valor: "PAGO", texto: "Pagos" },
  { valor: "CIERRE", texto: "Cierres" },
];

const hora = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function RegistroActividad({ actividades }: { actividades: Actividad[] }) {
  const [tipo, setTipo] = useState<TipoActividad | "TODOS">("TODOS");
  const [persona, setPersona] = useState<string>("TODAS");
  const personas = useMemo(() => personasDeActividad(actividades), [actividades]);
  const visibles = filtrarActividad(actividades, tipo, persona);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoActividad | "TODOS")}
            className="rounded-xl border border-borde bg-superficie px-3 py-2"
          >
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Persona
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="rounded-xl border border-borde bg-superficie px-3 py-2"
          >
            <option value="TODAS">Todas</option>
            {personas.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-texto-suave">No hay actividad con estos filtros.</p>
      ) : (
        <ol className="max-h-96 divide-y divide-borde overflow-y-auto rounded-xl border border-borde">
          {visibles.map((a) => (
            <li
              key={a.id}
              className={`grid grid-cols-[3.5rem_1fr] gap-x-3 px-3 py-2 text-sm ${
                a.resaltar ? "bg-peligro-fondo text-peligro-texto" : ""
              }`}
            >
              <span className="font-semibold tabular-nums">{hora.format(new Date(a.en))}</span>
              <div className="min-w-0">
                <p className="break-words font-semibold">{a.que}</p>
                <p className={`break-words ${a.resaltar ? "" : "text-texto-suave"}`}>
                  {a.persona}{a.detalle ? ` · ${a.detalle}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
