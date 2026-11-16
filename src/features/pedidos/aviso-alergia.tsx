import { Insignia } from "../../components/ui";
import { textoAlergia, type AlergiaPedido } from "./alergias";

export function AvisoAlergia({ alergia }: { alergia?: AlergiaPedido | null }) {
  const texto = textoAlergia(alergia);
  if (!texto) return null;
  return <span className="mt-3 block text-peligro-texto">
    <Insignia tono="peligro"><span aria-hidden="true">⚠ </span>{texto}</Insignia>
  </span>;
}
