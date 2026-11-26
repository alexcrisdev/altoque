import { Insignia } from "../../components/ui/insignia";
import type { ResultadoAgotados } from "./agotados-actions";
import { DIAS_AGOTADOS } from "./sugerencia-stock-logica";

const formatoDia = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short",
});
const formatoHora = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false,
});

// US-146: el dueño ve qué platos se agotaron, el día y la hora aproximada del quiebre.
export function AgotadosRecientes({ resultado, hoy }: { resultado: ResultadoAgotados; hoy: string }) {
  return (
    <section aria-labelledby="agotados-titulo" className="mt-6 grid gap-3">
      <h2 id="agotados-titulo" className="text-lg font-bold text-texto">
        Agotados en los últimos {DIAS_AGOTADOS} días
      </h2>

      {!resultado.ok ? (
        <p role="status" className="rounded-xl border border-borde bg-superficie p-4 text-sm text-texto">
          {resultado.mensaje}
        </p>
      ) : resultado.platos.length === 0 ? (
        <p className="text-sm text-texto-suave">Ningún plato se agotó en estos días.</p>
      ) : (
        <>
          <ul className="grid gap-2">
            {resultado.platos.map((plato) => (
              <li
                key={`${plato.productoId}-${plato.fecha}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-borde bg-superficie p-3 text-sm"
              >
                <span className="break-words font-semibold">{plato.nombre}</span>
                <span className="text-texto-suave">
                  {plato.fecha === hoy ? "hoy" : formatoDia.format(new Date(`${plato.fecha}T12:00:00Z`))}
                  {plato.quiebre ? ` · ~${formatoHora.format(new Date(plato.quiebre))}` : " · hora no disponible"}
                </span>
                <Insignia tono="aviso">Agotado ({plato.stockInicial} u.)</Insignia>
              </li>
            ))}
          </ul>
          <p className="text-sm text-texto-suave">
            La hora es aproximada: es la del pedido con el que se acabó el stock del día.
            La sugerencia no baja por un día agotado.
          </p>
        </>
      )}
    </section>
  );
}
