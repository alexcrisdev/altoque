// US-099 (Parte 2b): sección "Actividad y tiempos" (componente de servidor).
import { MensajeEstado, Tarjeta } from "@/components/ui";
import type { ResultadoActividad } from "./actividad-actions";
import { ETIQUETA_ETAPA, formatoDuracion } from "./actividad-logica";
import { RegistroActividad } from "./registro-actividad";

export function ActividadVista({ resultado }: { resultado: ResultadoActividad }) {
  if (!resultado.ok) return <MensajeEstado tipo="error" titulo={resultado.mensaje} />;
  const { tiempos, registro } = resultado.actividad;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tarjeta className="space-y-3">
        <h3 className="font-bold">Tiempos por etapa (hoy)</h3>
        <p className="text-xs text-texto-suave">Solo pedidos ya entregados.</p>
        {!tiempos ? (
          <p className="text-sm text-texto-suave">—</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-texto-suave">
                <th className="py-1 font-normal">Etapa</th>
                <th className="py-1 text-right font-normal">Prom.</th>
                <th className="py-1 text-right font-normal">Mediana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {tiempos.map((t) => (
                <tr key={t.etapa}>
                  <td className="py-2">
                    {ETIQUETA_ETAPA[t.etapa]}
                    <span className="block text-xs text-texto-suave">{t.pedidos} pedido(s)</span>
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {t.pedidos ? formatoDuracion(t.promedioMs) : "—"}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {t.pedidos ? formatoDuracion(t.medianaMs) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>

      <Tarjeta className="space-y-3 lg:col-span-2">
        <h3 className="font-bold">Registro de actividad (hoy)</h3>
        {!registro ? (
          <p className="text-sm text-texto-suave">—</p>
        ) : (
          <RegistroActividad actividades={registro} />
        )}
      </Tarjeta>
    </div>
  );
}
