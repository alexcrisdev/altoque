import { Insignia } from "../../components/ui";
import { textoAlergia, type AlergiaPedido } from "./alergias";

export function AvisoAlergia({ alergia, cocina = false, id }: { alergia?: AlergiaPedido | null; cocina?: boolean; id?: string }) {
  const texto = textoAlergia(alergia);
  if (!texto) return null;
  if (cocina) return <span id={id} className="aviso-alergia-cocina mt-4 block w-full rounded-xl border-2 border-peligro-borde bg-peligro-texto p-4 font-bold text-superficie uppercase">
    <span aria-hidden="true">⚠ </span>{texto}
  </span>;
  return <span className="mt-3 block text-peligro-texto">
    <Insignia tono="peligro"><span aria-hidden="true">⚠ </span>{texto}</Insignia>
  </span>;
}
