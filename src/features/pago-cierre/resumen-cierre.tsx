import { formatearPrecio } from "@/features/carta/formato";
import { ETIQUETA_TIPO_CIERRE, type CierreCuenta } from "./cierre-logica";

// US-020: lo que quedó registrado al cerrar la cuenta.

const soles = (centimos: number) => formatearPrecio(centimos / 100);

export function ResumenCierre({ cierre }: { cierre: CierreCuenta }) {
  const fecha = new Date(cierre.cerradoEn).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima",
  });
  const excepcion = cierre.tipo === "EXCEPTION";

  return (
    <section
      aria-labelledby="cierre"
      className={`mt-6 rounded-xl border-2 p-4 ${excepcion ? "border-aviso-borde bg-aviso-fondo" : "border-exito-borde bg-exito-fondo"}`}
    >
      <h2 id="cierre" className="text-xl font-semibold">Cuenta cerrada</h2>
      <p className="mt-1 font-medium">{ETIQUETA_TIPO_CIERRE[cierre.tipo]}</p>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt>Cerrada por</dt>
        <dd className="text-right">{cierre.cerradoPor ?? "Personal"}</dd>
        <dt>Fecha y hora</dt>
        <dd className="text-right">{fecha}</dd>
        <dt>Importe final</dt>
        <dd className="text-right font-semibold">{soles(cierre.consumoCentimos)}</dd>
        <dt>Pagado</dt>
        <dd className="text-right">{soles(cierre.pagadoCentimos)}</dd>
        {cierre.saldoCentimos !== 0 && (
          <>
            <dt>{cierre.saldoCentimos > 0 ? "Saldo no cobrado" : "Saldo a favor del cliente"}</dt>
            <dd className="text-right font-semibold">{soles(Math.abs(cierre.saldoCentimos))}</dd>
          </>
        )}
      </dl>
      {cierre.motivo && <p className="mt-3 text-sm"><span className="font-medium">Motivo:</span> {cierre.motivo}</p>}
    </section>
  );
}
