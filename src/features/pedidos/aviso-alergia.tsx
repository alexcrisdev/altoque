import { Insignia } from "../../components/ui";
import { textoAlergia, type AlergiaPedido } from "./alergias";

export function AvisoAlergia({ alergia, cocina = false, id }: { alergia?: AlergiaPedido | null; cocina?: boolean; id?: string }) {
  const texto = textoAlergia(alergia);
  if (!texto) return null;
  if (cocina) return <span id={id} className="mt-3 block w-full rounded-lg bg-[#991b1b] p-3 font-bold text-white uppercase">
    <span aria-hidden="true">⚠ </span>{texto}
  </span>;
  return <span className="mt-3 block text-peligro-texto">
    <Insignia tono="peligro"><span aria-hidden="true">⚠ </span>{texto}</Insignia>
  </span>;
}
