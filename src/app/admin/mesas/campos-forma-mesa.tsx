import { SILLAS_MAXIMAS, SILLAS_POR_DEFECTO, type FormaMesa } from "@/features/plano-mesas/sillas";

const CAMPO = "min-h-11 rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

// Plano: forma y sillas de la mesa (1 a 8). Con 5 o 6 sillas el plano dibuja 2 mesas juntas y con
// 7 u 8, 3 juntas (sigue siendo una mesa).
export function CamposFormaMesa({ forma = "ROUND", sillas = SILLAS_POR_DEFECTO }: { forma?: FormaMesa; sillas?: number }) {
  return <>
    <label className="grid gap-2 text-sm font-medium">
      Forma
      <select name="forma" defaultValue={forma} required className={CAMPO}>
        <option value="SQUARE">Cuadrada</option>
        <option value="ROUND">Redonda</option>
      </select>
    </label>
    <label className="grid gap-2 text-sm font-medium">
      Sillas (1 a {SILLAS_MAXIMAS})
      <input name="sillas" type="number" inputMode="numeric" min={1} max={SILLAS_MAXIMAS} step={1} required
        defaultValue={sillas} className={`${CAMPO} w-24`} />
    </label>
  </>;
}
